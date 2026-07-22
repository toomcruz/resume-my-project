import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_OPENAI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const MODEL_ALIASES: Record<string, string> = {
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  "google/gemini-3-pro-preview": "gemini-2.5-pro",
};

const ALLOWED_MODELS = new Set(["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]);

const MAX_BODY_BYTES = 18 * 1024 * 1024;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Imagens excedem o limite de 18 MB por análise." }, 413);
  }

  const geminiApiKey =
    Deno.env.get("GEMINI_API_KEY")?.trim() || Deno.env.get("GOOGLE_AI_API_KEY")?.trim();

  if (!geminiApiKey) {
    return jsonResponse({ error: "GEMINI_API_KEY não configurada nos segredos do Supabase." }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo JSON inválido." }, 400);
  }

  const rawModel = typeof payload.model === "string" ? payload.model : "";
  const model = MODEL_ALIASES[rawModel] ?? rawModel;
  if (!ALLOWED_MODELS.has(model)) {
    return jsonResponse({ error: "Modelo Gemini não autorizado." }, 400);
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return jsonResponse({ error: "Mensagens da análise não informadas." }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const response = await fetch(GEMINI_OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${geminiApiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ ...payload, model }),
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return jsonResponse(
      {
        error: isTimeout
          ? "A API Gemini demorou demais para responder."
          : "Falha ao acessar a API Gemini.",
      },
      isTimeout ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }
});
