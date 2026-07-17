import { describe, it, expect } from "vitest";
import { expectedRolesForProcess, processHasJazigo } from "../document-types";

describe("expectedRolesForProcess — teste 26", () => {
  it("sepultamento quadra geral não pede concessionário", () => {
    const roles = expectedRolesForProcess("sepultamento_quadra_geral");
    expect(roles).not.toContain("concessionario");
    expect(roles).toContain("falecido_sepultamento");
  });

  it("sepultamento em jazigo pede concessionário e signatário", () => {
    const roles = expectedRolesForProcess("sepultamento_jazigo");
    expect(roles).toContain("concessionario");
    expect(roles).toContain("signatario");
  });

  it("PPS pede os dois falecidos distintos", () => {
    const roles = expectedRolesForProcess("pps");
    expect(roles).toContain("falecido_sepultamento");
    expect(roles).toContain("falecido_exumacao_pps");
  });

  it("atualização cadastral pede concessionário e sucessor", () => {
    const roles = expectedRolesForProcess("atualizacao_cadastral");
    expect(roles).toContain("concessionario");
    expect(roles).toContain("sucessor");
  });
});

describe("processHasJazigo", () => {
  it("classifica corretamente", () => {
    expect(processHasJazigo("sepultamento_jazigo")).toBe(true);
    expect(processHasJazigo("pps")).toBe(true);
    expect(processHasJazigo("sepultamento_quadra_geral")).toBe(false);
    expect(processHasJazigo("translado")).toBe(false);
  });
});
