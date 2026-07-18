// Lógica pura do Cadastro do Concessionário (GSCEMI).
// Sem I/O. Testável isoladamente.
import type {
  AlertaGscemi,
  CadastroGscemi,
  DadosConcessao,
  DocumentoFonte,
  EnderecoCadastral,
  PapelPessoa,
  PessoaCadastral,
  SituacaoConcessionario,
  TipoConcessao,
} from "./types";
import { nameKey, normalizeCpf } from "./normalizers";

const QUADRA_GERAL_HINTS = [
  "QUADRA GERAL",
  "COMUNITARIO",
  "COMUNITÁRIO",
  "GAVETA COMUNITARIA",
  "GAVETA COMUNITÁRIA",
  "SEPULTURA COMUNITARIA",
  "SEPULTURA COMUNITÁRIA",
  "PRAZO FIXO",
  "CESSAO TEMPORARIA",
  "CESSÃO TEMPORÁRIA",
];

export function detectarTipoConcessao(concessao: DadosConcessao, textoLivre?: string): TipoConcessao {
  const alvo = [
    concessao.tipoVenda,
    concessao.tipoConcessao,
    concessao.tipoConcessionario,
    concessao.grupo,
    concessao.nomeQuadra,
    concessao.status,
    textoLivre ?? "",
  ]
    .filter(Boolean)
    .join(" | ")
    .toUpperCase();
  if (!alvo) return "NAO_IDENTIFICADO";
  for (const hint of QUADRA_GERAL_HINTS) {
    if (alvo.includes(hint)) return "QUADRA_GERAL_TEMPORARIA";
  }
  // Sinais fortes de jazigo/concessão: presença de letra + lote/número,
  // "JAZIGO", "CONCESSÃO PERMANENTE", quantidade de jazigos > 0.
  if (/JAZIGO|CONCESSAO PERMANENTE|CONCESSÃO PERMANENTE/.test(alvo)) return "JAZIGO_CONCESSAO";
  if ((concessao.qtdJazigos ?? 0) > 0) return "JAZIGO_CONCESSAO";
  return "NAO_IDENTIFICADO";
}

export function situacaoConcessionario(pessoa?: PessoaCadastral): SituacaoConcessionario {
  if (!pessoa) return "NAO_IDENTIFICADA";
  if (pessoa.dataFalecimento && pessoa.dataFalecimento.trim() && pessoa.dataFalecimento.trim() !== "/  /") {
    return "FALECIDO";
  }
  return "VIVO";
}

/** Compara duas pessoas por múltiplos campos. Nome sozinho nunca basta se há outros dados. */
export function samePerson(a?: PessoaCadastral, b?: PessoaCadastral): boolean {
  if (!a || !b) return false;
  const cpfA = a.cpf ? normalizeCpf(a.cpf).normalized : "";
  const cpfB = b.cpf ? normalizeCpf(b.cpf).normalized : "";
  if (cpfA && cpfB) return cpfA === cpfB;

  const nomeA = a.nome ? nameKey(a.nome) : "";
  const nomeB = b.nome ? nameKey(b.nome) : "";
  if (!nomeA || !nomeB) return false;
  if (nomeA !== nomeB) return false;

  // Nome bate. Se existirem outros dados nos dois, pelo menos um extra deve coincidir.
  const extras: Array<[string | undefined, string | undefined]> = [
    [a.rg, b.rg],
    [a.dataNascimento, b.dataNascimento],
    [a.telefone1 ?? a.celular, b.telefone1 ?? b.celular],
  ];
  const ambosTemAlgum = extras.some(([x, y]) => x && y);
  if (!ambosTemAlgum) return true; // só nome disponível dos dois lados
  const conflitos = extras.filter(([x, y]) => x && y && x !== y).length;
  const matches = extras.filter(([x, y]) => x && y && x === y).length;
  return matches >= 1 && conflitos === 0;
}

interface MontarInput {
  documentos: DocumentoFonte[];
  declarante?: PessoaCadastral;
  contratante?: PessoaCadastral;
  falecidoSepultado?: PessoaCadastral;
}

/**
 * Consolida os documentos GSCEMI (podem ser 1..N imagens do mesmo cadastro)
 * em um único {@link CadastroGscemi}, aplicando as regras de papéis e
 * gerando alertas apropriados.
 */
