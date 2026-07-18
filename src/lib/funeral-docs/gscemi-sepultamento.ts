// Consolidação das telas GSCEMI "Cadastro do Falecido / Sepultamento" e
// "Declarantes do Óbito / Pagamento". Puro — sem I/O.
import type {
  AlertaGscemi,
  CadastroSepultamentoGscemi,
  DadosPlacaIdentificacao,
  DeclaranteGscemi,
  DocumentoFonte,
  EnderecoGscemi,
  OrigemDadosDeclarantePagamento,
  RegistroLivro,
  TipoProcedimentoSepultamento,
} from "./types";
import { nameKey, normalizeCpf } from "./normalizers";

// ------------------------------------------------------------------
// Cadastro do falecido / sepultamento
// ------------------------------------------------------------------

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function boolFlag(v: unknown): boolean | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v).trim().toUpperCase();
  if (["1", "TRUE", "SIM", "S", "X", "MARCADO", "CHECKED"].includes(s)) return true;
  if (["0", "FALSE", "NAO", "NÃO", "N", ""].includes(s)) return false;
  return undefined;
}

function extractEndereco(d: Record<string, unknown>, prefix = ""): EnderecoGscemi | undefined {
  const p = prefix ? `${prefix}_` : "";
  const cep = str(d[`${p}cep`]);
  const logradouro = str(d[`${p}logradouro`] ?? d[`${p}endereco`]);
  const numero = str(d[`${p}numero`]);
  const bairro = str(d[`${p}bairro`]);
  const cidade = str(d[`${p}cidade`]);
  const uf = str(d[`${p}uf`] ?? d[`${p}estado`]);
  const complemento = str(d[`${p}complemento`]);
  const codigoIbge = str(d[`${p}codigo_ibge`] ?? d[`${p}ibge`]);
  if (!cep && !logradouro && !numero && !bairro && !cidade && !uf) return undefined;
  return { cep, logradouro, numero, complemento, bairro, cidade, uf, codigoIbge };
}

function extractProcedimento(d: Record<string, unknown>): TipoProcedimentoSepultamento {
  return {
    sepultamento: boolFlag(d.sepultamento),
    cremacao: boolFlag(d.cremacao ?? d.cremação),
    cremacaoESepultamento: boolFlag(d.cremacao_e_sepultamento ?? d.cremacao_sepultamento),
    tanatopraxia: boolFlag(d.tanatopraxia),
    exumacao: boolFlag(d.exumacao ?? d.exumação),
    transladoInterno: boolFlag(d.translado_interno),
    transladoExterno: boolFlag(d.translado_externo),
  };
}

function extractRegistroLivro(d: Record<string, unknown>): RegistroLivro | undefined {
  const cartorio = str(d.cartorio_sepultamento ?? d.cartorio);
  const distrito = str(d.distrito_sepultamento ?? d.distrito);
  const livro = str(d.livro_sepultamento ?? d.livro);
  const pagina = str(d.pagina_sepultamento ?? d.pagina ?? d.página_sepultamento);
  const notaFiscal = str(d.nota_fiscal);
  if (!cartorio && !distrito && !livro && !pagina && !notaFiscal) return undefined;
  return { cartorio, distrito, livro, pagina, notaFiscal };
}

function extractPlacaIdentificacao(d: Record<string, unknown>): DadosPlacaIdentificacao | undefined {
  // "Termo/Nº de Controle Sepult." → guardamos com o nome original E com
  // o nome semântico "número da placa de identificação".
  const termo = str(
    d.termo_numero_controle ??
      d.termo_n_controle ??
      d.termo_controle ??
      d["termo/nº_controle"] ??
      d["termo/n_controle"],
  );
  const temLapide = str(d.tem_lapide);
  const tipoLapide = str(d.tipo_lapide);
  const quantidadeGravacoes = str(d.quantidade_gravacoes ?? d.qtd_gravacoes);
  const lapideFixada = str(d.lapide_fixada);
  const dataFixacao = str(d.data_fixacao_lapide ?? d.data_fixacao);
  const situacaoSepultado = str(d.situacao_sepultado);
  const dataSituacaoSepultado = str(d.data_situacao_sepultado ?? d.data_sit_sepultado);
  const personalidade = str(d.personalidade);
  const foto = str(d.foto);
  if (
    !termo &&
    !temLapide &&
    !tipoLapide &&
    !quantidadeGravacoes &&
    !lapideFixada &&
    !dataFixacao &&
    !situacaoSepultado &&
    !dataSituacaoSepultado &&
    !personalidade &&
    !foto
  ) {
    return undefined;
  }
  return {
    termoNumeroControle: termo,
    // regra explícita do usuário: o mesmo valor é exposto como número da placa
    numeroPlacaIdentificacao: termo,
    temLapide,
    tipoLapide,
    quantidadeGravacoes,
    lapideFixada,
    dataFixacao,
    situacaoSepultado,
    dataSituacaoSepultado,
    personalidade,
    foto,
  };
}

