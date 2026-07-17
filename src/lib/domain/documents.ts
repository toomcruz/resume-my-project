import type {
  AttendanceContext,
  DocumentSlug,
  RequiredDocument,
} from "./types";

/**
 * Pure implementation of the "required documents" rules described in the
 * restructuring spec, section 12.
 *
 * This helper does NOT verify that the model file actually exists in the
 * official catalog. That check belongs to the UI / server layer, which
 * should show a non-blocking warning when a slug returned here is missing.
 */

const R = {
  velorio: "Velório selecionado (has_wake=sim).",
  quadraGeral: "Sepultamento em quadra geral.",
  jazigoComVaga:
    "Sepultamento em jazigo com gaveta disponível — Ordem + Termo.",
  ppsSepultamento:
    "Exumação para Pronto Sepultamento (PPS) — Ordem de Sepultamento do novo falecido.",
  ppsExumacao:
    "Exumação para Pronto Sepultamento (PPS) — Ordem de Exumação do falecido anterior.",
  ppsTermo:
    "Exumação para Pronto Sepultamento (PPS) — Termo de Responsabilidade do jazigo.",
  preparacaoQuadra: "Preparação da exumação em quadra geral.",
  preparacaoJazigo:
    "Preparação da exumação em jazigo — Ordem + Termo do responsável.",
  execucaoOssarioAluguel:
    "Execução da exumação com destino ossário (aluguel).",
  execucaoOssarioAquisicao:
    "Execução da exumação com destino ossário (aquisição).",
  execucaoTranslado:
    "Execução da exumação com destino translado.",
  semiIntacto:
    "Resultado semi-intacto — guia específica quando o modelo estiver cadastrado.",
  ossarioIndependente: "Processo Ossário independente.",
  transladoIndependente: "Processo Translado independente.",
  atualizacaoCadastral: "Processo Atualização Cadastral.",
} as const;

function add(
  out: Map<DocumentSlug, RequiredDocument>,
  slug: DocumentSlug,
  reason: string,
): void {
  // Never generate duplicates — first reason wins for traceability.
  if (!out.has(slug)) out.set(slug, { slug, reason });
}

export function getRequiredDocuments(ctx: AttendanceContext): RequiredDocument[] {
  const out = new Map<DocumentSlug, RequiredDocument>();

  if (ctx.process === "velorio_sepultamento") {
    // Velório
    if (ctx.has_wake === "sim") {
      add(out, "identificacao-sala-velorio", R.velorio);
      add(out, "condolencias", R.velorio);
    }
    // Sepultamento
    if (ctx.burial_here === "sim") {
      if (ctx.local_sepultamento_tipo === "quadra_geral") {
        add(out, "ordem-sepultamento", R.quadraGeral);
      } else if (ctx.local_sepultamento_tipo === "jazigo") {
        if (ctx.jazigo_possui_gaveta_disponivel === "sim") {
          add(out, "ordem-sepultamento", R.jazigoComVaga);
          add(out, "termo-compromisso-responsabilidade", R.jazigoComVaga);
        } else if (ctx.jazigo_possui_gaveta_disponivel === "nao") {
          // PPS — sepultamento + exumação do falecido anterior + termo.
          add(out, "ordem-sepultamento", R.ppsSepultamento);
          add(out, "ordem-exumacao", R.ppsExumacao);
          add(out, "termo-compromisso-responsabilidade", R.ppsTermo);
        }
      }
    }
    return [...out.values()];
  }

  if (ctx.process === "exumacao") {
    const local = ctx.local_sepultamento_tipo;

    if (ctx.exhumation_phase === "preparacao") {
      if (local === "quadra_geral") {
        add(out, "ordem-exumacao", R.preparacaoQuadra);
      } else if (local === "jazigo") {
        add(out, "ordem-exumacao", R.preparacaoJazigo);
        add(out, "termo-compromisso-responsabilidade", R.preparacaoJazigo);
      }
      return [...out.values()];
    }

    if (ctx.exhumation_phase === "execucao") {
      // Semi-intacto: usa modelo específico se disponível; caller decide.
      if (ctx.resultado_exumacao === "semi_intacto") {
        add(out, "guia-exumacao-semi-intacto", R.semiIntacto);
        return [...out.values()];
      }

      if (ctx.resultado_exumacao === "ossos_liberados") {
        // Em jazigo, só há documento de destino quando o usuário confirmou
        // explicitamente que os despojos sairão do jazigo.
        const emitirDestino =
          local === "quadra_geral" ||
          (local === "jazigo" && ctx.destino_fora_jazigo === "sim");

        if (emitirDestino) {
          if (ctx.destino_pos_exumacao === "ossario") {
            if (ctx.modalidade_ossario === "aluguel") {
              add(out, "aquisicao-renovacao-ossuario", R.execucaoOssarioAluguel);
            } else if (ctx.modalidade_ossario === "aquisicao") {
              add(out, "aquisicao-renovacao-ossuario", R.execucaoOssarioAquisicao);
            }
            // Renovação NÃO aparece como destino de Exumação (spec §5).
          } else if (ctx.destino_pos_exumacao === "translado") {
            add(out, "memorando-autorizacao-translado", R.execucaoTranslado);
          }
        }
      }
      return [...out.values()];
    }

    return [];
  }

  if (ctx.process === "ossario") {
    // Ossário independente: aluguel, aquisição ou renovação (todos usam o
    // mesmo modelo oficial "aquisicao-renovacao-ossuario").
    if (
      ctx.ossario_operacao === "aluguel" ||
      ctx.ossario_operacao === "aquisicao" ||
      ctx.ossario_operacao === "renovacao"
    ) {
      add(out, "aquisicao-renovacao-ossuario", R.ossarioIndependente);
    }
    return [...out.values()];
  }

  if (ctx.process === "translado") {
    add(out, "memorando-autorizacao-translado", R.transladoIndependente);
    return [...out.values()];
  }

  if (ctx.process === "atualizacao_cadastral") {
    add(out, "atualizacao-cadastral", R.atualizacaoCadastral);
    return [...out.values()];
  }

  // Relação de Registros do Jazigo: sem modelo oficial cadastrado hoje.
  // Retorna vazio; a UI mostra aviso não bloqueante.
  return [];
}
