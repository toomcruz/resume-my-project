// Funde documentos num único ProcessoFunerario.
// Regras: DO tem prioridade em identidade/filiação/óbito/declarante.
// Nota tem prioridade em contratação/itens/padrão.
// Correção manual (já aplicada aos ValorRastreado com confianca=1) sempre prevalece.
import type {
  Contratante,
  DadosContratacao,
  DadosSepultamento,
  DadosVelorio,
  DocumentoFonte,
  Falecido,
  ProcessoFunerario,
  Responsavel,
  TipoProcesso,
  ValorRastreado,
} from "./types";
import { detectDiscrepancies } from "./discrepancy-detector";
import { detectarPadraoFuneral } from "./padrao-funeral";
import { mergeDeceased, sameDeceased } from "./person-matcher";
import { computePending } from "./required-fields";

function vr(value: unknown, docId?: string, confianca = 0.7): ValorRastreado | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  return { original: s, normalized: s, confianca, origemDocId: docId };
}

/** Junta prioridade: só sobrescreve se o incoming tem confianca estritamente maior. */
function preferHigher<T extends ValorRastreado | undefined>(current: T, incoming: T): T {
  if (!current) return incoming;
  if (!incoming) return current;
  return incoming.confianca > current.confianca ? incoming : current;
}

function extractFalecido(doc: DocumentoFonte, papel: "principal" | "exumado" | "relacionado" = "principal"): Falecido {
  const d = doc.dadosExtraidos as Record<string, unknown>;
  return {
    papel,
    nome: vr(d.nome_falecido ?? d.nome, doc.id, doc.classificacaoConfianca),
    cpf: vr(d.cpf_falecido ?? d.cpf, doc.id, doc.classificacaoConfianca),
    rg: vr(d.rg_falecido ?? d.rg, doc.id, doc.classificacaoConfianca),
    sexo: vr(d.sexo, doc.id),
    dataNascimento: vr(d.data_nascimento, doc.id),
    dataObito: vr(d.data_obito ?? d.data_falecimento, doc.id),
    horaObito: vr(d.hora_obito ?? d.hora_falecimento, doc.id),
    nomeMae: vr(d.nome_mae, doc.id),
    nomePai: vr(d.nome_pai, doc.id),
    causaMortis: vr(d.causa_mortis, doc.id),
    numeroDO: vr(d.numero_do ?? d.numero_declaracao_obito, doc.id),
    proAim: vr(d.pro_aim ?? d.numero_registro, doc.id),
    localFalecimento: vr(d.local_falecimento, doc.id),
  };
}

function extractResponsavel(doc: DocumentoFonte): Responsavel {
  const d = doc.dadosExtraidos as Record<string, unknown>;
  return {
    nome: vr(d.nome_declarante ?? d.nome_responsavel, doc.id, doc.classificacaoConfianca),
    cpf: vr(d.cpf_declarante ?? d.cpf_responsavel, doc.id),
    rg: vr(d.rg_declarante ?? d.rg_responsavel, doc.id),
    telefone1: vr(d.telefone_declarante ?? d.telefone1, doc.id),
    telefone2: vr(d.telefone2, doc.id),
    email: vr(d.email_declarante ?? d.email, doc.id),
    endereco: vr(d.endereco_declarante ?? d.endereco, doc.id),
    grauParentesco: vr(d.grau_parentesco_declarante ?? d.grau_parentesco, doc.id, 0.9),
  };
}

function extractContratante(doc: DocumentoFonte): Contratante {
  const d = doc.dadosExtraidos as Record<string, unknown>;
  return {
    nome: vr(d.nome_contratante, doc.id, doc.classificacaoConfianca),
    cpf: vr(d.cpf_contratante, doc.id),
    rg: vr(d.rg_contratante, doc.id),
    grauParentesco: vr(d.grau_parentesco_contratante, doc.id),
    telefone1: vr(d.telefone_contratante ?? d.telefone1, doc.id),
    email: vr(d.email_contratante, doc.id),
    endereco: vr(d.endereco_contratante, doc.id),
  };
}