export function montarCadastroGscemi(input: MontarInput): CadastroGscemi | undefined {
  const gscemiDocs = input.documentos.filter((d) => d.tipoDocumento === "CADASTRO_CONCESSIONARIO_GSCEMI");
  if (!gscemiDocs.length) return undefined;

  const concessao: DadosConcessao = {};
  let concessionario: PessoaCadastral | undefined;
  let dependente: PessoaCadastral | undefined;
  let textoLivre = "";
  const origem: string[] = [];

  for (const doc of gscemiDocs) {
    origem.push(doc.id);
    const d = doc.dadosExtraidos as Record<string, unknown>;
    textoLivre += " " + JSON.stringify(d).toUpperCase();
    mergeConcessao(concessao, extractConcessao(d));
    concessionario = mergePessoa(concessionario, extractConcessionario(d));
    const dep = extractDependente(d);
    if (dep) dependente = mergePessoa(dependente, dep);
  }

  const tipoConcessao = detectarTipoConcessao(concessao, textoLivre);
  const situacao = situacaoConcessionario(concessionario);

  // Papéis do concessionário: comparar com declarante / contratante / falecido
  if (concessionario) {
    const papeis = new Set<PapelPessoa>(["CONCESSIONARIO"]);
    if (samePerson(concessionario, input.declarante)) papeis.add("DECLARANTE");
    if (samePerson(concessionario, input.contratante)) papeis.add("CONTRATANTE");
    if (samePerson(concessionario, input.falecidoSepultado)) papeis.add("FALECIDO_SEPULTADO");
    concessionario.papeis = Array.from(papeis);
  }

  // Administrador provisório: só em JAZIGO_CONCESSAO com concessionário falecido
  let administradorProvisorio: PessoaCadastral | undefined;
  if (tipoConcessao === "JAZIGO_CONCESSAO" && situacao === "FALECIDO" && dependente) {
    administradorProvisorio = {
      ...dependente,
      // Nunca reaproveitar o grau com o concessionário para papel operacional
      papeis: uniquePapeis([
        "DEPENDENTE_CONCESSIONARIO",
        "ADMINISTRADOR_PROVISORIO_JAZIGO",
        ...(dependente.papeis ?? []),
      ]),
    };
  }
  if (dependente && !dependente.papeis?.includes("DEPENDENTE_CONCESSIONARIO")) {
    dependente.papeis = uniquePapeis(["DEPENDENTE_CONCESSIONARIO", ...(dependente.papeis ?? [])]);
  }

  const alertas = buildAlertas({
    tipoConcessao,
    situacao,
    concessionario,
    administradorProvisorio,
    declarante: input.declarante,
    falecidoSepultado: input.falecidoSepultado,
  });

  return {
    tipoConcessao,
    concessao,
    concessionario,
    situacaoConcessionario: situacao,
    dependente,
    administradorProvisorio,
    alertas,
    origemDocIds: origem,
  };
}

function uniquePapeis(list: PapelPessoa[]): PapelPessoa[] {
  return Array.from(new Set(list));
}

function buildAlertas(args: {
  tipoConcessao: TipoConcessao;
  situacao: SituacaoConcessionario;
  concessionario?: PessoaCadastral;
  administradorProvisorio?: PessoaCadastral;
  declarante?: PessoaCadastral;
  falecidoSepultado?: PessoaCadastral;
}): AlertaGscemi[] {
  const out: AlertaGscemi[] = [];
  const papeis = args.concessionario?.papeis ?? [];
  if (papeis.includes("DECLARANTE")) {
    out.push({ nivel: "info", mensagem: "Concessionário também identificado como declarante." });
  }
  if (
    args.concessionario &&
    !papeis.includes("DECLARANTE") &&
    !papeis.includes("CONTRATANTE") &&
    !papeis.includes("FALECIDO_SEPULTADO")
  ) {
    out.push({
      nivel: "info",
      mensagem: "Concessionário não possui relação direta identificada com o falecido.",
    });
  }
  if (args.tipoConcessao === "QUADRA_GERAL_TEMPORARIA") {
    out.push({ nivel: "info", mensagem: "Quadra Geral: dependente não aplicável." });
  }
  if (args.tipoConcessao === "JAZIGO_CONCESSAO" && args.situacao === "FALECIDO") {
    if (args.administradorProvisorio) {
      out.push({ nivel: "info", mensagem: "Concessionário falecido: administrador provisório encontrado." });
    } else {
      out.push({
        nivel: "warn",
        mensagem: "Concessionário falecido: nenhum administrador provisório encontrado.",
      });
    }
  }
  if (args.administradorProvisorio?.grauParentescoComConcessionario) {
    out.push({
      nivel: "info",
      mensagem:
        "Grau de parentesco do dependente é apenas cadastral e não será usado na Ordem de Sepultamento.",
    });
  }
  return out;
}

// ------------------ Extract helpers ------------------

function extractConcessao(d: Record<string, unknown>): DadosConcessao {
  return {
    inscricaoGscemi: str(d.inscricao ?? d.inscricao_gscemi ?? d.numero_inscricao),
    numeroContrato: str(d.contrato ?? d.numero_contrato),
    numeroArquivo: str(d.arquivo ?? d.numero_arquivo),
    preContrato: str(d.pre_contrato),
    dataCadastro: str(d.data_cadastro ?? d.data_contrato ?? d.data),
    grupo: str(d.grupo),
    sg: str(d.sg),
    tipoVenda: str(d.tipo_venda ?? d.t_venda),
    tipoConcessao: str(d.tipo_concessao),
    quadra: str(d.quadra),
    nomeQuadra: str(d.nome_quadra),
    letra: str(d.letra),
    lote: str(d.lote),
    numero: str(d.numero_jazigo ?? d.numero),
    qtdContratos: num(d.qtd_contratos),
    qtdJazigos: num(d.qtd_jazigos),
    status: str(d.status_cadastro ?? d.status),
    dataStatus: str(d.data_status),
    filial: str(d.filial),
    vendedor: str(d.vendedor),
    tipoConcessionario: str(d.tipo_concessionario),
    valorInformado: num(d.valor_informado ?? d.valor),
    tipoCobranca: str(d.tipo_cobranca),
    diaVencimento: str(d.dia_vencimento ?? d.dia_venc),
    qtdCremacoes: num(d.qtd_cremacoes ?? d.crem_usadas),
  };
}

