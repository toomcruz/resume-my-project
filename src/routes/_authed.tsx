import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Loader2 } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session, loading } = useAuthSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [session, loading, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="bg-transparent">
          <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:px-4">
            <SidebarTrigger className="-ml-1 transition-transform hover:scale-105" />
            <Separator orientation="vertical" className="mx-1 h-5" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
                Apoio ao Atendimento
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 md:px-8 md:py-10 animate-fade-in-soft">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
