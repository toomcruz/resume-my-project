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

function documentXml(docx: Uint8Array): string {
  return new PizZip(docx).file("word/document.xml")?.asText() ?? "";
}

function alternateContentForShape(xml: string, docPrId: number): string {
  const markerIndex = xml.indexOf(`<wp:docPr id="${docPrId}"`);
  if (markerIndex < 0) return "";
  const start = xml.lastIndexOf("<mc:AlternateContent", markerIndex);
  const closing = "</mc:AlternateContent>";
  const end = xml.indexOf(closing, markerIndex);
  if (start < 0 || end < 0) return "";
  return xml.slice(start, end + closing.length);
}

function expectShapeFill(xml: string, docPrId: number, color: string): void {
  const shape = alternateContentForShape(xml, docPrId);
  expect(shape, `shape ${docPrId} should exist`).not.toBe("");
  expect(shape, `shape ${docPrId} should use fill ${color}`).toMatch(
    new RegExp(
      `<wps:spPr>[\\s\\S]*?<a:solidFill><a:srgbClr val="${color}"\\/><\\/a:solidFill>`,
    ),
  );
}

function paragraphContaining(xml: string, text: string): string {
  return xml.match(new RegExp(`<w:p\\b[\\s\\S]*?${text}[\\s\\S]*?<\\/w:p>`))?.[0] ?? "";
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
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

    expect(detectPlaceholders(template)).toEqual(["data", "nomeFal"]);
  });

  it("fills official double-brace templates without Docxtemplater Multi error", () => {
    const template = readTemplate("public/templates/official/velorio/condolencias.docx");

    expect(() =>
      fillDocx(template, {
        data: "16/07/2026",
        nomeFal: "Maria Silva",
      }),
    ).not.toThrow();
  });

  it("keeps the condolences sheet without a wake room field", () => {
    const template = readTemplate("public/templates/official/velorio/condolencias.docx");
    const output = fillDocx(template, {
      data: "16/07/2026",
      nomeFal: "Maria Silva",
    });

    expect(renderedText(output)).not.toMatch(/\bSala\s*:/i);
  });

  it("keeps generated DOCX output compressed for Microsoft Word compatibility", () => {
    const template = readTemplate("public/templates/official/sepultamento/ordem-sepultamento.docx");
    const placeholders = detectPlaceholders(template);
    const output = fillDocx(template, fakeValuesFor(placeholders));

    expect(output.byteLength).toBeLessThan(template.byteLength * 2);
  });

  it("fills the burial order from the death declarant and marks only the applicable boxes", () => {
    const template = readTemplate("public/templates/official/sepultamento/ordem-sepultamento.docx");
    const output = fillDocx(template, {
      nomeFal: "GERALDA TESTE",
      nomeResp: "PESSOA INCORRETA",
      cpfResp: "99999999999",
      telResp: "11999999999",
      parent: "FILHO",
      nome_declarante: "DECLARANTE CORRETO",
      cpf_declarante: "12345678901",
      telefone_declarante: "11987654321",
      grau_parentesco_declarante: "GENRO",
      quadra_geral_gaveta: "SIM",
      concessao: "NAO",
      padrao_funeral: "POPULAR",
      covid_lacrado: "NAO",
    });
    const text = renderedText(output);
    const xml = documentXml(output);

    expect(text).toContain("DECLARANTE CORRETO");
    expect(text).toContain("123.456.789-01");
    expect(text).toContain("(11)98765-4321");
    expect(text).toContain("GENRO");

    // Quadra geral: Concessão fica inteiramente em branco e apenas Quadra/SIM é preenchida.
    expectShapeFill(xml, 1, "FFFFFF");
    expectShapeFill(xml, 2, "FFFFFF");
    expectShapeFill(xml, 3, "000000");
    expectShapeFill(xml, 4, "FFFFFF");

    // Contratação: somente Popular é preenchida.
    expectShapeFill(xml, 8, "FFFFFF");
    expectShapeFill(xml, 9, "FFFFFF");
    expectShapeFill(xml, 10, "000000");
    expectShapeFill(xml, 11, "FFFFFF");
    expectShapeFill(xml, 12, "FFFFFF");
    expectShapeFill(xml, 13, "FFFFFF");

    // COVID/Lacrado passa a usar dois retângulos do Word, com somente NÃO preenchido.
    expectShapeFill(xml, 114, "FFFFFF");
    expectShapeFill(xml, 14, "000000");
    expect(text).not.toMatch(/COVID\/Lacrado:[^\n]*\[/i);

    // O nome da pessoa falecida usa 16 pt também no nível do run.
    const deceasedParagraph = paragraphContaining(xml, "GERALDA TESTE");
    expect(deceasedParagraph).toContain('<w:sz w:val="32"/>');
    expect(deceasedParagraph).toMatch(/<w:rPr>[\s\S]*?<w:sz w:val="32"\/>/);
  });

  it("matches the manual administration reference without mixing room and address", () => {
    const template = readTemplate("public/templates/official/sepultamento/ordem-sepultamento.docx");
    const output = fillDocx(template, {
      nomeFal: "GERALDO CLEBIS MAGALHÃES",
      nome_declarante: "MARCOS ROBERTO DE OLIVEIRA TACCONI",
      cpf_declarante: "16504040850",
      endereco_declarante:
        "RUA CÉSAR VALLEJO, 1360 APT 141 BAIRRO: REAL PARQUE - SÃO PAULO/SP CEP: 05685-000",
      telefone_declarante: "11983440011",
      profissao_declarante: "MÉDICO",
      grau_parentesco_declarante: "GENRO",
      sala_velorio: "A RUA CÉSAR VALLEJO, 1360",
      numero_declaracao_obito: "0100039350",
      placa: "118822",
      dataSep: "26/07/2026",
      horaSep: "14:00",
      dataExt: "São Paulo, 26 de julho de 2026",
      numero_nota_contratacao: "00104494",
      empresa_agencia: "CONSOLARE",
      padrao_funeral: "PADRÃO",
      covid_lacrado: "NAO",
      quadra_geral_gaveta: "SIM",
      concessao: "NAO",
    });
    const text = renderedText(output);
    const xml = documentXml(output);

    expect(text).toContain("01-00039350");
    expect(text).toContain("Profissão: MÉDICO");
    expect(text).toContain("CEP: 05685-000  Telefone: (11)98344-0011");
    expect(text).not.toContain("RG:");
    expect(text).not.toContain("São Paulo, São Paulo,");
    expect(countOccurrences(text, "RUA CÉSAR VALLEJO")).toBe(1);
    expectShapeFill(xml, 9, "000000");
    expectShapeFill(xml, 10, "FFFFFF");
    expect(paragraphContaining(xml, "26/07/2026")).toContain('<w:color w:val="FF0000"/>');
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
