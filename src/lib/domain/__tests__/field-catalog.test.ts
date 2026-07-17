import { describe, expect, it } from "vitest";
import {
  canonicalize,
  canonicalizeExtractedData,
  canonicalizeInContext,
} from "../canonicalize";
import { getExpectedFields } from "../expected-fields";
import {
  buildTemplatePayload,
  getCanonicalKeysForDocument,
} from "../template-payload";
import type { AttendanceContext } from "../types";

const baseSepultamento: AttendanceContext = {
  process: "velorio_sepultamento",
  has_wake: "sim",
  burial_here: "sim",
  local_sepultamento_tipo: "jazigo",
  jazigo_possui_gaveta_disponivel: "sim",
};

const baseSepQuadraSemVelorio: AttendanceContext = {
  process: "velorio_sepultamento",
  has_wake: "nao",
  burial_here: "sim",
  local_sepultamento_tipo: "quadra_geral",
};

const baseExumacaoPreparacao: AttendanceContext = {
  process: "exumacao",
  exhumation_phase: "preparacao",
  local_sepultamento_tipo: "jazigo",
};

describe("canonicalize (spec §5, §8)", () => {
  it("normaliza inscricao_gs para inscricao_gscemi (spec test 9)", () => {
    expect(canonicalize("inscricao_gs")).toBe("inscricao_gscemi");
    expect(canonicalize("inscrGS")).toBe("inscricao_gscemi");
    expect(canonicalize("inscricaoGS")).toBe("inscricao_gscemi");
    expect(canonicalize("numero_inscricao")).toBe("inscricao_gscemi");
  });

  it("nome_falecido resolve por processo (spec §5)", () => {
    expect(canonicalizeInContext("nome_falecido", baseSepultamento)).toBe(
      "nome_falecido_sepultamento",
    );
    expect(canonicalizeInContext("nome_falecido", baseExumacaoPreparacao)).toBe(
      "nome_falecido_exumacao",
    );
  });

  it("localizacao resolve por processo e local (spec §5)", () => {
    expect(canonicalizeInContext("localizacao", baseSepultamento)).toBe("local_jazigo");
    expect(canonicalizeInContext("localizacao", baseSepQuadraSemVelorio)).toBe(
      "local_sepultamento",
    );
    expect(canonicalizeInContext("localizacao", baseExumacaoPreparacao)).toBe(
      "local_exumacao",
    );
  });

  it("descarta chaves desconhecidas para 'unknown' (spec §13)", () => {
    const { canonical, unknown } = canonicalizeExtractedData(
      { inscricao_gs: "004582", something_random: "x", nome_responsavel: "Ana" },
      baseSepultamento,
    );
    expect(canonical.inscricao_gscemi).toBe("004582");
    expect(canonical.nome_responsavel).toBe("Ana");
    expect(unknown.something_random).toBe("x");
    expect(canonical.something_random).toBeUndefined();
  });
});