function extractSepultamento(doc: DocumentoFonte): DadosSepultamento {
  const d = doc.dadosExtraidos as Record<string, unknown>;
  return {
    cemiterio: vr(d.cemiterio, doc.id),
    data: vr(d.data_sepultamento, doc.id),
    hora: vr(d.hora_sepultamento, doc.id),
    local: vr(d.local_sepultamento, doc.id),
    quadra: vr(d.quadra, doc.id),
    rua: vr(d.rua ?? d.quadra_rua, doc.id),
    terreno: vr(d.terreno, doc.id),
    gaveta: vr(d.gaveta, doc.id),
    concessao: vr(d.concessao, doc.id),
  };
}

function extractVelorio(doc: DocumentoFonte): DadosVelorio {
  const d = doc.dadosExtraidos as Record<string, unknown>;
  return {
    local: vr(d.local_velorio ?? d.local_do_velorio, doc.id),
    sala: vr(d.sala_velorio ?? d.sala, doc.id),
    inicio: vr(d.inicio_velorio, doc.id),
    fim: vr(d.fim_velorio, doc.id),
  };
}

function extractContratacao(doc: DocumentoFonte): DadosContratacao {
  const d = doc.dadosExtraidos as Record<string, unknown>;
  const itens = Array.isArray(d.itens) ? (d.itens as DadosContratacao["itens"]) : [];
  const padrao = detectarPadraoFuneral(itens);
  return {
    numeroContratacao: vr(d.numero_contratacao, doc.id, 0.9),
    tipoContratacao: vr(d.tipo_contratacao, doc.id),
    agencia: vr(d.agencia, doc.id),
    emissao: vr(d.emissao, doc.id),
    padraoFuneral: padrao.padrao,
    padraoFonte: padrao.textoOrigem,
    itens,
    ordensServico: Array.isArray(d.ordens_servico) ? (d.ordens_servico as string[]) : [],
    pagamento: (d.pagamento as DadosContratacao["pagamento"]) ?? undefined,
  };
}

function mergeResp(a: Responsavel | undefined, b: Responsavel): Responsavel {
  if (!a) return b;
  const out: Responsavel = { ...a };
  for (const key of Object.keys(b) as Array<keyof Responsavel>) {
    if (key === "assinaturaPresente") {
      out.assinaturaPresente = out.assinaturaPresente || b.assinaturaPresente;
      continue;
    }
    (out as Record<string, unknown>)[key as string] = preferHigher(a[key] as ValorRastreado | undefined, b[key] as ValorRastreado | undefined);
  }
  return out;
}

function mergeSep(a: DadosSepultamento | undefined, b: DadosSepultamento): DadosSepultamento {
  if (!a) return b;
  const out: DadosSepultamento = { ...a };
  for (const key of Object.keys(b) as Array<keyof DadosSepultamento>) {
    if (key === "crematorio") { out.crematorio = out.crematorio || b.crematorio; continue; }
    (out as Record<string, unknown>)[key as string] = preferHigher(a[key] as ValorRastreado | undefined, b[key] as ValorRastreado | undefined);
  }
  return out;
}

function mergeVel(a: DadosVelorio | undefined, b: DadosVelorio): DadosVelorio {
  if (!a) return b;
  return {
    local: preferHigher(a.local, b.local),
    sala: preferHigher(a.sala, b.sala),
    inicio: preferHigher(a.inicio, b.inicio),
    fim: preferHigher(a.fim, b.fim),
  };
}

export interface MergeOptions {
  tipoProcesso?: TipoProcesso;
  /** Em exumação: id (image_id) do documento que representa o falecido exumado. */
  exumadoDocId?: string;
}

