import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { detectPlaceholders, fillDocx } from "../docx.server";

const OFFICIAL_TEMPLATES_DIR = "public/templates/official";

function readTemplate(path: string): ArrayBuffer {
  const buffer = readFileSync(path);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function findDocxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findDocxFiles(path);
      return entry.isFile() && entry.name.endsWith(".docx") ? [path] : [];
    })
    .sort();
}

function fakeValuesFor(placeholders: string[]): Record<string, string> {
  return Object.fromEntries(
    placeholders.map((placeholder) => [placeholder, `valor ficticio para ${placeholder}`]),
  );
}

function renderedText(docx: Uint8Array): string {
  const zip = new PizZip(docx);
  const zipWithFiles = zip as PizZip & { files?: Record<string, unknown> };
  return Object.keys(zipWithFiles.files ?? {})
    .filter((name) => name.startsWith("word/") && name.endsWith(".xml"))
    .map(
      (name) =>
        zip
          .file(name)
          ?.asText()
          .replace(/<[^>]+>/g, "") ?? "",
    )
    .join("\n");
}

function expectNoUnresolvedPlaceholders(output: Uint8Array, templatePath: string): void {
  expect(
    renderedText(output),
    `${templatePath} should not keep unresolved placeholders`,
  ).not.toMatch(/\{\{?\s*[a-zA-Z0-9_]+\s*\}?\}/);
}

function expectNoHiddenInk(zip: PizZip, templatePath: string): void {
  expect(
    zip.file("word/document.xml")?.asText() ?? "",
    `${templatePath} should not contain hidden Word ink content parts`,
  ).not.toContain("<w14:contentPart");
  expect(
    zip.file("word/_rels/document.xml.rels")?.asText() ?? "",
    `${templatePath} should not reference hidden Word ink parts`,
  ).not.toMatch(/ink\/ink1\.xml|media\/image1\.emf/);
  expect(zip.file("word/ink/ink1.xml")).toBeNull();
  expect(zip.file("word/media/image1.emf")).toBeNull();
}

function pagesFromPackage(zip: PizZip): number | null {
  const appXml = zip.file("docProps/app.xml")?.asText() ?? "";
  const pages = appXml.match(/<Pages>(\d+)<\/Pages>/)?.[1];
  return pages ? Number.parseInt(pages, 10) : null;
}

describe("docx official templates", () => {
  it("detects double-brace placeholders without inner brace duplicates", () => {
    const template = readTemplate("public/templates/official/velorio/condolencias.docx");

    expect(detectPlaceholders(template)).toEqual(["data", "nomeFal", "sala"]);
  });

  it("fills official double-brace templates without Docxtemplater Multi error", () => {
    const template = readTemplate("public/templates/official/velorio/condolencias.docx");

    expect(() =>
      fillDocx(template, {
        data: "16/07/2026",
        nomeFal: "Maria Silva",
        sala: "Sala 1",
      }),
    ).not.toThrow();
  });

  it("keeps generated DOCX output compressed for Microsoft Word compatibility", () => {
    const template = readTemplate("public/templates/official/sepultamento/ordem-sepultamento.docx");
    const placeholders = detectPlaceholders(template);
    const output = fillDocx(template, fakeValuesFor(placeholders));

    expect(output.byteLength).toBeLessThan(template.byteLength * 2);
  });

  it("keeps operational print templates free of hidden Word ink", () => {
    const templatePaths = [
      "public/templates/official/sepultamento/ordem-sepultamento.docx",
      "public/templates/official/sepultamento/ordem-sepultamento-jazigo.docx",
      "public/templates/official/exumacao/ordem-exumacao.docx",
      "public/templates/official/exumacao/ordem-exumacao-jazigo.docx",
      "public/templates/official/ossuario/aquisicao-renovacao-ossuario.docx",
      "public/templates/official/ossuario/renovacao-ossuario.docx",
    ];

    for (const templatePath of templatePaths) {
      const template = readTemplate(templatePath);
      expectNoHiddenInk(new PizZip(template), templatePath);

      const placeholders = detectPlaceholders(template);
      const output = fillDocx(template, fakeValuesFor(placeholders));
      expectNoHiddenInk(new PizZip(output), `${templatePath} output`);
    }
  });

  it("keeps rebuilt operational templates declared as one-page documents", () => {
    const templatePaths = [
      "public/templates/official/sepultamento/ordem-sepultamento.docx",
      "public/templates/official/sepultamento/ordem-sepultamento-jazigo.docx",
      "public/templates/official/exumacao/ordem-exumacao.docx",
      "public/templates/official/exumacao/ordem-exumacao-jazigo.docx",
      "public/templates/official/atualizacao-cadastral/atualizacao-cadastral.docx",
      "public/templates/official/ossuario/aquisicao-renovacao-ossuario.docx",
      "public/templates/official/ossuario/renovacao-ossuario.docx",
    ];

    for (const templatePath of templatePaths) {
      expect(pagesFromPackage(new PizZip(readTemplate(templatePath))), templatePath).toBe(1);
    }
  });

  it("detects and fills every official DOCX template without Multi error", () => {
    const templatePaths = findDocxFiles(OFFICIAL_TEMPLATES_DIR);

    expect(templatePaths.length).toBeGreaterThan(0);

    for (const templatePath of templatePaths) {
      const template = readTemplate(templatePath);
      const placeholders = detectPlaceholders(template);
      expect(
        placeholders.length,
        `${templatePath} should have detected placeholders`,
      ).toBeGreaterThan(0);
      const values = fakeValuesFor(placeholders);

      try {
        const output = fillDocx(template, values);
        expectNoUnresolvedPlaceholders(output, templatePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message, `${templatePath} should not throw Multi error`).not.toMatch(/multi error/i);
        throw error;
      }
    }
  });
});
