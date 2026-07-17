/**
 * Tipos puros do módulo "Confirmar pessoas e informações".
 *
 * Este arquivo NÃO importa nada de UI, Supabase ou IA. Toda a lógica de
 * domínio é testável em isolamento.
 */

// -----------------------------------------------------------------------------
// Documento
// -----------------------------------------------------------------------------

export type DocumentType =
  | "rg"
  | "cpf"
  | "cnh"
  | "documento_identidade"
  | "comprovante_residencia"
  | "certidao_obito"
  | "declaracao_obito"
  | "tela_sistema_interno"
  | "cadastro_jazigo"
  | "registro_jazigo"
  | "documento_sepultamento"
  | "documento_exumacao"
  | "documento_ossuario"
  | "documento_translado"
  | "recibo"
  | "livro_registro"
  | "desconhecido";

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "rg",
  "cpf",
  "cnh",
  "documento_identidade",
  "comprovante_residencia",
  "certidao_obito",
  "declaracao_obito",
  "tela_sistema_interno",
  "cadastro_jazigo",
  "registro_jazigo",
  "documento_sepultamento",
  "documento_exumacao",
  "documento_ossuario",
  "documento_translado",
  "recibo",
  "livro_registro",
  "desconhecido",
] as const;

export type DocumentClassification = {
  documentType: DocumentType;
  confidence: number;
  reason: string;
  alternatives: Array<{ documentType: DocumentType; confidence: number }>;
};

// -----------------------------------------------------------------------------
// Papéis
// -----------------------------------------------------------------------------

export type PersonRole =
  | "falecido_sepultamento"
  | "falecido_exumacao"
  | "falecido_exumacao_pps"
  | "responsavel"
  | "requerente"
  | "concessionario"
  | "sucessor"
  | "signatario"
  | "autorizado"
  | "declarante"
  | "outro";

export type RoleCandidate = {
  role: PersonRole;
  confidence: number;
  evidence: string;
  sourceImageId: string;
};

// -----------------------------------------------------------------------------
// Processo
// -----------------------------------------------------------------------------

export type ProcessKind =
  | "sepultamento_quadra_geral"
  | "sepultamento_jazigo"
  | "pps"
  | "exumacao_comum"
  | "exumacao_jazigo"
  | "ossario"
  | "translado"
  | "atualizacao_cadastral";

// -----------------------------------------------------------------------------
// Pessoa extraída (bruta, vinda de UMA imagem)
// -----------------------------------------------------------------------------

export type ExtractedPersonRaw = {
  /** ID temporário, único dentro da resposta de UMA imagem. */
  temporaryId: string;
  name: string;
  cpf?: string;
  rg?: string;
  birthDate?: string;
  address?: string;
  phone?: string;
  email?: string;
  roleCandidates: Array<{
    role: PersonRole;
    confidence: number;
    evidence: string;
  }>;
};

// -----------------------------------------------------------------------------
// Pessoa consolidada (após merge entre imagens)
// -----------------------------------------------------------------------------

export type ExtractedPerson = {
  /** ID estável do atendimento (não persistido além do atendimento). */
  id: string;
  name: string;
  cpf?: string;
  rg?: string;
  birthDate?: string;
  address?: string;
  phone?: string;
  email?: string;
  roleCandidates: RoleCandidate[];
  sourceImageIds: string[];
  /** Marcado quando o usuário confirmou papel/identidade. */
  confirmedByUser?: boolean;
  /** Papéis confirmados manualmente pelo usuário. */
  confirmedRoles?: PersonRole[];
};

// -----------------------------------------------------------------------------
// Campo canônico extraído
// -----------------------------------------------------------------------------

export type ExtractedField = {
  canonicalKey: string;
  rawValue: string;
  normalizedValue: string;
  /** Se o campo pertence a uma pessoa, referência ao ID dela. */
  entityTemporaryId?: string;
  confidence: number;
  evidence: string;
  sourceImageId: string;
};

export type ConfirmedField = {
  key: string;
  value: string;
  sourceImageId: string;
  documentType: DocumentType;
  evidence: string;
  confidence: number;
  rawValue: string;
  normalizedValue: string;
  confirmedByUser?: boolean;
};

// -----------------------------------------------------------------------------
// Imagem
// -----------------------------------------------------------------------------

export type ImageStatus =
  | "pendente"
  | "processando"
  | "concluida"
  | "precisa_revisao"
  | "duplicada"
  | "erro";

export type ImageRecord = {
  imageId: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** Hash sha-256 (hex) usado apenas para detectar duplicatas. */
  hash: string;
  status: ImageStatus;
  documentType?: DocumentType;
  classificationConfidence?: number;
  errors?: string[];
  processedAt?: string;
};

// -----------------------------------------------------------------------------
// Resposta bruta da IA para UMA imagem
// -----------------------------------------------------------------------------

export type ImageExtractionResult = {
  imageId: string;
  classification: DocumentClassification;
  persons: ExtractedPersonRaw[];
  fields: ExtractedField[];
  warnings: string[];
  missingExpectedFields: string[];
};

// -----------------------------------------------------------------------------
// Conflito entre valores de um mesmo campo
// -----------------------------------------------------------------------------

export type FieldConflict = {
  key: string;
  candidates: Array<{
    value: string;
    sourceImageId: string;
    documentType: DocumentType;
    evidence: string;
    confidence: number;
  }>;
};
