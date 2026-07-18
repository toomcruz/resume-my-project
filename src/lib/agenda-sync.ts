import type { AgendaType } from "@/lib/agenda";
import {
  EXHUMATION_TIME_SLOTS,
  isExhumationTimeSlot,
  isExhumationWorkingDay,
} from "@/lib/domain/exhumation-slots";

/**
 * Pure helpers for the agenda linkage flow.
 *
 * Extracted from the "new attendance" route and the extract server function so
 * their business rules can be unit-tested without touching Supabase or the UI.
 */

export type ProcessKey = "sepultamento" | "exumacao" | (string & {});

/** Resolves which operational agenda an attendance belongs to. */
export function resolveAgendaType(
  processKey: ProcessKey,
  tipoAgendaExumacao?: string | null,
): AgendaType | null {
  if (processKey === "sepultamento") return "velorio_sepultamento";
  if (processKey === "exumacao") {
    return tipoAgendaExumacao === "exumacao_pss" ? "exumacao_pss" : "exumacao";
  }
  return null;
}

/** Returns true only when the burial flow explicitly includes a wake. */
export function hasWake(extras: Record<string, string | undefined>): boolean {
  return extras.tem_velorio === "SIM";
}

export function burialRequiresPps(
  subprocess: string | null | undefined,
  extras: Record<string, string | undefined>,
): boolean {
  return subprocess === "jazigo" && extras.jazigo_possui_gaveta_disponivel === "nao";
}

/**
 * Determines whether a new attendance should automatically produce an agenda
 * event.
 *
 * Exhumation keeps its current automatic linkage flow. Burial only creates a
 * linked event when the user explicitly chooses "Sim, haverá velório". A plain
 * burial therefore remains outside the wake agenda and does not generate an
 * empty or misleading row.
 */
export function shouldCreateAgendaEvent(
  processKey: ProcessKey,
  extras: Record<string, string | undefined>,
): boolean {
  const eventDate = extras.data_agendada?.trim();
  if (!eventDate) return false;
  if (processKey === "exumacao") return true;
  if (processKey === "sepultamento") {
    return hasWake(extras) || extras.jazigo_possui_gaveta_disponivel === "nao";
  }
  return false;
}

/**
 * Builds a partial update patch that only fills empty fields on the linked
 * agenda event. Non-empty existing values are preserved so extraction cannot
 * overwrite manual entries.
 */
export function buildAgendaSyncPatch<E extends Record<string, unknown>>(
  event: E,
  candidates: Record<string, string | null>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [field, candidate] of Object.entries(candidates)) {
    const current = String(event[field] ?? "").trim();
    if (!current && candidate && candidate.trim()) {
      patch[field] = candidate;
    }
  }
  return patch;
}

/**
 * PPS-specific rules (Exumação PSS agenda):
 * - date must fall on a working day (Mon-Fri);
 * - time, when informed, must be one of the fixed slots (08:30, 09:00, 09:30).
 * Returns a list of user-facing error messages; empty when valid.
 */
export interface PpsScheduleInput {
  processKey: ProcessKey;
  subprocess?: string | null;
  tipoAgendaExumacao?: string | null;
  jazigoPossuiGavetaDisponivel?: string | null;
  data_agendada?: string;
  hora_agendamento?: string;
}

export function isPpsSchedule(input: PpsScheduleInput): boolean {
  return (
    (input.processKey === "exumacao" && input.tipoAgendaExumacao === "exumacao_pss") ||
    (input.processKey === "sepultamento" &&
      input.subprocess === "jazigo" &&
      input.jazigoPossuiGavetaDisponivel === "nao")
  );
}

export function validatePpsSchedule(input: PpsScheduleInput): string[] {
  if (!isPpsSchedule(input)) return [];
  const errors: string[] = [];
  const dateRaw = input.data_agendada?.trim();
  if (dateRaw) {
    const [y, m, d] = dateRaw.split("-").map((part) => Number.parseInt(part, 10));
    if (
      Number.isFinite(y) &&
      Number.isFinite(m) &&
      Number.isFinite(d) &&
      !isExhumationWorkingDay(new Date(y, m - 1, d, 12, 0, 0))
    ) {
      errors.push("Exumação PSS ocorre apenas de segunda a sexta-feira.");
    }
  }
  const timeRaw = input.hora_agendamento?.trim();
  if (timeRaw && !isExhumationTimeSlot(timeRaw)) {
    errors.push(`Horário inválido para Exumação PSS. Use ${EXHUMATION_TIME_SLOTS.join(", ")}.`);
  }
  return errors;
}
