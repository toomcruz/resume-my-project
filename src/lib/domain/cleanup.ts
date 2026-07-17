import type { AttendanceContext } from "./types";

/**
 * Removes descendant answers that stopped being valid after a parent answer
 * changed. Cleanup is REQUIRED to be state-level (not visual) so obsolete
 * answers cannot leak into summaries, documents or agenda events.
 *
 * Pure: receives the previous context and the changed key/value, returns a
 * fresh context. Never mutates its input.
 */

type Key = keyof AttendanceContext;

const DESCENDANTS: Partial<Record<Key, Key[]>> = {
  // Sepultamento em jazigo — se voltar a existir vaga, tudo relativo à PPS
  // sai. As chaves adicionais (nome_falecido_exumacao_pps etc.) vivem no
  // subprocess_details do runtime legado; a UI deve chamar cleanup dessas
  // chaves complementares por conta própria, mas os campos condicionais
  // do domínio novo são estes.
  jazigo_possui_gaveta_disponivel: [],

  // Ao mudar local do sepultamento, jazigo-only responses saem.
  local_sepultamento_tipo: ["jazigo_possui_gaveta_disponivel"],

  // Ao mudar resultado, tudo abaixo de destino sai.
  resultado_exumacao: [
    "destino_fora_jazigo",
    "destino_pos_exumacao",
    "modalidade_ossario",
    "tipo_translado",
  ],

  // Ao mudar destino_fora_jazigo, os campos de destino saem.
  destino_fora_jazigo: [
    "destino_pos_exumacao",
    "modalidade_ossario",
    "tipo_translado",
  ],

  // Ao mudar destino_pos_exumacao, os campos específicos do ramo saem.
  destino_pos_exumacao: ["modalidade_ossario", "tipo_translado"],
};

/**
 * Apply a single answer change and clear every descendant that is no longer
 * valid under the new value.
 *
 * Special cases:
 * - When `resultado_exumacao` is set to `semi_intacto`, `destino_fora_jazigo`
 *   must also be cleared even though generic descendant rules would already
 *   drop the deeper fields.
 * - When the parent value did not change, no cleanup is performed.
 */
export function applyAnswer<K extends Key>(
  prev: AttendanceContext,
  key: K,
  value: AttendanceContext[K],
): AttendanceContext {
  const next: AttendanceContext = { ...prev, [key]: value };
  if (prev[key] === value) return next;

  const descendants = DESCENDANTS[key];
  if (!descendants) return next;

  for (const dep of descendants) {
    delete next[dep];
  }

  // Semi-intacto: também remove destino_fora_jazigo (parent branch inválido).
  if (key === "resultado_exumacao" && value === "semi_intacto") {
    delete next.destino_fora_jazigo;
  }

  // Se destino_pos_exumacao virou ossário, tipo_translado deve sumir; se
  // virou translado, modalidade_ossario deve sumir. As regras genéricas
  // acima já garantem isso, mas mantemos explícito para leitura.
  if (key === "destino_pos_exumacao") {
    if (value === "ossario") delete next.tipo_translado;
    if (value === "translado") delete next.modalidade_ossario;
  }

  return next;
}
