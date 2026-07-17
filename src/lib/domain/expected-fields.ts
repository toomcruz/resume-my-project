/**
 * `getExpectedFields` — helper puro que devolve os campos aplicáveis a um
 * atendimento em execução. Base da tela reestruturada e do prompt da IA.
 *
 * Regras (spec §3, §6, §7):
 *  - Considera processo, fase e documentos aplicáveis.
 *  - Filtra por `visibleWhen` sobre o contexto.
 *  - Marca `required=true` quando algum documento aplicável exige o campo
 *    ou quando o `requiredWhen` do campo é satisfeito.
 *  - Descarta duplicatas e chaves fora do catálogo.
 */

import {
  FIELD_CATALOG,
  type FieldDefinition,
  type FieldSection,
} from "./field-catalog";
import type { AttendanceContext, DocumentSlug } from "./types";

export interface ExpectedField {
  field: FieldDefinition;
  required: boolean;
  usedInDocuments: DocumentSlug[];
}

export interface ExpectedFieldsResult {
  fields: ExpectedField[];
  bySection: Record<FieldSection, ExpectedField[]>;
  requiredKeys: string[];
  optionalKeys: string[];
}

export interface GetExpectedFieldsInput {
  ctx: AttendanceContext;
  applicableDocuments: readonly DocumentSlug[];
}

const EMPTY_BY_SECTION: () => Record<FieldSection, ExpectedField[]> = () => ({
  pessoas: [],
  falecido: [],
  responsavel: [],
  concessionario: [],
  jazigo: [],
  ossuario: [],
  velorio: [],
  sepultamento: [],
  exumacao: [],
  translado: [],
  dados_administrativos: [],
  outros: [],
});

export function getExpectedFields(input: GetExpectedFieldsInput): ExpectedFieldsResult {
  const { ctx, applicableDocuments } = input;
  const docs = new Set<DocumentSlug>(applicableDocuments);

  const bySection = EMPTY_BY_SECTION();
  const fields: ExpectedField[] = [];
  const seen = new Set<string>();

  for (const field of FIELD_CATALOG) {
    if (seen.has(field.canonicalKey)) continue;

    const processMatch =
      field.applicableProcesses.length === 0
        ? false
        : field.applicableProcesses.includes(ctx.process);

    const usedInDocuments = field.applicableDocuments.filter((slug) => docs.has(slug));
    const usedByAnyDoc = usedInDocuments.length > 0;

    // Um campo entra na lista se:
    //   - é aplicável ao processo atual, E
    //   - passa no visibleWhen, E
    //   - ou é usado por algum documento aplicável, ou tem requiredWhen ativo,
    //     ou é elegível pelo processo sem depender de documento.
    if (!processMatch && !usedByAnyDoc) continue;
    if (field.visibleWhen && !field.visibleWhen(ctx)) continue;

    const requiredByRule = field.requiredWhen ? field.requiredWhen(ctx) : false;
    const required = requiredByRule || usedByAnyDoc;

    const entry: ExpectedField = { field, required, usedInDocuments };
    fields.push(entry);
    bySection[field.section].push(entry);
    seen.add(field.canonicalKey);
  }

  // Ordena por prioridade dentro de cada seção (1 = crítico primeiro).
  for (const list of Object.values(bySection)) {
    list.sort((a, b) => a.field.priority - b.field.priority);
  }

  const requiredKeys = fields.filter((f) => f.required).map((f) => f.field.canonicalKey);
  const optionalKeys = fields.filter((f) => !f.required).map((f) => f.field.canonicalKey);

  return { fields, bySection, requiredKeys, optionalKeys };
}
