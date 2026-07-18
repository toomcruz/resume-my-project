import { describe, expect, it } from "vitest";
import {
  computeExhumationSlotUsage,
  isAgendaStatusBlocking,
} from "@/lib/agenda-slots";
import type { AgendaEvent, AgendaStatus } from "@/lib/agenda";

function make(id: string, start: string | null, status: AgendaStatus): AgendaEvent {
  return {
    id,
    user_id: "u",
    attendance_id: null,
    agenda_type: "exumacao",
    event_date: "2026-07-16",
    start_time: start,
    end_time: null,
    deceased_name: null,
    responsible_name: null,
    registration_number: null,
    service: null,
    location: null,
    room: null,
    burial_time: null,
    burial_location: null,
    funeral_home: null,
    family_present: null,
    destination: null,
    result_status: null,
    payment_date: null,
    pss_reference: null,
    status,
    notes: null,
    quadra_rua: null,
    terreno: null,
    gaveta: null,
    arrival_time: null,
    driver_name: null,
    vehicle_plate: null,
    created_at: "",
    updated_at: "",
  };
}

describe("isAgendaStatusBlocking", () => {
  it("libera apenas concluido e cancelado", () => {
    expect(isAgendaStatusBlocking("agendado")).toBe(true);
    expect(isAgendaStatusBlocking("confirmado")).toBe(true);
    expect(isAgendaStatusBlocking("em_andamento")).toBe(true);
    expect(isAgendaStatusBlocking("pendente")).toBe(true);
    expect(isAgendaStatusBlocking("concluido")).toBe(false);
    expect(isAgendaStatusBlocking("cancelado")).toBe(false);
  });
});

describe("computeExhumationSlotUsage", () => {
  it("marca os três slots como livres quando não há eventos", () => {
    const usage = computeExhumationSlotUsage([]);
    expect(usage.map((slot) => slot.slot)).toEqual(["08:30", "09:00", "09:30"]);
    expect(usage.every((slot) => !slot.occupied)).toBe(true);
  });

  it("marca slot como ocupado quando existe evento agendado no horário", () => {
    const usage = computeExhumationSlotUsage([make("a", "09:00:00", "agendado")]);
    expect(usage.find((slot) => slot.slot === "09:00")?.occupied).toBe(true);
    expect(usage.find((slot) => slot.slot === "08:30")?.occupied).toBe(false);
  });

  it("ignora eventos cancelados ou concluídos", () => {
    const usage = computeExhumationSlotUsage([
      make("a", "08:30", "cancelado"),
      make("b", "09:30", "concluido"),
    ]);
    expect(usage.every((slot) => !slot.occupied)).toBe(true);
  });

  it("agrega múltiplos eventos no mesmo slot", () => {
    const usage = computeExhumationSlotUsage([
      make("a", "09:00", "agendado"),
      make("b", "09:00", "confirmado"),
    ]);
    expect(usage.find((slot) => slot.slot === "09:00")?.events).toHaveLength(2);
  });
});
