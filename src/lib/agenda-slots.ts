import type { AgendaEvent, AgendaStatus } from "@/lib/agenda";
import {
  EXHUMATION_TIME_SLOTS,
  type ExhumationTimeSlot,
} from "@/lib/domain/exhumation-slots";

/**
 * Mapa da nomenclatura de status usada no runtime da agenda para a
 * nomenclatura do domínio de exumação. Statuses ausentes aqui liberam a vaga.
 *
 * Regra: apenas "concluido" e "cancelado" liberam a vaga; "agendado",
 * "confirmado", "em_andamento" e "pendente" mantêm o slot ocupado.
 */
export function isAgendaStatusBlocking(status: AgendaStatus): boolean {
  return status !== "concluido" && status !== "cancelado";
}

export interface ExhumationSlotUsage {
  slot: ExhumationTimeSlot;
  occupied: boolean;
  events: AgendaEvent[];
}

function trimTime(value: string | null | undefined): string {
  return (value ?? "").slice(0, 5);
}

/**
 * Calcula a ocupação dos três horários fixos da exumação para uma lista de
 * eventos já filtrada por data e agenda_type.
 */
export function computeExhumationSlotUsage(
  events: readonly AgendaEvent[],
): ExhumationSlotUsage[] {
  return EXHUMATION_TIME_SLOTS.map((slot) => {
    const matching = events.filter(
      (event) =>
        trimTime(event.start_time) === slot && isAgendaStatusBlocking(event.status),
    );
    return { slot, occupied: matching.length > 0, events: matching };
  });
}
