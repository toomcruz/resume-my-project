import { describe, expect, it, vi } from "vitest";
import { callAIGateway } from "../ai-gateway.server";

describe("callAIGateway", () => {
  it("chama diretamente a API oficial do Gemini quando há chave server-only", async () => {
    const doFetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await callAIGateway(
      { model: "gemini-2.5-flash", messages: [] },
      { fetch: doFetch as typeof fetch, apiKey: "gemini-test-key" },
    );

    expect(doFetch).toHaveBeenCalledOnce();
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer gemini-test-key");
  });

  it("usa a Edge Function autenticada do Supabase sem expor chave Gemini", async () => {
    const doFetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await callAIGateway(
      { model: "gemini-2.5-flash", messages: [] },
      {
        fetch: doFetch as typeof fetch,
        authHeader: "Bearer user-jwt",
        supabaseUrl: "https://project.supabase.co/",
        supabasePublishableKey: "sb_publishable_test",
      },
    );

    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe("https://project.supabase.co/functions/v1/analyze-images");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer user-jwt");
    expect(headers.get("apikey")).toBe("sb_publishable_test");
  });
});
