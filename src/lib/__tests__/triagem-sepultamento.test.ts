import { describe, expect, it } from "vitest";
import {
  applyLocalSepultamento,
  buildTriagemOverrides,
  computeQuickDate,
  formatIsoToBr,
  validateTriagemSepultamento,
  HORARIOS_SEPULTAMENTO,
  HORARIOS_VELORIO,
  SALAS_VELORIO,
  TRIAGEM_SEPULTAMENTO_REVIEW_KEYS,
} from "@/lib/triagem-sepultamento";

describe("triagem-sepultamento", () => {
  it("quadra geral → concessao NAO, quadra_geral_gaveta SIM", () => {
    expect(applyLocalSepultamento("quadra_geral")).toEqual({
      concessao: "NAO",
      quadra_geral_gaveta: "SIM",
    });
  });

  it("jazigo → concessao SIM, quadra_geral_gaveta NAO", () => {
    expect(applyLocalSepultamento("jazigo")).toEqual({
      concessao: "SIM",
      quadra_geral_gaveta: "NAO",
    });
  });

  it("computeQuickDate soma dias a partir da data base", () => {
    const base = new Date(2026, 6, 16);
    expect(computeQuickDate("hoje", base)).toBe("2026-07-16");
    expect(computeQuickDate("amanha", base)).toBe("2026-07-17");
    expect(computeQuickDate("mais2", base)).toBe("2026-07-18");
  });

  it("formatIsoToBr converte YYYY-MM-DD → DD/MM/AAAA", () => {
    expect(formatIsoToBr("2026-07-16")).toBe("16/07/2026");
    expect(formatIsoToBr("nao-iso")).toBe("nao-iso");
  });

  it("expõe os 7 horários oficiais e 6 salas A..F", () => {
    expect(HORARIOS_SEPULTAMENTO).toEqual([
      "10:00",
      "11:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
    ]);
    expect(SALAS_VELORIO).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("expõe horários de velório de 08:00 a 23:30 em intervalos de 30 minutos", () => {
    expect(HORARIOS_VELORIO).toHaveLength(32);
    expect(HORARIOS_VELORIO.slice(0, 4)).toEqual(["08:00", "08:30", "09:00", "09:30"]);
    expect(HORARIOS_VELORIO.at(-1)).toBe("23:30");
  });

  it("validação falha sem local, data, hora e escolha de velório", () => {
    expect(validateTriagemSepultamento({})).toHaveLength(4);
  });

  it("validação aceita somente sepultamento sem campos de velório", () => {
    const errs = validateTriagemSepultamento({
      subprocess: "quadra_geral",
      data_agendada: "2026-07-16",
      hora_sepultamento: "10:00",
      tem_velorio: "NAO",
      sem_velorio: "SIM",
    });
    expect(errs).toEqual([]);
  });

  it("validação aceita velório mesmo com detalhes ainda vazios", () => {
    const errs = validateTriagemSepultamento({
      subprocess: "jazigo",
      jazigo_possui_gaveta_disponivel: "sim",
      data_agendada: "2026-07-16",
      hora_sepultamento: "14:00",
      tem_velorio: "SIM",
    });
    expect(errs).toEqual([]);
  });

  it("mantém compatibilidade com atendimento antigo sem velório", () => {
    const errs = validateTriagemSepultamento({
      subprocess: "quadra_geral",
      data_agendada: "2026-07-16",
      hora_sepultamento: "10:00",
      sem_velorio: "SIM",
    });
    expect(errs).toEqual([]);
  });

  it("jazigo exige resposta sobre gaveta disponível", () => {
    const errs = validateTriagemSepultamento({
      subprocess: "jazigo",
      data_agendada: "2026-07-16",
      hora_sepultamento: "14:00",
      tem_velorio: "NAO",
    });
    expect(errs[0]).toBe("Informe se há gaveta disponível no jazigo.");
  });

  it("jazigo sem gaveta exige horário da Exumação PPS", () => {
    const errs = validateTriagemSepultamento({
      subprocess: "jazigo",
      jazigo_possui_gaveta_disponivel: "nao",
      data_agendada: "2026-07-16",
      hora_sepultamento: "14:00",
      tem_velorio: "NAO",
    });
    expect(errs[0]).toBe("Selecione o horário da Exumação PPS.");
  });

  it("jazigo com gaveta segue sem Exumação PPS", () => {
    const errs = validateTriagemSepultamento({
      subprocess: "jazigo",
      jazigo_possui_gaveta_disponivel: "sim",
      data_agendada: "2026-07-16",
      hora_sepultamento: "14:00",
      tem_velorio: "NAO",
    });
    expect(errs).toEqual([]);
  });

  it("buildTriagemOverrides usa placa digitada na triagem como fonte de verdade", () => {
    const out = buildTriagemOverrides({
      subprocess: "quadra_geral",
      data_agendada: "2026-07-16",
      hora_sepultamento: "10:00",
      tem_velorio: "SIM",
      sala_velorio: "A",
      placa_identificacao: "12345",
      placa_confirmada: "",
    });
    expect(out.placa_identificacao).toBe("12345");
    expect(out.data_sepultamento).toBe("16/07/2026");
    expect(out.hora_sepultamento).toBe("10:00");
    expect(out.sala_velorio).toBe("A");
    expect(out.concessao).toBe("NAO");
    expect(out.quadra_geral_gaveta).toBe("SIM");
  });

  it("buildTriagemOverrides inclui placa quando confirmada", () => {
    const out = buildTriagemOverrides({
      subprocess: "jazigo",
      jazigo_possui_gaveta_disponivel: "sim",
      data_agendada: "2026-07-16",
      hora_sepultamento: "14:00",
      tem_velorio: "SIM",
      sala_velorio: "B",
      placa_identificacao: "98765",
      placa_confirmada: "SIM",
    });
    expect(out.placa_identificacao).toBe("98765");
    expect(out.concessao).toBe("SIM");
    expect(out.quadra_geral_gaveta).toBe("NAO");
  });

  it("buildTriagemOverrides inclui todos os dados operacionais da triagem", () => {
    const out = buildTriagemOverrides({
      subprocess: "jazigo",
      jazigo_possui_gaveta_disponivel: "sim",
      data_agendada: "2026-07-16",
      hora_sepultamento: "14:00",
      tem_velorio: "SIM",
      sala_velorio: "B",
      inicio_velorio: "09:00",
      fim_velorio: "13:30",
      local_sepultamento: "Rua 03, terreno 10",
      funeraria: "Consolare",
      placa_identificacao: "98765",
    });
    expect(out).toMatchObject({
      data_sepultamento: "16/07/2026",
      hora_sepultamento: "14:00",
      horario_sepultamento: "14:00",
      sala_velorio: "B",
      inicio_velorio: "09:00",
      fim_velorio: "13:30",
      local_sepultamento: "Rua 03, terreno 10",
      funeraria: "Consolare",
      empresa_funeraria: "Consolare",
      placa_identificacao: "98765",
      concessao: "SIM",
      quadra_geral_gaveta: "NAO",
    });
  });

  it("oculta da revisão os campos já definidos na triagem", () => {
    expect(TRIAGEM_SEPULTAMENTO_REVIEW_KEYS.has("data_sepultamento")).toBe(true);
    expect(TRIAGEM_SEPULTAMENTO_REVIEW_KEYS.has("horario_sepultamento")).toBe(true);
    expect(TRIAGEM_SEPULTAMENTO_REVIEW_KEYS.has("sala_velorio")).toBe(true);
    expect(TRIAGEM_SEPULTAMENTO_REVIEW_KEYS.has("placa_identificacao")).toBe(true);
    expect(TRIAGEM_SEPULTAMENTO_REVIEW_KEYS.has("jazigo_possui_gaveta_disponivel")).toBe(true);
    expect(TRIAGEM_SEPULTAMENTO_REVIEW_KEYS.has("hora_exumacao_pps")).toBe(true);
    expect(TRIAGEM_SEPULTAMENTO_REVIEW_KEYS.has("inscricao_gscemi")).toBe(false);
  });

  it("buildTriagemOverrides zera sala quando for somente sepultamento", () => {
    const out = buildTriagemOverrides({
      subprocess: "quadra_geral",
      data_agendada: "2026-07-16",
      hora_sepultamento: "10:00",
      tem_velorio: "NAO",
      sala_velorio: "C",
    });
    expect(out.sala_velorio).toBe("");
  });
});
