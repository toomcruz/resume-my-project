import { describe, expect, it } from "vitest";
import { computeFieldStatus, computeReviewSummary } from "../review-status";
import type { FlatFieldMeta } from "../flatten-vision";
import { getCriticalFieldKeys } from "@/lib/domain/critical-fields";

function meta(overrides: Partial<FlatFieldMeta> = {}): FlatFieldMeta {
  return {
    key: "k",
    value: "v",
    confidence: 0.95,
    ...overrides,
  };
}

describe("computeFieldStatus", () => {
  it("retorna normal para valor com confiança alta e sem conflito", () => {
    expect(
      computeFieldStatus({
        value: "Maria",
        meta: meta({ confidence: 0.95 }),
        isCritical: true,
      }),
    ).toBe("normal");
  });

  it("retorna revisar quando confiança < 0,90 e sem conflito", () => {
    expect(
      computeFieldStatus({
        value: "Maria",
        meta: meta({ confidence: 0.7 }),
        isCritical: false,
      }),
    ).toBe("revisar");
  });

  it("retorna conflito mesmo com valor preenchido", () => {
    expect(
      computeFieldStatus({
        value: "Maria",
        meta: meta({ hasConflict: true, confidence: 0.95 }),
        isCritical: true,
      }),
    ).toBe("conflito");
  });

  it("retorna nao_encontrado quando campo crítico está vazio", () => {
    expect(computeFieldStatus({ value: "", meta: undefined, isCritical: true })).toBe(
      "nao_encontrado",
    );
  });

  it("trata textos de placeholder como ausência real", () => {
    expect(computeFieldStatus({ value: "Não informado", meta: undefined, isCritical: true })).toBe(
      "nao_encontrado",
    );
    expect(
      computeFieldStatus({ value: "Informação pendente", meta: undefined, isCritical: false }),
    ).toBe("opcional_vazio");
  });

  it("marca campo não crítico vazio como opcional_vazio", () => {
    expect(computeFieldStatus({ value: "", meta: undefined, isCritical: false })).toBe(
      "opcional_vazio",
    );
  });

  it("campo confirmado pelo usuário ignora limiar de confiança", () => {
    expect(
      computeFieldStatus({
        value: "Maria",
        meta: meta({ confidence: 0.3, confirmedByUser: true }),
        isCritical: true,
      }),
    ).toBe("normal");
  });
});

