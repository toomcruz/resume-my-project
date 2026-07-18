import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { CalendarDays, FileStack, FileText, LayoutDashboard, LogOut, Plus } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { title: "Atendimentos", url: "/dashboard", icon: LayoutDashboard },
  { title: "Agenda", url: "/agenda", icon: CalendarDays },
  { title: "Modelos", url: "/modelos", icon: FileStack },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (url: string) =>
    url === "/dashboard"
      ? currentPath === url || currentPath.startsWith("/atendimento")
      : currentPath === url || currentPath.startsWith(`${url}/`);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 px-1 py-1.5 group-data-[collapsible=icon]:justify-center"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <FileText className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display text-sm font-semibold leading-tight tracking-tight text-sidebar-foreground">
                Apoio ao Atendimento
              </div>
              <div className="text-[11px] leading-tight text-sidebar-foreground/60">
                Cartório · IA
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="pt-2">
            <Link to="/atendimento/novo" className="block px-2">
              <Button
                size="default"
                className="w-full gap-2 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0"
              >
                <Plus className="h-5 w-5 shrink-0" />
                {!collapsed && <span>Novo atendimento</span>}
              </Button>
            </Link>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      size="lg"
                      className="[&>svg]:size-5 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground hover:bg-sidebar-accent/60"
                    >
                      <Link to={item.url} className="flex items-center gap-2.5">
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sair"
              size="lg"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth", replace: true });
              }}
              className="[&>svg]:size-5 hover:bg-sidebar-accent/60"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
