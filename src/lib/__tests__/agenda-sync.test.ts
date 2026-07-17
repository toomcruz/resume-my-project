import { describe, expect, it } from "vitest";
import {
  buildAgendaSyncPatch,
  hasWake,
  resolveAgendaType,
  shouldCreateAgendaEvent,
} from "@/lib/agenda-sync";
import { getProcess } from "@/lib/processes";

describe("resolveAgendaType", () => {
  it("returns velorio_sepultamento for sepultamento (test 1)", () => {
    expect(resolveAgendaType("sepultamento")).toBe("velorio_sepultamento");
  });

  it("returns exumacao for plain exumation (test 2)", () => {
    expect(resolveAgendaType("exumacao")).toBe("exumacao");
    expect(resolveAgendaType("exumacao", "")).toBe("exumacao");
    expect(resolveAgendaType("exumacao", "exumacao")).toBe("exumacao");
  });

  it("returns exumacao_pss when tipo is exumacao_pss (test 3)", () => {
    expect(resolveAgendaType("exumacao", "exumacao_pss")).toBe("exumacao_pss");
  });

  it("returns null for unrelated processes", () => {
    expect(resolveAgendaType("outro" as never)).toBeNull();
  });
});

describe("hasWake", () => {
  it("only accepts the explicit SIM choice", () => {
    expect(hasWake({ tem_velorio: "SIM" })).toBe(true);
    expect(hasWake({ tem_velorio: "NAO" })).toBe(false);
    expect(hasWake({ sala_velorio: "A" })).toBe(false);
    expect(hasWake({})).toBe(false);
  });
});

describe("shouldCreateAgendaEvent", () => {
  it("does not create when there is no scheduled date (test 4)", () => {
    expect(shouldCreateAgendaEvent("sepultamento", { tem_velorio: "SIM" })).toBe(false);
    expect(
      shouldCreateAgendaEvent("sepultamento", {
        data_agendada: "   ",
        tem_velorio: "SIM",
      }),
    ).toBe(false);
    expect(
      shouldCreateAgendaEvent("exumacao", { hora_agendamento: "10:00" }),
    ).toBe(false);
  });

  it("does not create a wake event for a burial without wake", () => {
    expect(
      shouldCreateAgendaEvent("sepultamento", {
        data_agendada: "2026-07-20",
        tem_velorio: "NAO",
      }),
    ).toBe(false);
  });

  it("creates a linked event for wake plus burial", () => {
    expect(
      shouldCreateAgendaEvent("sepultamento", {
        data_agendada: "2026-07-20",
        tem_velorio: "SIM",
      }),
    ).toBe(true);
  });

  it("creates exhumation events when a date is provided", () => {
    expect(
      shouldCreateAgendaEvent("exumacao", { data_agendada: "2026-07-20" }),
    ).toBe(true);
  });

  it("never creates for unrelated processes", () => {
    expect(
      shouldCreateAgendaEvent("translado", { data_agendada: "2026-07-20" }),
    ).toBe(false);
  });
});

describe("sepultamento process form", () => {
  it("does not embed the operational agenda fields in generic extra fields", () => {
    const process = getProcess("sepultamento");
    expect(process?.extraFields ?? []).toEqual([]);
  });
});

describe("buildAgendaSyncPatch", () => {
  const baseEvent = {
    id: "e1",
    deceased_name: null,
    responsible_name: "Maria",
    location: "",
    room: null,
    start_time: null,
    burial_time: "14:00",
  } as const;

  it("fills empty fields with extracted values (test 5)", () => {
    const patch = buildAgendaSyncPatch(baseEvent, {
      deceased_name: "José da Silva",
      location: "Q3-R5",
      start_time: "09:00",
      burial_time: "15:00",
    });
    expect(patch).toEqual({
      deceased_name: "José da Silva",
      location: "Q3-R5",
      start_time: "09:00",
    });
  });

  it("never overwrites fields that already have a value (test 6)", () => {
    const patch = buildAgendaSyncPatch(baseEvent, {
      responsible_name: "Outro Nome",
      burial_time: "20:00",
    });
    expect(patch).toEqual({});
  });

  it("ignores null / blank candidates", () => {
    const patch = buildAgendaSyncPatch(baseEvent, {
      deceased_name: null,
      location: "   ",
    });
    expect(patch).toEqual({});
  });
});