describe("computeReviewSummary", () => {
  const critical = new Set(["nome_falecido", "cpf_falecido"]);

  it("permite geração quando não há campos críticos pendentes (mesmo com baixa confiança)", () => {
    const summary = computeReviewSummary({
      keys: ["nome_falecido", "cpf_falecido", "observacao"],
      fields: { nome_falecido: "Maria", cpf_falecido: "111.111.111-11", observacao: "x" },
      meta: {
        nome_falecido: meta({ confidence: 0.6 }),
        cpf_falecido: meta({ confidence: 0.95 }),
        observacao: meta({ confidence: 0.4 }),
      },
      criticalKeys: critical,
    });
    expect(summary.canGenerate).toBe(true);
    expect(summary.blockingKeys).toEqual([]);
    expect(summary.pendingCount).toBeGreaterThan(0);
    expect(summary.statuses.nome_falecido).toBe("revisar");
  });

  it("bloqueia geração quando campo crítico tem conflito", () => {
    const summary = computeReviewSummary({
      keys: ["nome_falecido", "cpf_falecido"],
      fields: { nome_falecido: "Maria", cpf_falecido: "111" },
      meta: {
        nome_falecido: meta({ confidence: 0.95 }),
        cpf_falecido: meta({ hasConflict: true, confidence: 0.9 }),
      },
      criticalKeys: critical,
    });
    expect(summary.canGenerate).toBe(false);
    expect(summary.blockingKeys).toEqual(["cpf_falecido"]);
  });

  it("bloqueia geração quando campo crítico está vazio", () => {
    const summary = computeReviewSummary({
      keys: ["nome_falecido", "cpf_falecido"],
      fields: { nome_falecido: "Maria", cpf_falecido: "" },
      meta: {},
      criticalKeys: critical,
    });
    expect(summary.canGenerate).toBe(false);
    expect(summary.blockingKeys).toEqual(["cpf_falecido"]);
    expect(summary.statuses.cpf_falecido).toBe("nao_encontrado");
  });

  it("campo não crítico ausente não bloqueia nem vira confirmado", () => {
    const summary = computeReviewSummary({
      keys: ["nome_falecido", "observacao"],
      fields: { nome_falecido: "Maria", observacao: "" },
      meta: {},
      criticalKeys: critical,
    });
    expect(summary.canGenerate).toBe(true);
    expect(summary.statuses.observacao).toBe("opcional_vazio");
  });

  it("resolve aliases como um único conceito quando um deles possui valor", () => {
    const summary = computeReviewSummary({
      keys: ["cpfResp", "cpf_responsavel"],
      fields: { cpfResp: "123.456.789-00", cpf_responsavel: "" },
      meta: { cpfResp: meta({ key: "cpfResp", value: "123.456.789-00" }) },
      criticalKeys: new Set(["cpf_responsavel"]),
    });

    expect(summary.canGenerate).toBe(true);
    expect(summary.pendingCount).toBe(0);
    expect(summary.blockingKeys).toEqual([]);
    expect(summary.statuses.cpfResp).toBe("normal");
    expect(summary.statuses.cpf_responsavel).toBe("normal");
  });

  it("conta uma única pendência para aliases vazios do mesmo campo", () => {
    const summary = computeReviewSummary({
      keys: ["dataSep", "data_sepultamento"],
      fields: { dataSep: "", data_sepultamento: "" },
      meta: {},
      criticalKeys: new Set(["dataSep", "data_sepultamento"]),
    });

    expect(summary.pendingCount).toBe(1);
    expect(summary.blockingKeys).toHaveLength(1);
  });

  it("gera divergência quando aliases possuem valores realmente diferentes", () => {
    const summary = computeReviewSummary({
      keys: ["dataSep", "data_sepultamento"],
      fields: { dataSep: "17/07/2026", data_sepultamento: "18/07/2026" },
      meta: {},
      criticalKeys: new Set(["dataSep"]),
    });

    expect(summary.pendingCount).toBe(1);
    expect(summary.statuses.dataSep).toBe("conflito");
    expect(summary.statuses.data_sepultamento).toBe("conflito");
  });
});

describe("getCriticalFieldKeys", () => {
  it("agrega placeholders únicos dos modelos aplicáveis", () => {
    const keys = getCriticalFieldKeys([
      { placeholders: ["nome_falecido", "cpf_falecido"] },
      { placeholders: ["nome_falecido", "data_sepultamento"] },
      { placeholders: null },
    ]);
    expect(keys.has("nome_falecido")).toBe(true);
    expect(keys.has("cpf_falecido")).toBe(true);
    expect(keys.has("data_sepultamento")).toBe(true);
    expect(keys.size).toBe(3);
  });

  it("não trata campos de Localização / Jazigo como críticos", () => {
    const keys = getCriticalFieldKeys([
      {
        placeholders: [
          "nome_falecido",
          "quadra",
          "rua",
          "quadraRua",
          "terreno",
          "gaveta",
          "localJaz",
          "placa",
          "inscricaoGS",
        ],
      },
    ]);
    expect(keys.has("nome_falecido")).toBe(true);
    expect(keys.has("quadra")).toBe(false);
    expect(keys.has("rua")).toBe(false);
    expect(keys.has("quadraRua")).toBe(false);
    expect(keys.has("terreno")).toBe(false);
    expect(keys.has("gaveta")).toBe(false);
    expect(keys.has("localJaz")).toBe(false);
    expect(keys.has("placa")).toBe(false);
    expect(keys.has("inscricaoGS")).toBe(false);
  });
});
