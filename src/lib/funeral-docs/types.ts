// Tipos do módulo de documentos funerários. Puros — sem I/O.

export type TipoDocumento =
  | "DECLARACAO_DE_OBITO"
  | "NOTA_DE_CONTRATACAO_FUNERAL"
  | "CADASTRO_CONCESSIONARIO_GSCEMI"
  | "DOCUMENTO_DESCONHECIDO";

export type PapelPessoa =
  | "FALECIDO_SEPULTADO"
  | "FALECIDO_EXUMADO"
  | "DECLARANTE"
  | "RESPONSAVEL_ORDEM_SEPULTAMENTO"
  | "CONTRATANTE"
  | "CONCESSIONARIO"
  | "DEPENDENTE_CONCESSIONARIO"
  | "ADMINISTRADOR_PROVISORIO_JAZIGO"
  | "PAGADOR"
  | "CONJUGE"
  | "FILHO"
  | "ATENDENTE";

export type TipoConcessao = "QUADRA_GERAL_TEMPORARIA" | "JAZIGO_CONCESSAO" | "NAO_IDENTIFICADO";

export type SituacaoConcessionario = "VIVO" | "FALECIDO" | "NAO_IDENTIFICADA";

export interface EnderecoCadastral {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  cidade?: string;
  bairro?: string;
  pontoReferencia?: string;
  area?: string;
}

export interface PessoaCadastral {
  nome?: string;
  nomeNormalizado?: string;
  cpf?: string;
  rg?: string;
  orgaoExpedidor?: string;
  dataNascimento?: string;
  dataFalecimento?: string;
  estadoCivil?: string;
  sexo?: string;
  profissao?: string;
  telefone1?: string;
  telefone2?: string;
  celular?: string;
  fax?: string;
  email?: string;
  nacionalidade?: string;
  localNascimento?: string;
  ufNascimento?: string;
  familia?: string;
  matricula?: string;
  observacao?: string;
  enderecoResidencial?: EnderecoCadastral;
  enderecoCobranca?: EnderecoCadastral;
  enderecoComercial?: EnderecoCadastral;
  /** Apenas para dependentes: grau de parentesco com o concessionário. Nunca com o falecido sepultado. */
  grauParentescoComConcessionario?: string;
  papeis?: PapelPessoa[];
}

export interface DadosConcessao {
  inscricaoGscemi?: string;
  numeroContrato?: string;
  numeroArquivo?: string;
  preContrato?: string;
  dataCadastro?: string;
  grupo?: string;
  sg?: string;
  tipoVenda?: string;
  tipoConcessao?: string;
  quadra?: string;
  nomeQuadra?: string;
  letra?: string;
  lote?: string;
  numero?: string;
  qtdContratos?: number;
  qtdJazigos?: number;
  status?: string;
  dataStatus?: string;
  filial?: string;
  vendedor?: string;
  tipoConcessionario?: string;
  valorInformado?: number;
  tipoCobranca?: string;
  diaVencimento?: string;
  qtdCremacoes?: number;
}

export interface AlertaGscemi {
  nivel: "info" | "warn" | "error";
  mensagem: string;
}

export interface CadastroGscemi {
  tipoConcessao: TipoConcessao;
  concessao: DadosConcessao;
  concessionario?: PessoaCadastral;
  situacaoConcessionario: SituacaoConcessionario;
  dependente?: PessoaCadastral;
  administradorProvisorio?: PessoaCadastral;
  alertas: AlertaGscemi[];
  origemDocIds: string[];
}

export type TipoProcesso = "sepultamento" | "exumacao";

export type PadraoFuneral =
  | "PADRAO"
  | "LUXO"
  | "SUPER_LUXO"
  | "CREMACAO"
  | "DOADOR_DE_ORGAOS"
  | "GRATUITO"
  | "OUTRO"
  | "NAO_IDENTIFICADO";

export type PapelFalecido = "principal" | "exumado" | "relacionado";

export type StatusDivergencia = "PENDENTE" | "CONFIRMADO" | "DESCARTADO";

export interface ValorRastreado<T = string> {
  original: string;
  normalized: T;
  confianca: number; // 0..1
  origemDocId?: string;
}

