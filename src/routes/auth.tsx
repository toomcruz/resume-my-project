import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function normalizeUsername(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "");
}

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuthSession();
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  async function accessWithUsername(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeUsername(username);
    if (clean.length < 3) return toast.error("Use pelo menos 3 caracteres no nome de usuário.");

    try {
      setSubmitting(true);
      const { data, error } = await supabase.functions.invoke("username-login", {
        body: { username: clean },
      });

      if (error) throw error;
      if (!data?.token_hash) throw new Error(data?.error || "Não foi possível gerar a sessão.");

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "email",
      });

      if (verifyError) throw verifyError;
      toast.success("Bem-vindo!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível acessar o sistema.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="p-2 rounded-xl bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <span className="font-semibold text-lg">Apoio ao Atendimento</span>
        </div>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Acessar sistema</CardTitle>
            <CardDescription>Digite seu nome de usuário para continuar.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={accessWithUsername} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Nome de usuário</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex.: tom"
                  required
                  minLength={3}
                  maxLength={40}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Apenas letras, números, ponto, hífen e underline.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Acessar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