function mergeShallow<T extends Record<string, unknown>>(base: T | undefined, incoming: T | undefined): T | undefined {
  if (!incoming) return base;
  if (!base) return incoming;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(incoming)) {
    if (out[k] == null || out[k] === "") out[k] = incoming[k];
  }
  return out as T;
}

function extractCadastroFromDoc(doc: DocumentoFonte): CadastroSepultamentoGscemi {
  const d = doc.dadosExtraidos as Record<string, unknown>;
  return {
    numeroRegistro: str(d.numero_registro_sepultamento ?? d.numero_registro ?? d.numero),
    numeroSepultado: str(d.numero_sepultado ?? d.numero_sepult),
    inscricaoGscemi: str(d.inscricao ?? d.inscricao_gscemi),
    numeroOrdemServico: str(d.numero_ordem_servico ?? d.os_sisfuner ?? d.numero_os),
    numeroContrato: str(d.numero_contrato ?? d.contrato),
    numeroDeclaracaoObito: str(d.numero_registro_do ?? d.numero_do ?? d.numero_declaracao_obito),
    proAim: str(d.pro_aim),
    temPlanoFunerario: str(d.tem_plano_funerario),
    naturezaObito: str(d.natureza_obito ?? d.nat_obito),
    parentescoCadastroSepultamento: str(d.parentesco_cadastro_sepultamento ?? d.parentesco),
    tipoAtendimento: str(d.tipo_atendimento),
    tipoProcedimento: extractProcedimento(d),
    nomeFalecido: str(d.nome_falecido),
    sexo: str(d.sexo),
    dataNascimento: str(d.data_nascimento_falecido ?? d.nascimento),
    dataFalecimento: str(d.data_falecimento ?? d.falecimento),
    dataSepultamento: str(d.data_sepultamento ?? d.sepultamento),
    dataExumacao: str(d.data_exumacao ?? d.exumacao_data),
    transladoInterno: str(d.data_translado_interno ?? d.translado_interno_data),
    transladoExterno: str(d.data_translado_externo ?? d.translado_externo_data),
    cor: str(d.cor ?? d.raca),
    estadoCivil: str(d.estado_civil),
    religiao: str(d.religiao),
    profissao: str(d.profissao),
    endereco: extractEndereco(d, "falecido") ?? extractEndereco(d),
    capela: str(d.capela),
    nomeConcessionarioVinculado: str(d.nome_concessionario ?? d.concessionario),
    codigoCemiterio: str(d.codigo_cemiterio),
    nomeCemiterio: str(d.nome_cemiterio ?? d.cemiterio),
    quadra: str(d.quadra),
    letra: str(d.letra),
    lote: str(d.lote),
    numeroJazigo: str(d.numero_jazigo ?? d.numero),
    tipoConcessao: str(d.tipo_concessao),
    registroLivro: extractRegistroLivro(d),
    placaIdentificacao: extractPlacaIdentificacao(d),
    contratacaoAtendimento: {
      concessionaria: str(d.concessionaria_responsavel ?? d.concessionaria),
      seguradoraParceiro: str(d.seguradora_parceiro ?? d.seguradora),
      descricao: str(d.descricao_atendimento ?? d.descricao),
      tipoAtendimento: str(d.tipo_atendimento),
    },
    alertas: [],
    origemDocIds: [doc.id],
  };
}

function mergeCadastros(a: CadastroSepultamentoGscemi, b: CadastroSepultamentoGscemi): CadastroSepultamentoGscemi {
  const out: CadastroSepultamentoGscemi = { ...a };
  for (const k of Object.keys(b) as Array<keyof CadastroSepultamentoGscemi>) {
    if (k === "alertas" || k === "origemDocIds" || k === "tipoProcedimento") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (out as any)[k];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inc = (b as any)[k];
    if (cur == null || cur === "") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = inc;
    } else if (typeof cur === "object" && typeof inc === "object" && inc) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = mergeShallow(cur as Record<string, unknown>, inc as Record<string, unknown>);
    }
  }
  out.tipoProcedimento = { ...b.tipoProcedimento, ...a.tipoProcedimento };
  out.origemDocIds = Array.from(new Set([...a.origemDocIds, ...b.origemDocIds]));
  return out;
}

