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
const SELECTED_CHECKBOX_COLOR = "156082";
const UNSELECTED_CHECKBOX_COLOR = "000000";

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

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function firstNonEmpty(data: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = String(data[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D+/g, "");
  if (digits.length !== 11) return value.trim();
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  let digits = value.replace(/\D+/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value.trim();
}

function isYes(value: unknown): boolean {
  return ["SIM", "S", "TRUE", "1", "X", "MARCADO", "CHECKED"].includes(normalizedText(value));
}

function isBurialOrderTemplate(zip: PizZip): boolean {
  const text = stripXmlTags(zip.file(DOCUMENT_XML_PATH)?.asText() ?? "");
  return text.includes("Ordem de Sepultamento") && text.includes("NOME DA PESSOA FALECIDA");
}

function detectFuneralCategory(data: Record<string, string>): string {
  const preferred = [
    "padrao_funeral",
    "padraoFuneral",
    "tipo_contratacao",
    "tipoContratacao",
    "modalidade_funeral",
    "modalidadeFuneral",
    "categoria_funeral",
    "categoriaFuneral",
    "descricao_atendimento",
    "descricao",
    "itens",
  ];
  const relevantEntries = Object.entries(data)
    .filter(([key, value]) =>
      Boolean(String(value ?? "").trim()) &&
      /(contrat|funeral|padrao|padrão|modalidade|categoria|item|servico|serviço)/i.test(key),
    )
    .map(([, value]) => String(value));
  const source = normalizedText(
    [...preferred.map((key) => data[key]).filter(Boolean), ...relevantEntries].join(" "),
  );

  if (/\b(DE FORA|EXTERNO|EXTERNA)\b/.test(source)) return "DE_FORA";
  if (/\bDOADOR(?:A)?(?: DE ORGAOS)?\b/.test(source)) return "DOADOR";
  if (/\b(SOCIAL|GRATUIDADE|GRATUITO)\b/.test(source)) return "SOCIAL";
  if (/\bPOPULAR\b/.test(source)) return "POPULAR";
  if (/\b(SUPER LUXO|SUPERLUXO|LUXO)\b/.test(source)) return "LUXO";
  if (/\b(PADRAO|JADE)\b/.test(source)) return "PADRAO";
  return "";
}

function prepareBurialOrderData(data: Record<string, string>): Record<string, string> {
  const output = { ...data };
  const preferredFields: Record<string, string[]> = {
    nomeResp: [
      "nome_declarante",
      "nome_declarante_obito",
      "nome_responsavel",
      "nome_requerente",
      "nomeRequerente",
      "nomeResp",
    ],
    rgResp: [
      "rg_declarante",
      "rg_declarante_obito",
      "rg_responsavel",
      "rg_requerente",
      "rgRequerente",
      "rgResp",
    ],
    cpfResp: [
      "cpf_declarante",
      "cpf_declarante_obito",
      "cpf_responsavel",
      "cpf_requerente",
      "cpfRequerente",
      "cpfResp",
    ],
    endResp: [
      "endereco_declarante",
      "endereco_declarante_obito",
      "endereco_responsavel",
      "endereco_requerente",
      "enderecoRequerente",
      "endResp",
    ],
    telResp: [
      "telefone_declarante",
      "celular_declarante_obito",
      "telefone_declarante_obito",
      "telefone_responsavel",
      "telefone_requerente",
      "telefoneRequerente",
      "telResp",
    ],
    parent: [
      "grau_parentesco_declarante",
      "parentesco_declarante",
      "parentesco_declarante_obito",
      "grau_parentesco_responsavel",
      "grau_parentesco",
      "parentesco",
      "parent",
    ],
  };

  for (const [target, keys] of Object.entries(preferredFields)) {
    const value = firstNonEmpty(output, keys);
    if (value) output[target] = value;
  }

  if (output.cpfResp) output.cpfResp = formatCpf(output.cpfResp);
  if (output.telResp) output.telResp = formatPhone(output.telResp);
  if (output.parent) output.parent = output.parent.trim().toUpperCase();

  const localText = normalizedText(
    [output.local_sepultamento, output.localSepultamento, output.quadraRua].filter(Boolean).join(" "),
  );
  output.__ordemLocal =
    isYes(output.quadra_geral_gaveta) || localText.includes("QUADRA GERAL")
      ? "QUADRA_GERAL"
      : isYes(output.concessao)
        ? "JAZIGO"
        : "";
  output.__ordemContratacao = detectFuneralCategory(output);

  const covid = normalizedText(
    firstNonEmpty(output, ["covid_lacrado", "covidLacrado", "lacrado_covid", "lacradoCovid"]),
  );
  output.__ordemCovid = covid.startsWith("SIM") ? "SIM" : covid.startsWith("NAO") ? "NAO" : "";
  return output;
}

function alternateContentBounds(xml: string, docPrId: number): [number, number] | null {
  const markerIndex = xml.indexOf(`<wp:docPr id="${docPrId}"`);
  if (markerIndex < 0) return null;
  const start = xml.lastIndexOf("<mc:AlternateContent", markerIndex);
  const closing = "</mc:AlternateContent>";
  const endIndex = xml.indexOf(closing, markerIndex);
  if (start < 0 || endIndex < 0) return null;
  return [start, endIndex + closing.length];
}

function setShapeOutline(xml: string, docPrId: number, color: string): string {
  const bounds = alternateContentBounds(xml, docPrId);
  if (!bounds) return xml;
  const [start, end] = bounds;
  const vmlColor = color === UNSELECTED_CHECKBOX_COLOR ? "black" : `#${color}`;
  let block = xml.slice(start, end);
  block = block.replace(
    /(<a:ln(?:\s[^>]*)?>[\s\S]*?<a:solidFill>)(?:<a:srgbClr\b[^>]*\/>|<a:schemeClr\b[^>]*\/>|<a:schemeClr\b[^>]*>[\s\S]*?<\/a:schemeClr>)(<\/a:solidFill>)/,
    `$1<a:srgbClr val="${color}"/>$2`,
  );
  block = block.replace(
    /<v:stroke\b([^>]*?)\bcolor=(["'])[^"']*\2([^>]*)>/,
    `<v:stroke$1color="${vmlColor}"$3>`,
  );
  return `${xml.slice(0, start)}${block}${xml.slice(end)}`;
}

function ensureCovidYesCheckbox(xml: string): string {
  if (xml.includes('<wp:docPr id="114"')) return xml;
  const bounds = alternateContentBounds(xml, 14);
  if (!bounds) return xml;
  const [start, end] = bounds;
  let clone = xml.slice(start, end);
  clone = clone
    .replace(/<wp:docPr id="14"/, '<wp:docPr id="114"')
    .replace(/wp14:anchorId="[0-9A-F]+"/gi, 'wp14:anchorId="C0A1D001"')
    .replace(/<wp:posOffset>1427480<\/wp:posOffset>/, "<wp:posOffset>880000</wp:posOffset>")
    .replace(/<v:rect id="shape_0"/, '<v:rect id="shape_114"');
  return `${xml.slice(0, start)}${clone}${xml.slice(start)}`;
}

function setDeceasedNameFontSize(xml: string): string {
  const marker = "<w:t>NOME DA PESSOA FALECIDA:</w:t>";
  const markerIndex = xml.indexOf(marker);
  if (markerIndex < 0) return xml;
  const labelParagraphEnd = xml.indexOf("</w:p>", markerIndex);
  const valueParagraphStart = xml.indexOf("<w:p", labelParagraphEnd + 1);
  const valueParagraphEnd = xml.indexOf("</w:p>", valueParagraphStart);
  if (labelParagraphEnd < 0 || valueParagraphStart < 0 || valueParagraphEnd < 0) return xml;

  const end = valueParagraphEnd + "</w:p>".length;
  let paragraph = xml.slice(valueParagraphStart, end);
  const hadSize = /<w:sz(?:Cs)?\b/.test(paragraph);
  paragraph = paragraph
    .replace(/<w:sz w:val="\d+"\/>/g, '<w:sz w:val="32"/>')
    .replace(/<w:szCs w:val="\d+"\/>/g, '<w:szCs w:val="32"/>');
  if (!hadSize) {
    paragraph = paragraph.replace(
      "<w:rPr>",
      '<w:rPr><w:sz w:val="32"/><w:szCs w:val="32"/>',
    );
  }
  return `${xml.slice(0, valueParagraphStart)}${paragraph}${xml.slice(end)}`;
}

function postProcessBurialOrder(zip: PizZip, data: Record<string, string>): void {
  const documentFile = zip.file(DOCUMENT_XML_PATH);
  if (!documentFile) return;
  let xml = documentFile.asText();

  // The opposite section stays blank: quadra geral marks only its SIM box;
  // jazigo marks only Concessão/SIM. This mirrors the official paper workflow.
  for (const id of [1, 2, 3, 4]) xml = setShapeOutline(xml, id, UNSELECTED_CHECKBOX_COLOR);
  if (data.__ordemLocal === "QUADRA_GERAL") {
    xml = setShapeOutline(xml, 3, SELECTED_CHECKBOX_COLOR);
  } else if (data.__ordemLocal === "JAZIGO") {
    xml = setShapeOutline(xml, 1, SELECTED_CHECKBOX_COLOR);
  }

  const contractShapeIds: Record<string, number> = {
    SOCIAL: 11,
    DOADOR: 13,
    PADRAO: 9,
    POPULAR: 10,
    LUXO: 12,
    DE_FORA: 8,
  };
  for (const id of Object.values(contractShapeIds)) {
    xml = setShapeOutline(xml, id, UNSELECTED_CHECKBOX_COLOR);
  }
  const selectedContract = contractShapeIds[data.__ordemContratacao];
  if (selectedContract) xml = setShapeOutline(xml, selectedContract, SELECTED_CHECKBOX_COLOR);

  // The original file mixed typed brackets with one Word shape. Replace that
  // mixture with two identical Word rectangles, matching the upper checkboxes.
  xml = ensureCovidYesCheckbox(xml);
  xml = xml.replace(
    /COVID\/Lacrado:\s*\[\s*\]\s*sim\s*\[\s*\]\s*não/i,
    "COVID/Lacrado:             sim             não",
  );
  xml = setShapeOutline(xml, 114, UNSELECTED_CHECKBOX_COLOR);
  xml = setShapeOutline(xml, 14, UNSELECTED_CHECKBOX_COLOR);
  if (data.__ordemCovid === "SIM") xml = setShapeOutline(xml, 114, SELECTED_CHECKBOX_COLOR);
  if (data.__ordemCovid === "NAO") xml = setShapeOutline(xml, 14, SELECTED_CHECKBOX_COLOR);

  xml = setDeceasedNameFontSize(xml);
  documentFile.asText();
  zip.file(DOCUMENT_XML_PATH, xml);
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
    const burialOrder = isBurialOrderTemplate(zip);
    const renderData = burialOrder ? prepareBurialOrderData(data) : data;
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: detectDelimiters(zip),
      nullGetter: () => "",
    });
    doc.render(renderData);
    const outputZip = doc.getZip();
    if (burialOrder) postProcessBurialOrder(outputZip, renderData);
    return outputZip.generate({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  } catch (error: unknown) {
    throw new Error(getDocxErrorMessage(error));
  }
}
