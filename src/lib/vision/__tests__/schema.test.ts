import { describe, it, expect } from "vitest";
import { parseImageExtractionResponse } from "../schema";

describe("parseImageExtractionResponse — teste 7: JSON inválido nunca é sucesso vazio", () => {
  it("rejeita string vazia", () => {
    const r = parseImageExtractionResponse("");
    expect(r.ok).toBe(false);
  });

  it("rejeita objeto vazio", () => {
    const r = parseImageExtractionResponse({});
    expect(r.ok).toBe(false);
  });

  it("rejeita JSON sem imageId", () => {
    const r = parseImageExtractionResponse({ documentType: "rg" });
    expect(r.ok).toBe(false);
  });

  it("rejeita JSON sem documentType", () => {
    const r = parseImageExtractionResponse({ imageId: "img1" });
    expect(r.ok).toBe(false);
  });

  it("aceita payload mínimo válido", () => {
    const r = parseImageExtractionResponse({
      imageId: "img1",
      documentType: "rg",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.persons).toEqual([]);
      expect(r.data.fields).toEqual([]);
    }
  });

  it("extrai JSON de dentro de texto ruidoso (fallback)", () => {
    const noisy = 'Aqui está: {"imageId":"img1","documentType":"cpf"} — fim.';
    const r = parseImageExtractionResponse(noisy);
    expect(r.ok).toBe(true);
  });

  it("rejeita quando não há JSON no texto", () => {
    const r = parseImageExtractionResponse("apenas texto solto");
    expect(r.ok).toBe(false);
  });
});
