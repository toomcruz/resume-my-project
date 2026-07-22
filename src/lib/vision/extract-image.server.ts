/**
 * Extração por imagem — pipeline de alta precisão com verificação em duas
 * passadas quando a confiança agregada é baixa. Resposta sempre validada
 * por Zod. Sem PII nos logs.
 *
 * Server-only. Nunca importe deste arquivo em código de cliente.
 */
import { parseImageExtractionResponse, type ImageExtractionResponse } from "@/lib/vision/schema";
import { callAIGateway } from "@/lib/ai-gateway.server";

// Flash como primário: ~5x mais rápido que o Pro e suficiente para a maioria
// dos prints/documentos. Pro entra apenas na passada de verificação para
// campos com baixa confiança — economiza tempo e créditos sem perder acurácia.
const MODEL_PRIMARY = "gemini-2.5-flash";
const MODEL_VERIFY = "gemini-2.5-pro";
const MODEL_FALLBACK = "gemini-2.5-flash-lite";

const TIMEOUT_PRIMARY_MS = 25000;
const TIMEOUT_VERIFY_MS = 35000;
const TIMEOUT_FALLBACK_MS = 15000;

// Se a mediana das confidences ficar abaixo disto OU houver muitos warnings,
// disparamos uma passada de verificação focada nos campos duvidosos.
const LOW_CONFIDENCE_THRESHOLD = 0.7;

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
  return `Você é um OCR forense sênior especializado em documentos brasileiros de
cemitério (${params.processLabel}): RG, CPF, CNH, certidões, declarações,
comprovantes, recibos, livros de registro, cadastros de jazigo e prints de
sistemas internos (WhatsApp, sistema funerário, planilhas).

METODOLOGIA (SIGA EM ORDEM, SEM PULAR PASSOS):
1. VARREDURA GLOBAL: descreva mentalmente a imagem. Identifique orientação,
   cabeçalho, corpo, rodapé, tabelas, carimbos, assinaturas e manuscritos.
2. CLASSIFICAÇÃO: identifique o tipo de documento e a confiança dessa escolha.
3. VARREDURA DETALHADA: leia CADA campo, linha por linha, coluna por coluna.
   Não pule rodapé, carimbo, marca d'água, anotações à mão, verso ou timbre.
4. VERIFICAÇÃO CRUZADA: reveja nomes, CPFs, RGs e datas dígito por dígito antes
   de escrever a resposta. Se um número não fecha (dígito verificador de CPF,
   data impossível como 32/13/2026), marque em warnings e reduza a confidence.
5. NORMALIZAÇÃO: aplique as regras abaixo antes de emitir o JSON.

DESAMBIGUAÇÃO DE CARACTERES (campos numéricos SEMPRE dígitos):
- 0 vs O/Q, 1 vs l/I/|, 2 vs Z, 5 vs S, 6 vs G, 7 vs T/1, 8 vs B, 9 vs g/q.
- Em CPF, RG, datas, telefone, quadra, gaveta, jazigo, livro, folha, placa
  e CEP, prefira SEMPRE o dígito quando houver dúvida.
- Preserve zeros à esquerda em livro, folha, inscrição, quadra, gaveta, placa
  e códigos internos ("003" NUNCA vira "3").

NORMALIZAÇÃO DE VALORES:
- Nomes: MAIÚSCULAS quando o documento estiver em maiúsculas; caso contrário
  mantenha a capitalização original. Preserve acentos, hífens, apóstrofos e
  espaços exatamente ("D'Angelo", "São José", "Maria da Silva-Santos").
- CPF: 000.000.000-00. RG: mantenha pontuação/dígito X do documento.
- Datas: SEMPRE DD/MM/AAAA. Se só houver mês/ano, deixe o dia vazio e
  registre em warnings. Rejeite datas impossíveis.
- Horas: HH:MM em 24h. "14h30", "2:30 pm" → "14:30".
- Telefone: (DD) 9XXXX-XXXX ou (DD) XXXX-XXXX conforme o documento.
- CEP: 00000-000. Endereço: preserve abreviações (R., Av., Trav., Estr.).
- Placa de veículo: MAIÚSCULAS, formato Mercosul (ABC1D23) ou antigo (ABC-1234).
- Valores em R$: mantenha vírgula decimal e ponto de milhar ("R$ 1.234,56").

PRINTS DE SISTEMA E WHATSAPP:
- Identifique pares rótulo→valor. Ignore chrome do app (barra de status,
  botões, menu, teclado, timestamps do sistema operacional).
- Em conversas: nome do contato no topo é o interlocutor; horários e checks
  ("visto", ✓✓) são metadados, não dados do falecido.
- Fotos de placa/motorista: extraia placa, nome do motorista, empresa e
  horário quando visíveis. Não invente empresa a partir da placa.

REGRAS DE PAPEL (roleCandidates):
- Titular de certidão/declaração de óbito → "falecido_sepultamento" (nunca
  "responsavel").
- Declarante da certidão de óbito NUNCA vira responsável automaticamente.
- Concessionário exige evidência textual explícita ("concessionário",
  "permissionário", "titular da concessão") ou cadastro de jazigo. Não presuma.
- Requerente é quem assina o pedido/formulário no papel de solicitante.

CONFIDENCE (seja honesto — isso dispara reverificação automática):
- 0.95-1.0: texto impresso nítido, sem ambiguidade.
- 0.75-0.94: legível com pequena ambiguidade resolvida por contexto.
- 0.5-0.74: leitura provável, dúvida real entre alternativas.
- <0.5: dúvida forte; ainda assim registre e explique em evidence.

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem comentários):
{
  "imageId": "${params.imageId}",
  "documentType": um de: rg, cpf, cnh, documento_identidade, comprovante_residencia,
    certidao_obito, declaracao_obito, tela_sistema_interno, cadastro_jazigo,
    registro_jazigo, documento_sepultamento, documento_exumacao,
    documento_ossuario, documento_translado, recibo, livro_registro, desconhecido,
  "documentTypeConfidence": 0..1,
  "documentTypeReason": string curta citando pistas visuais,
  "persons": [{
    "temporaryId": string único na imagem (ex.: "p1", "p2"),
    "name": string,
    "cpf"?: string, "rg"?: string, "birthDate"?: string,
    "address"?: string, "phone"?: string, "email"?: string,
    "roleCandidates": [{ "role": papel, "confidence": 0..1, "evidence": string literal }]
  }],
  "fields": [{ "canonicalKey": string, "value": string,
    "confidence": 0..1, "evidence": string literal, "entityTemporaryId"?: string }],
  "warnings": string[]
}

REGRAS INVIOLÁVEIS:
- Retorne SOMENTE JSON. Nada antes, nada depois.
- imageId deve valer EXATAMENTE "${params.imageId}".
- NUNCA invente. Campo ausente = não incluir. Campo parcial = fora + warning.
- evidence cita LITERALMENTE o trecho lido ("consta no doc: ...").
- Se a imagem estiver totalmente ilegível, retorne documentType "desconhecido"
  com confidence baixa e explique em warnings.${expected}${hints}`;
}

