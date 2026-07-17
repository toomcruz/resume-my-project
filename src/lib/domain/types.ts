/**
 * Shared domain types for the restructured attendance/agenda flows.
 *
 * Pure module: no runtime side effects, no Supabase, no React.
 * Used only by the new `src/lib/domain/*` helpers and their tests during
 * Fase 1. Runtime code continues to consume the legacy modules until later
 * phases wire these in explicitly.
 */

export type ProcessKey =
  | "velorio_sepultamento"
  | "exumacao"
  | "ossario"
  | "translado"
  | "atualizacao_cadastral"
  | "relacao_registros_jazigo";

export type YesNo = "sim" | "nao";

export type LocalSepultamentoTipo = "quadra_geral" | "jazigo";

export type ExhumationSchedulingMode = "agenda" | "sem_agendamento";

export type ExhumationPhase = "preparacao" | "execucao";

export type ResultadoExumacao = "ossos_liberados" | "semi_intacto";

export type DestinoPosExumacao = "ossario" | "translado";

export type ModalidadeOssario = "aluguel" | "aquisicao" | "renovacao";

export type TipoTranslado = "interno" | "externo";

/**
 * Context passed to the pure decision helpers (documents, cleanup, summary,
 * question visibility). Every field is optional so partially-filled
 * attendances can be evaluated at any step of the wizard.
 */
export interface AttendanceContext {
  process: ProcessKey;

  // Velório / Sepultamento
  has_wake?: YesNo;
  burial_here?: YesNo;
  local_sepultamento_tipo?: LocalSepultamentoTipo;
  jazigo_possui_gaveta_disponivel?: YesNo;

  // Exumação
  exhumation_scheduling_mode?: ExhumationSchedulingMode;
  exhumation_phase?: ExhumationPhase;
  resultado_exumacao?: ResultadoExumacao;
  destino_fora_jazigo?: YesNo;
  destino_pos_exumacao?: DestinoPosExumacao;
  modalidade_ossario?: ModalidadeOssario;
  tipo_translado?: TipoTranslado;

  // Ossário independente
  ossario_operacao?: ModalidadeOssario;
}

/**
 * Slug of a document that a given attendance requires. Slugs must match ids
 * from `public/templates/official/catalogo-modelos.json` — never invent one.
 */
export type DocumentSlug =
  | "identificacao-sala-velorio"
  | "condolencias"
  | "ordem-sepultamento"
  | "ordem-exumacao"
  | "termo-compromisso-responsabilidade"
  | "aquisicao-renovacao-ossuario"
  | "guia-exumacao-semi-intacto"
  | "memorando-autorizacao-translado"
  | "atualizacao-cadastral";

export interface RequiredDocument {
  slug: DocumentSlug;
  /**
   * Reason this document was selected. Useful for the review screen and for
   * debugging when a document appears or disappears due to a condition
   * change.
   */
  reason: string;
}