interface MontarSepInput {
  documentos: DocumentoFonte[];
  numeroDoDeclaracaoObito?: string;
  dataSepultamentoOutrasFontes?: string;
}

export function montarCadastroSepultamentoGscemi(
  input: MontarSepInput,
): CadastroSepultamentoGscemi | undefined {
  const docs = input.documentos.filter(
    (d) => d.tipoDocumento === "CADASTRO_FALECIDO_SEPULTAMENTO_GSCEMI",
  );
  if (!docs.length) return undefined;
  let consolidado: CadastroSepultamentoGscemi | undefined;
  for (const doc of docs) {
    const extracted = extractCadastroFromDoc(doc);
    consolidado = consolidado ? mergeCadastros(consolidado, extracted) : extracted;
  }
  if (!consolidado) return undefined;

  // Alertas de conferência
  const alertas: AlertaGscemi[] = [];
  const reg = consolidado.registroLivro;
  if (reg?.livro && !reg.pagina) {
    alertas.push({ nivel: "warn", mensagem: "Livro encontrado, mas página ausente." });
  }
  if (!consolidado.placaIdentificacao?.numeroPlacaIdentificacao) {
    alertas.push({ nivel: "info", mensagem: "Número da placa de identificação não encontrado." });
  }
  if (
    input.numeroDoDeclaracaoObito &&
    consolidado.numeroDeclaracaoObito &&
    input.numeroDoDeclaracaoObito.replace(/\D+/g, "") !==
      consolidado.numeroDeclaracaoObito.replace(/\D+/g, "")
  ) {
    alertas.push({
      nivel: "warn",
      mensagem: "Nº da Declaração de Óbito diverge entre GSCEMI e a DO anexada.",
    });
  }
  if (
    input.dataSepultamentoOutrasFontes &&
    consolidado.dataSepultamento &&
    input.dataSepultamentoOutrasFontes !== consolidado.dataSepultamento
  ) {
    alertas.push({
      nivel: "warn",
      mensagem: "Data do sepultamento diverge entre GSCEMI e Nota de Contratação.",
    });
  }
  if (consolidado.inscricaoGscemi) {
    alertas.push({
      nivel: "info",
      mensagem: "Inscrição GSCEMI vinculada ao cadastro do concessionário.",
    });
  }
  consolidado.alertas = alertas;
  return consolidado;
}

// ------------------------------------------------------------------
// Declarantes (óbito + pagamento)
// ------------------------------------------------------------------

function extractDeclarante(
  doc: DocumentoFonte,
  papel: DeclaranteGscemi["papel"],
  keyPrefix: "obito" | "pagamento",
): DeclaranteGscemi | undefined {
  const d = doc.dadosExtraidos as Record<string, unknown>;
  const nome = str(d[`nome_declarante_${keyPrefix}`] ?? d[`declarante_${keyPrefix}_nome`]);
  const cpf = str(d[`cpf_declarante_${keyPrefix}`]);
  const cnpj = str(d[`cnpj_declarante_${keyPrefix}`]);
  const inscricao = str(d[`inscricao_declarante_${keyPrefix}`]);
  const telefone = str(d[`telefone_declarante_${keyPrefix}`]);
  const celular = str(d[`celular_declarante_${keyPrefix}`]);
  const email = str(d[`email_declarante_${keyPrefix}`]);
  const endereco = extractEndereco(d, `declarante_${keyPrefix}`);
  const tipoPessoaRaw = str(d[`tipo_pessoa_declarante_${keyPrefix}`]);
  const tipoPessoa: DeclaranteGscemi["tipoPessoa"] = tipoPessoaRaw
    ? /JUR/i.test(tipoPessoaRaw)
      ? "JURIDICA"
      : "FISICA"
    : undefined;
  const origemRaw = str(d[`origem_dados_declarante_${keyPrefix}`]);
  const origem: OrigemDadosDeclarantePagamento | undefined = origemRaw
    ? /OBITO|ÓBITO/i.test(origemRaw)
      ? "DECLARANTE_OBITO"
      : /ADM/i.test(origemRaw)
        ? "ADMINISTRADOR_PROVISORIO"
        : /MANUAL/i.test(origemRaw)
          ? "PREENCHIMENTO_MANUAL"
          : "OUTRA_FONTE"
    : undefined;

  if (!nome && !cpf && !cnpj && !inscricao && !telefone && !celular && !email && !endereco) {
    return undefined;
  }
  return {
    papel,
    inscricao,
    nome,
    nomeNormalizado: nome ? nameKey(nome) : undefined,
    tipoPessoa,
    cpf: cpf ? normalizeCpf(cpf).normalized || cpf : undefined,
    cnpj,
    endereco,
    telefone,
    celular,
    email,
    origemDadosDeclarantePagamento: papel === "DECLARANTE_DO_PAGAMENTO" ? origem : undefined,
    origemDocIds: [doc.id],
  };
}

