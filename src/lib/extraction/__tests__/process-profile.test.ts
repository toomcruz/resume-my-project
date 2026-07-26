import { describe, expect, it } from "vitest";
import { buildExtractionContext, getExtractionProfile } from "../process-profile";

describe("perfil enxuto de extração", () => {
  it("limita sepultamento aos dados realmente usados nos documentos", () => {
    const profile = getExtractionProfile("sepultamento", "jazigo");

    expect(profile.expectedFields).toContain("nome_falecido");
    expect(profile.expectedFields).toContain("numero_do");
    expect(profile.expectedFields).toContain("padrao_funeral");
    expect(profile.expectedFields).not.toContain("valor_exumacao");
    expect(profile.expectedFields.length).toBeLessThan(35);
    expect(profile.concurrency).toBe(2);
  });

  it("não pede terreno e gaveta na quadra geral", () => {
    const profile = getExtractionProfile("sepultamento", "quadra_geral");

    expect(profile.expectedFields).not.toContain("terreno");
    expect(profile.expectedFields).not.toContain("gaveta");
    expect(profile.instructions).toContain("Quadra Geral");
  });

  it("gera contexto curto e específico do atendimento", () => {
    const context = buildExtractionContext("ossario", "renovacao");

    expect(context).toContain("Subprocesso: renovacao");
    expect(context).toContain("ossuário");
    expect(context).not.toContain("undefined");
  });
});
