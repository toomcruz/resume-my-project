import { describe, expect, it } from "vitest";
import { isPpsSchedule, validatePpsSchedule } from "@/lib/agenda-sync";

describe("isPpsSchedule", () => {
  it("é true apenas para exumação com destino exumacao_pss", () => {
    expect(
      isPpsSchedule({ processKey: "exumacao", tipoAgendaExumacao: "exumacao_pss" }),
    ).toBe(true);
    expect(
      isPpsSchedule({ processKey: "exumacao", tipoAgendaExumacao: "exumacao" }),
    ).toBe(false);
    expect(
      isPpsSchedule({ processKey: "sepultamento", tipoAgendaExumacao: "exumacao_pss" }),
    ).toBe(false);
  });
});

describe("validatePpsSchedule", () => {
  const base = {
    processKey: "exumacao" as const,
    tipoAgendaExumacao: "exumacao_pss" as const,
  };

  it("não retorna erros fora do contexto PPS", () => {
    expect(
      validatePpsSchedule({
        processKey: "exumacao",
        tipoAgendaExumacao: "exumacao",
        data_agendada: "2026-07-18", // sábado
        hora_agendamento: "10:00",
      }),
    ).toEqual([]);
  });

  it("aprova quinta-feira com slot válido", () => {
    // 2026-07-16 é uma quinta-feira.
    expect(
      validatePpsSchedule({
        ...base,
        data_agendada: "2026-07-16",
        hora_agendamento: "09:00",
      }),
    ).toEqual([]);
  });

  it("rejeita sábado", () => {
    // 2026-07-18 é sábado.
    const errors = validatePpsSchedule({
      ...base,
      data_agendada: "2026-07-18",
      hora_agendamento: "09:00",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/segunda a sexta/i);
  });

  it("rejeita horário fora dos slots fixos", () => {
    const errors = validatePpsSchedule({
      ...base,
      data_agendada: "2026-07-16",
      hora_agendamento: "10:00",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/08:30, 09:00, 09:30/);
  });

  it("aceita ausência de campos (retorna vazio)", () => {
    expect(validatePpsSchedule({ ...base })).toEqual([]);
  });
});
