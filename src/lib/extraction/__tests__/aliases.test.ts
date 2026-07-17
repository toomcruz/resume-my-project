import { describe, it, expect } from "vitest";
import { resolveAlias, rewriteKeysToCanonical } from "../aliases";

describe("resolveAlias", () => {
  it("normaliza camelCase", () => {
    expect(resolveAlias("nomeFalecido")).toBe("nome_falecido");
  });
  it("ignora acentos", () => {
    expect(resolveAlias("Endereço")).toBe("endereco");
  });
  it("retorna null para desconhecidos", () => {
    expect(resolveAlias("chave_esquisita")).toBeNull();
  });
});

describe("rewriteKeysToCanonical", () => {
  it("reescreve chaves conhecidas e preserva desconhecidas", () => {
    const { rewritten, unknown } = rewriteKeysToCanonical({
      nomeFalecido: "João",
      cpfRequerente: "529.982.247-25",
      xpto: "algo",
    });
    expect(rewritten.nome_falecido).toBe("João");
    expect(rewritten.cpf_responsavel).toBe("529.982.247-25");
    expect(rewritten.xpto).toBe("algo");
    expect(unknown).toContain("xpto");
  });

  it("mantém primeiro valor não-vazio em caso de colisão", () => {
    const { rewritten } = rewriteKeysToCanonical({
      nomeFalecido: "",
      nome_falecido: "Maria",
    });
    expect(rewritten.nome_falecido).toBe("Maria");
  });
});
