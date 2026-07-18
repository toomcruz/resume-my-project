// Configuração central de campos obrigatórios por tipo de processo.
import type { CampoPendente, ProcessoFunerario, TipoProcesso } from "./types";

const OBRIGATORIOS: Record<TipoProcesso, string[]> = {
  sepultamento: [
    "nome_falecido",
    "data_obito",
    "data_sepultamento",
    "hora_sepultamento",
    "local_sepultamento",
    "nome_responsavel",
    "grau_parentesco",
    "numero_do",
    "padrao_funeral",
  ],
  exumacao: [
    "nome_falecido_exumado",
    "nome_responsavel",
    "grau_parentesco",
    "data_exumacao",
  ],
};

const CONFIANCA_MINIMA = 0.6;

export function computePending(processo: ProcessoFunerario): CampoPendente[] {
  const flat: Record<string, { value: string; confianca: number }> = {};
  const push = (campo: string, value?: string, confianca = 1) => {
    if (!value) return;
    flat[campo] = { value, confianca };
  };

  const principal = processo.falecidos.find((f) => f.papel === "principal") ?? processo.falecidos[0];
  if (principal) {
    push("nome_falecido", principal.nome?.normalized, principal.nome?.confianca ?? 0);
    push("cpf_falecido", principal.cpf?.normalized, principal.cpf?.confianca ?? 0);
    push("data_obito", principal.dataObito?.normalized, principal.dataObito?.confianca ?? 0);
    push("numero_do", principal.numeroDO?.normalized, principal.numeroDO?.confianca ?? 0);
  }
  const exumado = processo.falecidos.find((f) => f.papel === "exumado");
  if (exumado) {
    push("nome_falecido_exumado", exumado.nome?.normalized, exumado.nome?.confianca ?? 0);
  }
  push("nome_responsavel", processo.responsavelPrincipal?.nome?.normalized, processo.responsavelPrincipal?.nome?.confianca ?? 0);
  push("grau_parentesco", processo.responsavelPrincipal?.grauParentesco?.normalized, processo.responsavelPrincipal?.grauParentesco?.confianca ?? 0);
  push("data_sepultamento", processo.dadosSepultamento?.data?.normalized, processo.dadosSepultamento?.data?.confianca ?? 0);
  push("hora_sepultamento", processo.dadosSepultamento?.hora?.normalized, processo.dadosSepultamento?.hora?.confianca ?? 0);
  push("local_sepultamento", processo.dadosSepultamento?.local?.normalized, processo.dadosSepultamento?.local?.confianca ?? 0);
  if (processo.dadosContratacao?.padraoFuneral) {
    push("padrao_funeral", processo.dadosContratacao.padraoFuneral, 1);
  }

  const pend: CampoPendente[] = [];
  for (const campo of OBRIGATORIOS[processo.tipoProcesso]) {
    const found = flat[campo];
    if (!found) pend.push({ campo, motivo: "AUSENTE" });
    else if (found.confianca < CONFIANCA_MINIMA) pend.push({ campo, motivo: "BAIXA_CONFIANCA", confianca: found.confianca });
  }
  return pend;
}
