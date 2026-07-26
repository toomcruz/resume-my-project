import { describe, expect, it } from "vitest";
import { buildExtractionContext, getExtractionProfile } from "../process-profile";

describe("perfil enxuto de extração", () => {
  it("limita sepultamento aos dados realmente usados nos documentos", () => {
    const profile = getExtractionProfile("sepultamento", "jazigo");

    expect(profile.expectedFields).toContain("nome_falecido");
    expect(profile.expectedFields).toContain("numero_do");
    expect(profile.expectedFields).toContain("padrao_funeral");
    expect(profile.expectedFields).toContain("profissao_declarante");
    expect(profile.expectedFields).toContain("numero_nota_contratacao");
    expect(profile.expectedFields).not.toContain("valor_exumacao");
    expect(profile.expectedFields.length).toBeLessThan(30);
    expect(profile.concurrency).toBe(2);
  });

  it("não pede à IA campos que pertencem à triagem do sepultamento", () => {
    const profile = getExtractionProfile("sepultamento", "quadra_geral");

    expect(profile.expectedFields).not.toContain("sala_velorio");
    expect(profile.expectedFields).not.toContain("data_sepultamento");
    expect(profile.expectedFields).not.toContain("hora_sepultamento");
    expect(profile.expectedFields).not.toContain("local_sepultamento");
    expect(profile.instructions).toContain("Quadra Geral");
    expect(profile.instructions).toContain("triagem");
  });

  it("gera contexto curto e específico do atendimento", () => {
    const context = buildExtractionContext("ossario", "renovacao");

    expect(context).toContain("Subprocesso: renovacao");
    expect(context).toContain("ossuário");
    expect(context).not.toContain("undefined");
  });
});
