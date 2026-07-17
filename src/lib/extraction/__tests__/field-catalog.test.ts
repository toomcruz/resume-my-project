import { describe, it, expect } from "vitest";
import {
  FIELD_CATALOG,
  canonicalize,
  getFieldByAlias,
  getFieldByKey,
  getFieldsForProcess,
} from "../field-catalog";

describe("FIELD_CATALOG", () => {
  it("não tem chaves canônicas duplicadas", () => {
    const keys = FIELD_CATALOG.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cada aliás canoniza para a chave declarada", () => {
    for (const field of FIELD_CATALOG) {
      expect(canonicalize(field.key)).toBe(field.key);
      for (const alias of field.aliases) {
        expect(canonicalize(alias)).toBe(field.key);
      }
    }
  });

  it("resolve variações camelCase e com acentos", () => {
    expect(canonicalize("nomeFalecido")).toBe("nome_falecido");
    expect(canonicalize("inscrGS")).toBe("inscricao_gs");
    expect(canonicalize("horaSep")).toBe("hora_sepultamento");
  });

  it("devolve null para chaves desconhecidas", () => {
    expect(canonicalize("campo_que_nao_existe")).toBeNull();
    expect(canonicalize("")).toBeNull();
  });

  it("getFieldByAlias devolve a definição", () => {
    const def = getFieldByAlias("cpfRequerente");
    expect(def?.key).toBe("cpf_responsavel");
    expect(def?.entity).toBe("responsavel");
  });

  it("getFieldsForProcess inclui campos globais (*)", () => {
    const sep = getFieldsForProcess("sepultamento");
    expect(sep.some((field) => field.key === "nome_responsavel")).toBe(true);
    expect(sep.some((field) => field.key === "nome_falecido")).toBe(true);
    expect(sep.some((field) => field.key === "sala_velorio")).toBe(true);
  });

  it("getFieldsForProcess não vaza campos de outro processo", () => {
    const exu = getFieldsForProcess("exumacao");
    expect(exu.some((field) => field.key === "sala_velorio")).toBe(false);
    expect(exu.some((field) => field.key === "referencia_pps")).toBe(true);
  });

  it("todo campo com validator aponta para um validador conhecido", () => {
    const allowed = new Set(["cpf", "date", "time", "cep", "phone", "email", "name", "preserve"]);
    for (const field of FIELD_CATALOG) {
      if (field.validator) expect(allowed.has(field.validator)).toBe(true);
    }
  });

  it("getFieldByKey ↔ getFieldByAlias são consistentes", () => {
    const byKey = getFieldByKey("nome_falecido");
    const byAlias = getFieldByAlias("falecido");
    expect(byKey).toBeDefined();
    expect(byAlias?.key).toBe(byKey?.key);
  });
});
