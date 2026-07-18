/**
 * Extração por imagem — uma chamada à IA por imagem, resposta validada
 * com Zod. Um retry único quando o schema falha. Sem PII nos logs.
 *
 * Server-only. Nunca importe deste arquivo em código de cliente.
 */
import {
  parseImageExtractionResponse,
  type ImageExtractionResponse,
} from "@/lib/vision/schema";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Modelo Pro para OCR de fotos/prints (melhor leitura de manuscritos,
// documentos rotacionados, baixa iluminação e telas de sistema).
const MODEL_PRIMARY = "google/gemini-3-pro-preview";
// Fallback rápido quando o Pro estiver indisponível ou lento.
const MODEL_FALLBACK = "google/gemini-3-flash-preview";

export type ExtractImageInput = {
  imageId: string;
  imageUrl: string; // https URL ou data:image/...;base64,...
  processLabel: string;
  contextHints?: string;
  expectedCanonicalKeys?: string[];
};

export type ExtractImageOutcome =
  | { ok: true; data: ImageExtractionResponse; durationMs: number }
  | { ok: false; error: string; durationMs: number };

type CallDeps = {
  fetch?: typeof fetch;
  apiKey?: string;
};

function buildSystemPrompt(params: ExtractImageInput): string {
  const expected = params.expectedCanonicalKeys?.length
    ? `\nCampos canônicos esperados (use estas chaves em "canonicalKey"): ${params.expectedCanonicalKeys.join(", ")}`
    : "";
  const hints = params.contextHints ? `\nContexto: ${params.contextHints}` : "";
  return `Você é um OCR forense especializado em documentos brasileiros de cemitério
(${params.processLabel}): RG, CPF, CNH, certidões, declarações, comprovantes,
recibos, livros de registro, cadastros de jazigo e prints de sistemas internos.

QUALIDADE DE LEITURA (foco absoluto):
- Trate fotos e prints como podendo estar tortos, desfocados, com reflexo,
  sombra, dobras, marca d'água, timbre ou baixa resolução. Mentalmente rotacione
  e realinhe o texto antes de transcrever.
- Faça OCR minucioso, campo por campo, coluna por coluna. Não pule linhas.
- Diferencie zero (0) de "O", um (1) de "l"/"I", cinco (5) de "S", oito (8)
  de "B". Em caso de dúvida, prefira dígito quando o campo é numérico
  (CPF, RG, datas, número de jazigo, quadra, gaveta, livro, folha).
- Preserve acentuação, hífens, apóstrofos e espaços dos nomes exatamente
  como no documento. Mantenha grafia original (ex.: "D'Angelo", "São José").
- Preserve zeros à esquerda em livro, folha, inscrição, quadra, gaveta e placa.
- Datas SEMPRE em DD/MM/AAAA. Se só houver mês/ano, deixe o dia vazio.
- CPF em 000.000.000-00; RG mantém pontuação original ou X final se houver.
- Endereços: mantenha abreviações do documento (R., Av., Trav.) e número/CEP.
- Texto manuscrito: transcreva apenas quando legível; use warnings quando ilegível.
- Prints de sistema: leia rótulo + valor. Ignore cabeçalho de menu e navegação.

Sua resposta DEVE ser JSON válido no formato exato:
{
  "imageId": string,
  "documentType": um dos: rg, cpf, cnh, documento_identidade, comprovante_residencia,
    certidao_obito, declaracao_obito, tela_sistema_interno, cadastro_jazigo,
    registro_jazigo, documento_sepultamento, documento_exumacao,
    documento_ossuario, documento_translado, recibo, livro_registro, desconhecido,
  "documentTypeConfidence": número 0..1,
  "documentTypeReason": string,
  "persons": Array<{
    "temporaryId": string único na imagem,
    "name": string,
    "cpf"?: string, "rg"?: string, "birthDate"?: string,
    "address"?: string, "phone"?: string, "email"?: string,
    "roleCandidates": Array<{ "role": papel, "confidence": 0..1, "evidence": string }>
  }>,
  "fields": Array<{ "canonicalKey": string, "value": string,
    "confidence": 0..1, "evidence": string, "entityTemporaryId"?: string }>,
  "warnings": string[]
}

Regras estritas:
- Retorne SOMENTE JSON. Sem markdown, sem comentários.
- imageId deve valer EXATAMENTE "${params.imageId}".
- Nunca invente dados. Se um campo não aparece na imagem, não inclua.
- Se o valor está parcialmente ilegível, deixe fora e registre em warnings
  ("CPF parcialmente ilegível", "data do óbito borrada", etc.).
- confidence reflete a legibilidade real: 0.95+ apenas quando o texto está
  nítido; 0.5-0.7 para leitura provável mas com ambiguidade; <0.5 quando há
  dúvida real entre alternativas.
- evidence deve citar literalmente o trecho lido do documento.
- Titular de certidão/declaração de óbito é candidato forte a "falecido_*",
  nunca a "responsavel".
- Declarante da certidão de óbito NUNCA é responsável automaticamente.
- Concessionário exige evidência específica ("concessionário", "permissionário",
  "titular da concessão", cadastro de jazigo). Não presuma.${expected}${hints}`;
}

async function callOnce(
  params: ExtractImageInput,
  attempt: number,
  deps: CallDeps,
  model: string = MODEL_PRIMARY,
): Promise<ExtractImageOutcome> {
  const started = Date.now();
  const apiKey = deps.apiKey ?? process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "LOVABLE_API_KEY não configurada", durationMs: 0 };
  }
  const doFetch = deps.fetch ?? fetch;

  const userText =
    attempt === 0
      ? `Analise a imagem com OCR minucioso e retorne o JSON descrito. Leia CADA campo visível, inclusive rodapé, carimbos e anotações à mão. imageId = "${params.imageId}".`
      : `A resposta anterior não passou pelo validador. Retorne EXATAMENTE um JSON no formato descrito, sem texto ao redor. imageId = "${params.imageId}".`;

  let res: Response;
  try {
    res = await doFetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildSystemPrompt(params) },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: params.imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "falha de rede",
      durationMs: Date.now() - started,
    };
  }

  if (!res.ok) {
    if (res.status === 429) {
      return {
        ok: false,
        error: "Limite de requisições atingido. Tente novamente em instantes.",
        durationMs: Date.now() - started,
      };
    }
    if (res.status === 402) {
      return {
        ok: false,
        error: "Créditos de IA esgotados. Adicione créditos no workspace.",
        durationMs: Date.now() - started,
      };
    }
    return {
      ok: false,
      error: `Falha na extração (HTTP ${res.status})`,
      durationMs: Date.now() - started,
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "resposta não é JSON", durationMs: Date.now() - started };
  }

  const text =
    (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
      ?.content ?? "";

  const parsed = parseImageExtractionResponse(text);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, durationMs: Date.now() - started };
  }
  // Sobrescreve imageId para evitar que a IA use um valor divergente.
  return {
    ok: true,
    data: { ...parsed.data, imageId: params.imageId },
    durationMs: Date.now() - started,
  };
}

/**
 * Extrai dados de UMA imagem. Retry único quando o schema falha.
 * Nunca lança — devolve outcome. Logs sem PII.
 */
export async function extractSingleImage(
  params: ExtractImageInput,
  deps: CallDeps = {},
): Promise<ExtractImageOutcome> {
  const first = await callOnce(params, 0, deps, MODEL_PRIMARY);
  if (first.ok) return first;

  // Retry por schema/JSON no mesmo modelo.
  const schemaRetryable =
    /JSON|schema|resposta vazia|resposta não é objeto|não é JSON válido|JSON vazio/i.test(
      first.error,
    );
  if (schemaRetryable) {
    const second = await callOnce(params, 1, deps, MODEL_PRIMARY);
    if (second.ok) return second;
  }

  // Fallback para modelo Flash quando o Pro falha por HTTP transitório
  // (5xx, timeout, indisponibilidade) — mantém a extração funcional.
  const httpFallback = /HTTP 5\d\d|falha de rede|timeout|indisponí|unavailable/i.test(first.error);
  if (httpFallback) {
    const fallback = await callOnce(params, 0, deps, MODEL_FALLBACK);
    return fallback;
  }

  return first;
}
