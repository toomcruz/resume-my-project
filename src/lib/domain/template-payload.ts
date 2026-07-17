/**
 * Mapeia dados canônicos confirmados para os placeholders técnicos dos
 * modelos DOCX. Fase A — camada 3 da spec (§1, §16).
 *
 * Contratos:
 *  - Nunca inventa placeholder que o modelo não declara.
 *  - Nunca usa dados brutos vindos da IA — recebe `canonicalData` já validado.
 *  - Preserva o valor como string (zeros à esquerda em inscrição/livro/folha).
 *  - Papéis (falecido de sepultamento vs. exumação PPS) NÃO se misturam.
 *
 * O mapa é declarativo (`documentSlug → placeholder → canonicalKey`) para
 * facilitar auditoria e novos modelos.
 */

import type { DocumentSlug } from "./types";

export type ConfirmedRoles = {
  /** Se true, `nome_falecido_exumacao_pps` alimenta os placeholders de
   *  exumação em vez de `nome_falecido_exumacao`. */
  ppsExumacao?: boolean;
};

/** Mapa placeholder → chave canônica, por documento. */
const PLACEHOLDER_MAP: Record<DocumentSlug, Record<string, string>> = {
  "identificacao-sala-velorio": {
    nomeFal: "nome_falecido_sepultamento",
    sala: "sala_velorio",
    inicio: "inicio_velorio",
    fim: "fim_velorio",
    data: "data_sepultamento",
  },
  condolencias: {
    nomeFal: "nome_falecido_sepultamento",
    sala: "sala_velorio",
    data: "data_sepultamento",
  },
  "ordem-sepultamento": {
    nomeFal: "nome_falecido_sepultamento",
    nomeResp: "nome_responsavel",
    cpfResp: "cpf_responsavel",
    rgResp: "rg_responsavel",
    endResp: "endereco_responsavel",
    telResp: "telefone_responsavel",
    parent: "parentesco_qualidade",
    numDO: "numero_declaracao_obito",
    inscrGS: "inscricao_gscemi",
    placa: "placa_identificacao",
    salaVelorio: "sala_velorio",
    dataSep: "data_sepultamento",
    horaSep: "horario_sepultamento",
    quadraRua: "quadra_rua",
    gaveta: "gaveta",
    livroObito: "livro_obito",
    funeraria: "empresa_funeraria",
    nota: "numero_nota_contratacao",
    dataAtual: "data_atual",
    dataExt: "data_atual_extenso",
  },
  "ordem-exumacao": {
    // Substituído por `nome_falecido_exumacao_pps` quando `ppsExumacao=true`.
    nomeFal: "nome_falecido_exumacao",
    nomeResp: "nome_responsavel",
    cpfResp: "cpf_responsavel",
    rgResp: "rg_responsavel",
    endResp: "endereco_responsavel",
    telResp: "telefone_responsavel",
    parent: "parentesco_qualidade",
    numDO: "numero_declaracao_obito",
    inscrGS: "inscricao_gscemi",
    placa: "placa_identificacao",
    dataAg: "data_exumacao",
    horaAg: "hora_agendamento",
    quadraRua: "quadra_rua",
    gaveta: "gaveta",
    sepultura: "terreno",
    dataAtual: "data_atual",
    dataExt: "data_atual_extenso",
  },
  "termo-compromisso-responsabilidade": {
    nomeResp: "nome_responsavel",
    cpfResp: "cpf_responsavel",
    endResp: "endereco_responsavel",
    telResp: "telefone_responsavel",
    qualid: "qualidade_signatario",
    tipoProcedimento: "tipo_procedimento",
    localJaz: "local_jazigo",
    falecido1: "falecido1_termo",
    falecido2: "falecido2_termo",
    dataExt: "data_atual_extenso",
  },
  "aquisicao-renovacao-ossuario": {
    nomeConc: "nome_concessionario",
    cpfConc: "cpf_concessionario",
    endConc: "endereco_concessionario",
    telConc: "telefone_concessionario",
    nomeFal: "nome_falecido_exumacao",
    inscrGS: "inscricao_gscemi",
    numeroOssuario: "numero_ossuario",
    bloco: "bloco_ossuario",
    dataAquisicao: "data_aquisicao_ossuario",
    dataVencimento: "data_vencimento_ossuario",
    dataExt: "data_atual_extenso",
  },
  "guia-exumacao-semi-intacto": {
    nomeFal: "nome_falecido_exumacao",
    nomeResp: "nome_responsavel",
    cpfResp: "cpf_responsavel",
    telResp: "telefone_responsavel",
    local: "local_exumacao",
    valorExumacao: "valor_exumacao",
    valorReinumacao: "valor_reinumacao",
    valorCessaoGaveta: "valor_cessao_gaveta",
    dataTent: "data_tentativa",
    dataProx: "data_proxima_tentativa",
    dataExt: "data_atual_extenso",
  },
  "memorando-autorizacao-translado": {
    nomeFal: "nome_falecido_exumacao",
    nomeResp: "nome_responsavel",
    cpfResp: "cpf_responsavel",
    origem: "origem_translado",
    destino: "destino_translado",
    dataExt: "data_atual_extenso",
  },
  "atualizacao-cadastral": {
    nomeConc: "nome_concessionario",
    cpf: "cpf_concessionario",
    endereco: "endereco_concessionario",
    telefone: "telefone_concessionario",
    email: "email_concessionario",
    nomeSuc: "nome_sucessor",
    parent: "parentesco_qualidade",
    nasc: "data_nascimento",
    inscrGS: "inscricao_gscemi",
    quadra: "quadra",
    terreno: "terreno",
    livro: "livro",
    folha: "folha",
    metragem: "metragem",
    quadraRec: "quadra",
    terrRec: "terreno",
    livroRec: "livro",
    folhaRec: "folha",
    dataAt: "data_atual",
    dataContr: "data_atual",
    dataRec: "data_atual",
    proxRen: "data_vencimento_ossuario",
    rg: "rg_responsavel",
  },
};

