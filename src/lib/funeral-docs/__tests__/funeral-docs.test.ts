import { describe, expect, it, vi } from "vitest";
import {
  maskCpf,
  maskRg,
  nameKey,
  normalizeCpf,
  normalizeDate,
  normalizeMoney,
  normalizeName,
  normalizeParentesco,
  normalizePhone,
  normalizeTime,
} from "../normalizers";
import { classifyDocument } from "../document-classifier";
import { detectarPadraoFuneral } from "../padrao-funeral";
import { mergeDeceased, sameDeceased } from "../person-matcher";
import { detectDiscrepancies } from "../discrepancy-detector";
import { applyManualCorrection, mergeProcess } from "../process-merger";
import { logSafe, mask } from "../logger";
import { computePending } from "../required-fields";
import {
  detectarTipoConcessao,
  montarCadastroGscemi,
  samePerson,
  situacaoConcessionario,
} from "../gscemi";
import type { DocumentoFonte, Falecido } from "../types";

// ---------- Normalizadores ----------
describe("normalizers", () => {
  it("normaliza CPF fictício", () => {
    expect(normalizeCpf("111.222.333-44").normalized).toBe("111.222.333-44");
    expect(normalizeCpf("11122233344").normalized).toBe("111.222.333-44");
    expect(normalizeCpf("abc").normalized).toBe("");
  });
  it("mascara CPF/RG", () => {
    expect(maskCpf("11122233344")).toBe("***.***.***-44");
    expect(maskRg("12.345.678-9")).toBe("***8-9");
  });
  it("normaliza nome preservando original", () => {
    const n = normalizeName("  josé   da  silva  ");
    expect(n.original).toContain("josé");
    expect(n.normalized).toBe("JOSÉ DA SILVA");
    expect(nameKey("José da Silva")).toBe("jose da silva");
  });
  it("normaliza data em BR e ISO", () => {
    expect(normalizeDate("1/2/2026").normalized).toBe("01/02/2026");
    expect(normalizeDate("2026-07-18").normalized).toBe("18/07/2026");
    expect(normalizeDate("xxx").normalized).toBe("");
  });
  it("normaliza hora, telefone e moeda", () => {
    expect(normalizeTime("9h05").normalized).toBe("09:05");
    expect(normalizePhone("11999887766").normalized).toBe("(11) 99988-7766");
    expect(normalizeMoney("R$ 1.234,56").normalized).toBeCloseTo(1234.56);
  });
  it("interpreta grau de parentesco", () => {
    expect(normalizeParentesco("Filha").normalized).toBe("FILHA");
    expect(normalizeParentesco("mãe").normalized).toBe("MAE");
  });
});

// ---------- Classificador ----------
describe("document classifier", () => {
  it("identifica declaração de óbito por palavras-chave", () => {
    const r = classifyDocument({
      ocrText: "DECLARAÇÃO DE ÓBITO Falecido(a) Declarante Grau de parentesco Data e hora do falecimento Causa mortis Nome do pai Nome da mãe",
    });
    expect(r.tipo).toBe("DECLARACAO_DE_OBITO");
  });
  it("identifica nota de contratação", () => {
    const r = classifyDocument({
      ocrText: "NOTA DE CONTRATAÇÃO DE FUNERAL Contratante ITENS DA COMPRA Produtos Total DADOS DO PAGAMENTO Local do velório Local do sepultamento Número da contratação",
    });
    expect(r.tipo).toBe("NOTA_DE_CONTRATACAO_FUNERAL");
  });
  it("cai em DOCUMENTO_DESCONHECIDO com baixa confiança", () => {
    const r = classifyDocument({ ocrText: "recibo simples" });
    expect(r.tipo).toBe("DOCUMENTO_DESCONHECIDO");
  });
  it("identifica cadastro GSCEMI", () => {
    const r = classifyDocument({
      ocrText:
        "Cadastro de Concessionário GSCEMI Manutenção Inscrição Contrato Grupo T.Venda Filial Quadra Letra Dependentes Cadastrado por Data Cadastro",
    });
    expect(r.tipo).toBe("CADASTRO_CONCESSIONARIO_GSCEMI");
  });
});

