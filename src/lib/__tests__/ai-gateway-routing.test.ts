import { describe, expect, it, vi } from "vitest";
import { callAIGateway } from "../ai-gateway.server";
import {
  SCANNE_SUPABASE_PUBLISHABLE_KEY,
  SCANNE_SUPABASE_URL,
} from "@/integrations/supabase/runtime-config";

describe("roteamento da IA", () => {
  it("usa a Edge Function do Supabase ativo em chamadas autenticadas", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    await callAIGateway(
      { model: "gemini-2.5-flash", messages: [{ role: "user", content: "teste" }] },
      {
        fetch: fetchMock as typeof fetch,
        authHeader: "Bearer token-do-usuario",
        apiKey: "chave-direta-que-nao-deve-vencer",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${SCANNE_SUPABASE_URL}/functions/v1/analyze-images`);
    expect(new Headers(init?.headers).get("apikey")).toBe(SCANNE_SUPABASE_PUBLISHABLE_KEY);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-do-usuario");
  });

  it("permite chamada direta somente sem sessão, para desenvolvimento", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    await callAIGateway(
      { model: "gemini-2.5-flash", messages: [{ role: "user", content: "teste" }] },
      { fetch: fetchMock as typeof fetch, apiKey: "chave-local" },
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain("generativelanguage.googleapis.com");
  });
});