export interface BuildTemplatePayloadInput {
  documentSlug: DocumentSlug;
  canonicalData: Record<string, string>;
  confirmedRoles?: ConfirmedRoles;
}

export interface BuildTemplatePayloadResult {
  payload: Record<string, string>;
  missing: string[];
}

/**
 * Converte dados canônicos para o payload de placeholders esperado pelo
 * modelo. Retorna também os placeholders sem valor, permitindo à UI marcar
 * o documento como incompleto.
 */
export function buildTemplatePayload(
  input: BuildTemplatePayloadInput,
): BuildTemplatePayloadResult {
  const { documentSlug, canonicalData, confirmedRoles } = input;
  const map = PLACEHOLDER_MAP[documentSlug];
  if (!map) return { payload: {}, missing: [] };

  const autoDates = computeAutoDates();
  const payload: Record<string, string> = {};
  const missing: string[] = [];

  for (const [placeholder, canonicalKey] of Object.entries(map)) {
    let key = canonicalKey;
    if (
      documentSlug === "ordem-exumacao" &&
      placeholder === "nomeFal" &&
      confirmedRoles?.ppsExumacao
    ) {
      key = "nome_falecido_exumacao_pps";
    }
    if (
      documentSlug === "termo-compromisso-responsabilidade" &&
      placeholder === "falecido2" &&
      confirmedRoles?.ppsExumacao
    ) {
      key = "nome_falecido_exumacao_pps";
    }
    let value = canonicalData[key];
    // Data atual e por extenso são sempre calculadas pelo sistema (São Paulo, hoje).
    if (!value || value.length === 0) {
      if (key === "data_atual") value = autoDates.dataAtual;
      else if (key === "data_atual_extenso") value = autoDates.dataAtualExtenso;
    }
    if (typeof value === "string" && value.length > 0) {
      payload[placeholder] = value;
    } else {
      missing.push(placeholder);
    }
  }

  return { payload, missing };
}

/** Retorna a data atual formatada (fuso São Paulo) e sua versão por extenso
 *  já prefixada com "São Paulo, ...". Usado como fallback automático. */
function computeAutoDates(): { dataAtual: string; dataAtualExtenso: string } {
  const now = new Date();
  const tz = "America/Sao_Paulo";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const dataAtual = `${day}/${month}/${year}`;

  const monthName = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    month: "long",
  }).format(now);
  const dataAtualExtenso = `São Paulo, ${parseInt(day, 10)} de ${monthName} de ${year}`;

  return { dataAtual, dataAtualExtenso };
}

/** Retorna quais chaves canônicas são consumidas pelo modelo. Útil para
 *  cálculo de completude. */
export function getCanonicalKeysForDocument(documentSlug: DocumentSlug): string[] {
  const map = PLACEHOLDER_MAP[documentSlug];
  if (!map) return [];
  return Array.from(new Set(Object.values(map)));
}
