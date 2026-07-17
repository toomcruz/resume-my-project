// Server-only helper: call Lovable AI Gateway to extract structured data from images.
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface ExtractParams {
  imageDataUrls: string[]; // data:image/...;base64,... OR https URLs
  fields: string[]; // placeholder names to fill
  processLabel: string;
  contextHints?: string;
}

export async function extractFromImages(params: ExtractParams): Promise<Record<string, string>> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY não configurada");

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

  const content: any[] = [
    { type: "text", text: "Extraia os dados das imagens abaixo em JSON." },
    ...params.imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
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
