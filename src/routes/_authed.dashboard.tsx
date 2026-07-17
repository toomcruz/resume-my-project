import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Clock, CheckCircle2 } from "lucide-react";
import { PROCESSES } from "@/lib/processes";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus atendimentos e gere documentos.</p>
        </div>
        <Link to="/atendimento/novo">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Novo atendimento
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : !items?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-medium">Nenhum atendimento ainda</h3>
              <p className="text-sm text-muted-foreground">Comece um novo atendimento e envie prints ou fotos.</p>
            </div>
            <Link to="/atendimento/novo">
              <Button className="gap-2 mt-2">
                <Plus className="h-4 w-4" /> Criar atendimento
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => {
            const proc = PROCESSES.find((p) => p.key === a.process);
            const sm = statusMeta[a.status] ?? statusMeta.draft;
            const Icon = sm.icon;
            return (
              <Link key={a.id} to="/atendimento/$id" params={{ id: a.id }}>
                <Card className="hover:border-primary/50 transition-colors">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">{proc?.label ?? a.process}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.subprocess ? `${a.subprocess} · ` : ""}
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                        </div>
                      </div>
                    </div>
                    <Badge variant={sm.variant} className="gap-1">
                      <Icon className="h-3 w-3" /> {sm.label}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
