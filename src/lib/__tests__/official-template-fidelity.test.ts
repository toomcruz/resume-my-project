import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getOfficialInstallVariants,
  type OfficialTemplateCatalogItem,
} from "../official-templates";

// Pin approved original binaries and their visual layout.
const OFFICIAL_TEMPLATE_HASHES: Record<string, string> = {
  "public/templates/official/sepultamento/ordem-sepultamento.docx":
    "bde11413c4827c1ab05b66669b24deeb41066788a52219e0951cb90f6c46710c",
  "public/templates/official/exumacao/ordem-exumacao.docx":
    "37e6191a0397e6dd7a66d207180be1945fda1dbda3dd36ace0fb6aaea73d0fed",
  "public/templates/official/ossuario/aquisicao-renovacao-ossuario.docx":
    "069a775cf6f80a72c6dacefd9e1b1eeb7a64be2e89dd95a55fcc70a5c032d256",
  "public/templates/official/atualizacao-cadastral/atualizacao-cadastral.docx":
    "35a4a5f9b67e43bc14ba3cc1a7cc7a3d2a440e990bc0dc8a4f176aba771979dd",
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadCatalog(): OfficialTemplateCatalogItem[] {
  return JSON.parse(
    readFileSync("public/templates/official/catalogo-modelos.json", "utf8"),
  ) as OfficialTemplateCatalogItem[];
}

describe("official template visual fidelity", () => {
  it("keeps the original Santana DOCX binaries unchanged", () => {
    for (const [path, expectedHash] of Object.entries(OFFICIAL_TEMPLATE_HASHES)) {
      expect(sha256(path), path).toBe(expectedHash);
    }
  });

  it("reuses the canonical original file for every operational variant", () => {
    const catalog = loadCatalog();
    const ids = ["ordem-sepultamento", "ordem-exumacao", "aquisicao-renovacao-ossuario"];

    for (const id of ids) {
      const item = catalog.find((candidate) => candidate.id === id);
      expect(item, `${id} must exist in the official catalog`).toBeDefined();
      if (!item) throw new Error(`Official catalog item not found: ${id}`);

      const variants = getOfficialInstallVariants(item);
      expect(new Set(variants.map((variant) => variant.file)), id).toEqual(new Set([item.arquivo]));
    }
  });
});
