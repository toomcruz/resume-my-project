/**
 * Schema Zod estrito para a resposta da IA em UMA imagem.
 *
 * Este schema é a única porta de entrada aceita para dados vindos da IA
 * no fluxo de visão. Um JSON vazio, sem `imageId` ou sem `documentType`
 * NÃO é sucesso — é erro daquela imagem.
 *
 * Nunca aceita `Record<string, string>`. Todos os consumidores tipam
 * a partir daqui.
 */
import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/domain/vision/types";

const nonEmpty = z.string().trim().min(1);

const ROLE_ALIASES: Record<string, string> = {
  falecido: "falecido_sepultamento",
  de_cujus: "falecido_sepultamento",
  vitima: "falecido_sepultamento",
  exumado: "falecido_exumacao",
  responsavel_legal: "responsavel",
  requisitante: "requerente",
};

export const RoleCandidateSchema = z.object({
  role: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const normalized = value.trim().toLowerCase();
      return ROLE_ALIASES[normalized] ?? normalized;
    },
    z.enum([
      "falecido_sepultamento",
      "falecido_exumacao",
      "falecido_exumacao_pps",
      "responsavel",
      "requerente",
      "concessionario",
      "sucessor",
      "signatario",
      "autorizado",
      "declarante",
      "outro",
    ]),
  ),
  confidence: z.number().min(0).max(1),
  evidence: z.string().default(""),
});


export const RawPersonSchema = z.object({
  temporaryId: nonEmpty,
  name: nonEmpty,
  cpf: z.string().optional(),
  rg: z.string().optional(),
  birthDate: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  roleCandidates: z.array(RoleCandidateSchema).default([]),
});

export const RawFieldSchema = z.object({
  canonicalKey: nonEmpty,
  value: z.string(),
  confidence: z.number().min(0).max(1).default(0.6),
  evidence: z.string().default(""),
  entityTemporaryId: z.string().optional(),
});

export const ImageExtractionResponseSchema = z.object({
  imageId: nonEmpty,
  documentType: z.enum(DOCUMENT_TYPES as unknown as [string, ...string[]]),
  documentTypeConfidence: z.number().min(0).max(1).default(0.6),
  documentTypeReason: z.string().default(""),
  persons: z.array(RawPersonSchema).default([]),
  fields: z.array(RawFieldSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type ImageExtractionResponse = z.infer<typeof ImageExtractionResponseSchema>;

/**
 * Parse defensivo — aceita string bruta ou objeto.
 * Devolve `{ ok: true, data }` OU `{ ok: false, error }`.
 * Um JSON vazio, um objeto sem imageId ou sem documentType é ERRO,
 * nunca sucesso silencioso.
 */
export function parseImageExtractionResponse(
  input: unknown,
): { ok: true; data: ImageExtractionResponse } | { ok: false; error: string } {
  let raw: unknown = input;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: "resposta vazia" };
    try {
      raw = JSON.parse(trimmed);
    } catch {
      // Tenta extrair o primeiro objeto JSON de dentro do texto
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) return { ok: false, error: "não é JSON válido" };
      try {
        raw = JSON.parse(match[0]);
      } catch {
        return { ok: false, error: "não é JSON válido" };
      }
    }
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "resposta não é objeto" };
  }
  if (Object.keys(raw as object).length === 0) {
    return { ok: false, error: "JSON vazio não é sucesso" };
  }
  const parsed = ImageExtractionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "schema inválido" };
  }
  return { ok: true, data: parsed.data };
}
