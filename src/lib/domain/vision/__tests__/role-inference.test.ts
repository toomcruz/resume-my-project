import { describe, it, expect } from "vitest";
import { filterRoleCandidates, suggestedRolesForPerson } from "../role-inference";
import type { ExtractedPerson, RoleCandidate } from "../types";

function candidate(overrides: Partial<RoleCandidate>): RoleCandidate {
  return {
    role: "responsavel",
    confidence: 0.9,
    evidence: "",
    sourceImageId: "img1",
    ...overrides,
  };
}

describe("filterRoleCandidates", () => {
  it("teste 5 — declarante NÃO vira automaticamente responsável", () => {
    const filtered = filterRoleCandidates([
      candidate({ role: "responsavel", evidence: "Declarante da certidão" }),
    ]);
    expect(filtered).toHaveLength(0);
  });

  it("teste 6 — concessionário exige evidência específica", () => {
    const filtered = filterRoleCandidates(
      [
        candidate({
          role: "concessionario",
          evidence: "Pessoa que entregou os documentos",
        }),
      ],
      { process: "sepultamento_jazigo" },
    );
    expect(filtered).toHaveLength(0);
  });

  it("aceita concessionário quando doc é cadastro de jazigo", () => {
    const filtered = filterRoleCandidates(
      [
        candidate({
          role: "concessionario",
          evidence: "Titular",
          sourceImageId: "imgJazigo",
        }),
      ],
      {
        process: "sepultamento_jazigo",
        documentTypeById: { imgJazigo: "cadastro_jazigo" },
      },
    );
    expect(filtered).toHaveLength(1);
  });

  it("descarta concessionário em processo sem jazigo", () => {
    const filtered = filterRoleCandidates(
      [
        candidate({
          role: "concessionario",
          evidence: "concessionário",
        }),
      ],
      { process: "sepultamento_quadra_geral" },
    );
    expect(filtered).toHaveLength(0);
  });

  it("teste 10 — PPS mantém dois falecidos distintos", () => {
    const filtered = filterRoleCandidates(
      [
        candidate({
          role: "falecido_sepultamento",
          evidence: "Nome do falecido",
          sourceImageId: "imgS",
        }),
        candidate({
          role: "falecido_exumacao_pps",
          evidence: "Despojos de",
          sourceImageId: "imgE",
        }),
      ],
      {
        process: "pps",
        documentTypeById: {
          imgS: "certidao_obito",
          imgE: "documento_exumacao",
        },
      },
    );
    const roles = filtered.map((c) => c.role);
    expect(roles).toContain("falecido_sepultamento");
    expect(roles).toContain("falecido_exumacao_pps");
  });
});

describe("suggestedRolesForPerson", () => {
  it("teste 1 — certidão identifica titular como candidato a falecido", () => {
    const person: ExtractedPerson = {
      id: "p1",
      name: "João",
      roleCandidates: [
        {
          role: "falecido_sepultamento",
          confidence: 0.95,
          evidence: "Titular da certidão de óbito",
          sourceImageId: "img1",
        },
      ],
      sourceImageIds: ["img1"],
    };
    const roles = suggestedRolesForPerson(person, {
      documentTypeById: { img1: "certidao_obito" },
      process: "sepultamento_quadra_geral",
    });
    expect(roles).toContain("falecido_sepultamento");
  });

  it("teste 2 — RG identifica titular mas NÃO define papel automaticamente", () => {
    const person: ExtractedPerson = {
      id: "p1",
      name: "Maria",
      rg: "12345678",
      roleCandidates: [], // RG puro não gera candidato de papel
      sourceImageIds: ["img1"],
    };
    expect(suggestedRolesForPerson(person)).toHaveLength(0);
  });
});