describe("getExpectedFields (spec §3, §6, §7)", () => {
  it("sepultamento sem velório não retorna inicio_velorio nem fim_velorio (test 2)", () => {
    const result = getExpectedFields({
      ctx: { ...baseSepQuadraSemVelorio },
      applicableDocuments: ["ordem-sepultamento"],
    });
    expect(result.requiredKeys).not.toContain("inicio_velorio");
    expect(result.requiredKeys).not.toContain("fim_velorio");
    expect(result.optionalKeys).not.toContain("inicio_velorio");
    expect(result.optionalKeys).not.toContain("fim_velorio");
  });

  it("somente velório (sem sepultamento) não expõe local_sepultamento (test 3)", () => {
    const ctx: AttendanceContext = {
      process: "velorio_sepultamento",
      has_wake: "sim",
      burial_here: "nao",
    };
    const result = getExpectedFields({
      ctx,
      applicableDocuments: ["identificacao-sala-velorio", "condolencias"],
    });
    const all = [...result.requiredKeys, ...result.optionalKeys];
    expect(all).not.toContain("local_sepultamento");
    expect(all).not.toContain("horario_sepultamento");
    expect(result.requiredKeys).toContain("sala_velorio");
  });

  it("exumação em preparação não expõe resultado_exumacao (test 4)", () => {
    const result = getExpectedFields({
      ctx: baseExumacaoPreparacao,
      applicableDocuments: ["ordem-exumacao"],
    });
    const all = [...result.requiredKeys, ...result.optionalKeys];
    expect(all).not.toContain("resultado_exumacao");
  });

  it("cpf_falecido não aparece sem regra aplicável (test 7)", () => {
    const result = getExpectedFields({
      ctx: baseSepultamento,
      applicableDocuments: ["ordem-sepultamento", "termo-compromisso-responsabilidade"],
    });
    const all = [...result.requiredKeys, ...result.optionalKeys];
    expect(all).not.toContain("cpf_falecido");
  });

  it("data_nascimento não aparece globalmente (test 8)", () => {
    const result = getExpectedFields({
      ctx: baseSepultamento,
      applicableDocuments: ["ordem-sepultamento"],
    });
    const all = [...result.requiredKeys, ...result.optionalKeys];
    expect(all).not.toContain("data_nascimento");
  });

  it("campos não duplicam entre aliases (test 10)", () => {
    const result = getExpectedFields({
      ctx: baseSepultamento,
      applicableDocuments: ["ordem-sepultamento", "termo-compromisso-responsabilidade"],
    });
    const keys = result.fields.map((f) => f.field.canonicalKey);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it("agrupa por seção (test 11)", () => {
    const result = getExpectedFields({
      ctx: baseSepultamento,
      applicableDocuments: ["ordem-sepultamento", "termo-compromisso-responsabilidade"],
    });
    expect(result.bySection.responsavel.length).toBeGreaterThan(0);
    expect(result.bySection.jazigo.length).toBeGreaterThan(0);
    expect(result.bySection.sepultamento.length).toBeGreaterThan(0);
  });

  it("resposta condicional invisível não aparece (test 18)", () => {
    const ctx: AttendanceContext = {
      process: "exumacao",
      exhumation_phase: "preparacao",
      exhumation_scheduling_mode: "sem_agendamento",
    };
    const result = getExpectedFields({ ctx, applicableDocuments: ["ordem-exumacao"] });
    const all = [...result.requiredKeys, ...result.optionalKeys];
    expect(all).not.toContain("hora_agendamento");
  });

  it("PPS mostra os dois falecidos separadamente (test 5)", () => {
    const ctx: AttendanceContext = {
      process: "velorio_sepultamento",
      has_wake: "sim",
      burial_here: "sim",
      local_sepultamento_tipo: "jazigo",
      jazigo_possui_gaveta_disponivel: "nao",
    };
    const result = getExpectedFields({
      ctx,
      applicableDocuments: [
        "ordem-sepultamento",
        "ordem-exumacao",
        "termo-compromisso-responsabilidade",
      ],
    });
    const keys = result.fields.map((f) => f.field.canonicalKey);
    expect(keys).toContain("nome_falecido_sepultamento");
    expect(keys).toContain("nome_falecido_exumacao_pps");
  });
});

describe("buildTemplatePayload (spec §16)", () => {
  it("mapeia canônicos para placeholders técnicos (test 21)", () => {
    const { payload, missing } = buildTemplatePayload({
      documentSlug: "ordem-sepultamento",
      canonicalData: {
        nome_falecido_sepultamento: "João Pedro Vasco",
        nome_responsavel: "Maria Helena",
        cpf_responsavel: "445.537.558-90",
        inscricao_gscemi: "004582",
        horario_sepultamento: "14:30",
      },
    });
    expect(payload.nomeFal).toBe("João Pedro Vasco");
    expect(payload.nomeResp).toBe("Maria Helena");
    expect(payload.cpfResp).toBe("445.537.558-90");
    expect(payload.inscrGS).toBe("004582");
    expect(payload.horaSep).toBe("14:30");
    expect(missing).toContain("numDO");
  });

  it("preserva zeros à esquerda (test 24)", () => {
    const { payload } = buildTemplatePayload({
      documentSlug: "atualizacao-cadastral",
      canonicalData: { livro: "0012", folha: "0087", inscricao_gscemi: "004582" },
    });
    expect(payload.livro).toBe("0012");
    expect(payload.folha).toBe("0087");
    expect(payload.inscrGS).toBe("004582");
  });

  it("descarta chaves desconhecidas (test 20)", () => {
    const { payload } = buildTemplatePayload({
      documentSlug: "ordem-sepultamento",
      canonicalData: {
        nome_falecido_sepultamento: "João",
        chave_qualquer: "não deve entrar",
        nomeFal: "não deve substituir",
      },
    });
    expect(payload.nomeFal).toBe("João");
    expect(Object.values(payload)).not.toContain("não deve entrar");
  });

  it("não confunde falecido de sepultamento com falecido de exumação PPS (test 22, 23)", () => {
    const { payload: sep } = buildTemplatePayload({
      documentSlug: "ordem-sepultamento",
      canonicalData: {
        nome_falecido_sepultamento: "Falecido A",
        nome_falecido_exumacao_pps: "Falecido B",
      },
    });
    expect(sep.nomeFal).toBe("Falecido A");

    const { payload: exumPps } = buildTemplatePayload({
      documentSlug: "ordem-exumacao",
      canonicalData: {
        nome_falecido_exumacao: "Falecido A",
        nome_falecido_exumacao_pps: "Falecido B",
      },
      confirmedRoles: { ppsExumacao: true },
    });
    expect(exumPps.nomeFal).toBe("Falecido B");

    const { payload: exumNormal } = buildTemplatePayload({
      documentSlug: "ordem-exumacao",
      canonicalData: {
        nome_falecido_exumacao: "Falecido A",
        nome_falecido_exumacao_pps: "Falecido B",
      },
    });
    expect(exumNormal.nomeFal).toBe("Falecido A");
  });

  it("getCanonicalKeysForDocument lista dependências únicas", () => {
    const keys = getCanonicalKeysForDocument("ordem-sepultamento");
    expect(keys).toContain("nome_falecido_sepultamento");
    expect(keys).toContain("inscricao_gscemi");
    expect(new Set(keys).size).toBe(keys.length);
  });
});
