import { describe, it, expect } from "vitest";
import { parseAIResponse } from "../schemas";

const validPayload = {
  documentClassification: {
    documentType: "certidao_obito",
    confidence: 0.92,
    reason: "cabeçalho identificado",
    possibleAlternatives: [],
  },
  fields: [
    {
      key: "nome_falecido",
      label: "Nome do falecido",
      value: "João da Silva",
      rawValue: "JOAO DA SILVA",
      entityType: "falecido",
      section: "Identificação",
      sourceImageId: "img_1",
      sourceFileName: "certidao.jpg",
      documentType: "certidao_obito",
      confidence: 0.95,
      status: "confirmado",
    },
  ],
  warnings: [],
  missingExpectedFields: [],
  processingNotes: [],
};

describe("parseAIResponse", () => {
  it("aceita payload válido como objeto", () => {
    const r = parseAIResponse(validPayload);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.fields[0].key).toBe("nome_falecido");
  });

  it("aceita payload válido como string JSON", () => {
    const r = parseAIResponse(JSON.stringify(validPayload));
    expect(r.ok).toBe(true);
  });

  it("rejeita string vazia", () => {
    const r = parseAIResponse("");
    expect(r.ok).toBe(false);
  });

  it("rejeita JSON malformado com mensagem clara", () => {
    const r = parseAIResponse("{ not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON inválido/);
  });

  it("rejeita quando faltam campos obrigatórios", () => {
    const bad = { ...validPayload };
    // @ts-expect-error — remoção intencional para teste
    delete bad.fields;
    const r = parseAIResponse(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Schema inválido/);
  });

  it("rejeita entityType fora do enum", () => {
    const bad = structuredClone(validPayload);
    (bad.fields[0] as Record<string, unknown>).entityType = "chefe";
    const r = parseAIResponse(bad);
    expect(r.ok).toBe(false);
  });

  it("rejeita status fora do enum", () => {
    const bad = structuredClone(validPayload);
    (bad.fields[0] as Record<string, unknown>).status = "aprovado";
    const r = parseAIResponse(bad);
    expect(r.ok).toBe(false);
  });
});
