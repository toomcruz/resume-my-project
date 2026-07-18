/**
 * Determina os campos "críticos" para um atendimento — os que, se ausentes
 * ou em conflito, devem bloquear a geração dos documentos.
 *
 * A fonte da verdade são os placeholders dos modelos DOCX aplicáveis: se
 * um placeholder aparece em um modelo que será gerado, ele é necessário.
 * Isto evita listas hardcoded desconectadas do domínio.
 *
 * Campos da seção "Localização / Jazigo" são propositalmente tratados como
 * não críticos, pois o usuário pode gerar documentos mesmo sem esses dados
 * preenchidos (ex.: sepultamento em quadra geral, atendimentos sem jazigo).
 */

import { FIELD_CATALOG } from "./field-catalog";

export interface TemplateWithPlaceholders {
  placeholders?: unknown;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]+/g, "");
}

const AUTO_FILLED_KEYS = [
  "data_atual",
  "data_atual_extenso",
  "dataAtual",
  "dataAtualExtenso",
  "dataExt",
  "dataAt",
  "dataContr",
  "dataRec",
];

const NON_CRITICAL_KEYS = (() => {
  const set = new Set<string>();
  for (const def of FIELD_CATALOG) {
    if (def.section !== "jazigo") continue;
    set.add(normalizeKey(def.canonicalKey));
    for (const alias of def.aliases) {
      set.add(normalizeKey(alias));
    }
  }
  for (const key of AUTO_FILLED_KEYS) set.add(normalizeKey(key));
  return set;
})();

export function getCriticalFieldKeys(
  applicableTemplates: readonly TemplateWithPlaceholders[],
): Set<string> {
  const keys = new Set<string>();
  for (const template of applicableTemplates) {
    const placeholders = template.placeholders;
    if (!Array.isArray(placeholders)) continue;
    for (const placeholder of placeholders) {
      if (typeof placeholder === "string" && placeholder.trim()) {
        const trimmed = placeholder.trim();
        if (!NON_CRITICAL_KEYS.has(normalizeKey(trimmed))) {
          keys.add(trimmed);
        }
      }
    }
  }
  return keys;
}