function extractConcessionario(d: Record<string, unknown>): PessoaCadastral | undefined {
  const nome = str(d.nome_concessionario ?? d.nome);
  const cpf = str(d.cpf_concessionario ?? d.cpf);
  const residencial = extractEndereco(d, "residencial") ?? extractEndereco(d, "");
  const cobranca = extractEndereco(d, "cobranca");
  const comercial = extractEndereco(d, "comercial");
  const telefone1 = str(d.telefone_1 ?? d.telefone1 ?? d.telefone);
  const celular = str(d.celular);
  const email = str(d.email);
  if (!nome && !cpf && !residencial && !cobranca && !comercial && !telefone1 && !celular && !email) return undefined;
  return {
    nome,
    nomeNormalizado: nome ? nameKey(nome) : undefined,
    cpf,
    rg: str(d.rg_concessionario ?? d.rg),
    orgaoExpedidor: str(d.orgao_expedidor),
    dataNascimento: str(d.data_nascimento),
    dataFalecimento: str(d.data_falecimento ?? d.falecimento),
    estadoCivil: str(d.estado_civil),
    sexo: str(d.sexo),
    profissao: str(d.profissao),
    telefone1,
    telefone2: str(d.telefone_2 ?? d.telefone2),
    celular,
    fax: str(d.fax),
    email,
    nacionalidade: str(d.nacionalidade),
    localNascimento: str(d.local_nascimento),
    ufNascimento: str(d.uf_nascimento ?? d.uf),
    familia: str(d.familia),
    matricula: str(d.matricula),
    observacao: str(d.observacao),
    enderecoResidencial: residencial,
    enderecoCobranca: cobranca,
    enderecoComercial: comercial,
  };
}

function extractDependente(d: Record<string, unknown>): PessoaCadastral | undefined {
  const nome = str(d.nome_dependente);
  if (!nome && !d.cpf_dependente) return undefined;
  return {
    nome,
    nomeNormalizado: nome ? nameKey(nome) : undefined,
    cpf: str(d.cpf_dependente),
    rg: str(d.rg_dependente),
    orgaoExpedidor: str(d.orgao_expedidor_dependente),
    dataNascimento: str(d.data_nascimento_dependente),
    telefone1: str(d.telefone_dependente),
    celular: str(d.celular_dependente),
    email: str(d.email_dependente),
    enderecoResidencial: extractEndereco(d, "dependente"),
    grauParentescoComConcessionario: str(d.grau_parentesco_dependente ?? d.grau_parentesco_com_concessionario),
  };
}

function extractEndereco(d: Record<string, unknown>, prefix: string): EnderecoCadastral | undefined {
  const p = prefix ? `${prefix}_` : "";
  const cep = str(d[`cep_${prefix}`] ?? d[`${p}cep`]);
  const logradouro = str(d[`endereco_${prefix}`] ?? d[`${p}endereco`]);
  const numero = str(d[`numero_${prefix}`] ?? d[`${p}numero`]);
  if (!cep && !logradouro && !numero) return undefined;
  return {
    cep,
    logradouro,
    numero,
    complemento: str(d[`complemento_${prefix}`] ?? d[`${p}complemento`]),
    cidade: str(d[`cidade_${prefix}`] ?? d[`${p}cidade`]),
    bairro: str(d[`bairro_${prefix}`] ?? d[`${p}bairro`]),
    pontoReferencia: str(d[`ponto_referencia_${prefix}`] ?? d[`${p}ponto_referencia`]),
    area: str(d[`area_${prefix}`] ?? d[`${p}area`]),
  };
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function mergeConcessao(base: DadosConcessao, incoming: DadosConcessao): void {
  for (const k of Object.keys(incoming) as Array<keyof DadosConcessao>) {
    if (base[k] == null && incoming[k] != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (base as any)[k] = incoming[k];
    }
  }
}

function mergePessoa(base: PessoaCadastral | undefined, incoming: PessoaCadastral | undefined): PessoaCadastral | undefined {
  if (!incoming) return base;
  if (!base) return incoming;
  const out: PessoaCadastral = { ...base };
  for (const k of Object.keys(incoming) as Array<keyof PessoaCadastral>) {
    if (out[k] == null && incoming[k] != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = incoming[k];
    }
    if (k === "enderecoResidencial" || k === "enderecoCobranca" || k === "enderecoComercial") {
      const a = out[k];
      const b = incoming[k];
      if (a && b) out[k] = { ...b, ...a };
    }
  }
  return out;
}
