import { describe, it, expect } from "vitest";
import {
  initialVisionState,
  visionReducer,
  type VisionState,
} from "../attendance-vision-store";
import type { ImageExtractionResponse } from "../schema";

function mkResponse(
  imageId: string,
  overrides: Partial<ImageExtractionResponse> = {},
): ImageExtractionResponse {
  return {
    imageId,
    documentType: "rg",
    documentTypeConfidence: 0.9,
    documentTypeReason: "",
    persons: [],
    fields: [],
    warnings: [],
    ...overrides,
  };
}

function seed(): VisionState {
  let s = initialVisionState;
  s = visionReducer(s, {
    type: "add_image",
    image: {
      imageId: "img1",
      fileName: "a.jpg",
      mimeType: "image/jpeg",
      size: 1000,
      hash: "h1",
      status: "pendente",
    },
  });
  s = visionReducer(s, {
    type: "add_image",
    image: {
      imageId: "img2",
      fileName: "b.jpg",
      mimeType: "image/jpeg",
      size: 1200,
      hash: "h2",
      status: "pendente",
    },
  });
  return s;
}

describe("visionReducer — teste 8: reprocessamento preserva confirmações", () => {
  it("valores confirmados pelo usuário sobrevivem a nova extração", () => {
    let s = seed();
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: mkResponse("img1", {
        fields: [
          { canonicalKey: "cpf_responsavel", value: "111.111.111-11", confidence: 0.8, evidence: "" },
        ],
      }),
    });
    s = visionReducer(s, {
      type: "confirm_field",
      field: {
        key: "cpf_responsavel",
        value: "222.222.222-22",
        sourceImageId: "img1",
        documentType: "rg",
        evidence: "",
        confidence: 1,
        rawValue: "222.222.222-22",
        normalizedValue: "22222222222",
      },
    });
    // Reprocessa a mesma imagem com valor DIFERENTE.
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: mkResponse("img1", {
        fields: [
          { canonicalKey: "cpf_responsavel", value: "999.999.999-99", confidence: 0.9, evidence: "" },
        ],
      }),
    });
    expect(s.confirmedFields.cpf_responsavel.value).toBe("222.222.222-22");
    expect(s.confirmedFields.cpf_responsavel.confirmedByUser).toBe(true);
  });
});

describe("visionReducer — teste 9: remover imagem não apaga valor confirmado", () => {
  it("marca fonte ausente mas mantém valor", () => {
    let s = seed();
    s = visionReducer(s, {
      type: "confirm_field",
      field: {
        key: "nome_responsavel",
        value: "Maria",
        sourceImageId: "img1",
        documentType: "rg",
        evidence: "",
        confidence: 1,
        rawValue: "Maria",
        normalizedValue: "Maria",
      },
    });
    s = visionReducer(s, { type: "remove_image", imageId: "img1" });
    expect(s.confirmedFields.nome_responsavel.value).toBe("Maria");
    expect(s.confirmedFields.nome_responsavel.sourceImageId).toBe("");
  });
});

describe("visionReducer — teste 12: conflito é apresentado, não resolvido silenciosamente", () => {
  it("valores diferentes para a mesma chave viram conflito", () => {
    let s = seed();
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: mkResponse("img1", {
        fields: [
          { canonicalKey: "cpf_responsavel", value: "111.111.111-11", confidence: 0.9, evidence: "A" },
        ],
      }),
    });
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: mkResponse("img2", {
        documentType: "cpf",
        fields: [
          { canonicalKey: "cpf_responsavel", value: "222.222.222-22", confidence: 0.85, evidence: "B" },
        ],
      }),
    });
    expect(s.conflicts).toHaveLength(1);
    expect(s.conflicts[0].key).toBe("cpf_responsavel");
    expect(s.conflicts[0].candidates).toHaveLength(2);

    // Ao resolver, o conflito desaparece.
    s = visionReducer(s, {
      type: "resolve_conflict",
      key: "cpf_responsavel",
      chosenValue: "111.111.111-11",
      sourceImageId: "img1",
    });
    expect(s.conflicts).toHaveLength(0);
    expect(s.confirmedFields.cpf_responsavel.value).toBe("111.111.111-11");
  });
});

describe("visionReducer — consolidação de pessoas por CPF (teste 10)", () => {
  it("mesmo CPF em duas imagens gera uma pessoa consolidada", () => {
    let s = seed();
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: mkResponse("img1", {
        persons: [
          {
            temporaryId: "t1",
            name: "Ana",
            cpf: "52998224725",
            roleCandidates: [],
          },
        ],
      }),
    });
    s = visionReducer(s, {
      type: "ingest_extraction",
      response: mkResponse("img2", {
        persons: [
          {
            temporaryId: "t2",
            name: "Ana",
            cpf: "529.982.247-25",
            roleCandidates: [],
          },
        ],
      }),
    });
    expect(s.persons).toHaveLength(1);
  });
});
