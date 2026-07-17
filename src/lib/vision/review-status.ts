/**
 * Modelo de "revisão por exceção" para os dados extraídos.
 *
 * A avaliação acontece por conceito apresentado ao usuário, não por alias
 * técnico isolado. Assim, se `cpfResp` estiver preenchido e
 * `cpf_responsavel` vazio, o grupo continua resolvido em vez de criar uma
 * pendência duplicada. A contagem também considera cada conceito uma só vez.
 */
import type { FlatFieldMeta } from "./flatten-vision";
import { groupFields, isBlankValue } from "./field-presentation";

export type FieldStatus = "normal" | "revisar" | "conflito" | "nao_encontrado" | "opcional_vazio";

const CONFIDENCE_THRESHOLD = 0.9;

export function isReviewBlankValue(value: unknown): boolean {
  if (isBlankValue(value)) return true;
  if (typeof value !== "string") return true;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
  return ["nao informado", "informacao pendente", "n/a", "na", "nao se aplica"].includes(
    normalized,
  );
}

export interface ComputeFieldStatusInput {
  value: string | undefined;
  meta: FlatFieldMeta | undefined;
  isCritical: boolean;
}

export function computeFieldStatus(input: ComputeFieldStatusInput): FieldStatus {
  const { value, meta, isCritical } = input;
  const blank = isReviewBlankValue(value);

  if (meta?.hasConflict && !meta.confirmedByUser) return "conflito";
  if (blank) return isCritical ? "nao_encontrado" : "opcional_vazio";
  if (meta && !meta.confirmedByUser && meta.confidence < CONFIDENCE_THRESHOLD) {
    return "revisar";
  }
  return "normal";
}

export interface ReviewSummary {
  statuses: Record<string, FieldStatus>;
  /** Quantidade de conceitos que realmente exigem ação, sem duplicar aliases. */
  pendingCount: number;
  /** Uma chave representativa por conceito crítico bloqueado. */
  blockingKeys: string[];
  canGenerate: boolean;
}

export interface ComputeReviewSummaryInput {
  keys: readonly string[];
  fields: Record<string, string | undefined>;
  meta: Record<string, FlatFieldMeta | undefined>;
  criticalKeys: ReadonlySet<string>;
}

function normalizeComparableValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeReviewSummary(input: ComputeReviewSummaryInput): ReviewSummary {
  const { keys, fields, meta, criticalKeys } = input;
  const statuses: Record<string, FieldStatus> = {};
  const blocking: string[] = [];
  let pending = 0;

  const { sections } = groupFields({ keys, fields });

  for (const group of sections.flatMap((section) => section.groups)) {
    const valueKey = group.keys.find((key) => !isReviewBlankValue(fields[key]));
    const value = valueKey ? fields[valueKey] : undefined;
    const isCritical = group.keys.some((key) => criticalKeys.has(key));

    const groupMetas = group.keys
      .map((key) => meta[key])
      .filter((item): item is FlatFieldMeta => !!item);
    const selectedMeta = (valueKey ? meta[valueKey] : undefined) ?? groupMetas[0];

    const distinctValues = new Set(
      group.keys
        .map((key) => fields[key])
        .filter((item): item is string => !isReviewBlankValue(item))
        .map(normalizeComparableValue),
    );
    const hasConflict =
      distinctValues.size > 1 || groupMetas.some((item) => item.hasConflict === true);

    const effectiveMeta = selectedMeta
      ? { ...selectedMeta, hasConflict }
      : hasConflict
        ? {
            key: group.primaryKey,
            value: value ?? "",
            confidence: 1,
            hasConflict: true,
          }
        : undefined;

    const status = computeFieldStatus({ value, meta: effectiveMeta, isCritical });
    for (const key of group.keys) statuses[key] = status;

    if (status === "revisar" || status === "conflito" || status === "nao_encontrado") {
      pending += 1;
    }
    if (isCritical && (status === "conflito" || status === "nao_encontrado")) {
      blocking.push(valueKey ?? group.primaryKey);
    }
  }

  return {
    statuses,
    pendingCount: pending,
    blockingKeys: blocking,
    canGenerate: blocking.length === 0,
  };
}
