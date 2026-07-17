import { describe, it, expect } from "vitest";
import { consolidatePersons, mergePersonsById } from "../person-consolidation";
import type { ExtractedPersonRaw } from "../types";

function raw(
  id: string,
  name: string,
  extra: Partial<ExtractedPersonRaw> = {},
): ExtractedPersonRaw {
  return {
    temporaryId: id,
    name,
    roleCandidates: [],
    ...extra,
  };
}

let counter = 0;
const idFn = () => `p_${++counter}`;

describe("consolidatePersons", () => {
  it("teste 8 — mesmo CPF une entidades de documentos diferentes", () => {
    counter = 0;
    const out = consolidatePersons(
      [
        { imageId: "img1", raw: raw("t1", "Maria Helena Vasco", { cpf: "52998224725" }) },
        { imageId: "img2", raw: raw("t2", "Maria H. Vasco", { cpf: "529.982.247-25" }) },
      ],
      idFn,
    );
    expect(out).toHaveLength(1);
    expect(out[0].sourceImageIds).toEqual(["img1", "img2"]);
  });

  it("teste 9 — nomes semelhantes sem documento NÃO são unidos", () => {
    counter = 0;
    const out = consolidatePersons(
      [
        { imageId: "img1", raw: raw("t1", "João Pedro Vasco") },
        { imageId: "img2", raw: raw("t2", "João Paulo Vasco") },
      ],
      idFn,
    );
    expect(out).toHaveLength(2);
  });

  it("une por nome exato + data de nascimento", () => {
    counter = 0;
    const out = consolidatePersons(
      [
        { imageId: "img1", raw: raw("t1", "Ana Silva", { birthDate: "1980-01-15" }) },
        { imageId: "img2", raw: raw("t2", "Ana Silva", { birthDate: "1980-01-15" }) },
      ],
      idFn,
    );
    expect(out).toHaveLength(1);
  });

  it("teste 7 — uma pessoa pode acumular vários papéis", () => {
    counter = 0;
    const out = consolidatePersons(
      [
        {
          imageId: "img1",
          raw: raw("t1", "Carlos", {
            cpf: "52998224725",
            roleCandidates: [
              { role: "responsavel", confidence: 0.9, evidence: "Responsável" },
            ],
          }),
        },
        {
          imageId: "img2",
          raw: raw("t2", "Carlos", {
            cpf: "52998224725",
            roleCandidates: [
              { role: "concessionario", confidence: 0.9, evidence: "Concessionário" },
            ],
          }),
        },
      ],
      idFn,
    );
    expect(out).toHaveLength(1);
    const roles = out[0].roleCandidates.map((c) => c.role);
    expect(roles).toContain("responsavel");
    expect(roles).toContain("concessionario");
  });
});

describe("mergePersonsById — teste 28: usuário pode unir duas entidades", () => {
  it("une preservando dados e confirmações", () => {
    counter = 0;
    const persons = consolidatePersons(
      [
        { imageId: "img1", raw: raw("t1", "João Pedro Vasco") },
        {
          imageId: "img2",
          raw: raw("t2", "J. P. Vasco", { cpf: "52998224725" }),
        },
      ],
      idFn,
    );
    expect(persons).toHaveLength(2);
    const result = mergePersonsById(persons, persons[0].id, persons[1].id);
    expect(result).toHaveLength(1);
    expect(result[0].cpf).toBe("52998224725");
    expect(result[0].sourceImageIds).toEqual(["img1", "img2"]);
  });
});
