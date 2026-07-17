import { describe, expect, it } from "vitest";
import {
  EXHUMATION_TIME_SLOTS,
  isExhumationBlockingStatus,
  isExhumationTimeSlot,
  isExhumationWorkingDay,
} from "../exhumation-slots";

describe("exhumation-slots — configuração central", () => {
  it("expõe exatamente 08:30, 09:00 e 09:30", () => {
    expect([...EXHUMATION_TIME_SLOTS]).toEqual(["08:30", "09:00", "09:30"]);
  });

  it("valida horários permitidos", () => {
    expect(isExhumationTimeSlot("08:30")).toBe(true);
    expect(isExhumationTimeSlot("10:00")).toBe(false);
    expect(isExhumationTimeSlot("")).toBe(false);
  });

  it("aceita segunda a sexta e rejeita sábado/domingo", () => {
    // 2026-07-13 é segunda-feira
    expect(isExhumationWorkingDay(new Date("2026-07-13T12:00:00Z"))).toBe(true);
    expect(isExhumationWorkingDay(new Date("2026-07-17T12:00:00Z"))).toBe(true);
    // sábado
    expect(isExhumationWorkingDay(new Date("2026-07-18T12:00:00Z"))).toBe(false);
    // domingo
    expect(isExhumationWorkingDay(new Date("2026-07-19T12:00:00Z"))).toBe(false);
  });

  it("status que bloqueiam vaga", () => {
    expect(isExhumationBlockingStatus("agendado")).toBe(true);
    expect(isExhumationBlockingStatus("confirmado")).toBe(true);
    expect(isExhumationBlockingStatus("em_execucao")).toBe(true);
  });

  it("status que liberam vaga", () => {
    expect(isExhumationBlockingStatus("cancelado")).toBe(false);
    expect(isExhumationBlockingStatus("realizado")).toBe(false);
    expect(isExhumationBlockingStatus("nao_compareceu")).toBe(false);
  });
});
