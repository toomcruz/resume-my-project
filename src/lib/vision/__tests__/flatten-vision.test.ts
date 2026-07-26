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

  it("mantém endereço e telefone do falecido separados dos dados do declarante", () => {
    let s = initialVisionState;
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: response("img1", {
        documentType: "declaracao_obito",
        persons: [
          {
            temporaryId: "falecido",
            name: "PESSOA FALECIDA",
            address: "ENDEREÇO DO FALECIDO",
            roleCandidates: [
              {
                role: "falecido_sepultamento",
                confidence: 0.99,
                evidence: "titular da declaração",
              },
            ],
          },
          {
            temporaryId: "declarante",
            name: "MARCOS DECLARANTE",
            cpf: "165.040.408-50",
            rg: "1234567",
            address: "RUA DO DECLARANTE, 100",
            phone: "(11)98344-0011",
            roleCandidates: [
              {
                role: "declarante",
                confidence: 0.99,
                evidence: "campo DECLARANTE",
              },
            ],
          },
        ],
      }),
    });

    const { flat } = flattenVisionState(s);
    expect(flat.nome_falecido).toBe("PESSOA FALECIDA");
    expect(flat.endereco).toBeUndefined();
    expect(flat.nome_declarante).toBe("MARCOS DECLARANTE");
    expect(flat.cpf_declarante).toBe("165.040.408-50");
    expect(flat.rg_declarante).toBe("1234567");
    expect(flat.endereco_declarante).toBe("RUA DO DECLARANTE, 100");
    expect(flat.telefone_declarante).toBe("(11)98344-0011");
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
