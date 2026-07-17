/**
 * Helpers puros para a "triagem rápida" do processo Sepultamento.
 *
 * Sem dependências de UI, DOM ou Supabase — para permitir testes puros e
 * uso tanto no client quanto no server ao montar o payload do DOCX.
 */

export type LocalSepultamento = "quadra_geral" | "jazigo";

export type QuickDateChoice = "hoje" | "amanha" | "mais2" | "outra";

/** Horários oficiais de sepultamento (seleção única). */
export const HORARIOS_SEPULTAMENTO = [
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
] as const;

/** Salas de velório (seleção única). */
export const SALAS_VELORIO = ["A", "B", "C", "D", "E", "F"] as const;

/**
 * Aplica o efeito colateral da escolha do local do sepultamento nos campos
 * derivados de triagem (`concessao`, `quadra_geral_gaveta`).
 */
export function applyLocalSepultamento(local: LocalSepultamento): {
  concessao: "SIM" | "NAO";
  quadra_geral_gaveta: "SIM" | "NAO";
} {
  if (local === "quadra_geral") return { concessao: "NAO", quadra_geral_gaveta: "SIM" };
  return { concessao: "SIM", quadra_geral_gaveta: "NAO" };
}

/** Retorna a data ISO (YYYY-MM-DD) para os presets rápidos. */
export function computeQuickDate(
  choice: Exclude<QuickDateChoice, "outra">,
  base: Date = new Date(),
): string {
  const offset = choice === "hoje" ? 0 : choice === "amanha" ? 1 : 2;
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Converte YYYY-MM-DD → DD/MM/AAAA. Retorna a string original se inválida. */
export function formatIsoToBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export interface TriagemSepultamentoState {
  /** "quadra_geral" | "jazigo" — usado como `subprocess`. */
  subprocess?: string;
  /** ISO YYYY-MM-DD. */
  data_agendada?: string;
  hora_sepultamento?: string;
  /** Escolha explícita feita no fluxo progressivo. */
  tem_velorio?: "SIM" | "NAO" | "";
  /** Letra A..F. */
  sala_velorio?: string;
  inicio_velorio?: string;
  fim_velorio?: string;
  local_sepultamento?: string;
  funeraria?: string;
  /** Compatibilidade com documentos e atendimentos anteriores. */
  sem_velorio?: "SIM" | "";
  /** Valor informado deliberadamente na triagem. */
  placa_identificacao?: string;
  placa_confirmada?: "SIM" | "";
}

/**
 * Chaves que já foram definidas na triagem e não devem reaparecer como campos
 * editáveis na revisão do documento. Inclui aliases canônicos e legados.
 */
export const TRIAGEM_SEPULTAMENTO_REVIEW_KEYS = new Set([
  "data_sepultamento",
  "dataSepultamento",
  "dataSep",
  "hora_sepultamento",
  "horario_sepultamento",
  "horaSepultamento",
  "horaSep",
  "sala_velorio",
  "salaVelorio",
  "sala",
  "inicio_velorio",
  "inicio",
  "fim_velorio",
  "fim",
  "local_sepultamento",
  "localSepultamento",
  "funeraria",
  "empresa_funeraria",
  "empresaFuneraria",
  "placa_identificacao",
  "placaIdentificacao",
  "placa",
  "concessao",
  "quadra_geral_gaveta",
]);

/**
 * Valida se a triagem pode ser confirmada. Retorna a lista de mensagens de
 * erro na ordem em que devem ser exibidas (a UI mostra apenas a primeira).
 *
 * Os detalhes do velório são opcionais. A única exigência é a escolha explícita
 * entre "haverá velório" e "somente sepultamento", evitando que a interface
 * presuma uma opção e despeje campos desnecessários na tela.
 */
export function validateTriagemSepultamento(state: TriagemSepultamentoState): string[] {
  const errors: string[] = [];
  if (state.subprocess !== "quadra_geral" && state.subprocess !== "jazigo") {
    errors.push("Selecione o local do sepultamento (Quadra geral ou Jazigo).");
  }
  if (!state.data_agendada?.trim()) {
    errors.push("Selecione a data do sepultamento.");
  }
  if (!state.hora_sepultamento?.trim()) {
    errors.push("Selecione o horário do sepultamento.");
  }
  const wakeChoice =
    state.tem_velorio || (state.sem_velorio === "SIM" ? "NAO" : state.sala_velorio ? "SIM" : "");
  if (wakeChoice !== "SIM" && wakeChoice !== "NAO") {
    errors.push("Informe se haverá velório.");
  }
  return errors;
}

/**
 * Constrói o subconjunto de campos que devem sobrescrever `extracted_data`
 * na geração do DOCX. A placa só entra se confirmada. Sala fica vazia quando
 * o atendimento foi definido como somente sepultamento.
 */
export function buildTriagemOverrides(state: TriagemSepultamentoState): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.data_agendada) out.data_sepultamento = formatIsoToBr(state.data_agendada);
  if (state.hora_sepultamento) {
    out.hora_sepultamento = state.hora_sepultamento;
    out.horario_sepultamento = state.hora_sepultamento;
  }
  const semVelorio = state.tem_velorio === "NAO" || state.sem_velorio === "SIM";
  if (semVelorio) {
    out.sala_velorio = "";
    out.inicio_velorio = "";
    out.fim_velorio = "";
  } else {
    if (state.sala_velorio) out.sala_velorio = state.sala_velorio;
    if (state.inicio_velorio) out.inicio_velorio = state.inicio_velorio;
    if (state.fim_velorio) out.fim_velorio = state.fim_velorio;
  }
  if (state.local_sepultamento?.trim()) {
    out.local_sepultamento = state.local_sepultamento.trim();
  }
  if (state.funeraria?.trim()) {
    out.funeraria = state.funeraria.trim();
    out.empresa_funeraria = state.funeraria.trim();
  }
  if (state.placa_identificacao?.trim()) {
    out.placa_identificacao = state.placa_identificacao.trim();
  }
  if (state.subprocess === "quadra_geral" || state.subprocess === "jazigo") {
    const { concessao, quadra_geral_gaveta } = applyLocalSepultamento(state.subprocess);
    out.concessao = concessao;
    out.quadra_geral_gaveta = quadra_geral_gaveta;
  }
  return out;
}
