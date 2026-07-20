import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.5";

const PROD_ORIGIN = "https://scanne-sistema.eelcruzz.chatgpt.site";

function normalizeUsername(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "");
}

function isAllowedOrigin(origin: string) {
  return (
    origin === PROD_ORIGIN ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origem não autorizada." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    const { username: rawUsername } = await req.json();
    const username = normalizeUsername(rawUsername);

    if (username.length < 3 || username.length > 40) {
      return new Response(
        JSON.stringify({ error: "Use um nome de usuário entre 3 e 40 caracteres." }),
        { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Configuração interna do Supabase indisponível.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const email = `${username}@users.scanne.app`;
    let found = false;

    for (let page = 1; page <= 10 && !found; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      found = data.users.some((user) => user.email === email);
      if (data.users.length < 1000) break;
    }

    if (!found) {
      const { error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { username, full_name: username },
      });

      if (error && !/already.*registered|already.*exists/i.test(error.message)) {
        throw error;
      }
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError) throw linkError;

    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) throw new Error("Não foi possível gerar a sessão.");

    return new Response(JSON.stringify({ token_hash: tokenHash, username }), {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao acessar o sistema.";
    console.error("username-login:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
