/**
 * Canonicalização context-aware para chaves vindas da IA, do banco ou de
 * componentes legados. Fase A: apenas leitura pura, sem side-effects.
 *
 * Regras:
 *  - `inscricao_gs` (e variações) → `inscricao_gscemi`.
 *  - `nome_falecido` (genérico) → depende do processo/subcontexto:
 *      • velorio_sepultamento → `nome_falecido_sepultamento`
 *      • exumacao             → `nome_falecido_exumacao`
 *  - `localizacao` (genérica) → depende do processo:
 *      • velorio_sepultamento (jazigo)      → `local_jazigo`
 *      • velorio_sepultamento (quadra_geral) → `local_sepultamento`
 *      • exumacao                            → `local_exumacao`
 *      • translado                           → mantém como texto (não canoniza)
 *  - Aliases declarados no catálogo são resolvidos automaticamente.
 */

import { FIELD_CATALOG, type FieldDefinition } from "./field-catalog";
import type { AttendanceContext } from "./types";

function normalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Chaves que NÃO devem ser resolvidas cegamente pelo alias index porque
// dependem do contexto do atendimento. Consultamos `canonicalizeInContext`.
const CONTEXT_KEYS = new Set(["nome_falecido", "localizacao"]);

const ALIAS_INDEX: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const field of FIELD_CATALOG) {
    map.set(normalize(field.canonicalKey), field.canonicalKey);
    for (const alias of field.aliases) {
      const n = normalize(alias);
      if (CONTEXT_KEYS.has(n)) continue; // não sobrescreve resolução contextual
      if (!map.has(n)) map.set(n, field.canonicalKey);
    }
  }
  return map;
})();

/** Canonicaliza sem contexto: útil para chaves sem ambiguidade (inscricao_gs). */
export function canonicalize(rawKey: string): string | null {
  if (!rawKey) return null;
  return ALIAS_INDEX.get(normalize(rawKey)) ?? null;
}

/**
 * Canonicaliza usando o contexto do atendimento. Necessário para chaves
 * genéricas historicamente reutilizadas em fluxos distintos.
 */
export function canonicalizeInContext(
  rawKey: string,
  ctx: AttendanceContext,
): string | null {
  if (!rawKey) return null;
  const n = normalize(rawKey);

  if (n === "nome_falecido") {
    if (ctx.process === "velorio_sepultamento") return "nome_falecido_sepultamento";
    if (ctx.process === "exumacao") return "nome_falecido_exumacao";
    return "nome_falecido_sepultamento";
  }

  if (n === "localizacao") {
    if (ctx.process === "exumacao") return "local_exumacao";
    if (ctx.process === "velorio_sepultamento") {
      if (ctx.local_sepultamento_tipo === "jazigo") return "local_jazigo";
      if (ctx.local_sepultamento_tipo === "quadra_geral") return "local_sepultamento";
    }
    return null;
  }

  return ALIAS_INDEX.get(n) ?? null;
}

/** Retorna a definição canônica correspondente, se existir. */
export function resolveField(
  rawKey: string,
  ctx?: AttendanceContext,
): FieldDefinition | undefined {
  const key = ctx ? canonicalizeInContext(rawKey, ctx) : canonicalize(rawKey);
  if (!key) return undefined;
  return FIELD_CATALOG.find((f) => f.canonicalKey === key);
}

/**
 * Canonicaliza um mapa bruto (`{ chaveTecnica: valor }`) para o formato
 * canônico. Chaves desconhecidas são descartadas — não devem alimentar
 * documentos automaticamente (spec §13). O chamador é responsável por
 * preservar dados desconhecidos em "Outros dados encontrados".
 */
export function canonicalizeExtractedData(
  raw: Record<string, unknown>,
  ctx: AttendanceContext,
): { canonical: Record<string, string>; unknown: Record<string, unknown> } {
  const canonical: Record<string, string> = {};
  const unknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") {
      unknown[k] = v;
      continue;
    }
    const key = canonicalizeInContext(k, ctx);
    if (key && !(key in canonical)) {
      canonical[key] = v;
    } else if (!key) {
      unknown[k] = v;
    }
  }
  return { canonical, unknown };
}
