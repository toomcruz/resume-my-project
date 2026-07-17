/**
 * Determina os campos "críticos" para um atendimento — os que, se ausentes
 * ou em conflito, devem bloquear a geração dos documentos.
 *
 * A fonte da verdade são os placeholders dos modelos DOCX aplicáveis: se
 * um placeholder aparece em um modelo que será gerado, ele é necessário.
 * Isto evita listas hardcoded desconectadas do domínio.
 */

export interface TemplateWithPlaceholders {
  placeholders?: unknown;
}

export function getCriticalFieldKeys(
  applicableTemplates: readonly TemplateWithPlaceholders[],
): Set<string> {
  const keys = new Set<string>();
  for (const template of applicableTemplates) {
    const placeholders = template.placeholders;
    if (!Array.isArray(placeholders)) continue;
    for (const placeholder of placeholders) {
      if (typeof placeholder === "string" && placeholder.trim()) {
        keys.add(placeholder.trim());
      }
    }
  }
  return keys;
}