function medianConfidence(data: ImageExtractionResponse): number {
  const scores = data.fields.map((f) => f.confidence);
  if (scores.length === 0) return 1; // sem campos, não força reverificação
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function needsVerification(data: ImageExtractionResponse): boolean {
  if (data.documentType === "desconhecido") return false; // não adianta insistir
  const lowFields = data.fields.filter((f) => f.confidence < LOW_CONFIDENCE_THRESHOLD);
  const median = medianConfidence(data);
  const manyWarnings = data.warnings.length >= 3;
  return median < LOW_CONFIDENCE_THRESHOLD || lowFields.length >= 2 || manyWarnings;
}

function mergeExtractions(
  first: ImageExtractionResponse,
  second: ImageExtractionResponse,
): ImageExtractionResponse {
  // Estratégia: preferimos o valor da 2ª passada (verificação focada) quando a
  // confidence sobe; caso contrário mantemos o 1º. Warnings acumulam sem duplicar.
  const fieldMap = new Map(first.fields.map((f) => [f.canonicalKey, f]));
  for (const f of second.fields) {
    const prev = fieldMap.get(f.canonicalKey);
    if (!prev || f.confidence >= prev.confidence) {
      fieldMap.set(f.canonicalKey, f);
    }
  }
  const personMap = new Map(first.persons.map((p) => [p.temporaryId, p]));
  for (const p of second.persons) {
    if (!personMap.has(p.temporaryId)) personMap.set(p.temporaryId, p);
  }
  const warnings = Array.from(new Set([...first.warnings, ...second.warnings]));
  const documentTypeConfidence = Math.max(
    first.documentTypeConfidence,
    second.documentTypeConfidence,
  );
  const useSecondType =
    second.documentType !== "desconhecido" &&
    second.documentTypeConfidence >= first.documentTypeConfidence;
  return {
    imageId: first.imageId,
    documentType: useSecondType ? second.documentType : first.documentType,
    documentTypeConfidence,
    documentTypeReason: useSecondType ? second.documentTypeReason : first.documentTypeReason,
    persons: Array.from(personMap.values()),
    fields: Array.from(fieldMap.values()),
    warnings,
  };
}

type CallMode = "initial" | "schema-retry" | "verification";

async function callOnce(
  params: ExtractImageInput,
  mode: CallMode,
  deps: CallDeps,
  model: string,
  timeoutMs: number,
  priorData?: ImageExtractionResponse,
): Promise<ExtractImageOutcome> {
  const started = Date.now();

  let userText: string;
  if (mode === "initial") {
    userText = `Analise a imagem com OCR minucioso seguindo TODOS os passos da metodologia. Leia rodapé, carimbos, manuscritos e verso quando visíveis. imageId = "${params.imageId}".`;
  } else if (mode === "schema-retry") {
    userText = `Sua resposta anterior não passou pelo validador. Retorne EXATAMENTE um JSON no formato descrito, sem texto ao redor. imageId = "${params.imageId}".`;
  } else {
    // verification pass: mostra os campos duvidosos e pede releitura focada
    const suspects = (priorData?.fields ?? [])
      .filter((f) => f.confidence < LOW_CONFIDENCE_THRESHOLD)
      .map((f) => `- ${f.canonicalKey} = "${f.value}" (conf ${f.confidence.toFixed(2)})`)
      .join("\n");
    userText = `Segunda passada de VERIFICAÇÃO. Você já leu esta imagem, mas alguns
campos ficaram com baixa confiança. Reexamine a imagem com atenção
redobrada, dígito por dígito, e devolva o JSON COMPLETO no mesmo formato,
corrigindo os valores duvidosos e SUBINDO a confidence apenas quando você
tiver certeza real após a segunda leitura.

Campos a reverificar:
${suspects || "(reveja todos os campos numéricos e nomes)"}

imageId = "${params.imageId}".`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await callAIGateway(
      {
        model,
        temperature: 0,
        messages: [
          { role: "system", content: buildSystemPrompt(params) },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              // detail:"high" força a rota de análise em alta resolução no
              // gateway OpenAI-compatible — essencial para prints densos.
              {
                type: "image_url",
                image_url: { url: params.imageUrl, detail: "high" },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      },
      { ...deps, signal: controller.signal },
    );
  } catch (e) {
    clearTimeout(timer);
    const isAbort = (e as Error)?.name === "AbortError";
    return {
      ok: false,
      error: isAbort ? "timeout" : e instanceof Error ? e.message : "falha de rede",
      durationMs: Date.now() - started,
    };
  }
  clearTimeout(timer);

  if (!res.ok) {
    if (res.status === 429) {
      return {
        ok: false,
        error: "Limite da API Gemini atingido. Tente novamente em instantes.",
        durationMs: Date.now() - started,
      };
    }
    if (res.status === 402) {
      return {
        ok: false,
        error: "Créditos da API Gemini esgotados.",
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
  return {
    ok: true,
    data: { ...parsed.data, imageId: params.imageId },
    durationMs: Date.now() - started,
  };
}

/**
 * Extrai dados de UMA imagem em pipeline de alta precisão:
 * 1. Primária no modelo Pro com temperature 0 e detail:high.
 * 2. Retry único (mesmo modelo) quando o schema falha.
 * 3. Verificação focada quando a confiança agregada cai abaixo do limiar
 *    — resultado é mesclado, preservando o melhor valor por campo.
 * 4. Fallback para Flash em erros HTTP transitórios.
 *
 * Nunca lança — devolve outcome. Logs sem PII.
 */
export async function extractSingleImage(
  params: ExtractImageInput,
  deps: CallDeps = {},
): Promise<ExtractImageOutcome> {
  const first = await callOnce(params, "initial", deps, MODEL_PRIMARY, TIMEOUT_PRIMARY_MS);

  if (first.ok) {
    if (!needsVerification(first.data)) return first;
    const verify = await callOnce(
      params,
      "verification",
      deps,
      MODEL_VERIFY,
      TIMEOUT_VERIFY_MS,
      first.data,
    );
    if (verify.ok) {
      return {
        ok: true,
        data: mergeExtractions(first.data, verify.data),
        durationMs: first.durationMs + verify.durationMs,
      };
    }
    // Se a verificação falhar por qualquer motivo, ficamos com o 1º resultado.
    return first;
  }

  // Retry por schema/JSON no mesmo modelo (Pro).
  const schemaRetryable =
    /JSON|schema|resposta vazia|resposta não é objeto|não é JSON válido|JSON vazio/i.test(
      first.error,
    );
  if (schemaRetryable) {
    const second = await callOnce(params, "schema-retry", deps, MODEL_PRIMARY, TIMEOUT_PRIMARY_MS);
    if (second.ok) return second;
  }

  // Fallback para Flash em erros HTTP transitórios — mantém o fluxo funcional
  // mesmo quando o Pro está sobrecarregado.
  const httpFallback = /HTTP 5\d\d|falha de rede|timeout|indisponí|unavailable/i.test(first.error);
  if (httpFallback) {
    const fallback = await callOnce(params, "initial", deps, MODEL_FALLBACK, TIMEOUT_FALLBACK_MS);
    return fallback;
  }

  return first;
}
