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

const GSCEMI_KEYWORDS = [
  "GSCEMI",
  "Cadastro de Concessionário",
  "Cadastro de Concessionario",
  "Concessionário",
  "Concessionario",
  "Inscrição",
  "Inscricao",
  "Quadra",
  "Jazigo",
  "Filial",
  "Grupo",
  "T.Venda",
  "Tipo de Venda",
  "Cadastrado por",
  "Data Cadastro",
  "Dependentes",
  "Manutenção",
  "Contratos",
  "Concessionário Cadastrado",
  "QUADRA GERAL",
  "COMUNITARIO",
  "COMUNITÁRIO",
];

/** Tela "Cadastro do Falecido / Sepultamento" do GSCEMI. */
const GSCEMI_SEPULTAMENTO_KEYWORDS = [
  "Tipo de Sepultamento",
  "Tem plano funerário",
  "Nome Falecido",
  "Nº Sepult",
  "Número Sepult",
  "Nº Registro / D.O",
  "Registro / D.O",
  "PRO-AIM",
  "O.S. Sisfuner",
  "Sisfuner",
  "Tanatopraxia",
  "Tem Lápide",
  "Termo/Nº Controle",
  "Termo/N° Controle",
  "Livro sepultamento",
  "Página sepultamento",
  "Pagina sepultamento",
  "Cartório Sepultamento",
  "Cartorio Sepultamento",
  "Distrito Sepultamento",
  "Situação do Sepultado",
  "Situacao do Sepultado",
  "Seguradora/Parceiro",
  "Concessionária",
  "Capela",
  "Data Fixação Lápide",
];

/** Tela "Declarantes" (Óbito + Pagamento) do GSCEMI. */
const GSCEMI_DECLARANTES_KEYWORDS = [
  "DECLARANTE DO ÓBITO",
  "DECLARANTE DO OBITO",
  "DECLARANTE DO PAGAMENTO",
  "Importar do declarante do óbito",
  "Importar do declarante do obito",
  "Importar do adm. provisório",
  "Importar do adm. provisorio",
  "Adm. Provisório",
  "DADOS PESSOAIS",
  "Tipo Pessoa",
  "Física",
  "Jurídica",
  "Código IBGE",
  "Codigo IBGE",
];

function scoreKeywords(text: string, keywords: string[]): number {
  const upper = text.toUpperCase();
  let hits = 0;
  for (const k of keywords) if (upper.includes(k.toUpperCase())) hits += 1;
  return hits / keywords.length;
}

const THRESHOLD = 0.25;

export function classifyDocument(input: ClassificationInput): ClassificationResult {
  const text = input.ocrText ?? Object.values(input.extractedFields ?? {}).join(" ");
  const doScore = scoreKeywords(text, DO_KEYWORDS);
  const notaScore = scoreKeywords(text, NOTA_KEYWORDS);
  const gscemiScore = scoreKeywords(text, GSCEMI_KEYWORDS);
  const gscemiSepScore = scoreKeywords(text, GSCEMI_SEPULTAMENTO_KEYWORDS);
  const gscemiDeclScore = scoreKeywords(text, GSCEMI_DECLARANTES_KEYWORDS);

  const ranked: Array<{ tipo: TipoDocumento; confianca: number }> = (
    [
      { tipo: "DECLARACAO_DE_OBITO" as TipoDocumento, confianca: doScore },
      { tipo: "NOTA_DE_CONTRATACAO_FUNERAL" as TipoDocumento, confianca: notaScore },
      { tipo: "CADASTRO_CONCESSIONARIO_GSCEMI" as TipoDocumento, confianca: gscemiScore },
      { tipo: "CADASTRO_FALECIDO_SEPULTAMENTO_GSCEMI" as TipoDocumento, confianca: gscemiSepScore },
      { tipo: "DECLARANTES_SEPULTAMENTO_GSCEMI" as TipoDocumento, confianca: gscemiDeclScore },
    ]
  ).sort((a, b) => b.confianca - a.confianca);

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

