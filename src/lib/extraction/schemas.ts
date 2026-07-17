// Schemas Zod para a resposta esperada da IA. Sem .min/.max/enum de comprimento:
// bordas de valor ficam nos validators, para evitar 400/AI_NoObjectGeneratedError.

import { z } from "zod";
import {
  DOCUMENT_TYPES,
  ENTITY_TYPES,
  FIELD_STATUSES,
  type AIResponse,
} from "./types";

const documentTypeSchema = z.enum(DOCUMENT_TYPES);
const entityTypeSchema = z.enum(ENTITY_TYPES);
const fieldStatusSchema = z.enum(FIELD_STATUSES);

export const FieldAlternativeSchema = z.object({
  value: z.string(),
  sourceImageId: z.string(),
  confidence: z.number(),
});

export const ExtractedFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  rawValue: z.string(),
  entityType: entityTypeSchema,
  section: z.string(),
  sourceImageId: z.string(),
  sourceFileName: z.string(),
  documentType: documentTypeSchema,
  confidence: z.number(),
  status: fieldStatusSchema,
  alternatives: z.array(FieldAlternativeSchema).optional(),
});

export const DocumentClassificationSchema = z.object({
  documentType: documentTypeSchema,
  confidence: z.number(),
  reason: z.string(),
  possibleAlternatives: z.array(
    z.object({
      documentType: documentTypeSchema,
      confidence: z.number(),
    }),
  ),
});

export const AIResponseSchema = z.object({
  documentClassification: DocumentClassificationSchema,
  fields: z.array(ExtractedFieldSchema),
  warnings: z.array(z.string()),
  missingExpectedFields: z.array(z.string()),
  processingNotes: z.array(z.string()),
});

export type AIResponseParsed = z.infer<typeof AIResponseSchema>;

export type ParseResult =
  | { ok: true; data: AIResponse }
  | { ok: false; error: string };

/**
 * Interpreta uma resposta bruta da IA.
 * Aceita string (JSON) ou objeto já parseado.
 * Nunca retorna objeto vazio silenciosamente: em falha, retorna `{ ok: false, error }`.
 */
export function parseAIResponse(raw: unknown): ParseResult {
  let candidate: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: "Resposta vazia" };
    try {
      candidate = JSON.parse(trimmed);
    } catch (error) {
      return {
        ok: false,
        error: `JSON inválido: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const result = AIResponseSchema.safeParse(candidate);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".") || "(raiz)";
    return { ok: false, error: `Schema inválido em ${path}: ${first?.message ?? "erro desconhecido"}` };
  }
  return { ok: true, data: result.data };
}
