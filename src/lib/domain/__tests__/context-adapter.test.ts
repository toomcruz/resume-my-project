import { describe, expect, it } from "vitest";
import {
  buildAttendanceContext,
  runtimeProcessToDomain,
} from "@/lib/domain/context-adapter";
import { getRequiredDocuments } from "@/lib/domain/documents";

describe("runtimeProcessToDomain", () => {
  it("mapeia sepultamento → velorio_sepultamento", () => {
    expect(runtimeProcessToDomain("sepultamento")).toBe("velorio_sepultamento");
  });
  it("preserva os demais processos", () => {
    expect(runtimeProcessToDomain("exumacao")).toBe("exumacao");
    expect(runtimeProcessToDomain("ossario")).toBe("ossario");
    expect(runtimeProcessToDomain("translado")).toBe("translado");
    expect(runtimeProcessToDomain("atualizacao_cadastral")).toBe(
      "atualizacao_cadastral",
    );
  });
  it("retorna null para valores desconhecidos", () => {
    expect(runtimeProcessToDomain("desconhecido")).toBeNull();
  });
});

describe("buildAttendanceContext + getRequiredDocuments (integração)", () => {
  it("ossário aluguel gera 1 documento", () => {
    const ctx = buildAttendanceContext("ossario", "aluguel", {});
    expect(ctx?.ossario_operacao).toBe("aluguel");
    const docs = getRequiredDocuments(ctx!);
    expect(docs.map((doc) => doc.slug)).toEqual(["aquisicao-renovacao-ossuario"]);
  });

  it("translado interno gera memorando", () => {
    const ctx = buildAttendanceContext("translado", "interno", {});
    const docs = getRequiredDocuments(ctx!);
    expect(docs.map((doc) => doc.slug)).toEqual(["memorando-autorizacao-translado"]);
  });

  it("atualização cadastral gera 1 documento", () => {
    const ctx = buildAttendanceContext("atualizacao_cadastral", null, {});
    const docs = getRequiredDocuments(ctx!);
    expect(docs.map((doc) => doc.slug)).toEqual(["atualizacao-cadastral"]);
  });

  it("sepultamento sem has_wake/burial_here retorna lista vazia", () => {
    const ctx = buildAttendanceContext("sepultamento", "jazigo", {});
    expect(ctx?.process).toBe("velorio_sepultamento");
    expect(getRequiredDocuments(ctx!)).toEqual([]);
  });

  it("processo desconhecido retorna null", () => {
    expect(buildAttendanceContext("outro", null, {})).toBeNull();
  });
});