// ---------- GSCEMI ----------
describe("GSCEMI — cadastro do concessionário", () => {
  const abaManutencao: DocumentoFonte = {
    id: "gsc-1",
    tipoDocumento: "CADASTRO_CONCESSIONARIO_GSCEMI",
    classificacaoConfianca: 0.9,
    dadosExtraidos: {
      inscricao: "170931080",
      contrato: "",
      arquivo: "77264",
      grupo: "COMUM",
      t_venda: "COMUN",
      tipo_venda: "COMUNITARIO",
      quadra: "639",
      nome_quadra: "QUADRA GERAL 01",
      letra: "1GLD",
      qtd_jazigos: 1,
      status_cadastro: "ATIVO",
      filial: "SANTANA",
      nome_concessionario: "PESSOA FICTICIA TESTE",
      cpf_concessionario: "111.222.333-44",
      rg_concessionario: "111111111",
      data_nascimento: "01/01/1959",
      data_falecimento: "",
      estado_civil: "DIVORCIADO(A)",
      sexo: "FEMININO",
      profissao: "TESTE",
      nacionalidade: "BRASILEIRA",
      local_nascimento: "SAO PAULO",
      uf_nascimento: "SP",
    },
  };
  const abaEndereco: DocumentoFonte = {
    id: "gsc-2",
    tipoDocumento: "CADASTRO_CONCESSIONARIO_GSCEMI",
    classificacaoConfianca: 0.9,
    dadosExtraidos: {
      inscricao: "170931080",
      cep_residencial: "06543-001",
      endereco_residencial: "AVENIDA FICTICIA",
      numero_residencial: "1001",
      complemento_residencial: "APTO 92-A",
      cidade_residencial: "SANTANA DE PARNAIBA",
      bairro_residencial: "TAMBORE",
      cep_cobranca: "06543-001",
      endereco_cobranca: "AVENIDA FICTICIA",
      numero_cobranca: "1001",
    },
  };
  const abaComplementar: DocumentoFonte = {
    id: "gsc-3",
    tipoDocumento: "CADASTRO_CONCESSIONARIO_GSCEMI",
    classificacaoConfianca: 0.9,
    dadosExtraidos: {
      inscricao: "170931080",
      telefone_1: "(11) 99999-0000",
      celular: "(11) 98888-0000",
      email: "fake@example.com",
      familia: "MAI",
      vendedor: "VENDEDOR TESTE",
      dia_vencimento: "15",
    },
  };

  it("une três abas do mesmo cadastro em uma única pessoa/concessão", () => {
    const p = mergeProcess([abaManutencao, abaEndereco, abaComplementar]);
    const cad = p.cadastroGscemi!;
    expect(cad).toBeTruthy();
    expect(cad.origemDocIds).toHaveLength(3);
    expect(cad.concessao.inscricaoGscemi).toBe("170931080");
    expect(cad.concessao.numeroArquivo).toBe("77264");
    expect(cad.concessao.inscricaoGscemi).not.toBe(cad.concessao.numeroArquivo);
    expect(cad.concessionario?.nome).toBe("PESSOA FICTICIA TESTE");
    expect(cad.concessionario?.enderecoResidencial?.numero).toBe("1001");
    expect(cad.concessionario?.telefone1).toContain("99999");
  });

  it("classifica QUADRA_GERAL_TEMPORARIA sem exigir dependente", () => {
    const p = mergeProcess([abaManutencao, abaEndereco]);
    const cad = p.cadastroGscemi!;
    expect(cad.tipoConcessao).toBe("QUADRA_GERAL_TEMPORARIA");
    expect(cad.administradorProvisorio).toBeUndefined();
    expect(cad.alertas.some((a) => /Quadra Geral/i.test(a.mensagem))).toBe(true);
    // não gera pendência específica de administrador provisório
    expect(cad.alertas.some((a) => /administrador provisório/i.test(a.mensagem) && a.nivel === "warn")).toBe(false);
  });

  it("JAZIGO com concessionário vivo não cria administrador provisório", () => {
    const jazigo: DocumentoFonte = {
      ...abaManutencao,
      dadosExtraidos: {
        ...abaManutencao.dadosExtraidos,
        tipo_venda: "JAZIGO",
        nome_quadra: "QUADRA A",
      },
    };
    const cad = mergeProcess([jazigo]).cadastroGscemi!;
    expect(cad.tipoConcessao).toBe("JAZIGO_CONCESSAO");
    expect(situacaoConcessionario(cad.concessionario)).toBe("VIVO");
    expect(cad.administradorProvisorio).toBeUndefined();
  });

  it("JAZIGO com concessionário falecido + dependente vira ADMINISTRADOR_PROVISORIO_JAZIGO", () => {
    const jazigoFalecido: DocumentoFonte = {
      id: "gsc-x",
      tipoDocumento: "CADASTRO_CONCESSIONARIO_GSCEMI",
      classificacaoConfianca: 0.9,
      dadosExtraidos: {
        inscricao: "888",
        tipo_venda: "JAZIGO",
        nome_concessionario: "TITULAR FALECIDO",
        cpf_concessionario: "999.999.999-99",
        data_falecimento: "10/10/2020",
        nome_dependente: "DEPENDENTE FICTICIO",
        cpf_dependente: "222.333.444-55",
        grau_parentesco_dependente: "FILHA",
      },
    };
    const cad = mergeProcess([jazigoFalecido]).cadastroGscemi!;
    expect(cad.tipoConcessao).toBe("JAZIGO_CONCESSAO");
    expect(cad.situacaoConcessionario).toBe("FALECIDO");
    expect(cad.administradorProvisorio?.nome).toBe("DEPENDENTE FICTICIO");
    expect(cad.administradorProvisorio?.papeis).toContain("ADMINISTRADOR_PROVISORIO_JAZIGO");
    expect(cad.administradorProvisorio?.grauParentescoComConcessionario).toBe("FILHA");
    // grau com concessionário existe mas nunca vira grau com falecido sepultado
    expect((cad.administradorProvisorio as unknown as Record<string, unknown>).grauParentescoComFalecidoSepultado).toBeUndefined();
  });

  it("JAZIGO com concessionário falecido sem dependente cria alerta de pendência", () => {
    const jazigoOrfao: DocumentoFonte = {
      id: "gsc-y",
      tipoDocumento: "CADASTRO_CONCESSIONARIO_GSCEMI",
      classificacaoConfianca: 0.9,
      dadosExtraidos: {
        inscricao: "777",
        tipo_venda: "JAZIGO",
        nome_concessionario: "OUTRO FALECIDO",
        data_falecimento: "01/01/2000",
      },
    };
    const cad = mergeProcess([jazigoOrfao]).cadastroGscemi!;
    expect(cad.administradorProvisorio).toBeUndefined();
    expect(cad.alertas.some((a) => a.nivel === "warn" && /nenhum administrador/i.test(a.mensagem))).toBe(true);
  });

  it("concessionário também é declarante quando dados coincidem — pessoa única, papéis múltiplos", () => {
    const doDoc: DocumentoFonte = {
      id: "do-1",
      tipoDocumento: "DECLARACAO_DE_OBITO",
      classificacaoConfianca: 0.95,
      dadosExtraidos: {
        nome_falecido: "MARIA FICTICIA",
        nome_declarante: "PESSOA FICTICIA TESTE",
        cpf_declarante: "111.222.333-44",
        grau_parentesco_declarante: "FILHA",
        data_obito: "01/01/2026",
      },
    };
    const p = mergeProcess([doDoc, abaManutencao]);
    const cad = p.cadastroGscemi!;
    expect(cad.concessionario?.papeis).toEqual(expect.arrayContaining(["CONCESSIONARIO", "DECLARANTE"]));
    // continua sendo uma única pessoa cadastral (não duplica)
    expect(cad.concessionario?.cpf).toBe("111.222.333-44");
  });

  it("concessionário sem relação direta com o falecido é sinalizado", () => {
    const doDoc: DocumentoFonte = {
      id: "do-2",
      tipoDocumento: "DECLARACAO_DE_OBITO",
      classificacaoConfianca: 0.95,
      dadosExtraidos: {
        nome_falecido: "OUTRA PESSOA",
        nome_declarante: "TERCEIRO DECLARANTE",
        cpf_declarante: "555.666.777-88",
        data_obito: "01/01/2026",
      },
    };
    const cad = mergeProcess([doDoc, abaManutencao]).cadastroGscemi!;
    expect(cad.concessionario?.papeis).toEqual(["CONCESSIONARIO"]);
    expect(cad.alertas.some((a) => /não possui relação direta/i.test(a.mensagem))).toBe(true);
  });

  it("samePerson exige mais que o nome quando há CPF divergente", () => {
    expect(
      samePerson(
        { nome: "JOSE SILVA", cpf: "111.222.333-44" },
        { nome: "JOSE SILVA", cpf: "555.666.777-88" },
      ),
    ).toBe(false);
  });

  it("detectarTipoConcessao reconhece Quadra Geral por termos-chave", () => {
    expect(detectarTipoConcessao({ nomeQuadra: "QUADRA GERAL 01" })).toBe("QUADRA_GERAL_TEMPORARIA");
    expect(detectarTipoConcessao({ tipoVenda: "PRAZO FIXO" })).toBe("QUADRA_GERAL_TEMPORARIA");
    expect(detectarTipoConcessao({ tipoVenda: "JAZIGO" })).toBe("JAZIGO_CONCESSAO");
  });

  it("montarCadastroGscemi retorna undefined sem documentos GSCEMI", () => {
    expect(montarCadastroGscemi({ documentos: [] })).toBeUndefined();
  });
});


