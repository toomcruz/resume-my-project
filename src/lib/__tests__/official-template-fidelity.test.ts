import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getOfficialInstallVariants,
  type OfficialTemplateCatalogItem,
} from "../official-templates";

// Pin approved original binaries and their visual layout.
const OFFICIAL_TEMPLATE_HASHES: Record<string, string> = {
  "public/templates/official/velorio/identificacao-sala-velorio.docx":
    "d4e4230533fea272dbf3ee8864ced45406078d3bb614a826d51111ecca66c18f",
  "public/templates/official/velorio/condolencias.docx":
    "23b2630714c81024a459eded78f3b492faeff0b2d571a9a1e1a018fdbbe431e6",
  "public/templates/official/sepultamento/ordem-sepultamento.docx":
    "4782c38af2fabb8062a783769f867463d9e735206809780c1d7a396397cc4e68",
  "public/templates/official/exumacao/ordem-exumacao.docx":
    "6bb32ef36e8fa8f3093e5f34eda7c6784614b90c0d7b932795dc08e782d8d119",
  "public/templates/official/ossuario/aquisicao-renovacao-ossuario.docx":
    "8ecab66997f93a0444728d2e2800daa06ef06f02905b740773e82b060d0b5e14",
  "public/templates/official/atualizacao-cadastral/atualizacao-cadastral.docx":
    "840fe0a1c7e1c68bd5db33c688ede422e9a20e08a0b5d73d352f817b602d88b8",
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

  it("keeps catalog hashes and file sizes aligned with the official binaries", () => {
    for (const item of loadCatalog()) {
      const path = `public/templates/official/${item.arquivo}`;
      expect(statSync(path).size, path).toBe(item.tamanhoBytes);
      expect(sha256(path), path).toBe(item.sha256);
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
