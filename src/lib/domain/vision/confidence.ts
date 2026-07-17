/**
 * Cálculo de confiança agregada. A confiança é uma função de:
 *
 * - existência de rótulo explícito;
 * - tipo do documento;
 * - qualidade da imagem (usada só se disponível);
 * - consistência com o processo;
 * - repetição em múltiplos documentos;
 * - validação determinística (CPF/data/etc);
 * - ausência de conflito.
 *
 * A confiança final não é apenas um "ícone colorido": ela decide se
 * o assistente pode oferecer confirmação em lote (>= 0.90) ou se o
 * item precisa de revisão obrigatória (< 0.75 ou conflito).
 */

export type ConfidenceBand = "alta" | "revisar" | "baixa" | "conflito";

export function confidenceBand(confidence: number, hasConflict: boolean): ConfidenceBand {
  if (hasConflict) return "conflito";
  if (confidence >= 0.9) return "alta";
  if (confidence >= 0.75) return "revisar";
  return "baixa";
}

export type ConfidenceSignals = {
  hasExplicitLabel?: boolean;
  documentTypeStrong?: boolean;
  processConsistent?: boolean;
  repetitionCount?: number;
  deterministicValid?: boolean;
  hasConflict?: boolean;
  base: number;
};

/** Combina sinais em uma nova confiança. */
export function computeConfidence(signals: ConfidenceSignals): number {
  let c = signals.base;
  if (signals.hasExplicitLabel) c += 0.15;
  if (signals.documentTypeStrong) c += 0.1;
  if (signals.processConsistent) c += 0.05;
  if (signals.deterministicValid) c += 0.1;
  if (signals.deterministicValid === false) c -= 0.3;
  if (signals.hasConflict) c -= 0.25;
  if ((signals.repetitionCount ?? 0) >= 2) c += 0.05;
  return Math.max(0, Math.min(1, c));
}

export function canConfirmInBatch(confidence: number, hasConflict: boolean): boolean {
  if (hasConflict) return false;
  return confidence >= 0.9;
}