// ---------- Padrão do funeral ----------
describe("padrão do funeral", () => {
  it("classifica LUXO pelo item, não pelo valor", () => {
    const r = detectarPadraoFuneral([{ descricao: "URNA LUXO MODELO X", valorTotal: 10 }]);
    expect(r.padrao).toBe("LUXO");
  });
  it("classifica CREMACAO por termo específico", () => {
    const r = detectarPadraoFuneral([{ descricao: "SERVIÇO DE CREMAÇÃO" }]);
    expect(r.padrao).toBe("CREMACAO");
  });
  it("retorna NAO_IDENTIFICADO quando nada bate", () => {
    expect(detectarPadraoFuneral([{ descricao: "TAXA ADMINISTRATIVA" }]).padrao).toBe("NAO_IDENTIFICADO");
  });
});

// ---------- Person matcher ----------
describe("dedup de falecido", () => {
  const base: Falecido = {
    papel: "principal",
    nome: { original: "JOSÉ DA SILVA", normalized: "JOSÉ DA SILVA", confianca: 1 },
    dataNascimento: { original: "01/01/1950", normalized: "01/01/1950", confianca: 1 },
  };
  it("mesmo nome + mesmo nascimento = mesma pessoa", () => {
    expect(sameDeceased(base, { ...base })).toBe(true);
  });
  it("nascimentos diferentes = pessoas diferentes", () => {
    expect(
      sameDeceased(base, {
        ...base,
        dataNascimento: { original: "02/02/1960", normalized: "02/02/1960", confianca: 1 },
      }),
    ).toBe(false);
  });
  it("CPFs diferentes = pessoas diferentes", () => {
    expect(
      sameDeceased(
        { ...base, cpf: { original: "1", normalized: "111.222.333-44", confianca: 1 } },
        { ...base, cpf: { original: "2", normalized: "555.666.777-88", confianca: 1 } },
      ),
    ).toBe(false);
  });
  it("merge preserva o valor pré-existente", () => {
    const a = { ...base };
    const b: Falecido = { papel: "principal", nomeMae: { original: "M", normalized: "MARIA", confianca: 1 } };
    const m = mergeDeceased(a, b);
    expect(m.nome?.normalized).toBe("JOSÉ DA SILVA");
    expect(m.nomeMae?.normalized).toBe("MARIA");
  });
});

