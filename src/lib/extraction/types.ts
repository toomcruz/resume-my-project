// Fase 1 do pipeline de extração — apenas tipos e enums.
// Nenhum consumo em runtime nesta fase (isolado da UI e do server atual).

export const ENTITY_TYPES = [
  "falecido",
  "responsavel",
  "requerente",
  "concessionario",
  "administrador",
  "sucessor",
  "autorizado",
  "jazigo",
  "ossario",
  "atendimento",
  "funeraria",
  "outro",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const DOCUMENT_TYPES = [
  "documento_identidade",
  "cpf",
  "comprovante_endereco",
  "certidao_obito",
  "tela_sistema_interno",
  "documento_jazigo",
  "ordem_sepultamento",
  "ordem_exumacao",
  "termo_responsabilidade",
  "documento_ossuario",
  "documento_translado",
  "atualizacao_cadastral",
  "recibo",
  "desconhecido",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const FIELD_STATUSES = ["confirmado", "revisar", "conflito", "invalido"] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

export const IMAGE_PROCESSING_STATUSES = [
  "pendente",
  "preparando",
  "processando",
  "concluida",
  "precisa_revisao",
  "duplicada",
  "erro",
] as const;
export type ImageProcessingStatus = (typeof IMAGE_PROCESSING_STATUSES)[number];

export const FIELD_VALUE_TYPES = [
  "text",
  "name",
  "cpf",
  "cep",
  "date",
  "time",
  "phone",
  "email",
  "number",
] as const;
export type FieldValueType = (typeof FIELD_VALUE_TYPES)[number];

export const APPLICABLE_PROCESSES = [
  "sepultamento",
  "exumacao",
  "ossario",
  "translado",
  "atualizacao_cadastral",
  "*",
] as const;
export type ApplicableProcess = (typeof APPLICABLE_PROCESSES)[number];

export interface FieldAlternative {
  value: string;
  sourceImageId: string;
  confidence: number;
}

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  rawValue: string;
  entityType: EntityType;
  section: string;
  sourceImageId: string;
  sourceFileName: string;
  documentType: DocumentType;
  confidence: number;
  status: FieldStatus;
  alternatives?: FieldAlternative[];
}

export interface DocumentClassification {
  documentType: DocumentType;
  confidence: number;
  reason: string;
  possibleAlternatives: Array<{ documentType: DocumentType; confidence: number }>;
}

export interface AIResponse {
  documentClassification: DocumentClassification;
  fields: ExtractedField[];
  warnings: string[];
  missingExpectedFields: string[];
  processingNotes: string[];
}

export interface ImageState {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  status: ImageProcessingStatus;
  documentType: DocumentType | null;
  processedAt: string | null;
  attempt: number;
  error: string | null;
  result: AIResponse | null;
}

export interface ValidationOutcome {
  ok: boolean;
  normalized?: string;
  reason?: string;
}
