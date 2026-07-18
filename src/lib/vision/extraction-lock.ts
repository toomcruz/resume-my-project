/**
 * Atomic per-attendance extraction lock.
 *
 * Backed by the Postgres function `try_acquire_extraction_lock` which uses
 * a UNIQUE constraint on `extraction_locks.attendance_id` plus an
 * `ON CONFLICT ... WHERE (status <> 'running' OR expires_at < now())`
 * update. Only ONE concurrent caller can win the row — the losers get
 * an empty result and MUST return without calling AI.
 *
 * This module is pure w.r.t. Supabase — it depends only on a minimal
 * client interface, so the concurrency tests can substitute an
 * in-memory implementation that mirrors the atomic semantics.
 */

export interface LockRpcClient {
  rpc(
    fn: "try_acquire_extraction_lock",
    args: { _attendance_id: string; _ttl_seconds?: number },
  ): Promise<{ data: Array<{ execution_id: string; expires_at: string }> | null; error: unknown }>;
  rpc(
    fn: "release_extraction_lock",
    args: {
      _attendance_id: string;
      _execution_id: string;
      _status: "done" | "error";
      _error_message?: string | null;
    },
  ): Promise<{ data: boolean | null; error: unknown }>;
}

export interface AcquiredLock {
  executionId: string;
  expiresAt: string;
}

export async function tryAcquireExtractionLock(
  client: LockRpcClient,
  attendanceId: string,
  ttlSeconds = 180,
): Promise<AcquiredLock | null> {
  const { data, error } = await client.rpc("try_acquire_extraction_lock", {
    _attendance_id: attendanceId,
    _ttl_seconds: ttlSeconds,
  });
  if (error) throw new Error(`Falha ao adquirir lock: ${String(error)}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return { executionId: row.execution_id, expiresAt: row.expires_at };
}

export async function releaseExtractionLock(
  client: LockRpcClient,
  attendanceId: string,
  executionId: string,
  status: "done" | "error",
  errorMessage: string | null = null,
): Promise<void> {
  await client.rpc("release_extraction_lock", {
    _attendance_id: attendanceId,
    _execution_id: executionId,
    _status: status,
    _error_message: errorMessage,
  });
}
