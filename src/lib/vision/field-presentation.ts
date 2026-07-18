/**
 * Camada de apresentação dos campos extraídos.
 *
 * Converte as chaves técnicas usadas nos modelos DOCX (ex.: `cpfResp`,
 * `cpf_responsavel`) em rótulos amigáveis e agrupa aliases sob um mesmo
 * conceito canônico, mantendo o mapeamento reverso para propagar o valor
 * editado em todas as chaves do grupo (compatibilidade com os placeholders
 * existentes).
 *
 * Este módulo é puro — sem React, sem Supabase.
 */

import { FIELD_CATALOG, type FieldDefinition, type FieldSection } from "@/lib/domain/field-catalog";

export type PresentationGroup = {
  id: string;
  label: string;
  section: FieldSection | "outros";
  /** Todas as chaves técnicas que representam o mesmo dado. */
  keys: string[];
  /** Chave preferencial para leitura (primeiro valor não vazio). */
  primaryKey: string;
  /** true quando o campo alimenta um placeholder de documento (crítico). */
  hint?: string;
};

export type PresentationSection = {
  id: FieldSection | "outros";
  label: string;
  order: number;
  groups: PresentationGroup[];
};

const SECTION_META: Record<PresentationSection["id"], { label: string; order: number }> = {
  falecido: { label: "Dados do falecido", order: 1 },
  responsavel: { label: "Responsável", order: 2 },
  concessionario: { label: "Concessionário", order: 3 },
  jazigo: { label: "Localização / Jazigo", order: 4 },
  ossuario: { label: "Ossário", order: 5 },
  velorio: { label: "Velório", order: 6 },
  sepultamento: { label: "Sepultamento", order: 7 },
  exumacao: { label: "Exumação", order: 8 },
  translado: { label: "Translado", order: 9 },
  pessoas: { label: "Pessoas envolvidas", order: 10 },
  dados_administrativos: { label: "Dados administrativos", order: 11 },
  outros: { label: "Outras informações", order: 99 },
};

/** Normaliza uma chave para casamento com aliases (case+underscore+hífen). */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]+/g, "");
}

// Índice normalizado alias/canonical → definição.
const CATALOG_INDEX: Map<string, FieldDefinition> = (() => {
  const idx = new Map<string, FieldDefinition>();
  for (const def of FIELD_CATALOG) {
    idx.set(normalizeKey(def.canonicalKey), def);
    for (const alias of def.aliases) {
      const n = normalizeKey(alias);
      if (!idx.has(n)) idx.set(n, def);
    }
  }
  return idx;
})();

/**
 * Grupos "manuais" para chaves comuns em modelos DOCX que não estão no
 * catálogo canônico ou que precisam ser reagrupadas para o usuário final.
 * Os `keys` incluem todas as variações que já apareceram em placeholders.
 */
const MANUAL_GROUPS: Omit<PresentationGroup, "primaryKey">[] = [
  // Data atual e data por extenso são preenchidas automaticamente pelo sistema
  // (São Paulo, dia X de mês de ano) — não aparecem na revisão.
  {
    id: "grp_data_sepultamento",
    label: "Data do sepultamento",
    section: "sepultamento",
    keys: ["dataSep", "data_sep", "data_sepultamento", "dataSepultamento"],
  },
  {
    id: "grp_hora_sepultamento",
    label: "Horário do sepultamento",
    section: "sepultamento",
    keys: ["horaSep", "hora_sep", "hora_sepultamento", "horario_sepultamento"],
  },
  {
    id: "grp_local_sepultamento",
    label: "Local do sepultamento",
    section: "sepultamento",
    keys: ["localSep", "local_sep", "local_sepultamento"],
  },
  {
    id: "grp_sala_velorio",
    label: "Sala do velório",
    section: "velorio",
    keys: ["salaVelorio", "sala_velorio", "sala"],
  },
  {
    id: "grp_inicio_velorio",
    label: "Início do velório",
    section: "velorio",
    keys: ["inicioVelorio", "inicio_velorio", "hora_inicio_velorio"],
  },
  {
    id: "grp_fim_velorio",
    label: "Término do velório",
    section: "velorio",
    keys: ["fimVelorio", "fim_velorio", "hora_fim_velorio"],
  },
  {
    id: "grp_funeraria",
    label: "Funerária",
    section: "dados_administrativos",
    keys: ["funeraria", "empresa_funeraria", "nomeFuneraria"],
  },
  {
    id: "grp_placa",
    label: "Placa de identificação",
    section: "sepultamento",
    keys: ["placa", "placa_identificacao", "placaId"],
  },
  {
    id: "grp_falecido_generico",
    label: "Nome do falecido",
    section: "falecido",
    keys: ["falecido", "falecido1", "nomeFalecido", "nomefal"],
  },
];