function mergeDeclarante(a: DeclaranteGscemi | undefined, b: DeclaranteGscemi): DeclaranteGscemi {
  if (!a) return b;
  const out: DeclaranteGscemi = { ...a };
  (Object.keys(b) as Array<keyof DeclaranteGscemi>).forEach((k) => {
    if (k === "origemDocIds") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (out as any)[k];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inc = (b as any)[k];
    if (cur == null || cur === "") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = inc;
    } else if (typeof cur === "object" && typeof inc === "object" && inc) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = mergeShallow(cur as Record<string, unknown>, inc as Record<string, unknown>);
    }
  });
  out.origemDocIds = Array.from(new Set([...a.origemDocIds, ...b.origemDocIds]));
  return out;
}

export interface DeclarantesGscemiResult {
  declaranteObito?: DeclaranteGscemi;
  declarantePagamento?: DeclaranteGscemi;
  alertas: AlertaGscemi[];
  /** True quando o pagamento corresponde à mesma pessoa do declarante do óbito. */
  pagamentoIgualObito?: boolean;
}

/** Consolida telas do tipo `DECLARANTES_SEPULTAMENTO_GSCEMI`. */
export function montarDeclarantesGscemi(input: {
  documentos: DocumentoFonte[];
  declaranteObitoDaDO?: { nome?: string; cpf?: string };
  administradorProvisorio?: { nome?: string; cpf?: string };
}): DeclarantesGscemiResult | undefined {
  const docs = input.documentos.filter(
    (d) => d.tipoDocumento === "DECLARANTES_SEPULTAMENTO_GSCEMI",
  );
  if (!docs.length) return undefined;

  let obito: DeclaranteGscemi | undefined;
  let pagamento: DeclaranteGscemi | undefined;
  for (const doc of docs) {
    const oNew = extractDeclarante(doc, "DECLARANTE_DO_OBITO_GSCEMI", "obito");
    if (oNew) obito = mergeDeclarante(obito, oNew);
    const pNew = extractDeclarante(doc, "DECLARANTE_DO_PAGAMENTO", "pagamento");
    if (pNew) pagamento = mergeDeclarante(pagamento, pNew);
  }

  const alertas: AlertaGscemi[] = [];
  let pagamentoIgualObito: boolean | undefined;

  if (pagamento?.origemDadosDeclarantePagamento === "DECLARANTE_OBITO") {
    alertas.push({
      nivel: "info",
      mensagem: "Declarante do pagamento importado do declarante do óbito.",
    });
  }
  if (pagamento?.origemDadosDeclarantePagamento === "ADMINISTRADOR_PROVISORIO") {
    alertas.push({
      nivel: "info",
      mensagem: "Declarante do pagamento importado do administrador provisório.",
    });
  }

  if (obito && pagamento) {
    const cpfO = obito.cpf?.replace(/\D+/g, "");
    const cpfP = pagamento.cpf?.replace(/\D+/g, "");
    if (cpfO && cpfP) {
      pagamentoIgualObito = cpfO === cpfP;
    } else if (obito.nomeNormalizado && pagamento.nomeNormalizado) {
      pagamentoIgualObito = obito.nomeNormalizado === pagamento.nomeNormalizado;
    }
  }

  if (input.declaranteObitoDaDO && obito) {
    const cpfDO = input.declaranteObitoDaDO.cpf?.replace(/\D+/g, "");
    const cpfObito = obito.cpf?.replace(/\D+/g, "");
    const nomeDO = input.declaranteObitoDaDO.nome ? nameKey(input.declaranteObitoDaDO.nome) : "";
    if (cpfDO && cpfObito && cpfDO !== cpfObito) {
      alertas.push({
        nivel: "warn",
        mensagem: "Declarante do óbito diverge da Declaração de Óbito anexada.",
      });
    } else if (!cpfDO && nomeDO && obito.nomeNormalizado && nomeDO !== obito.nomeNormalizado) {
      alertas.push({
        nivel: "warn",
        mensagem: "Declarante do óbito diverge da Declaração de Óbito anexada.",
      });
    }
  }

  return { declaranteObito: obito, declarantePagamento: pagamento, alertas, pagamentoIgualObito };
}
