// Server-only DOCX helpers using docxtemplater + pizzip.
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

type TemplateDelimiters = { start: string; end: string };

const SINGLE_BRACE_DELIMITERS: TemplateDelimiters = {
  start: "{",
  end: "}",
};
const DOUBLE_BRACE_DELIMITERS: TemplateDelimiters = {
  start: "{{",
  end: "}}",
};

const DOCUMENT_XML_PATH = "word/document.xml";
const DOCUMENT_RELS_PATH = "word/_rels/document.xml.rels";
const CONTENT_TYPES_PATH = "[Content_Types].xml";
const TINY_INK_MAX_EXTENT = 1000;

function getTemplateXmlFiles(zip: PizZip): string[] {
  const zipWithFiles = zip as PizZip & { files?: Record<string, unknown> };
  return Object.keys(zipWithFiles.files ?? {}).filter(
    (name) => name.startsWith("word/") && name.endsWith(".xml"),
  );
}

function stripXmlTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, "");
}

function detectDelimiters(zip: PizZip): TemplateDelimiters {
  for (const name of getTemplateXmlFiles(zip)) {
    const stripped = stripXmlTags(zip.file(name)?.asText() ?? "");
    if (/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(stripped)) return DOUBLE_BRACE_DELIMITERS;
  }
  return SINGLE_BRACE_DELIMITERS;
}

function getXmlAttribute(fragment: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return fragment.match(new RegExp(`\\b${escapedName}=(["'])(.*?)\\1`))?.[2];
}

function normalizePackageTarget(baseDirectory: string, target: string): string {
  const sourceSegments = target.startsWith("/")
    ? target.slice(1).split("/")
    : [...baseDirectory.split("/"), ...target.split("/")];
  const normalized: string[] = [];

  for (const segment of sourceSegments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") normalized.pop();
    else normalized.push(segment);
  }

  return normalized.join("/");
}

function removeTinyInkArtifacts(zip: PizZip): void {
  const documentFile = zip.file(DOCUMENT_XML_PATH);
  if (!documentFile) return;

  const removedRelationshipIds = new Set<string>();
  const cleanedDocument = documentFile.asText().replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!paragraph.includes("<w14:contentPart")) return paragraph;

    const extent = paragraph.match(/<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    if (!extent) return paragraph;
    if (Number(extent[1]) > TINY_INK_MAX_EXTENT || Number(extent[2]) > TINY_INK_MAX_EXTENT) {
      return paragraph;
    }

    for (const match of paragraph.matchAll(/\br:id=(["'])(.*?)\1/g)) {
      removedRelationshipIds.add(match[2]);
    }
    return "";
  });

  if (!removedRelationshipIds.size) return;
  zip.file(DOCUMENT_XML_PATH, cleanedDocument);

  const relationshipsFile = zip.file(DOCUMENT_RELS_PATH);
  if (!relationshipsFile) return;

  const removedTargets: string[] = [];
  const cleanedRelationships = relationshipsFile
    .asText()
    .replace(/<Relationship\b[^>]*\/>/g, (relationship) => {
      const id = getXmlAttribute(relationship, "Id");
      if (!id || !removedRelationshipIds.has(id)) return relationship;

      const target = getXmlAttribute(relationship, "Target");
      if (target) removedTargets.push(target);
      return "";
    });
  zip.file(DOCUMENT_RELS_PATH, cleanedRelationships);

  const removedPackagePaths = removedTargets.map((target) =>
    normalizePackageTarget("word", target),
  );
  for (const path of removedPackagePaths) zip.remove(path);

  const contentTypesFile = zip.file(CONTENT_TYPES_PATH);
  if (!contentTypesFile) return;

  const removedPartNames = new Set(removedPackagePaths.map((path) => `/${path}`));
  const cleanedContentTypes = contentTypesFile
    .asText()
    .replace(/<Override\b[^>]*\/>/g, (override) => {
      const partName = getXmlAttribute(override, "PartName");
      return partName && removedPartNames.has(partName) ? "" : override;
    });
  zip.file(CONTENT_TYPES_PATH, cleanedContentTypes);
}

function getDocxErrorMessage(error: unknown): string {
  const err = error as {
    properties?: {
      errors?: Array<{
        properties?: { explanation?: string; id?: string; xtag?: string };
      }>;
    };
    message?: string;
  };
  const details = err?.properties?.errors
    ?.map((e) => e?.properties?.explanation || e?.properties?.xtag || e?.properties?.id)
    .filter(Boolean)
    .join("; ");
  return details ? `Erro no modelo: ${details}` : err?.message || "Erro ao preencher o modelo";
}

export function detectPlaceholders(docxBuffer: ArrayBuffer): string[] {
  const zip = new PizZip(docxBuffer);
  const clean = new Set<string>();
  // Scan main document and headers/footers
  for (const name of getTemplateXmlFiles(zip)) {
    const xml = zip.file(name)?.asText() ?? "";
    // Strip XML tags so placeholders split across runs still match
    const stripped = stripXmlTags(xml);
    const doubleMatches = stripped.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];
    for (const match of doubleMatches) clean.add(match.replace(/[{}\s]/g, ""));

    const withoutDoubleBraceTags = stripped.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, "");
    const singleMatches = withoutDoubleBraceTags.match(/\{\s*([a-zA-Z0-9_]+)\s*\}/g) ?? [];
    for (const match of singleMatches) clean.add(match.replace(/[{}\s]/g, ""));
  }
  return Array.from(clean).sort();
}

export function fillDocx(docxBuffer: ArrayBuffer, data: Record<string, string>): Uint8Array {
  const zip = new PizZip(docxBuffer);
  try {
    // Fidelity-first: do NOT sanitize/normalize the official template binary.
    // Any XML mutation risks breaking tipografia (rPr/pPr) e layout do modelo.
    // Só limpa artefatos residuais de anotações Ink do Word quando o modelo os
    // contiver — caso contrário a etapa é totalmente pulada.
    const documentXml = zip.file(DOCUMENT_XML_PATH)?.asText() ?? "";
    if (documentXml.includes("<w14:contentPart")) {
      removeTinyInkArtifacts(zip);
    }
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: detectDelimiters(zip),
      nullGetter: () => "",
    });
    doc.render(data);
    return doc.getZip().generate({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  } catch (error: unknown) {
    throw new Error(getDocxErrorMessage(error));
  }
}