const MANUAL_INDEX = new Map<string, Omit<PresentationGroup, "primaryKey">>();
for (const grp of MANUAL_GROUPS) {
  for (const k of grp.keys) MANUAL_INDEX.set(normalizeKey(k), grp);
}

/** Converte uma chave desconhecida em um label legível. */
function humanizeKey(key: string): string {
  const clean = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .trim()
    .toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export interface GroupFieldsInput {
  keys: readonly string[];
  fields: Record<string, string | undefined>;
}

export interface GroupFieldsResult {
  sections: PresentationSection[];
  /** Índice chave → grupo, para lookup ao editar. */
  keyToGroup: Map<string, PresentationGroup>;
}

/**
 * Constrói a hierarquia de seções → grupos a partir das chaves conhecidas
 * no atendimento (união de campos extraídos + placeholders dos modelos).
 */
/**
 * Chaves preenchidas automaticamente pelo sistema (data atual e derivados).
 * Nunca aparecem na revisão manual — o `buildTemplatePayload` injeta o
 * valor calculado no fuso "America/Sao_Paulo" na geração do DOCX.
 */
const AUTO_FILLED_KEYS = new Set<string>(
  [
    "data_atual",
    "data_atual_extenso",
    "dataAtual",
    "dataAtualExtenso",
    "dataExt",
    "dataAt",
    "dataContr",
    "dataRec",
  ].map(normalizeKey),
);

export function isAutoFilledKey(key: string): boolean {
  return AUTO_FILLED_KEYS.has(normalizeKey(key));
}

export function groupFields({ keys, fields }: GroupFieldsInput): GroupFieldsResult {
  // groupId → { def, keys[] }
  type Bucket = {
    id: string;
    label: string;
    section: PresentationSection["id"];
    keys: string[];
  };
  const buckets = new Map<string, Bucket>();

  for (const key of keys) {
    const norm = normalizeKey(key);
    if (AUTO_FILLED_KEYS.has(norm)) continue;
    const catalogDef = CATALOG_INDEX.get(norm);
    const manual = !catalogDef ? MANUAL_INDEX.get(norm) : undefined;

    let bucketId: string;
    let label: string;
    let section: PresentationSection["id"];

    if (catalogDef) {
      bucketId = `cat:${catalogDef.canonicalKey}`;
      label = catalogDef.label;
      section = catalogDef.section;
    } else if (manual) {
      bucketId = `man:${manual.id}`;
      label = manual.label;
      section = manual.section;
    } else {
      // Chave desconhecida — vira grupo próprio em "outros".
      bucketId = `raw:${key}`;
      label = humanizeKey(key);
      section = "outros";
    }

    const existing = buckets.get(bucketId);
    if (existing) {
      if (!existing.keys.includes(key)) existing.keys.push(key);
    } else {
      buckets.set(bucketId, { id: bucketId, label, section, keys: [key] });
    }
  }

  // Constrói grupos escolhendo primaryKey (primeira chave com valor não vazio).
  const keyToGroup = new Map<string, PresentationGroup>();
  const sectionsMap = new Map<PresentationSection["id"], PresentationGroup[]>();

  for (const bucket of buckets.values()) {
    const primaryKey =
      bucket.keys.find((k) => (fields[k] ?? "").trim().length > 0) ?? bucket.keys[0];
    const group: PresentationGroup = {
      id: bucket.id,
      label: bucket.label,
      section: bucket.section,
      keys: bucket.keys,
      primaryKey,
    };
    for (const k of bucket.keys) keyToGroup.set(k, group);
    const arr = sectionsMap.get(bucket.section) ?? [];
    arr.push(group);
    sectionsMap.set(bucket.section, arr);
  }

  const sections: PresentationSection[] = [];
  for (const [id, groups] of sectionsMap.entries()) {
    const meta = SECTION_META[id] ?? SECTION_META.outros;
    groups.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    sections.push({ id, label: meta.label, order: meta.order, groups });
  }
  sections.sort((a, b) => a.order - b.order);

  return { sections, keyToGroup };
}

/** Rótulo amigável para uma chave isolada (usado em resumos/badges). */
export function getFriendlyLabel(key: string): string {
  const norm = normalizeKey(key);
  const def = CATALOG_INDEX.get(norm);
  if (def) return def.label;
  const manual = MANUAL_INDEX.get(norm);
  if (manual) return manual.label;
  return humanizeKey(key);
}

/** Retorna true quando o valor deve ser tratado como "não informado". */
export function isBlankValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const low = trimmed.toLowerCase();
  return low === "undefined" || low === "null" || low === "nan";
}
