import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, FileText, Clock, CheckCircle2, Trash2 } from "lucide-react";
import { PROCESSES } from "@/lib/processes";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/dashboard")({
  component: Dashboard,
});

const statusMeta: Record<string, { label: string; icon: any; variant: any }> = {
  draft: { label: "Rascunho", icon: Clock, variant: "outline" },
  extracting: { label: "Extraindo", icon: Clock, variant: "secondary" },
  reviewing: { label: "Revisão", icon: Clock, variant: "secondary" },
  generating: { label: "Gerando", icon: Clock, variant: "secondary" },
  done: { label: "Concluído", icon: CheckCircle2, variant: "default" },
  error: { label: "Erro", icon: Clock, variant: "destructive" },
};

function Dashboard() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery({
    queryKey: ["attendances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("id, process, subprocess, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atendimento removido");
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao remover"),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      const { error } = await supabase.from("attendances").delete().eq("user_id", uid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Histórico apagado");
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao apagar histórico"),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div className="min-w-0 space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full gradient-accent" />
            Painel
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-gradient md:text-4xl">
            Atendimentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus atendimentos e gere documentos com precisão.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {items && items.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Apagar histórico
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar todo o histórico?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os {items.length} atendimentos, imagens e documentos gerados serão
                    removidos permanentemente. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearAll.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Apagar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Link to="/atendimento/novo">
            <Button className="gap-2 gradient-primary text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5 hover:brightness-110">
              <Plus className="h-4 w-4" /> Novo atendimento
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
          ))}
        </div>
      ) : !items?.length ? (
        <Card className="premium-card border-dashed animate-fade-up stagger-1">
          <CardContent className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-accent text-accent-foreground shadow-[var(--shadow-glow)]">
              <FileText className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-lg font-semibold tracking-tight">Nenhum atendimento ainda</h3>
              <p className="text-sm text-muted-foreground">
                Comece um novo atendimento e envie prints ou fotos.
              </p>
            </div>
            <Link to="/atendimento/novo">
              <Button className="mt-2 gap-2 gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4" /> Criar atendimento
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a, i) => {
            const proc = PROCESSES.find((p) => p.key === a.process);
            const sm = statusMeta[a.status] ?? statusMeta.draft;
            const Icon = sm.icon;
            const delay = `stagger-${Math.min(i + 1, 5)}`;
            return (
              <Card key={a.id} className={`premium-card premium-card-hover animate-fade-up ${delay}`}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <Link
                    to="/atendimento/$id"
                    params={{ id: a.id }}
                    className="flex min-w-0 flex-1 items-center gap-3 group"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/70 text-foreground/80 transition-colors group-hover:bg-accent/15 group-hover:text-accent">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-display font-semibold tracking-tight">
                        {proc?.label ?? a.process}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.subprocess ? `${a.subprocess} · ` : ""}
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={sm.variant} className="gap-1 rounded-full px-2.5">
                      <Icon className="h-3 w-3" /> {sm.label}
                    </Badge>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Apagar atendimento"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Apagar este atendimento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O atendimento e todos os seus arquivos e documentos gerados serão
                            removidos permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteOne.mutate(a.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Apagar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
