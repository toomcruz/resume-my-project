import { describe, it, expect } from "vitest";
import { flattenVisionState } from "../flatten-vision";
import { initialVisionState, visionReducer } from "../attendance-vision-store";
import type { ImageExtractionResponse } from "../schema";

function response(
  imageId: string,
  overrides: Partial<ImageExtractionResponse> = {},
): ImageExtractionResponse {
  return {
    imageId,
    documentType: "certidao_obito",
    documentTypeConfidence: 0.9,
    documentTypeReason: "",
    persons: [],
    fields: [],
    warnings: [],
    ...overrides,
  };
}

describe("flattenVisionState", () => {
  it("gera mapa plano com melhor confiança por chave", () => {
    let s = initialVisionState;
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: response("img1", {
        fields: [
          { canonicalKey: "nome_falecido", value: "Maria Silva", confidence: 0.8, evidence: "" },
        ],
      }),
    });
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: response("img2", {
        fields: [
          { canonicalKey: "nome_falecido", value: "Maria Silva", confidence: 0.95, evidence: "" },
        ],
      }),
    });
    const { flat, meta } = flattenVisionState(s);
    expect(flat.nome_falecido).toBe("Maria Silva");
    expect(meta.nome_falecido.confidence).toBe(0.95);
    expect(meta.nome_falecido.hasConflict).toBe(false);
  });

  it("marca conflito quando valores divergem", () => {
    let s = initialVisionState;
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: response("img1", {
        fields: [
          { canonicalKey: "cpf_falecido", value: "111.111.111-11", confidence: 0.9, evidence: "" },
        ],
      }),
    });
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: response("img2", {
        fields: [
          { canonicalKey: "cpf_falecido", value: "222.222.222-22", confidence: 0.85, evidence: "" },
        ],
      }),
    });
    const { meta } = flattenVisionState(s);
    expect(meta.cpf_falecido.hasConflict).toBe(true);
  });

  it("deriva chaves de pessoa consolidada por papel", () => {
    let s = initialVisionState;
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: response("img1", {
        persons: [
          {
            temporaryId: "p1",
            name: "João Silva",
            cpf: "529.982.247-25",
            roleCandidates: [
              { role: "responsavel", confidence: 0.9, evidence: "assinou requerimento" },
            ],
          },
        ],
      }),
    });
    const { flat } = flattenVisionState(s);
    expect(flat.nome_responsavel).toBe("João Silva");
    expect(flat.cpf_responsavel).toBe("529.982.247-25");
  });

  it("confirmação do usuário sobrescreve valor bruto", () => {
    let s = initialVisionState;
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: response("img1", {
        fields: [
          { canonicalKey: "nome_falecido", value: "Errado", confidence: 0.9, evidence: "" },
        ],
      }),
    });
    s = visionReducer(s, {
      type: "confirm_field",
      field: {
        key: "nome_falecido",
        value: "Correto",
        sourceImageId: "img1",
        documentType: "certidao_obito",
        evidence: "usuário",
        confidence: 1,
        rawValue: "Correto",
        normalizedValue: "Correto",
        confirmedByUser: true,
      },
    });
    const { flat, meta } = flattenVisionState(s);
    expect(flat.nome_falecido).toBe("Correto");
    expect(meta.nome_falecido.confirmedByUser).toBe(true);
  });
});
