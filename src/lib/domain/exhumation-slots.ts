/**
 * Single source of truth for the Exhumation agenda scheduling window.
 *
 * The specification fixes the working days (Mon-Fri) and the three exact
 * time slots (08:30, 09:00, 09:30). Every UI component, validator and
 * server-side check MUST import from here — do not hard-code these values
 * anywhere else.
 */

/** Valid time slots (HH:mm) for the Exhumation agenda. */
export const EXHUMATION_TIME_SLOTS = ["08:30", "09:00", "09:30"] as const;

export type ExhumationTimeSlot = (typeof EXHUMATION_TIME_SLOTS)[number];

/** ISO day-of-week numbers considered working days (Mon=1 ... Sun=7). */
export const EXHUMATION_WORKING_DAYS = [1, 2, 3, 4, 5] as const;

/**
 * Status values that keep an appointment slot occupied. Every other status
 * (cancelado, realizado, nao_compareceu) frees the slot.
 */
export const EXHUMATION_SLOT_BLOCKING_STATUSES = [
  "agendado",
  "confirmado",
  "em_execucao",
] as const;

export type ExhumationAppointmentStatus =
  | "agendado"
  | "confirmado"
  | "em_execucao"
  | "realizado"
  | "cancelado"
  | "reagendado"
  | "nao_compareceu";

export function isExhumationWorkingDay(date: Date): boolean {
  // getDay() returns 0 (Sun)-6 (Sat). Map to ISO 1 (Mon)-7 (Sun).
  const iso = date.getDay() === 0 ? 7 : date.getDay();
  return (EXHUMATION_WORKING_DAYS as readonly number[]).includes(iso);
}

export function isExhumationTimeSlot(value: string): value is ExhumationTimeSlot {
  return (EXHUMATION_TIME_SLOTS as readonly string[]).includes(value);
}

export function isExhumationBlockingStatus(
  status: ExhumationAppointmentStatus,
): boolean {
  return (EXHUMATION_SLOT_BLOCKING_STATUSES as readonly string[]).includes(status);
}
