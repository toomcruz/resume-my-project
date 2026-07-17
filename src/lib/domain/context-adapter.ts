import type { AttendanceContext, ProcessKey as DomainProcessKey } from "./types";
import type { ProcessKey as RuntimeProcessKey } from "@/lib/processes";

/**
 * Adapter between the runtime `attendances.process` string and the domain
 * `AttendanceContext.process` used by the pure helpers.
 *
 * The runtime name `sepultamento` maps to the domain `velorio_sepultamento`;
 * every other process shares the same slug on both sides. This adapter is
 * the only place the two vocabularies meet — never rewrite the DB column.
 */
export function runtimeProcessToDomain(
  key: RuntimeProcessKey | string,
): DomainProcessKey | null {
  switch (key) {
    case "sepultamento":
      return "velorio_sepultamento";
    case "exumacao":
    case "ossario":
    case "translado":
    case "atualizacao_cadastral":
      return key;
    default:
      return null;
  }
}

/**
 * Best-effort translation of the runtime "extras" bag (subprocess +
 * extraFields collected in the wizard) into a partial `AttendanceContext`.
 *
 * Only fields we actually collect today are populated. Missing information
 * simply produces an empty document list downstream — the pure helpers
 * already treat every context field as optional.
 */
export function buildAttendanceContext(
  processKey: RuntimeProcessKey | string,
  subprocess: string | null | undefined,
  extras: Record<string, string | undefined>,
): AttendanceContext | null {
  const process = runtimeProcessToDomain(processKey);
  if (!process) return null;

  const ctx: AttendanceContext = { process };

  if (process === "ossario") {
    if (
      subprocess === "aluguel" ||
      subprocess === "aquisicao" ||
      subprocess === "renovacao"
    ) {
      ctx.ossario_operacao = subprocess;
    }
  }

  if (process === "translado") {
    if (subprocess === "interno" || subprocess === "externo") {
      ctx.tipo_translado = subprocess;
    }
  }

  if (process === "velorio_sepultamento") {
    if (subprocess === "quadra_geral" || subprocess === "jazigo") {
      ctx.local_sepultamento_tipo = subprocess;
    }
    if (extras.has_wake === "sim" || extras.has_wake === "nao") {
      ctx.has_wake = extras.has_wake;
    }
    if (extras.burial_here === "sim" || extras.burial_here === "nao") {
      ctx.burial_here = extras.burial_here;
    }
  }

  if (process === "exumacao") {
    if (subprocess === "quadra_geral" || subprocess === "jazigo") {
      ctx.local_sepultamento_tipo = subprocess;
    }
    if (
      extras.exhumation_phase === "preparacao" ||
      extras.exhumation_phase === "execucao"
    ) {
      ctx.exhumation_phase = extras.exhumation_phase;
    }
  }

  return ctx;
}
