/**
 * Gateway server-only para a API Gemini.
 *
 * Em produção, a chamada passa pela Edge Function autenticada do Supabase,
 * mantendo a chave do Gemini fora do navegador e do repositório. Para
 * desenvolvimento/testes, uma GEMINI_API_KEY server-only também é aceita.
 */
import { getRequest } from "@tanstack/react-start/server";

const GEMINI_OPENAI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const EDGE_FUNCTION_NAME = "analyze-images";

export type AIGatewayDeps = {
  fetch?: typeof fetch;
  /** Chave injetável apenas para testes ou execução server-only local. */
  apiKey?: string;
  authHeader?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  signal?: AbortSignal;
};

function serverEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function currentAuthorizationHeader(): string | undefined {
  try {
    return getRequest()?.headers.get("authorization") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function callAIGateway(
  payload: Record<string, unknown>,
  deps: AIGatewayDeps = {},
): Promise<Response> {
  const doFetch = deps.fetch ?? fetch;
  const directGeminiKey =
    deps.apiKey ?? serverEnv("GEMINI_API_KEY") ?? serverEnv("GOOGLE_AI_API_KEY");

  // Útil em desenvolvimento server-only e torna a migração tolerante caso a
  // hospedagem já tenha uma chave Gemini configurada.
  if (directGeminiKey) {
    return doFetch(GEMINI_OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${directGeminiKey}`,
      },
      signal: deps.signal,
      body: JSON.stringify(payload),
    });
  }

  const supabaseUrl = deps.supabaseUrl ?? serverEnv("SUPABASE_URL");
  const publishableKey = deps.supabasePublishableKey ?? serverEnv("SUPABASE_PUBLISHABLE_KEY");
  const authorization = deps.authHeader ?? currentAuthorizationHeader();

  if (!supabaseUrl || !publishableKey || !authorization) {
    throw new Error("Análise de fotos indisponível: configure GEMINI_API_KEY no Supabase.");
  }

  return doFetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${EDGE_FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: authorization,
    },
    signal: deps.signal,
    body: JSON.stringify(payload),
  });
}