export interface Falecido {
  id?: string;
  papel: PapelFalecido;
  nome?: ValorRastreado;
  nomeSocial?: ValorRastreado;
  cpf?: ValorRastreado;
  rg?: ValorRastreado;
  sexo?: ValorRastreado;
  cor?: ValorRastreado;
  profissao?: ValorRastreado;
  dataNascimento?: ValorRastreado;
  idade?: ValorRastreado<number>;
  naturalidade?: ValorRastreado;
  estadoCivil?: ValorRastreado;
  endereco?: ValorRastreado;
  nomeMae?: ValorRastreado;
  nomePai?: ValorRastreado;
  dataObito?: ValorRastreado;
  horaObito?: ValorRastreado;
  localFalecimento?: ValorRastreado;
  medico?: ValorRastreado;
  crm?: ValorRastreado;
  causaMortis?: ValorRastreado;
  proAim?: ValorRastreado;
  numeroDO?: ValorRastreado;
}

export interface Responsavel {
  nome?: ValorRastreado;
  cpf?: ValorRastreado;
  rg?: ValorRastreado;
  dataNascimento?: ValorRastreado;
  profissao?: ValorRastreado;
  telefone1?: ValorRastreado;
  telefone2?: ValorRastreado;
  email?: ValorRastreado;
  endereco?: ValorRastreado;
  grauParentesco?: ValorRastreado;
  assinaturaPresente?: boolean;
}

export interface Contratante {
  nome?: ValorRastreado;
  cpf?: ValorRastreado;
  rg?: ValorRastreado;
  grauParentesco?: ValorRastreado;
  telefone1?: ValorRastreado;
  telefone2?: ValorRastreado;
  email?: ValorRastreado;
  endereco?: ValorRastreado;
}

export interface DadosSepultamento {
  cemiterio?: ValorRastreado;
  data?: ValorRastreado;
  hora?: ValorRastreado;
  local?: ValorRastreado;
  quadra?: ValorRastreado;
  rua?: ValorRastreado;
  terreno?: ValorRastreado;
  gaveta?: ValorRastreado;
  concessao?: ValorRastreado;
  crematorio?: boolean;
}

export interface DadosVelorio {
  local?: ValorRastreado;
  sala?: ValorRastreado;
  inicio?: ValorRastreado;
  fim?: ValorRastreado;
}

export interface ItemContratado {
  codigo?: string;
  descricao: string;
  quantidade?: number;
  unidade?: string;
  valorUnitario?: number;
  valorTotal?: number;
}

export interface DadosContratacao {
  numeroContratacao?: ValorRastreado;
  numeroDO?: ValorRastreado;
  tipoContratacao?: ValorRastreado;
  agencia?: ValorRastreado;
  emissao?: ValorRastreado;
  padraoFuneral?: PadraoFuneral;
  padraoFonte?: string;
  itens: ItemContratado[];
  ordensServico: string[];
  pagamento?: {
    nome?: string;
    documento?: string;
    forma?: string;
    valorPago?: number;
    valorTotal?: number;
  };
}

export interface DocumentoFonte {
  id: string;
  tipoDocumento: TipoDocumento;
  attendanceImageId?: string;
  classificacaoConfianca: number;
  // Valores lidos do OCR; usamos `any` porque alguns campos são arrays
  // (itens, ordens_servico) e outros objetos (pagamento). O merger sabe
  // interpretar cada um.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dadosExtraidos: Record<string, any>;
}

export interface Divergencia {
  id?: string;
  campo: string;
  valorA: string;
  valorB: string;
  docAId?: string;
  docBId?: string;
  confianca: number;
  sugestao?: string;
  valorFinal?: string;
  status: StatusDivergencia;
}

export interface CampoPendente {
  campo: string;
  motivo: "AUSENTE" | "BAIXA_CONFIANCA";
  confianca?: number;
}

export interface ProcessoFunerario {
  id?: string;
  tipoProcesso: TipoProcesso;
  status: "em_analise" | "revisado" | "concluido";
  falecidos: Falecido[];
  responsavelPrincipal?: Responsavel;
  contratante?: Contratante;
  dadosSepultamento?: DadosSepultamento;
  dadosVelorio?: DadosVelorio;
  dadosContratacao?: DadosContratacao;
  documentos: DocumentoFonte[];
  divergencias: Divergencia[];
  camposPendentes: CampoPendente[];
}
