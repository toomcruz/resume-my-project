import { describe, expect, it } from "vitest";
import { getRequiredDocuments } from "../documents";
import type { AttendanceContext, DocumentSlug } from "../types";

function slugs(ctx: AttendanceContext): DocumentSlug[] {
  return getRequiredDocuments(ctx).map((d) => d.slug);
}

describe("getRequiredDocuments — velório e sepultamento", () => {
  it("somente velório: seleciona documentos de sala/condolências", () => {
    const s = slugs({
      process: "velorio_sepultamento",
      has_wake: "sim",
      burial_here: "nao",
    });
    expect(s).toEqual(
      expect.arrayContaining(["identificacao-sala-velorio", "condolencias"]),
    );
    expect(s).not.toContain("ordem-sepultamento");
  });

  it("somente sepultamento em quadra geral: só Ordem de Sepultamento", () => {
    const s = slugs({
      process: "velorio_sepultamento",
      has_wake: "nao",
      burial_here: "sim",
      local_sepultamento_tipo: "quadra_geral",
    });
    expect(s).toEqual(["ordem-sepultamento"]);
  });

  it("velório e sepultamento em jazigo com vaga: Ordem + Termo + docs de velório", () => {
    const s = slugs({
      process: "velorio_sepultamento",
      has_wake: "sim",
      burial_here: "sim",
      local_sepultamento_tipo: "jazigo",
      jazigo_possui_gaveta_disponivel: "sim",
    });
    expect(s).toEqual(
      expect.arrayContaining([
        "identificacao-sala-velorio",
        "condolencias",
        "ordem-sepultamento",
        "termo-compromisso-responsabilidade",
      ]),
    );
  });

  it("PPS: Ordem de Sepultamento + Ordem de Exumação + Termo", () => {
    const s = slugs({
      process: "velorio_sepultamento",
      burial_here: "sim",
      local_sepultamento_tipo: "jazigo",
      jazigo_possui_gaveta_disponivel: "nao",
    });
    expect(s).toEqual(
      expect.arrayContaining([
        "ordem-sepultamento",
        "ordem-exumacao",
        "termo-compromisso-responsabilidade",
      ]),
    );
    // PPS não seleciona ossário/translado automaticamente
    expect(s).not.toContain("aquisicao-renovacao-ossuario");
    expect(s).not.toContain("memorando-autorizacao-translado");
  });

  it("velório sem sepultamento não gera Ordem de Sepultamento", () => {
    const s = slugs({
      process: "velorio_sepultamento",
      has_wake: "sim",
      burial_here: "nao",
    });
    expect(s).not.toContain("ordem-sepultamento");
  });
});

describe("getRequiredDocuments — exumação preparação", () => {
  it("quadra geral: Ordem de Exumação", () => {
    const s = slugs({
      process: "exumacao",
      exhumation_phase: "preparacao",
      local_sepultamento_tipo: "quadra_geral",
    });
    expect(s).toEqual(["ordem-exumacao"]);
  });

  it("jazigo: Ordem + Termo", () => {
    const s = slugs({
      process: "exumacao",
      exhumation_phase: "preparacao",
      local_sepultamento_tipo: "jazigo",
    });
    expect(s).toEqual(
      expect.arrayContaining([
        "ordem-exumacao",
        "termo-compromisso-responsabilidade",
      ]),
    );
  });
});

