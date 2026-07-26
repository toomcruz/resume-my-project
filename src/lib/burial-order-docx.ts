import type PizZip from "pizzip";

const DOCUMENT_XML_PATH = "word/document.xml";
const CHECKBOX_BLACK = "000000";
const CHECKBOX_WHITE = "FFFFFF";

function stripXmlTags(xml: string): string {
  return xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function visibleText(xml: string): string {
  return decodeXmlText(stripXmlTags(xml)).replace(/\s+/g, " ").trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

function formatCep(value: string): string {
  const digits = value.replace(/\D+/g, "");
  if (digits.length !== 8) return value.trim();
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatDeclarationNumber(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D+/g, "");
  if (/^\d{10}$/.test(digits) && /^\d+$/.test(trimmed)) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return trimmed;
}

function isYes(value: unknown): boolean {
  return ["SIM", "S", "TRUE", "1", "X", "MARCADO", "CHECKED"].includes(normalizedText(value));
}

function isNo(value: unknown): boolean {
  return ["NAO", "NÃO", "N", "FALSE", "0", "DESMARCADO", "UNCHECKED"].includes(
    normalizedText(value),
  );
}

function sanitizeWakeRoom(value: string): string {
  const normalized = normalizedText(value);
  const match = /^(?:SALA(?: DE VELORIO)?\s*[:\-]?\s*)?([A-F])$/.exec(normalized);
  return match?.[1] ?? "";
}

function cleanAddress(value: string): string {
  return value
    .replace(/\bCEP\s*:?\s*\d{5}-?\d{3}\b/gi, " ")
    .replace(/\b(?:TELEFONE|TEL|FONE)\s*:?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim()
    .replace(/[\s,;.-]+$/, "");
}

function extractCep(value: string): string {
  return value.match(/\b\d{5}-?\d{3}\b/)?.[0] ?? "";
}

function stripSaoPauloPrefix(value: string): string {
  return value.replace(/^\s*S[aã]o Paulo\s*,\s*/i, "").trim();
}

function categoryFromValue(value: string): string {
  const source = normalizedText(value);
  if (!source) return "";
  if (/\b(DE FORA|EXTERNO|EXTERNA)\b/.test(source)) return "DE_FORA";
  if (/\bDOADOR(?:A)?(?: DE ORGAOS)?\b/.test(source)) return "DOADOR";
  if (/\b(SOCIAL|GRATUIDADE|GRATUITO)\b/.test(source)) return "SOCIAL";
  if (/\bPOPULAR\b/.test(source)) return "POPULAR";
  if (/\b(SUPER LUXO|SUPERLUXO|LUXO)\b/.test(source)) return "LUXO";
  if (/\b(PADRAO|JADE)\b/.test(source)) return "PADRAO";
  return "";
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
  ];
  for (const key of preferred) {
    const category = categoryFromValue(data[key] ?? "");
    if (category) return category;
  }

  const categories = new Set<string>();
  for (const [key, value] of Object.entries(data)) {
    if (!/(contrat|funeral|padrao|padrão|modalidade|categoria|item|servico|serviço)/i.test(key)) {
      continue;
    }
    const category = categoryFromValue(String(value ?? ""));
    if (category) categories.add(category);
  }
  return categories.size === 1 ? Array.from(categories)[0] : "";
}

export function isBurialOrderTemplate(zip: PizZip): boolean {
  const text = stripXmlTags(zip.file(DOCUMENT_XML_PATH)?.asText() ?? "");
  return text.includes("Ordem de Sepultamento") && text.includes("NOME DA PESSOA FALECIDA");
}

export function prepareBurialOrderData(data: Record<string, string>): Record<string, string> {
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

  const rawAddress = output.endResp ?? "";
  const explicitCep = firstNonEmpty(output, [
    "cep_declarante",
    "cep_declarante_obito",
    "cep_responsavel",
    "cep_requerente",
    "cep",
  ]);
  output.__ordemCep = formatCep(explicitCep || extractCep(rawAddress));
  output.__ordemEndereco = cleanAddress(rawAddress);
  output.endResp = output.__ordemEndereco;
  output.__ordemTelefone = output.telResp ?? "";
  output.__ordemProfissao = firstNonEmpty(output, [
    "profissao_declarante",
    "profissao_declarante_obito",
    "profissao_responsavel",
    "profissao",
  ]).trim();

  const semVelorio = isYes(output.sem_velorio) || isNo(output.tem_velorio);
  const sala = semVelorio
    ? ""
    : sanitizeWakeRoom(
        firstNonEmpty(output, ["sala_velorio", "salaVelorio", "sala_do_velorio", "sala"]),
      );
  output.salaVelorio = sala;
  output.sala = sala;

  output.numDO = formatDeclarationNumber(
    firstNonEmpty(output, ["numero_declaracao_obito", "numero_do", "numeroDO", "numDO"]),
  );
  output.nota = firstNonEmpty(output, [
    "numero_nota_contratacao",
    "numero_contratacao",
    "nota_contratacao",
    "numeroNotaContratacao",
    "nota",
  ]);
  output.funeraria = firstNonEmpty(output, [
    "empresa_agencia",
    "empresa_bloco_agencia",
    "agencia_funeral",
    "empresa_funeraria",
    "funeraria",
  ]);
  output.dataExt = stripSaoPauloPrefix(
    firstNonEmpty(output, ["dataExt", "data_atual_extenso", "dataAtualExtenso"]),
  );

  const localText = normalizedText(
    [output.local_sepultamento, output.localSepultamento, output.quadraRua].filter(Boolean).join(" "),
  );
  output.__ordemLocal =
    isYes(output.quadra_geral_gaveta) || localText.includes("QUADRA GERAL")
      ? "QUADRA_GERAL"
      : isYes(output.concessao)
        ? "JAZIGO"
        : "";
  if (output.__ordemLocal === "QUADRA_GERAL") output.quadraRua = "";

  output.__ordemContratacao = detectFuneralCategory(output);

  const covid = normalizedText(
    firstNonEmpty(output, ["covid_lacrado", "covidLacrado", "lacrado_covid", "lacradoCovid"]),
  );
  output.__ordemCovid = covid.startsWith("SIM") ? "SIM" : covid.startsWith("NAO") ? "NAO" : "";

  const family = firstNonEmpty(output, ["familia_presente", "familiaPresente"]);
  output.__ordemFamilia = isYes(family) ? "SIM" : isNo(family) ? "NAO" : "";
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

function setCheckboxState(xml: string, docPrId: number, selected: boolean): string {
  const bounds = alternateContentBounds(xml, docPrId);
  if (!bounds) return xml;
  const [start, end] = bounds;
  const fill = selected ? CHECKBOX_BLACK : CHECKBOX_WHITE;
  let block = xml.slice(start, end);

  block = block.replace(
    /(<wps:spPr>[\s\S]*?<a:solidFill>)(?:<a:srgbClr\b[^>]*\/>|<a:schemeClr\b[^>]*\/>|<a:schemeClr\b[^>]*>[\s\S]*?<\/a:schemeClr>)(<\/a:solidFill>)/,
    `$1<a:srgbClr val="${fill}"/>$2`,
  );
  block = block.replace(
    /(<a:ln(?:\s[^>]*)?>[\s\S]*?<a:solidFill>)(?:<a:srgbClr\b[^>]*\/>|<a:schemeClr\b[^>]*\/>|<a:schemeClr\b[^>]*>[\s\S]*?<\/a:schemeClr>)(<\/a:solidFill>)/,
    `$1<a:srgbClr val="${CHECKBOX_BLACK}"/>$2`,
  );
  block = block.replace(/\bfillcolor=(['"])[^'"]*\1/, `fillcolor="${selected ? "black" : "white"}"`);
  block = block.replace(/<v:fill\b([^>]*?)\bcolor2=(['"])[^'"]*\2([^>]*)\/>/, `<v:fill$1color2="${selected ? "black" : "white"}"$3/>`);
  block = block.replace(/<v:stroke\b([^>]*?)\bcolor=(['"])[^'"]*\2([^>]*)>/, `<v:stroke$1color="black"$3>`);
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
    .replace(/<wp:posOffset>1427480<\/wp:posOffset>/, "<wp:posOffset>1030000</wp:posOffset>")
    .replace(/<v:rect id="shape_0"/, '<v:rect id="shape_114"');
  return `${xml.slice(0, start)}${clone}${xml.slice(start)}`;
}

function ensureRunFormatting(paragraph: string, sizeHalfPoints: number, color?: string): string {
  const sizeXml = `<w:sz w:val="${sizeHalfPoints}"/><w:szCs w:val="${sizeHalfPoints}"/>`;
  let output = paragraph.replace(/<w:rPr\/>/g, `<w:rPr>${sizeXml}<w:b/><w:bCs/></w:rPr>`);
  output = output.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (_match, inner: string) => {
    let next = inner
      .replace(/<w:sz w:val="\d+"\/>/g, `<w:sz w:val="${sizeHalfPoints}"/>`)
      .replace(/<w:szCs w:val="\d+"\/>/g, `<w:szCs w:val="${sizeHalfPoints}"/>`);
    if (!/<w:sz\b/.test(next)) next += `<w:sz w:val="${sizeHalfPoints}"/>`;
    if (!/<w:szCs\b/.test(next)) next += `<w:szCs w:val="${sizeHalfPoints}"/>`;
    if (!/<w:b\b/.test(next)) next += "<w:b/>";
    if (!/<w:bCs\b/.test(next)) next += "<w:bCs/>";
    if (color) {
      next = next.replace(/<w:color\b[^>]*\/>/g, `<w:color w:val="${color}"/>`);
      if (!/<w:color\b/.test(next)) next += `<w:color w:val="${color}"/>`;
    }
    return `<w:rPr>${next}</w:rPr>`;
  });
  output = output.replace(/<w:r>(?!<w:rPr>)/g, `<w:r><w:rPr>${sizeXml}<w:b/><w:bCs/>${color ? `<w:color w:val="${color}"/>` : ""}</w:rPr>`);
  return output;
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
  const paragraph = ensureRunFormatting(xml.slice(valueParagraphStart, end), 32);
  return `${xml.slice(0, valueParagraphStart)}${paragraph}${xml.slice(end)}`;
}

function replaceFirstParagraphText(
  xml: string,
  predicate: (text: string) => boolean,
  replacement: string,
): string {
  let replaced = false;
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (replaced || !predicate(visibleText(paragraph))) return paragraph;
    replaced = true;
    const open = paragraph.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
    const pPr = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    const rPr = paragraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ??
      '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
    return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(replacement)}</w:t></w:r></w:p>`;
  });
}

function styleBurialDate(xml: string, dataSep: string): string {
  if (!dataSep) return xml;
  const markerIndex = xml.indexOf("DATA DO SEPULTAMENTO:");
  if (markerIndex < 0) return xml;
  let cursor = markerIndex;
  while (cursor < xml.length) {
    const start = xml.indexOf("<w:p", cursor);
    if (start < 0) return xml;
    const endIndex = xml.indexOf("</w:p>", start);
    if (endIndex < 0) return xml;
    const end = endIndex + "</w:p>".length;
    const paragraph = xml.slice(start, end);
    if (visibleText(paragraph).includes(dataSep)) {
      const styled = ensureRunFormatting(paragraph, 22, "FF0000").replace(
        /<w:jc w:val="[^"]+"\/>/g,
        '<w:jc w:val="center"/>',
      );
      return `${xml.slice(0, start)}${styled}${xml.slice(end)}`;
    }
    cursor = end;
    if (visibleText(paragraph).includes("HORA DO SEPULTAMENTO:")) return xml;
  }
  return xml;
}

function postProcessAuthorization(xml: string, data: Record<string, string>): string {
  const identity = [
    `Eu, ${data.nomeResp ?? ""}`.trim(),
    data.cpfResp ? `CPF: ${data.cpfResp}` : "",
    data.__ordemProfissao ? `Profissão: ${data.__ordemProfissao}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  xml = replaceFirstParagraphText(xml, (text) => /^Eu,\s*/i.test(text), identity);

  const address = data.__ordemEndereco ? `Endereço: ${data.__ordemEndereco}` : "Endereço:";
  xml = replaceFirstParagraphText(xml, (text) => /^ENDEREÇO\s*:/i.test(text), address);

  const contact = [
    data.__ordemCep ? `CEP: ${data.__ordemCep}` : "",
    data.__ordemTelefone ? `Telefone: ${data.__ordemTelefone}` : "",
  ]
    .filter(Boolean)
    .join("  ");
  xml = replaceFirstParagraphText(xml, (text) => /^(CEP|Telefone)\s*:/i.test(text), contact);
  return xml.replace(/São Paulo,\s*São Paulo,/gi, "São Paulo,");
}

export function postProcessBurialOrder(zip: PizZip, data: Record<string, string>): void {
  const documentFile = zip.file(DOCUMENT_XML_PATH);
  if (!documentFile) return;
  let xml = documentFile.asText();

  for (const id of [1, 2, 3, 4]) xml = setCheckboxState(xml, id, false);
  if (data.__ordemLocal === "QUADRA_GERAL") xml = setCheckboxState(xml, 3, true);
  if (data.__ordemLocal === "JAZIGO") xml = setCheckboxState(xml, 1, true);

  for (const id of [5, 6]) xml = setCheckboxState(xml, id, false);
  if (data.__ordemFamilia === "SIM") xml = setCheckboxState(xml, 5, true);
  if (data.__ordemFamilia === "NAO") xml = setCheckboxState(xml, 6, true);

  const contractShapeIds: Record<string, number> = {
    SOCIAL: 11,
    DOADOR: 13,
    PADRAO: 9,
    POPULAR: 10,
    LUXO: 12,
    DE_FORA: 8,
  };
  for (const id of Object.values(contractShapeIds)) xml = setCheckboxState(xml, id, false);
  const selectedContract = contractShapeIds[data.__ordemContratacao];
  if (selectedContract) xml = setCheckboxState(xml, selectedContract, true);

  xml = ensureCovidYesCheckbox(xml);
  xml = xml.replace(
    /COVID\/Lacrado:\s*\[\s*\]\s*sim\s*\[\s*\]\s*não/i,
    "COVID/Lacrado:             sim             não",
  );
  xml = setCheckboxState(xml, 114, data.__ordemCovid === "SIM");
  xml = setCheckboxState(xml, 14, data.__ordemCovid === "NAO");

  xml = setDeceasedNameFontSize(xml);
  xml = styleBurialDate(xml, data.dataSep ?? data.data_sepultamento ?? "");
  xml = postProcessAuthorization(xml, data);
  zip.file(DOCUMENT_XML_PATH, xml);
}