export function mergeProcess(docs: DocumentoFonte[], opts: MergeOptions = {}): ProcessoFunerario {
  const tipoProcesso: TipoProcesso = opts.tipoProcesso ?? "sepultamento";
  const processo: ProcessoFunerario = {
    tipoProcesso,
    status: "em_analise",
    falecidos: [],
    documentos: docs,
    divergencias: [],
    camposPendentes: [],
  };

  // 1) DO define identidade/responsável; Nota define contratação
  const dos = docs.filter((d) => d.tipoDocumento === "DECLARACAO_DE_OBITO");
  const notas = docs.filter((d) => d.tipoDocumento === "NOTA_DE_CONTRATACAO_FUNERAL");
  const others = docs.filter((d) => d.tipoDocumento === "DOCUMENTO_DESCONHECIDO");

  for (const doc of [...dos, ...notas, ...others]) {
    const papel: Falecido["papel"] =
      tipoProcesso === "exumacao" && opts.exumadoDocId && doc.id === opts.exumadoDocId
        ? "exumado"
        : "principal";
    const fal = extractFalecido(doc, papel);
    const existing = processo.falecidos.findIndex((f) => sameDeceased(f, fal));
    if (existing >= 0 && processo.falecidos[existing].papel === papel) {
      processo.falecidos[existing] = mergeDeceased(processo.falecidos[existing], fal);
    } else {
      processo.falecidos.push(fal);
    }

    if (doc.tipoDocumento === "DECLARACAO_DE_OBITO") {
      processo.responsavelPrincipal = mergeResp(processo.responsavelPrincipal, extractResponsavel(doc));
      processo.dadosSepultamento = mergeSep(processo.dadosSepultamento, extractSepultamento(doc));
    }
    if (doc.tipoDocumento === "NOTA_DE_CONTRATACAO_FUNERAL") {
      const contr = extractContratante(doc);
      processo.contratante = mergeResp(processo.contratante as Responsavel | undefined, contr as Responsavel) as Contratante;
      processo.dadosVelorio = mergeVel(processo.dadosVelorio, extractVelorio(doc));
      processo.dadosSepultamento = mergeSep(processo.dadosSepultamento, extractSepultamento(doc));
      const cAtual = processo.dadosContratacao;
      const cNovo = extractContratacao(doc);
      if (!cAtual) processo.dadosContratacao = cNovo;
      else {
        processo.dadosContratacao = {
          ...cAtual,
          numeroContratacao: preferHigher(cAtual.numeroContratacao, cNovo.numeroContratacao),
          tipoContratacao: preferHigher(cAtual.tipoContratacao, cNovo.tipoContratacao),
          agencia: preferHigher(cAtual.agencia, cNovo.agencia),
          emissao: preferHigher(cAtual.emissao, cNovo.emissao),
          padraoFuneral: cAtual.padraoFuneral !== "NAO_IDENTIFICADO" ? cAtual.padraoFuneral : cNovo.padraoFuneral,
          padraoFonte: cAtual.padraoFonte || cNovo.padraoFonte,
          itens: cAtual.itens.length ? cAtual.itens : cNovo.itens,
          ordensServico: cAtual.ordensServico.length ? cAtual.ordensServico : cNovo.ordensServico,
          pagamento: cAtual.pagamento ?? cNovo.pagamento,
        };
      }
    }
  }

  processo.divergencias = detectDiscrepancies(docs);
  processo.camposPendentes = computePending(processo);
  return processo;
}

/** Aplica uma correção manual a um campo específico. Prevalece sobre OCR. */
export function applyManualCorrection<T extends ProcessoFunerario>(processo: T, path: string, value: string): T {
  const parts = path.split(".");
  const clone: any = JSON.parse(JSON.stringify(processo));
  let cursor: any = clone;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cursor[key] == null || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  const last = parts[parts.length - 1];
  cursor[last] = { original: value, normalized: value, confianca: 1 };
  clone.camposPendentes = computePending(clone);
  return clone as T;
}
