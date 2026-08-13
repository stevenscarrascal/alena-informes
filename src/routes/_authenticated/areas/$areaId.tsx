import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";

import { AppShell, useMe } from "@/components/portal/AppShell";
import { getStats, listReports } from "@/lib/portal.functions";
import { STATUS_LABEL, formatBytes, formatDate, type Status } from "@/lib/portal-helpers";
import { ReportPreview, usePreviewUrls } from "@/components/portal/ReportPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/areas/$areaId")({
  head: () => ({
    meta: [
      { title: "Informes del proceso | Alena - Informes" },
      {
        name: "description",
        content:
          "Listado tabular de los informes del proceso con versión, tamaño, estado y última modificación.",
      },
      { property: "og:title", content: "Informes del proceso | Alena - Informes" },
      {
        property: "og:description",
        content:
          "Listado tabular de los informes del proceso con versión, tamaño, estado y última modificación.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AreaPage,
});

function AreaPage() {
  const { areaId } = useParams({ from: "/_authenticated/areas/$areaId" });
  const { data: me } = useMe();
  const fetchReports = useServerFn(listReports);
  const fetchStats = useServerFn(getStats);

  const area = (me?.areas ?? []).find((a) => a.id === areaId);
  const reports = useQuery({
    queryKey: ["reports", areaId],
    queryFn: () => fetchReports({ data: { areaId } }),
  });
  const previews = usePreviewUrls(
    (reports.data ?? []).map((r) => (r.report_versions as { id: string } | null)?.id),
  );
  const stats = useQuery({
    queryKey: ["stats", areaId],
    queryFn: () => fetchStats({ data: { areaId } }),
  });

  return (
    <AppShell>
      <div className="mx-auto  px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Proceso
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
              {area?.name ?? "Proceso"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {area?.description ?? "Informes publicados por este departamento."}
            </p>
          </div>
          <Button asChild>
            <Link to="/upload" search={{ areaId }}>
              <Plus className="size-4" /> Nuevo informe
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Informes", value: stats.data?.total ?? 0 },
            { label: "Versiones", value: stats.data?.versions ?? 0 },
            { label: "Pendientes", value: stats.data?.pending ?? 0 },
            { label: "Almacenado", value: formatBytes(stats.data?.bytes ?? 0) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Vista previa</TableHead>
                <TableHead>Informe</TableHead>
                <TableHead>Versión</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead className="text-right">Vistas</TableHead>
                <TableHead className="text-right">Modificado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reports.data ?? []).map((report) => {
                const version = report.report_versions as {
                  id: string;
                  version: string;
                  size_bytes: number;
                } | null;
                const previewUrl = version?.id ? previews.data?.[version.id] : undefined;
                return (
                  <TableRow key={report.id}>
                    <TableCell>
                      <Link to="/reports/$reportId" params={{ reportId: report.id }}>
                        <ReportPreview
                          url={previewUrl}
                          title={report.title as string}
                          scale={0.2}
                          className="h-16 w-24"
                        />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/reports/$reportId"
                        params={{ reportId: report.id }}
                        className="font-medium hover:text-primary"
                      >
                        {report.title}
                      </Link>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {report.description ?? "Sin descripción"}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{version?.version ?? "v1.0.0"}</TableCell>
                    <TableCell className="text-sm">
                      {formatBytes(Number(version?.size_bytes ?? 0))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {STATUS_LABEL[(report.status as Status) ?? "nuevo"]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{report.author_name ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {Number(report.view_count ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDate(report.updated_at as string)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {reports.data?.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Este proceso todavía no tiene informes.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
