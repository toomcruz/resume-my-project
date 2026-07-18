// Tipos do módulo de documentos funerários. Puros — sem I/O.

export type TipoDocumento =
  | "DECLARACAO_DE_OBITO"
  | "NOTA_DE_CONTRATACAO_FUNERAL"
  | "DOCUMENTO_DESCONHECIDO";

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
  dadosExtraidos: Record<string, unknown>;
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