// ---------- Discrepancy detector ----------
describe("divergências", () => {
  const docs: DocumentoFonte[] = [
    {
      id: "doc-a",
      tipoDocumento: "DECLARACAO_DE_OBITO",
      classificacaoConfianca: 0.9,
      dadosExtraidos: { nome_falecido: "José da Silva", data_sepultamento: "18/07/2026" },
    },
    {
      id: "doc-b",
      tipoDocumento: "NOTA_DE_CONTRATACAO_FUNERAL",
      classificacaoConfianca: 0.85,
      dadosExtraidos: { nome_falecido: "José da Silva", data_sepultamento: "19/07/2026" },
    },
  ];
  it("detecta divergência de datas", () => {
    const d = detectDiscrepancies(docs);
    expect(d.some((x) => x.campo === "data_sepultamento")).toBe(true);
  });
  it("ignora grafias equivalentes de nome", () => {
    const d = detectDiscrepancies(docs);
    expect(d.some((x) => x.campo === "nome_falecido")).toBe(false);
  });
});

// ---------- Merger ----------
describe("merger", () => {
  const doDoc: DocumentoFonte = {
    id: "do-1",
    tipoDocumento: "DECLARACAO_DE_OBITO",
    classificacaoConfianca: 0.95,
    dadosExtraidos: {
      nome_falecido: "MARIA FICTICIA",
      numero_do: "01-000000000",
      nome_declarante: "ANA FICTICIA",
      grau_parentesco_declarante: "FILHA",
      data_sepultamento: "19/07/2026",
      hora_sepultamento: "13:00",
      local_sepultamento: "CEMITERIO TESTE",
      data_obito: "18/07/2026",
    },
  };
  const notaDoc: DocumentoFonte = {
    id: "nota-1",
    tipoDocumento: "NOTA_DE_CONTRATACAO_FUNERAL",
    classificacaoConfianca: 0.9,
    dadosExtraidos: {
      nome_falecido: "MARIA FICTICIA",
      numero_contratacao: "10-000",
      nome_contratante: "CARLA FICTICIA",
      itens: [{ descricao: "URNA JADE PADRAO" }, { descricao: "TAXA" }],
      inicio_velorio: "09:00",
      fim_velorio: "12:59",
    },
  };
  it("não duplica o mesmo falecido presente nos dois docs", () => {
    const p = mergeProcess([doDoc, notaDoc]);
    expect(p.falecidos.length).toBe(1);
  });
  it("declarante da DO vira responsável principal com grau de parentesco", () => {
    const p = mergeProcess([doDoc, notaDoc]);
    expect(p.responsavelPrincipal?.nome?.normalized).toBe("ANA FICTICIA");
    expect(p.responsavelPrincipal?.grauParentesco?.normalized).toBe("FILHA");
  });
  it("contratante da Nota é distinto do declarante", () => {
    const p = mergeProcess([doDoc, notaDoc]);
    expect(p.contratante?.nome?.normalized).toBe("CARLA FICTICIA");
    expect(p.responsavelPrincipal?.nome?.normalized).not.toBe(p.contratante?.nome?.normalized);
  });
  it("extrai número da contratação e padrão pelos itens", () => {
    const p = mergeProcess([doDoc, notaDoc]);
    expect(p.dadosContratacao?.numeroContratacao?.normalized).toBe("10-000");
    expect(p.dadosContratacao?.padraoFuneral).toBe("PADRAO");
  });
  it("exumação suporta dois falecidos com papéis distintos", () => {
    const exumado: DocumentoFonte = {
      id: "do-2",
      tipoDocumento: "DECLARACAO_DE_OBITO",
      classificacaoConfianca: 0.9,
      dadosExtraidos: { nome_falecido: "PEDRO ANTIGO", data_obito: "01/01/1980" },
    };
    const p = mergeProcess([doDoc, exumado], { tipoProcesso: "exumacao", exumadoDocId: "do-2" });
    const papeis = p.falecidos.map((f) => f.papel).sort();
    expect(papeis).toEqual(["exumado", "principal"]);
  });
  it("marca campos ausentes como pendentes", () => {
    const p = mergeProcess([doDoc]);
    const nomes = p.camposPendentes.map((c) => c.campo);
    expect(nomes).toContain("padrao_funeral");
  });
  it("correção manual prevalece sobre OCR", () => {
    const p = mergeProcess([doDoc, notaDoc]);
    const corr = applyManualCorrection(p, "responsavelPrincipal.nome", "NOME CORRIGIDO");
    expect(corr.responsavelPrincipal?.nome?.normalized).toBe("NOME CORRIGIDO");
    expect(corr.responsavelPrincipal?.nome?.confianca).toBe(1);
  });
});

