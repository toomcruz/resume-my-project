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
