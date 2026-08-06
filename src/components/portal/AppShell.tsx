import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutGrid,
  Upload,
  Users,
  LogOut,
  FolderKanban,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AlenaLogo, ThemeToggle } from "@/components/portal/theme";
import { getMe } from "@/lib/portal.functions";
import { signOut as signOutFn } from "@/lib/auth.functions";
import { ROLE_LABEL, canViewActivity, roleOf, uploadableAreaIds } from "@/lib/permissions";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function useMe() {
  const fetchMe = useServerFn(getMe);
  return useQuery({ queryKey: ["me"], queryFn: () => fetchMe({}) });
}

function initials(name?: string | null) {
  if (!name) return "US";
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const endSession = useServerFn(signOutFn);

  const viewer = me?.viewer ?? null;
  const role = roleOf(viewer);
  const canUpload = uploadableAreaIds(viewer).length > 0;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  function toggleSidebar() {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", prev ? "0" : "1");
      return !prev;
    });
  }

  const nav = [
    { to: "/dashboard", label: "Panel", icon: LayoutGrid },
    ...(canUpload ? [{ to: "/upload", label: "Cargar informe", icon: Upload }] : []),
    ...(canViewActivity(viewer) ? [{ to: "/activity", label: "Actividad", icon: Activity }] : []),
  ];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await endSession({});
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-sidebar transition-all duration-200 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          className="flex h-24 items-center justify-center gap-3 border-b border-sidebar-border px-4 transition-colors hover:bg-sidebar-accent"
        >
          {collapsed ? (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FolderKanban className="size-5" />
            </div>
          ) : (
            <AlenaLogo className="h-16 w-auto shrink-0" />
          )}
        </button>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
                collapsed && "justify-center px-0",
                pathname === item.to && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          ))}

          {!collapsed && (
            <p className="mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Áreas
            </p>
          )}
          {collapsed && <div className="mt-6" />}
          {(me?.areas ?? []).map((area) => (
            <Link
              key={area.id}
              to="/areas/$areaId"
              params={{ areaId: area.id }}
              title={area.name}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
                collapsed && "justify-center px-0",
                pathname === `/areas/${area.id}` &&
                  "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: area.color ?? "#1e40af" }}
              />
              {!collapsed && <span className="truncate">{area.name}</span>}
            </Link>
          ))}
          {!me?.areas?.length && !collapsed && (
            <p className="px-3 text-xs text-muted-foreground">Sin áreas asignadas todavía.</p>
          )}

          {me?.isAdmin && (
            <>
              <div className="mt-6" />
              <Link
                to="/admin"
                title="Administración"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
                  collapsed && "justify-center px-0",
                  pathname === "/admin" && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <Users className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">Administración</span>}
              </Link>
              <Link
                to="/permissions"
                title="Permisos"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
                  collapsed && "justify-center px-0",
                  pathname === "/permissions" && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <ShieldCheck className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">Permisos</span>}
              </Link>
            </>
          )}
        </nav>

        <div
          className={cn(
            "flex items-center gap-3 border-t border-sidebar-border p-3",
            collapsed && "flex-col gap-2",
          )}
        >
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="text-xs">{initials(me?.profile?.full_name)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {me?.profile?.full_name ?? "Usuario"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
            </div>
          )}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border px-5 md:hidden">
          <AlenaLogo className="h-7 w-auto" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        <div className="flex flex-col gap-2 border-b border-border px-4 py-2 md:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs font-medium"
              >
                {item.label}
              </Link>
            ))}
            {me?.isAdmin && (
              <>
                <Link
                  to="/admin"
                  className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                >
                  Administración
                </Link>
                <Link
                  to="/permissions"
                  className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                >
                  Permisos
                </Link>
              </>
            )}
          </div>
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
