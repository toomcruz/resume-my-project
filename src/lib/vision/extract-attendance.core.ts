/**
 * Orquestração pura da extração por imagem para um atendimento.
 *
 * Recebe uma lista de imagens já preparadas (dataURL ou URL), executa o
 * pipeline de extração por imagem com concorrência limitada e reduz os
 * resultados no estado de sessão do assistente de visão.
 *
 * Não toca em Supabase, não faz IO. Isolado para permitir testes unitários.
 */
import type {
  ExtractImageInput,
  ExtractImageOutcome,
} from "@/lib/vision/extract-image.server";
import { extractImageBatch } from "@/lib/vision/extract-batch.server";
import {
  initialVisionState,
  visionReducer,
  type VisionState,
} from "@/lib/vision/attendance-vision-store";
import type { ImageRecord } from "@/lib/domain/vision/types";

export type PreparedImage = {
  imageId: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  imageUrl: string;
};

export type ExtractAttendanceCoreInput = {
  images: PreparedImage[];
  processLabel: string;
  contextHints?: string;
  expectedCanonicalKeys?: string[];
  previousState?: VisionState;
  concurrency?: number;
  /** Injeção para testes. */
  extract?: (input: ExtractImageInput) => Promise<ExtractImageOutcome>;
};

export type ExtractAttendanceCoreResult = {
  state: VisionState;
  errors: Array<{ imageId: string; error: string }>;
};

export async function extractAttendanceVisionCore(
  input: ExtractAttendanceCoreInput,
): Promise<ExtractAttendanceCoreResult> {
  // Estado base: preserva confirmações do usuário quando fornecido.
  let state = input.previousState ?? initialVisionState;

  // Registra cada imagem como "processando" (preserva confirmações).
  for (const img of input.images) {
    const record: ImageRecord = {
      imageId: img.imageId,
      fileName: img.fileName,
      mimeType: img.mimeType,
      size: img.size,
      hash: img.hash,
      status: "processando",
    };
    state = visionReducer(state, { type: "add_image", image: record });
    state = visionReducer(state, {
      type: "set_image_status",
      imageId: img.imageId,
      status: "processando",
    });
  }

  const items: ExtractImageInput[] = input.images.map((img) => ({
    imageId: img.imageId,
    imageUrl: img.imageUrl,
    processLabel: input.processLabel,
    contextHints: input.contextHints,
    expectedCanonicalKeys: input.expectedCanonicalKeys,
  }));

  const results = await extractImageBatch(items, {
    concurrency: input.concurrency ?? 3,
    extract: input.extract,
  });

  const errors: ExtractAttendanceCoreResult["errors"] = [];

  for (const result of results) {
    if (result.ok) {
      state = visionReducer(state, {
        type: "ingest_extraction",
        response: result.data,
      });
    } else {
      errors.push({ imageId: result.imageId, error: result.error });
      state = visionReducer(state, {
        type: "set_image_status",
        imageId: result.imageId,
        status: "erro",
        error: result.error,
      });
    }
  }

  return { state, errors };
}
