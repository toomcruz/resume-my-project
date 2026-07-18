import { describe, it, expect } from "vitest";
import {
  canStartAutoExtract,
  computeExtractedSignature,
  decidePollInterval,
  EXTRACT_LOCK_TTL_MS,
  mergeFieldsPreservingEdits,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  removeDiscrepancyOptimistically,
} from "@/lib/attendance-runtime";

describe("decidePollInterval", () => {
  it("desliga polling em status terminal", () => {
    expect(decidePollInterval({ status: "done", startedAt: null, now: 0 }).interval).toBe(false);
    expect(decidePollInterval({ status: "error", startedAt: 0, now: 10 }).interval).toBe(false);
    expect(decidePollInterval({ status: "cancelled", startedAt: 0, now: 10 }).interval).toBe(false);
  });

  it("mantém intervalo de 5s enquanto extrai", () => {
    const d = decidePollInterval({ status: "extracting", startedAt: 1_000, now: 3_000 });
    expect(d.interval).toBe(POLL_INTERVAL_MS);
    expect(d.timedOut).toBe(false);
  });

  it("interrompe após 120s de timeout", () => {
    const d = decidePollInterval({ status: "extracting", startedAt: 0, now: POLL_TIMEOUT_MS + 1 });
    expect(d.interval).toBe(false);
    expect(d.timedOut).toBe(true);
  });

  it("inicializa startedAt quando ausente", () => {
    const d = decidePollInterval({ status: "extracting", startedAt: null, now: 5_000 });
    expect(d.startedAt).toBe(5_000);
    expect(d.interval).toBe(POLL_INTERVAL_MS);
  });
});

describe("canStartAutoExtract", () => {
  const base = { status: "extracting", hasExtractedData: false, extracting: false, lockTimestamp: null, now: 100 };
  it("permite quando extracting, sem dados, sem lock", () => {
    expect(canStartAutoExtract(base)).toBe(true);
  });
  it("bloqueia se já há dados extraídos", () => {
    expect(canStartAutoExtract({ ...base, hasExtractedData: true })).toBe(false);
  });
  it("bloqueia se já está extraindo", () => {
    expect(canStartAutoExtract({ ...base, extracting: true })).toBe(false);
  });
  it("bloqueia se lock recente", () => {
    expect(canStartAutoExtract({ ...base, lockTimestamp: 100, now: 200 })).toBe(false);
  });
  it("libera após TTL do lock", () => {
    expect(canStartAutoExtract({ ...base, lockTimestamp: 0, now: EXTRACT_LOCK_TTL_MS + 1 })).toBe(true);
  });
  it("bloqueia se status não é extracting", () => {
    expect(canStartAutoExtract({ ...base, status: "done" })).toBe(false);
  });
});

describe("computeExtractedSignature", () => {
  it("ignora metadados internos e ordem", () => {
    const a = computeExtractedSignature({ b: "2", a: "1", _vision: { x: 1 } });
    const b = computeExtractedSignature({ a: "1", b: "2" });
    expect(a).toBe(b);
  });
  it("muda quando valor muda", () => {
    expect(computeExtractedSignature({ a: "1" })).not.toBe(computeExtractedSignature({ a: "2" }));
  });
  it("vazio para null", () => {
    expect(computeExtractedSignature(null)).toBe("");
  });
});

describe("mergeFieldsPreservingEdits", () => {
  it("preserva chaves editadas manualmente", () => {
    const out = mergeFieldsPreservingEdits({
      incoming: { nome: "AI", cpf: "111" },
      current: { nome: "Manual", cpf: "111" },
      userEditedKeys: new Set(["nome"]),
      overrides: {},
    });
    expect(out.nome).toBe("Manual");
    expect(out.cpf).toBe("111");
  });
  it("overrides sempre vencem", () => {
    const out = mergeFieldsPreservingEdits({
      incoming: { data: "01/01" },
      current: { data: "X" },
      userEditedKeys: new Set(["data"]),
      overrides: { data: "OVR" },
    });
    expect(out.data).toBe("OVR");
  });
});

describe("removeDiscrepancyOptimistically", () => {
  it("remove apenas a divergência informada", () => {
    const dados = { divergencias: [{ id: "a" }, { id: "b" }], outro: "x" };
    const out = removeDiscrepancyOptimistically(dados, "a");
    expect(out?.divergencias).toEqual([{ id: "b" }]);
    expect(out?.outro).toBe("x");
  });
  it("retorna null quando entrada é null", () => {
    expect(removeDiscrepancyOptimistically(null, "a")).toBeNull();
  });
});
