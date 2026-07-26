import type PizZip from "pizzip";

const DOCUMENT_XML_PATH = "word/document.xml";

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function visibleText(xml: string): string {
  return decodeXmlText(xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function firstNonEmpty(data: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = String(data[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function buildLineRuns(rPr: string, lines: string[]): string {
  return lines
    .map(
      (line, index) =>
        `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(line)}</w:t>${
          index < lines.length - 1 ? "<w:br/>" : ""
        }</w:r>`,
    )
    .join("");
}

/**
 * O modelo oficial guarda identificação, endereço e contato no mesmo parágrafo,
 * separados por quebras de linha. A etapa principal recompõe a identificação;
 * esta etapa garante que as três linhas permaneçam juntas, sem perder endereço
 * e telefone durante a substituição do XML.
 */
export function postProcessBurialAuthorization(
  zip: PizZip,
  data: Record<string, string>,
): void {
  const file = zip.file(DOCUMENT_XML_PATH);
  if (!file) return;
  let xml = file.asText();
  let replaced = false;

  const identity = [
    `Eu, ${firstNonEmpty(data, ["nomeResp", "nome_declarante", "nome_responsavel"])}`.trim(),
    firstNonEmpty(data, ["cpfResp", "cpf_declarante", "cpf_responsavel"])
      ? `CPF: ${firstNonEmpty(data, ["cpfResp", "cpf_declarante", "cpf_responsavel"])}`
      : "",
    data.__ordemProfissao ? `Profissão: ${data.__ordemProfissao}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const address = data.__ordemEndereco
    ? `Endereço: ${data.__ordemEndereco}`
    : "Endereço:";
  const contact = [
    data.__ordemCep ? `CEP: ${data.__ordemCep}` : "",
    data.__ordemTelefone ? `Telefone: ${data.__ordemTelefone}` : "",
  ]
    .filter(Boolean)
    .join("  ");
  const lines = [identity, address, contact].filter((line) => line.trim());

  xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (replaced || !/^Eu,\s*/i.test(visibleText(paragraph))) return paragraph;
    replaced = true;
    const open = paragraph.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
    const pPr = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    const rPr =
      paragraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ??
      '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
    return `${open}${pPr}${buildLineRuns(rPr, lines)}</w:p>`;
  });

  xml = xml.replace(/São Paulo,\s*São Paulo,/gi, "São Paulo,");
  file.asText();
  zip.file(DOCUMENT_XML_PATH, xml);
}
