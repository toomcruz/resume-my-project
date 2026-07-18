import { describe, it, expect } from "vitest";
import {
  tryAcquireExtractionLock,
  releaseExtractionLock,
  type LockRpcClient,
} from "@/lib/vision/extraction-lock";

/**
 * In-memory implementation that mirrors the atomic semantics of the
 * Postgres function: a single row per attendance_id, only reclaimable
 * when status != 'running' OR expires_at < now.
 *
 * A shared async mutex ensures no interleaving inside `rpc`, matching
 * PostgreSQL's serialized INSERT ... ON CONFLICT DO UPDATE for the same
 * primary key.
 */
function createInMemoryLockClient(): LockRpcClient & {
  aiCalls: { id: string; attendanceId: string }[];
} {
  type Row = { execution_id: string; status: "running" | "done" | "error"; expires_at: number };
  const rows = new Map<string, Row>();
  const aiCalls: { id: string; attendanceId: string }[] = [];
  let mutex: Promise<void> = Promise.resolve();
  const guard = async <T>(fn: () => T): Promise<T> => {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = mutex;
    mutex = next;
    await prev;
    try {
      return fn();
    } finally {
      release();
    }
  };

  const client = {
    aiCalls,
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "try_acquire_extraction_lock") {
        const attId = args._attendance_id as string;
        const ttl = ((args._ttl_seconds as number | undefined) ?? 180) * 1000;
        return guard(() => {
          const now = Date.now();
          const existing = rows.get(attId);
          if (existing && existing.status === "running" && existing.expires_at > now) {
            return { data: [], error: null };
          }
          const row: Row = {
            execution_id: `exec-${Math.random().toString(36).slice(2)}`,
            status: "running",
            expires_at: now + ttl,
          };
          rows.set(attId, row);
          return {
            data: [{ execution_id: row.execution_id, expires_at: new Date(row.expires_at).toISOString() }],
            error: null,
          };
        });
      }
      if (fn === "release_extraction_lock") {
        const attId = args._attendance_id as string;
        const execId = args._execution_id as string;
        const status = args._status as "done" | "error";
        return guard(() => {
          const row = rows.get(attId);
          if (row && row.execution_id === execId) {
            row.status = status;
          }
          return { data: true, error: null };
        });
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  } as unknown as LockRpcClient & { aiCalls: typeof aiCalls };
  return client;
}

async function simulateExtraction(client: LockRpcClient & { aiCalls: unknown[] }, attId: string, id: string) {
  const lock = await tryAcquireExtractionLock(client, attId);
  if (!lock) return { winner: false };
  // Simula chamada cara ao Gemini
  (client.aiCalls as { id: string; attendanceId: string }[]).push({ id, attendanceId: attId });
  await new Promise((r) => setTimeout(r, 5));
  await releaseExtractionLock(client, attId, lock.executionId, "done");
  return { winner: true };
}

describe("extraction lock (concurrency)", () => {
  it("apenas UMA tentativa concorrente adquire o lock e chama a IA", async () => {
    const client = createInMemoryLockClient();
    const attId = "att-1";
    const results = await Promise.all([
      simulateExtraction(client, attId, "A"),
      simulateExtraction(client, attId, "B"),
      simulateExtraction(client, attId, "C"),
      simulateExtraction(client, attId, "D"),
    ]);
    const winners = results.filter((r) => r.winner).length;
    expect(winners).toBe(1);
    expect(client.aiCalls.length).toBe(1);
  });

  it("libera o lock após término e permite nova execução", async () => {
    const client = createInMemoryLockClient();
    const attId = "att-2";
    const first = await simulateExtraction(client, attId, "A");
    const second = await simulateExtraction(client, attId, "B");
    expect(first.winner).toBe(true);
    expect(second.winner).toBe(true);
    expect(client.aiCalls.length).toBe(2);
  });

  it("mantém o lock enquanto não expira, mesmo em erro sem release", async () => {
    const client = createInMemoryLockClient();
    const attId = "att-3";
    const lock = await tryAcquireExtractionLock(client, attId);
    expect(lock).not.toBeNull();
    // Segunda tentativa deve falhar enquanto o lock ainda está "running".
    const second = await tryAcquireExtractionLock(client, attId);
    expect(second).toBeNull();
  });

  it("permite reaquisição após liberar com status=error", async () => {
    const client = createInMemoryLockClient();
    const attId = "att-4";
    const lock = await tryAcquireExtractionLock(client, attId);
    expect(lock).not.toBeNull();
    await releaseExtractionLock(client, attId, lock!.executionId, "error", "boom");
    const retry = await tryAcquireExtractionLock(client, attId);
    expect(retry).not.toBeNull();
  });
});
