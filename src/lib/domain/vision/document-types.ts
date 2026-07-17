import type { DocumentType, PersonRole, ProcessKind } from "./types";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  rg: "RG",
  cpf: "CPF",
  cnh: "CNH",
  documento_identidade: "Documento de identidade",
  comprovante_residencia: "Comprovante de residência",
  certidao_obito: "Certidão de óbito",
  declaracao_obito: "Declaração de óbito",
  tela_sistema_interno: "Tela do sistema interno",
  cadastro_jazigo: "Cadastro de jazigo",
  registro_jazigo: "Registro de jazigo",
  documento_sepultamento: "Documento de sepultamento",
  documento_exumacao: "Documento de exumação",
  documento_ossuario: "Documento de ossuário",
  documento_translado: "Documento de translado",
  recibo: "Recibo",
  livro_registro: "Livro de registro",
  desconhecido: "Desconhecido",
};

export const ROLE_LABELS: Record<PersonRole, string> = {
  falecido_sepultamento: "Falecido (sepultamento)",
  falecido_exumacao: "Falecido (exumação)",
  falecido_exumacao_pps: "Falecido (exumação PPS)",
  responsavel: "Responsável pelo atendimento",
  requerente: "Requerente",
  concessionario: "Concessionário",
  sucessor: "Sucessor",
  signatario: "Signatário",
  autorizado: "Pessoa autorizada",
  declarante: "Declarante",
  outro: "Outro",
};

/**
 * Papéis esperados por processo. A UI de "Confirmar pessoas"
 * pergunta apenas os papéis desta lista.
 */
export function expectedRolesForProcess(process: ProcessKind): PersonRole[] {
  switch (process) {
    case "sepultamento_quadra_geral":
      return ["falecido_sepultamento", "responsavel", "requerente"];
    case "sepultamento_jazigo":
      return [
        "falecido_sepultamento",
        "responsavel",
        "concessionario",
        "signatario",
      ];
    case "pps":
      return [
        "falecido_sepultamento",
        "falecido_exumacao_pps",
        "responsavel",
        "concessionario",
        "signatario",
      ];
    case "exumacao_comum":
      return ["falecido_exumacao", "responsavel", "requerente"];
    case "exumacao_jazigo":
      return [
        "falecido_exumacao",
        "responsavel",
        "requerente",
        "concessionario",
        "signatario",
      ];
    case "ossario":
      return ["falecido_sepultamento", "responsavel", "concessionario"];
    case "translado":
      return ["falecido_sepultamento", "autorizado", "responsavel"];
    case "atualizacao_cadastral":
      return ["concessionario", "sucessor", "responsavel"];
  }
}

/** Processos que envolvem jazigo/concessão. */
export function processHasJazigo(process: ProcessKind): boolean {
  return (
    process === "sepultamento_jazigo" ||
    process === "pps" ||
    process === "exumacao_jazigo" ||
    process === "ossario" ||
    process === "atualizacao_cadastral"
  );
}
