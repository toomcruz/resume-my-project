// Configuração pública e única do Supabase atualmente usado pelo Scanne.
// A chave publishable é própria para uso em aplicações cliente. Manter este
// arquivo como fonte única evita que navegador, SSR e Edge Function apontem
// para projetos diferentes durante uma publicação.
export const SCANNE_SUPABASE_PROJECT_REF = "zwbiqywqpllxfdofxtkz";
export const SCANNE_SUPABASE_URL = `https://${SCANNE_SUPABASE_PROJECT_REF}.supabase.co`;
export const SCANNE_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_hZTzedtYG7VIlgRiw77SLw_ZG5VBEty";

export function isScanneSupabaseUrl(value: unknown): boolean {
  return String(value ?? "").includes(SCANNE_SUPABASE_PROJECT_REF);
}
