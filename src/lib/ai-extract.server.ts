// Server-only helper: extrai dados estruturados com Gemini via Supabase.
import { callAIGateway } from "@/lib/ai-gateway.server";

export interface ExtractParams {
  imageDataUrls: string[]; // data:image/...;base64,... OR https URLs
  fields: string[]; // placeholder names to fill
  processLabel: string;
  contextHints?: string;
  model?: string; // default gemini-2.5-flash
  timeoutMs?: number; // default 20000
}

export async function extractFromImages(params: ExtractParams): Promise<Record<string, string>> {
  const fieldsList = params.fields.length
    ? params.fields.join(", ")
    : "nome_falecido, cpf, data_nascimento, data_falecimento, data_sepultamento, local_sepultamento, nome_responsavel, cpf_responsavel, endereco, telefone";

  const systemPrompt = `Você é um assistente que extrai dados de documentos e prints para atendimento em cemitério (${params.processLabel}).
Analise as imagens (RG, CPF, certidões, prints de sistema, etc.) e extraia APENAS os seguintes campos:
${fieldsList}

Regras:
- Retorne SOMENTE JSON válido, sem markdown, sem comentários.
- Use exatamente os nomes dos campos listados como chaves.
- Se um campo não for encontrado, use string vazia "".
- Datas no formato DD/MM/AAAA.
- CPF no formato 000.000.000-00.
${params.contextHints ? `\nContexto adicional: ${params.contextHints}` : ""}`;

  const content: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [
    { type: "text", text: "Extraia os dados das imagens abaixo em JSON." },
    ...params.imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 20000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await callAIGateway(
      {
        model: params.model ?? "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      },
      { signal: controller.signal },
    );
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name === "AbortError") {
      throw new Error("A IA demorou demais para responder. Tente novamente.");
    }
    throw e;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) {
      throw new Error("Limite da API Gemini atingido. Tente novamente em instantes.");
    }
    if (res.status === 402) throw new Error("Créditos da API Gemini esgotados.");
    throw new Error(`Falha na extração (${res.status}): ${body}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(text);
    // normalize to strings
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = v == null ? "" : String(v);
    }
    return out;
  } catch {
    return {};
  }
}
