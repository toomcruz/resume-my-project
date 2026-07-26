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

function normalizedLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function requestedFields(params: ExtractParams): string[] {
  const fields = new Set(params.fields);
  if (normalizedLabel(params.processLabel).includes("sepultamento")) {
    // Campos sem placeholder visual, mas necessários para preencher corretamente
    // a Ordem de Sepultamento e distinguir declarante, contratante e modalidade.
    for (const field of [
      "nome_declarante",
      "cpf_declarante",
      "rg_declarante",
      "grau_parentesco_declarante",
      "telefone_declarante",
      "endereco_declarante",
      "tipo_contratacao",
      "padrao_funeral",
      "covid_lacrado",
    ]) {
      fields.add(field);
    }
  }
  return Array.from(fields);
}

export async function extractFromImages(params: ExtractParams): Promise<Record<string, string>> {
  const fields = requestedFields(params);
  const fieldsList = fields.length
    ? fields.join(", ")
    : "nome_falecido, cpf, data_nascimento, data_falecimento, data_sepultamento, local_sepultamento, nome_responsavel, cpf_responsavel, endereco, telefone";
  const isSepultamento = normalizedLabel(params.processLabel).includes("sepultamento");

  const sepultamentoRules = isSepultamento
    ? `
Regras específicas da Ordem de Sepultamento:
- DECLARANTE DO ÓBITO tem prioridade absoluta para nome, RG, CPF, endereço, telefone e parentesco do responsável.
- Para nomeResp/nome_responsavel/nome_declarante, use a pessoa indicada como DECLARANTE na Declaração de Óbito. Não use o contratante, pagador, concessionário, falecido ou administrador provisório.
- Para cpfResp/cpf_responsavel/cpf_declarante, use somente o CPF do DECLARANTE DO ÓBITO. Nunca copie outro CPF visível no conjunto de imagens.
- Para parent/parentesco/grau_parentesco_declarante, copie o parentesco do DECLARANTE exatamente como aparece na Declaração de Óbito, por exemplo GENRO, FILHO ou ESPOSA. Não deduza e não substitua por outro vínculo encontrado em outro documento.
- Formate CPF como 000.000.000-00 e telefone como (11)00000-0000.
- Na Nota de Contratação, extraia tipo_contratacao e padrao_funeral usando somente uma destas opções: SOCIAL, DOADOR, PADRAO, POPULAR, LUXO ou DE_FORA. Escolha apenas uma e não use o valor total para decidir.
- covid_lacrado deve ser SIM ou NAO somente quando isso estiver explicitamente marcado ou escrito; caso contrário, deixe vazio.
- Em caso de conflito entre documentos, a Declaração de Óbito vence para os dados do declarante e a Nota de Contratação vence para número da nota, agência e modalidade do funeral.`
    : "";

  const systemPrompt = `Você é um assistente que extrai dados de documentos e prints para atendimento em cemitério (${params.processLabel}).
Analise as imagens (RG, CPF, certidões, prints de sistema, etc.) e extraia APENAS os seguintes campos:
${fieldsList}

Regras:
- Retorne SOMENTE JSON válido, sem markdown, sem comentários.
- Use exatamente os nomes dos campos listados como chaves.
- Se um campo não for encontrado, use string vazia "".
- Datas no formato DD/MM/AAAA.
- CPF no formato 000.000.000-00.
${sepultamentoRules}
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