// ---------- Pending fields ----------
describe("campos obrigatórios", () => {
  it("lista pendentes para sepultamento vazio", () => {
    const p = mergeProcess([]);
    expect(p.camposPendentes.length).toBeGreaterThan(0);
  });
  it("computePending marca baixa confiança", () => {
    const p = mergeProcess([]);
    p.falecidos.push({ papel: "principal", nome: { original: "x", normalized: "X", confianca: 0.2 } });
    const pend = computePending(p);
    expect(pend.some((c) => c.campo === "nome_falecido" && c.motivo === "BAIXA_CONFIANCA")).toBe(true);
  });
});

// ---------- Logger (segurança) ----------
describe("logSafe mascara dados sensíveis", () => {
  it("nunca imprime CPF/RG completo", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSafe("teste", { cpf: "111.222.333-44", rg: "12.345.678-9", nested: { cpf: "55566677788" } });
    const call = spy.mock.calls[0];
    const printed = JSON.stringify(call);
    expect(printed).not.toContain("111.222.333-44");
    expect(printed).not.toContain("11122233344");
    expect(printed).toContain("***.***.***-44");
    spy.mockRestore();
  });
  it("mask cobre strings livres", () => {
    const masked = mask("CPF 999.888.777-66 e RG 12.345.678-9");
    expect(String(masked)).not.toContain("999.888.777-66");
  });
});

