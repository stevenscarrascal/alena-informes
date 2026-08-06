import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/portal/AppShell";
import { getActivity } from "@/lib/portal.functions";
import { formatDateTime } from "@/lib/portal-helpers";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Actividad | Alena - Informes" },
      {
        name: "description",
        content: "Historial de cargas, versiones y cambios de estado de los informes por área.",
      },
      { property: "og:title", content: "Actividad | Alena - Informes" },
      {
        property: "og:description",
        content: "Historial de cargas, versiones y cambios de estado de los informes por área.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityPage,
});

const ACTION_LABEL: Record<string, string> = {
  informe_creado: "creó el informe",
  version_publicada: "publicó una versión",
  estado_actualizado: "actualizó el estado",
  informe_visto: "abrió el informe",
};

function ActivityPage() {
  const fetchActivity = useServerFn(getActivity);
  const activity = useQuery({ queryKey: ["activity"], queryFn: () => fetchActivity({}) });

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">Actividad reciente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Movimientos en los informes de tus áreas.
        </p>

        {activity.isError && (
          <p className="mt-10 rounded-lg border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            La actividad global está disponible para líderes de área y administradores.
          </p>
        )}

        <ul className="mt-6 space-y-2">
          {(activity.data ?? []).map((item) => {
            const area = item.areas as { name: string } | null;
            return (
              <li
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{item.author_name ?? "Alguien"}</span>{" "}
                    {ACTION_LABEL[item.action] ?? item.action}
                    {item.detail ? `: ${item.detail}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{area?.name ?? "Sin área"}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(item.created_at as string)}
                </span>
              </li>
            );
          })}
        </ul>

        {activity.data?.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">Sin actividad todavía.</p>
        )}
      </div>
    </AppShell>
  );
}