describe("getRequiredDocuments — exumação execução", () => {
  const base = {
    process: "exumacao" as const,
    exhumation_phase: "execucao" as const,
  };

  it("quadra geral + ossos liberados + ossário aluguel", () => {
    expect(
      slugs({
        ...base,
        local_sepultamento_tipo: "quadra_geral",
        resultado_exumacao: "ossos_liberados",
        destino_pos_exumacao: "ossario",
        modalidade_ossario: "aluguel",
      }),
    ).toEqual(["aquisicao-renovacao-ossuario"]);
  });

  it("quadra geral + ossos liberados + ossário aquisição", () => {
    expect(
      slugs({
        ...base,
        local_sepultamento_tipo: "quadra_geral",
        resultado_exumacao: "ossos_liberados",
        destino_pos_exumacao: "ossario",
        modalidade_ossario: "aquisicao",
      }),
    ).toEqual(["aquisicao-renovacao-ossuario"]);
  });

  it("renovação NÃO aparece como destino da Exumação", () => {
    const s = slugs({
      ...base,
      local_sepultamento_tipo: "quadra_geral",
      resultado_exumacao: "ossos_liberados",
      destino_pos_exumacao: "ossario",
      modalidade_ossario: "renovacao",
    });
    expect(s).toEqual([]);
  });

  it("quadra geral + ossos liberados + translado", () => {
    expect(
      slugs({
        ...base,
        local_sepultamento_tipo: "quadra_geral",
        resultado_exumacao: "ossos_liberados",
        destino_pos_exumacao: "translado",
        tipo_translado: "interno",
      }),
    ).toEqual(["memorando-autorizacao-translado"]);
  });

  it("jazigo + destino fora do jazigo = não: sem docs de destino", () => {
    expect(
      slugs({
        ...base,
        local_sepultamento_tipo: "jazigo",
        resultado_exumacao: "ossos_liberados",
        destino_fora_jazigo: "nao",
      }),
    ).toEqual([]);
  });

  it("jazigo + destino fora do jazigo = sim + ossário aquisição", () => {
    expect(
      slugs({
        ...base,
        local_sepultamento_tipo: "jazigo",
        resultado_exumacao: "ossos_liberados",
        destino_fora_jazigo: "sim",
        destino_pos_exumacao: "ossario",
        modalidade_ossario: "aquisicao",
      }),
    ).toEqual(["aquisicao-renovacao-ossuario"]);
  });

  it("semi-intacto seleciona a guia específica (existe no catálogo)", () => {
    expect(
      slugs({
        ...base,
        local_sepultamento_tipo: "quadra_geral",
        resultado_exumacao: "semi_intacto",
      }),
    ).toEqual(["guia-exumacao-semi-intacto"]);
  });

  it("semi-intacto NÃO seleciona ossário ou translado", () => {
    const s = slugs({
      ...base,
      local_sepultamento_tipo: "jazigo",
      resultado_exumacao: "semi_intacto",
    });
    expect(s).not.toContain("aquisicao-renovacao-ossuario");
    expect(s).not.toContain("memorando-autorizacao-translado");
  });
});

describe("getRequiredDocuments — ossário / translado / atualização cadastral", () => {
  it("ossário renovação usa o modelo oficial existente", () => {
    expect(
      slugs({ process: "ossario", ossario_operacao: "renovacao" }),
    ).toEqual(["aquisicao-renovacao-ossuario"]);
  });
  it("translado independente", () => {
    expect(slugs({ process: "translado" })).toEqual([
      "memorando-autorizacao-translado",
    ]);
  });
  it("atualização cadastral", () => {
    expect(slugs({ process: "atualizacao_cadastral" })).toEqual([
      "atualizacao-cadastral",
    ]);
  });
  it("relação de registros do jazigo: sem modelo oficial hoje", () => {
    expect(slugs({ process: "relacao_registros_jazigo" })).toEqual([]);
  });
});

describe("getRequiredDocuments — sem duplicidades", () => {
  it("PPS não repete Termo mesmo com múltiplos ramos ativos", () => {
    const docs = getRequiredDocuments({
      process: "velorio_sepultamento",
      has_wake: "sim",
      burial_here: "sim",
      local_sepultamento_tipo: "jazigo",
      jazigo_possui_gaveta_disponivel: "nao",
    });
    const termos = docs.filter(
      (d) => d.slug === "termo-compromisso-responsabilidade",
    );
    expect(termos).toHaveLength(1);
  });
});
