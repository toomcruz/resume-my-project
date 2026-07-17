import { describe, expect, it } from "vitest";
import { isQuestionVisible, isVelorioSepultamentoValid } from "../questions";
import type { AttendanceContext } from "../types";

describe("isVelorioSepultamentoValid", () => {
  it("aceita somente velório", () => {
    expect(
      isVelorioSepultamentoValid({ has_wake: "sim", burial_here: "nao" }),
    ).toBe(true);
  });
  it("aceita somente sepultamento", () => {
    expect(
      isVelorioSepultamentoValid({ has_wake: "nao", burial_here: "sim" }),
    ).toBe(true);
  });
  it("aceita velório e sepultamento", () => {
    expect(
      isVelorioSepultamentoValid({ has_wake: "sim", burial_here: "sim" }),
    ).toBe(true);
  });
  it("rejeita nao/nao", () => {
    expect(
      isVelorioSepultamentoValid({ has_wake: "nao", burial_here: "nao" }),
    ).toBe(false);
  });
  it("rejeita entradas incompletas", () => {
    expect(isVelorioSepultamentoValid({})).toBe(false);
  });
});

describe("isQuestionVisible", () => {
  const exec: AttendanceContext = {
    process: "exumacao",
    exhumation_phase: "execucao",
  };

  it("gaveta disponível só aparece em sepultamento em jazigo", () => {
    expect(
      isQuestionVisible("jazigo_possui_gaveta_disponivel", {
        process: "velorio_sepultamento",
        burial_here: "sim",
        local_sepultamento_tipo: "jazigo",
      }),
    ).toBe(true);
    expect(
      isQuestionVisible("jazigo_possui_gaveta_disponivel", {
        process: "velorio_sepultamento",
        burial_here: "sim",
        local_sepultamento_tipo: "quadra_geral",
      }),
    ).toBe(false);
  });

  it("resultado_exumacao só aparece na execução", () => {
    expect(isQuestionVisible("resultado_exumacao", exec)).toBe(true);
    expect(
      isQuestionVisible("resultado_exumacao", {
        process: "exumacao",
        exhumation_phase: "preparacao",
      }),
    ).toBe(false);
  });

  it("destino_fora_jazigo só aparece em jazigo com ossos liberados", () => {
    expect(
      isQuestionVisible("destino_fora_jazigo", {
        ...exec,
        local_sepultamento_tipo: "jazigo",
        resultado_exumacao: "ossos_liberados",
      }),
    ).toBe(true);
    expect(
      isQuestionVisible("destino_fora_jazigo", {
        ...exec,
        local_sepultamento_tipo: "quadra_geral",
        resultado_exumacao: "ossos_liberados",
      }),
    ).toBe(false);
  });

  it("destino_pos_exumacao em jazigo exige destino_fora_jazigo=sim", () => {
    expect(
      isQuestionVisible("destino_pos_exumacao", {
        ...exec,
        local_sepultamento_tipo: "jazigo",
        resultado_exumacao: "ossos_liberados",
        destino_fora_jazigo: "sim",
      }),
    ).toBe(true);
    expect(
      isQuestionVisible("destino_pos_exumacao", {
        ...exec,
        local_sepultamento_tipo: "jazigo",
        resultado_exumacao: "ossos_liberados",
        destino_fora_jazigo: "nao",
      }),
    ).toBe(false);
  });

  it("modalidade_ossario aparece apenas quando destino=ossario", () => {
    const ctx: AttendanceContext = {
      ...exec,
      local_sepultamento_tipo: "quadra_geral",
      resultado_exumacao: "ossos_liberados",
      destino_pos_exumacao: "ossario",
    };
    expect(isQuestionVisible("modalidade_ossario", ctx)).toBe(true);
    expect(
      isQuestionVisible("tipo_translado", {
        ...ctx,
        destino_pos_exumacao: "translado",
      }),
    ).toBe(true);
  });
});
