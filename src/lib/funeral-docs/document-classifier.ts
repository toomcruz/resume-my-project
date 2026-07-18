// Classifica o tipo de documento a partir do texto do OCR ou dos campos
// já extraídos. Puro — sem I/O, sem chamada de IA.
import type { TipoDocumento } from "./types";

export interface ClassificationInput {
  /** Texto bruto do OCR (opcional, mas recomendado). */
  ocrText?: string;
  /** Campos já lidos, quando disponíveis. */
  extractedFields?: Record<string, unknown>;
}

export interface ClassificationResult {
  tipo: TipoDocumento;
  confianca: number;
  motivo: string;
  alternativas: Array<{ tipo: TipoDocumento; confianca: number }>;
}

const DO_KEYWORDS = [
  "DECLARAÇÃO DE ÓBITO",
  "DECLARACAO DE OBITO",
  "Falecido(a)",
  "Declarante",
  "Grau de parentesco",
  "Data e hora do falecimento",
  "Causa mortis",
  "Nome do pai",
  "Nome da mãe",
];

const NOTA_KEYWORDS = [
  "NOTA DE CONTRATAÇÃO DE FUNERAL",
  "NOTA DE CONTRATACAO",
  "Contratante",
  "ITENS DA COMPRA",
  "Itens da compra",
  "DADOS DO PAGAMENTO",
  "Número da contratação",
  "Local do velório",
  "Local do sepultamento",
  "Produtos",
  "Total",
];

function scoreKeywords(text: string, keywords: string[]): number {
  const upper = text.toUpperCase();
  let hits = 0;
  for (const k of keywords) if (upper.includes(k.toUpperCase())) hits += 1;
  return hits / keywords.length;
}

const THRESHOLD = 0.35;

export function classifyDocument(input: ClassificationInput): ClassificationResult {
  const text = input.ocrText ?? Object.values(input.extractedFields ?? {}).join(" ");
  const doScore = scoreKeywords(text, DO_KEYWORDS);
  const notaScore = scoreKeywords(text, NOTA_KEYWORDS);

  const ranked: Array<{ tipo: TipoDocumento; confianca: number }> = [
    { tipo: "DECLARACAO_DE_OBITO", confianca: doScore },
    { tipo: "NOTA_DE_CONTRATACAO_FUNERAL", confianca: notaScore },
  ].sort((a, b) => b.confianca - a.confianca);

  const top = ranked[0];
  if (top.confianca < THRESHOLD) {
    return {
      tipo: "DOCUMENTO_DESCONHECIDO",
      confianca: 1 - top.confianca,
      motivo: `Nenhum tipo atingiu o mínimo (${THRESHOLD})`,
      alternativas: ranked,
    };
  }
  return {
    tipo: top.tipo,
    confianca: Number(top.confianca.toFixed(2)),
    motivo: `Palavras-chave características de ${top.tipo}`,
    alternativas: ranked.slice(1),
  };
}
