import type { AttendanceContext } from "./types";

/**
 * Visibility predicate for every conditional question introduced by the
 * restructuring spec. The UI must ask a question only when this function
 * returns `true` for that key. Invisible answers are cleaned up by
 * `applyAnswer` (see `./cleanup.ts`) so they never leak into documents.
 *
 * Only the questions whose visibility is non-trivial are listed here.
 * Questions that are always visible for their process are not included
 * (the UI shows them unconditionally under the correct process).
 */
export function isQuestionVisible(
  key: string,
  ctx: AttendanceContext,
): boolean {
  switch (key) {
    // Velório / Sepultamento
    case "local_sepultamento_tipo":
      return ctx.burial_here === "sim";
    case "jazigo_possui_gaveta_disponivel":
      return (
        ctx.burial_here === "sim" &&
        ctx.local_sepultamento_tipo === "jazigo"
      );

    // Exumação — execução
    case "resultado_exumacao":
      return (
        ctx.process === "exumacao" && ctx.exhumation_phase === "execucao"
      );
    case "destino_fora_jazigo":
      return (
        ctx.process === "exumacao" &&
        ctx.exhumation_phase === "execucao" &&
        ctx.resultado_exumacao === "ossos_liberados" &&
        ctx.local_sepultamento_tipo === "jazigo"
      );
    case "destino_pos_exumacao":
      if (
        ctx.process !== "exumacao" ||
        ctx.exhumation_phase !== "execucao" ||
        ctx.resultado_exumacao !== "ossos_liberados"
      ) {
        return false;
      }
      if (ctx.local_sepultamento_tipo === "quadra_geral") return true;
      if (ctx.local_sepultamento_tipo === "jazigo") {
        return ctx.destino_fora_jazigo === "sim";
      }
      return false;
    case "modalidade_ossario":
      return (
        isQuestionVisible("destino_pos_exumacao", ctx) &&
        ctx.destino_pos_exumacao === "ossario"
      );
    case "tipo_translado":
      return (
        isQuestionVisible("destino_pos_exumacao", ctx) &&
        ctx.destino_pos_exumacao === "translado"
      );
    default:
      return true;
  }
}

/** Combination validity for Velório e Sepultamento (spec §1). */
export function isVelorioSepultamentoValid(
  ctx: Pick<AttendanceContext, "has_wake" | "burial_here">,
): boolean {
  if (!ctx.has_wake || !ctx.burial_here) return false;
  return !(ctx.has_wake === "nao" && ctx.burial_here === "nao");
}
