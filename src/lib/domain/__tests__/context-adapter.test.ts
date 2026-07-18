import { describe, expect, it } from "vitest";
import { buildAttendanceContext, runtimeProcessToDomain } from "@/lib/domain/context-adapter";
import { getRequiredDocuments } from "@/lib/domain/documents";

describe("runtimeProcessToDomain", () => {
  it("mapeia sepultamento → velorio_sepultamento", () => {
    expect(runtimeProcessToDomain("sepultamento")).toBe("velorio_sepultamento");
  });
  it("preserva os demais processos", () => {
    expect(runtimeProcessToDomain("exumacao")).toBe("exumacao");
    expect(runtimeProcessToDomain("ossario")).toBe("ossario");
    expect(runtimeProcessToDomain("translado")).toBe("translado");
    expect(runtimeProcessToDomain("atualizacao_cadastral")).toBe("atualizacao_cadastral");
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

  it("sepultamento em jazigo com gaveta não gera exumação PPS", () => {
    const ctx = buildAttendanceContext("sepultamento", "jazigo", {
      tem_velorio: "NAO",
      jazigo_possui_gaveta_disponivel: "sim",
    });
    expect(ctx).toMatchObject({
      process: "velorio_sepultamento",
      burial_here: "sim",
      has_wake: "nao",
      jazigo_possui_gaveta_disponivel: "sim",
    });
    expect(getRequiredDocuments(ctx!).map((doc) => doc.slug)).toEqual([
      "ordem-sepultamento",
      "termo-compromisso-responsabilidade",
    ]);
  });

  it("sepultamento em jazigo sem gaveta inclui exumação PPS", () => {
    const ctx = buildAttendanceContext("sepultamento", "jazigo", {
      tem_velorio: "SIM",
      jazigo_possui_gaveta_disponivel: "nao",
    });
    expect(getRequiredDocuments(ctx!).map((doc) => doc.slug)).toEqual([
      "identificacao-sala-velorio",
      "condolencias",
      "ordem-sepultamento",
      "ordem-exumacao",
      "termo-compromisso-responsabilidade",
    ]);
  });

  it("processo desconhecido retorna null", () => {
    expect(buildAttendanceContext("outro", null, {})).toBeNull();
  });
});
