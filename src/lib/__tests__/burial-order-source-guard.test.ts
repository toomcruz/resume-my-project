import { describe, expect, it } from "vitest";
import { applyOfficialTemplateAliases } from "../official-templates";

const STORAGE_PATH = "usuario/official/ordem-sepultamento.docx";

describe("Ordem de Sepultamento - origem dos identificadores", () => {
  it("deixa identificadores em branco quando não existe prova documental", () => {
    const result = applyOfficialTemplateAliases(
      {
        inscricao_gscemi: "16504040880",
        numero_declaracao_obito: "423018264",
        livro_obito: "3326095",
        placa_identificacao: "998877",
        quadraRua: "Quadra Geral",
      },
      STORAGE_PATH,
    );

    expect(result.inscrGS).toBe("");
    expect(result.numDO).toBe("");
    expect(result.livroObito).toBe("");
    expect(result.placa).toBe("");
    expect(result.quadraRua).toBe("");
  });

  it("aceita identificadores do extrator legado apenas com rótulo e valor literais", () => {
    const result = applyOfficialTemplateAliases(
      {
        inscricao_gscemi: "000123",
        __evidence_inscricao_gscemi: "Nº de Inscrição (GSCEMI): 000123",
        numero_declaracao_obito: "01-00039350",
        __evidence_numero_declaracao_obito: "Nº da DO: 01-00039350",
        livro_obito: "00045",
        __evidence_livro_obito: "Livro de Óbito: 00045",
        placa_identificacao: "7788",
        __evidence_placa_identificacao: "Nº Placa de Identificação: 7788",
      },
      STORAGE_PATH,
    );

    expect(result.inscrGS).toBe("000123");
    expect(result.numDO).toBe("01-00039350");
    expect(result.livroObito).toBe("00045");
    expect(result.placa).toBe("7788");
  });

  it("aceita valor do pipeline de visão quando documento, rótulo e valor conferem", () => {
    const result = applyOfficialTemplateAliases(
      {
        inscricao_gscemi: "000999",
        _visionMeta: {
          inscricao_gscemi: { sourceImageId: "img-1", confirmedByUser: false },
        },
        _vision: {
          rawByImage: {
            "img-1": {
              documentType: "tela_sistema_interno",
              fields: [
                {
                  canonicalKey: "inscricao_gscemi",
                  value: "000999",
                  evidence: "Nº de Inscrição (GSCEMI): 000999",
                },
              ],
            },
          },
        },
      },
      STORAGE_PATH,
    );

    expect(result.inscrGS).toBe("000999");
  });

  it("aceita correção confirmada manualmente mesmo sem evidência OCR", () => {
    const result = applyOfficialTemplateAliases(
      {
        livro_obito: "00123",
        _visionMeta: {
          livro_obito: { confirmedByUser: true },
        },
      },
      STORAGE_PATH,
    );

    expect(result.livroObito).toBe("00123");
  });

  it("não aceita número genérico como inscrição GSCEMI", () => {
    const result = applyOfficialTemplateAliases(
      {
        numero_inscricao: "16504040880",
        __evidence_inscricao_gscemi: "Número de inscrição: 16504040880",
      },
      STORAGE_PATH,
    );

    expect(result.inscrGS).toBe("");
  });
});
