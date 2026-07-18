// Classifica o padrão do funeral a partir dos itens contratados.
// NUNCA usa o valor total — apenas descrições.
import type { ItemContratado, PadraoFuneral } from "./types";

interface Regra {
  padrao: PadraoFuneral;
  termos: string[];
}

const REGRAS: Regra[] = [
  { padrao: "SUPER_LUXO", termos: ["SUPER LUXO", "SUPERLUXO"] },
  { padrao: "LUXO", termos: ["LUXO"] },
  { padrao: "CREMACAO", termos: ["CREMAÇÃO", "CREMACAO", "CREMATORIO"] },
  { padrao: "DOADOR_DE_ORGAOS", termos: ["DOADOR DE ORGÃOS", "DOADOR DE ORGAOS", "DOADOR"] },
  { padrao: "GRATUITO", termos: ["GRATUITO", "GRATUIDADE"] },
  { padrao: "PADRAO", termos: ["PADRAO", "PADRÃO", "JADE"] },
];

export interface PadraoResult {
  padrao: PadraoFuneral;
  textoOrigem: string;
  origemCampo: string;
  confianca: number;
}

export function detectarPadraoFuneral(itens: ItemContratado[]): PadraoResult {
  for (const regra of REGRAS) {
    for (const item of itens) {
      const desc = (item.descricao || "").toUpperCase();
      for (const termo of regra.termos) {
        if (desc.includes(termo)) {
          return {
            padrao: regra.padrao,
            textoOrigem: item.descricao,
            origemCampo: "itens.descricao",
            confianca: 0.9,
          };
        }
      }
    }
  }
  return {
    padrao: itens.length ? "NAO_IDENTIFICADO" : "NAO_IDENTIFICADO",
    textoOrigem: "",
    origemCampo: "itens",
    confianca: 0,
  };
}
