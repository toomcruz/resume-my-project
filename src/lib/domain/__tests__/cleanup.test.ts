import { describe, expect, it } from "vitest";
import { applyAnswer } from "../cleanup";
import type { AttendanceContext } from "../types";

const base: AttendanceContext = {
  process: "exumacao",
  exhumation_phase: "execucao",
  local_sepultamento_tipo: "jazigo",
  resultado_exumacao: "ossos_liberados",
  destino_fora_jazigo: "sim",
  destino_pos_exumacao: "ossario",
  modalidade_ossario: "aquisicao",
};

describe("applyAnswer — limpeza de descendentes", () => {
  it("resultado_exumacao → semi_intacto limpa todos os destinos", () => {
    const next = applyAnswer(base, "resultado_exumacao", "semi_intacto");
    expect(next.destino_fora_jazigo).toBeUndefined();
    expect(next.destino_pos_exumacao).toBeUndefined();
    expect(next.modalidade_ossario).toBeUndefined();
    expect(next.tipo_translado).toBeUndefined();
  });

  it("destino_fora_jazigo sim → nao limpa destino_pos_exumacao e filhos", () => {
    const next = applyAnswer(base, "destino_fora_jazigo", "nao");
    expect(next.destino_pos_exumacao).toBeUndefined();
    expect(next.modalidade_ossario).toBeUndefined();
    expect(next.tipo_translado).toBeUndefined();
  });

  it("destino_pos_exumacao ossario → translado limpa modalidade_ossario", () => {
    const next = applyAnswer(base, "destino_pos_exumacao", "translado");
    expect(next.modalidade_ossario).toBeUndefined();
    expect(next.destino_pos_exumacao).toBe("translado");
  });

  it("destino_pos_exumacao translado → ossario limpa tipo_translado", () => {
    const withTranslado: AttendanceContext = {
      ...base,
      destino_pos_exumacao: "translado",
      tipo_translado: "interno",
      modalidade_ossario: undefined,
    };
    const next = applyAnswer(withTranslado, "destino_pos_exumacao", "ossario");
    expect(next.tipo_translado).toBeUndefined();
  });

  it("local_sepultamento_tipo jazigo → quadra_geral limpa gaveta disponível", () => {
    const ctx: AttendanceContext = {
      process: "velorio_sepultamento",
      burial_here: "sim",
      local_sepultamento_tipo: "jazigo",
      jazigo_possui_gaveta_disponivel: "nao",
    };
    const next = applyAnswer(ctx, "local_sepultamento_tipo", "quadra_geral");
    expect(next.jazigo_possui_gaveta_disponivel).toBeUndefined();
  });

  it("não muda estado quando o valor é o mesmo", () => {
    const next = applyAnswer(base, "resultado_exumacao", "ossos_liberados");
    expect(next).toEqual(base);
  });

  it("não muta o objeto de entrada", () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    applyAnswer(base, "resultado_exumacao", "semi_intacto");
    expect(base).toEqual(snapshot);
  });
});
