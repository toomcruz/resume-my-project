import { describe, it, expect } from "vitest";
import { computeConfidence, confidenceBand, canConfirmInBatch } from "../confidence";

describe("confidenceBand", () => {
  it("alta >= 0.9", () => {
    expect(confidenceBand(0.95, false)).toBe("alta");
  });
  it("revisar entre 0.75 e 0.89", () => {
    expect(confidenceBand(0.8, false)).toBe("revisar");
  });
  it("baixa abaixo de 0.75", () => {
    expect(confidenceBand(0.5, false)).toBe("baixa");
  });
  it("conflito sempre sobrepõe", () => {
    expect(confidenceBand(0.99, true)).toBe("conflito");
  });
});

describe("computeConfidence", () => {
  it("adiciona bônus por rótulo explícito e validação determinística", () => {
    const c = computeConfidence({
      base: 0.6,
      hasExplicitLabel: true,
      deterministicValid: true,
    });
    expect(c).toBeGreaterThan(0.8);
  });

  it("penaliza validação determinística inválida", () => {
    const c = computeConfidence({
      base: 0.9,
      deterministicValid: false,
    });
    expect(c).toBeLessThan(0.7);
  });

  it("penaliza conflito", () => {
    const c = computeConfidence({ base: 0.9, hasConflict: true });
    expect(c).toBeLessThan(0.7);
  });

  it("clamp em [0,1]", () => {
    expect(computeConfidence({ base: 2 })).toBe(1);
    expect(computeConfidence({ base: -1 })).toBe(0);
  });
});

describe("canConfirmInBatch — teste 15", () => {
  it("permite lote apenas quando alta e sem conflito", () => {
    expect(canConfirmInBatch(0.95, false)).toBe(true);
    expect(canConfirmInBatch(0.95, true)).toBe(false);
    expect(canConfirmInBatch(0.8, false)).toBe(false);
  });
});
