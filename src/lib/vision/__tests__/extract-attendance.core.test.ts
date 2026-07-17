import { describe, it, expect } from "vitest";
import { extractAttendanceVisionCore, type PreparedImage } from "../extract-attendance.core";
import type { ExtractImageOutcome } from "@/lib/vision/extract-image.server";
import type { ImageExtractionResponse } from "@/lib/vision/schema";

function fakeImage(id: string): PreparedImage {
  return {
    imageId: id,
    fileName: `${id}.jpg`,
    mimeType: "image/jpeg",
    size: 1024,
    hash: `hash-${id}`,
    imageUrl: `data:image/jpeg;base64,ZmFrZQ==`,
  };
}

function okResponse(imageId: string, name: string): ImageExtractionResponse {
  return {
    imageId,
    documentType: "certidao_obito",
    documentTypeConfidence: 0.9,
    documentTypeReason: "cabeçalho",
    persons: [
      {
        temporaryId: "p1",
        name,
        roleCandidates: [
          { role: "falecido_sepultamento", confidence: 0.95, evidence: "titular certidão" },
        ],
      },
    ],
    fields: [
      {
        canonicalKey: "nome_falecido",
        value: name,
        confidence: 0.95,
        evidence: "titular",
      },
    ],
    warnings: [],
  };
}

describe("extractAttendanceVisionCore", () => {
  it("registra imagens, executa lote e reduz estado", async () => {
    const images = [fakeImage("img-1"), fakeImage("img-2")];
    const extract = async ({ imageId }: { imageId: string }): Promise<ExtractImageOutcome> => ({
      ok: true,
      data: okResponse(imageId, "Maria Silva"),
      durationMs: 10,
    });

    const { state, errors } = await extractAttendanceVisionCore({
      images,
      processLabel: "sepultamento",
      extract,
    });

    expect(errors).toEqual([]);
    expect(state.images).toHaveLength(2);
    expect(state.images.every((i) => i.status === "concluida")).toBe(true);
    expect(state.persons.length).toBeGreaterThanOrEqual(1);
  });

  it("isola erros por imagem sem quebrar o lote", async () => {
    const images = [fakeImage("ok-1"), fakeImage("bad-1"), fakeImage("ok-2")];
    const extract = async ({ imageId }: { imageId: string }): Promise<ExtractImageOutcome> =>
      imageId.startsWith("bad")
        ? { ok: false, error: "HTTP 500", durationMs: 5 }
        : { ok: true, data: okResponse(imageId, "Fulano"), durationMs: 5 };

    const { state, errors } = await extractAttendanceVisionCore({
      images,
      processLabel: "sepultamento",
      extract,
    });

    expect(errors).toEqual([{ imageId: "bad-1", error: "HTTP 500" }]);
    expect(state.images.find((i) => i.imageId === "bad-1")?.status).toBe("erro");
    expect(state.images.filter((i) => i.status === "concluida")).toHaveLength(2);
  });

  it("preserva confirmações do usuário ao reprocessar", async () => {
    const images = [fakeImage("img-1")];
    const previous = await extractAttendanceVisionCore({
      images,
      processLabel: "sepultamento",
      extract: async ({ imageId }): Promise<ExtractImageOutcome> => ({
        ok: true,
        data: okResponse(imageId, "Nome Antigo"),
        durationMs: 1,
      }),
    });

    // Usuário confirma o nome
    const confirmed = {
      ...previous.state,
      confirmedFields: {
        nome_falecido: {
          key: "nome_falecido",
          value: "Nome Confirmado",
          sourceImageId: "img-1",
          documentType: "certidao_obito" as const,
          evidence: "usuário",
          confidence: 1,
          rawValue: "Nome Confirmado",
          normalizedValue: "Nome Confirmado",
          confirmedByUser: true,
        },
      },
    };

    const { state } = await extractAttendanceVisionCore({
      images,
      processLabel: "sepultamento",
      previousState: confirmed,
      extract: async ({ imageId }): Promise<ExtractImageOutcome> => ({
        ok: true,
        data: okResponse(imageId, "Nome IA Diferente"),
        durationMs: 1,
      }),
    });

    expect(state.confirmedFields.nome_falecido.value).toBe("Nome Confirmado");
    expect(state.confirmedFields.nome_falecido.confirmedByUser).toBe(true);
  });
});