// ---------- GSCEMI: Cadastro do Falecido / Sepultamento + Declarantes ----------
describe("GSCEMI — Cadastro do Sepultamento", () => {
  const sepDoc: DocumentoFonte = {
    id: "sep-1",
    tipoDocumento: "CADASTRO_FALECIDO_SEPULTAMENTO_GSCEMI",
    classificacaoConfianca: 0.9,
    dadosExtraidos: {
      numero_registro_sepultamento: "117049",
      numero_sepultado: "8390",
      inscricao: "170931080",
      numero_registro_do: "01-000000000",
      pro_aim: "AAA",
      tem_plano_funerario: "NAO",
      nome_falecido: "PESSOA FICTICIA",
      sexo: "FEMININO",
      parentesco: "TITULAR",
      sepultamento: "1",
      cremacao: "0",
      tanatopraxia: "0",
      cartorio_sepultamento: "SANTANA",
      distrito_sepultamento: "8",
      livro_sepultamento: "69",
      pagina_sepultamento: "47",
      nota_fiscal: "0",
      termo_numero_controle: "118988",
      tem_lapide: "SIM",
      situacao_sepultado: "CORPO INTEIRO",
      codigo_cemiterio: "1002",
      nome_cemiterio: "CEMITERIO SANTANA",
      nome_concessionario: "PESSOA FICTICIA TESTE",
      concessionaria_responsavel: "CONSOLARE",
      seguradora_parceiro: "OUTROS",
      data_sepultamento: "18/07/2026",
    },
  };

  it("classifica a tela por palavras-chave", () => {
    const r = classifyDocument({
      ocrText:
        "Tipo de Sepultamento Nome Falecido Nº Registro / D.O PRO-AIM Tem plano funerário Tanatopraxia Tem Lápide Termo/Nº Controle Livro sepultamento Página sepultamento Cartório Sepultamento Situação do Sepultado",
    });
    expect(r.tipo).toBe("CADASTRO_FALECIDO_SEPULTAMENTO_GSCEMI");
  });

  it("extrai inscrição, sepultado, livro, página e Termo/Nº Controle separadamente", () => {
    const p = mergeProcess([sepDoc]);
    const c = p.cadastroSepultamentoGscemi!;
    expect(c).toBeTruthy();
    expect(c.inscricaoGscemi).toBe("170931080");
    expect(c.numeroSepultado).toBe("8390");
    expect(c.registroLivro?.livro).toBe("69");
    expect(c.registroLivro?.pagina).toBe("47");
    expect(c.placaIdentificacao?.termoNumeroControle).toBe("118988");
    expect(c.placaIdentificacao?.numeroPlacaIdentificacao).toBe("118988");
  });

  it("preserva parentescoCadastroSepultamento sem copiar para outros papéis", () => {
    const p = mergeProcess([sepDoc]);
    expect(p.cadastroSepultamentoGscemi?.parentescoCadastroSepultamento).toBe("TITULAR");
    expect(p.responsavelPrincipal?.grauParentesco?.normalized).toBeUndefined();
  });

  it("não confunde placa com inscrição, DO ou contratação", () => {
    const p = mergeProcess([sepDoc]);
    const c = p.cadastroSepultamentoGscemi!;
    expect(c.placaIdentificacao?.numeroPlacaIdentificacao).not.toBe(c.inscricaoGscemi);
    expect(c.placaIdentificacao?.numeroPlacaIdentificacao).not.toBe(c.numeroDeclaracaoObito);
    expect(c.placaIdentificacao?.numeroPlacaIdentificacao).not.toBe(c.numeroContrato ?? "");
    expect(c.placaIdentificacao?.numeroPlacaIdentificacao).not.toBe(c.numeroSepultado);
    expect(c.registroLivro?.livro).not.toBe(c.registroLivro?.pagina);
  });

  it("alerta quando livro existe mas página não", () => {
    const semPag: DocumentoFonte = {
      ...sepDoc,
      id: "sep-2",
      dadosExtraidos: { ...sepDoc.dadosExtraidos, pagina_sepultamento: "" },
    };
    const p = mergeProcess([semPag]);
    expect(p.cadastroSepultamentoGscemi?.alertas.some((a) => /página ausente/i.test(a.mensagem))).toBe(true);
  });

  it("guarda cada opção de procedimento separadamente", () => {
    const p = mergeProcess([sepDoc]);
    const proc = p.cadastroSepultamentoGscemi?.tipoProcedimento!;
    expect(proc.sepultamento).toBe(true);
    expect(proc.cremacao).toBe(false);
    expect(proc.tanatopraxia).toBe(false);
  });

  it("detecta divergência de data de sepultamento com Nota de Contratação", () => {
    const nota: DocumentoFonte = {
      id: "nota-x",
      tipoDocumento: "NOTA_DE_CONTRATACAO_FUNERAL",
      classificacaoConfianca: 0.9,
      dadosExtraidos: { data_sepultamento: "19/07/2026" },
    };
    const p = mergeProcess([nota, sepDoc]);
    expect(
      p.cadastroSepultamentoGscemi?.alertas.some((a) => /Data do sepultamento diverge/i.test(a.mensagem)),
    ).toBe(true);
  });
});

describe("GSCEMI — Declarantes (óbito + pagamento)", () => {
  const iguais: DocumentoFonte = {
    id: "decl-1",
    tipoDocumento: "DECLARANTES_SEPULTAMENTO_GSCEMI",
    classificacaoConfianca: 0.9,
    dadosExtraidos: {
      nome_declarante_obito: "PESSOA FICTICIA TESTE",
      cpf_declarante_obito: "111.222.333-44",
      tipo_pessoa_declarante_obito: "Física",
      cep_declarante_obito: "02866-230",
      logradouro_declarante_obito: "RUA FICTICIA",
      numero_declarante_obito: "200",
      bairro_declarante_obito: "BAIRRO",
      cidade_declarante_obito: "SAO PAULO",
      uf_declarante_obito: "SP",
      telefone_declarante_obito: "11999999999",
      nome_declarante_pagamento: "PESSOA FICTICIA TESTE",
      cpf_declarante_pagamento: "111.222.333-44",
      origem_dados_declarante_pagamento: "DECLARANTE_OBITO",
    },
  };

  it("classifica a tela de declarantes", () => {
    const r = classifyDocument({
      ocrText:
        "DECLARANTE DO ÓBITO DECLARANTE DO PAGAMENTO DADOS PESSOAIS Importar do declarante do óbito Importar do adm. provisório Tipo Pessoa Física Jurídica Código IBGE",
    });
    expect(r.tipo).toBe("DECLARANTES_SEPULTAMENTO_GSCEMI");
  });

  it("mesma pessoa nas duas seções mantém papéis separados e sinaliza importação", () => {
    const p = mergeProcess([iguais]);
    expect(p.declaranteObitoGscemi?.papel).toBe("DECLARANTE_DO_OBITO_GSCEMI");
    expect(p.declarantePagamento?.papel).toBe("DECLARANTE_DO_PAGAMENTO");
    expect(p.declaranteObitoGscemi?.cpf).toBe("111.222.333-44");
    expect(p.declarantePagamento?.cpf).toBe("111.222.333-44");
    expect(p.declarantePagamento?.origemDadosDeclarantePagamento).toBe("DECLARANTE_OBITO");
  });

  it("pessoas diferentes nas duas seções ficam separadas", () => {
    const diff: DocumentoFonte = {
      ...iguais,
      id: "decl-2",
      dadosExtraidos: {
        ...iguais.dadosExtraidos,
        nome_declarante_pagamento: "OUTRA PESSOA FICTICIA",
        cpf_declarante_pagamento: "555.666.777-88",
        origem_dados_declarante_pagamento: "PREENCHIMENTO_MANUAL",
      },
    };
    const p = mergeProcess([diff]);
    expect(p.declaranteObitoGscemi?.cpf).not.toBe(p.declarantePagamento?.cpf);
    expect(p.declarantePagamento?.origemDadosDeclarantePagamento).toBe("PREENCHIMENTO_MANUAL");
  });

  it("pagamento importado do administrador provisório é registrado", () => {
    const admDoc: DocumentoFonte = {
      ...iguais,
      id: "decl-3",
      dadosExtraidos: {
        ...iguais.dadosExtraidos,
        nome_declarante_pagamento: "DEPENDENTE FICTICIO",
        cpf_declarante_pagamento: "222.333.444-55",
        origem_dados_declarante_pagamento: "ADMINISTRADOR_PROVISORIO",
      },
    };
    const p = mergeProcess([admDoc]);
    expect(p.declarantePagamento?.origemDadosDeclarantePagamento).toBe("ADMINISTRADOR_PROVISORIO");
    // adm provisório NÃO vira declarante do óbito
    expect(p.declaranteObitoGscemi?.nome).toBe("PESSOA FICTICIA TESTE");
    expect(p.declaranteObitoGscemi?.nome).not.toBe("DEPENDENTE FICTICIO");
  });

  it("as duas telas se juntam no mesmo processo", () => {
    const sepDoc2: DocumentoFonte = {
      id: "sep-3",
      tipoDocumento: "CADASTRO_FALECIDO_SEPULTAMENTO_GSCEMI",
      classificacaoConfianca: 0.9,
      dadosExtraidos: {
        inscricao: "170931080",
        nome_falecido: "PESSOA FICTICIA",
        livro_sepultamento: "69",
        pagina_sepultamento: "47",
        termo_numero_controle: "118988",
        sepultamento: "1",
      },
    };
    const p = mergeProcess([sepDoc2, iguais]);
    expect(p.cadastroSepultamentoGscemi?.inscricaoGscemi).toBe("170931080");
    expect(p.declaranteObitoGscemi?.nome).toBe("PESSOA FICTICIA TESTE");
    expect(p.declarantePagamento?.nome).toBe("PESSOA FICTICIA TESTE");
  });
});

