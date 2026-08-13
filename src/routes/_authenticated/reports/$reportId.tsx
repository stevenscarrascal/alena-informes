import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Maximize2, Share2, Trash2, Upload } from "lucide-react";

import { AppShell, useMe } from "@/components/portal/AppShell";
import {
  createViewToken,
  deleteReport,
  getReport,
  registerView,
  setReportStatus,
  setVersionEntryPath,
} from "@/lib/portal.functions";
import {
  STATUS_LABEL,
  formatBytes,
  formatDateTime,
  isApproved,
  type Status,
} from "@/lib/portal-helpers";
import { canAddVersion, canChangeStatus, canDeleteReport } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/reports/$reportId")({
  head: () => ({
    meta: [
      { title: "Informe | Alena - Informes" },
      {
        name: "description",
        content: "Visor interactivo del informe HTML con versiones, estado de revisión y descarga.",
      },
      { property: "og:title", content: "Informe | Alena - Informes" },
      {
        property: "og:description",
        content: "Visor interactivo del informe HTML con versiones, estado de revisión y descarga.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { reportId } = useParams({ from: "/_authenticated/reports/$reportId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const fetchReport = useServerFn(getReport);
  const makeToken = useServerFn(createViewToken);
  const updateStatus = useServerFn(setReportStatus);
  const removeReport = useServerFn(deleteReport);
  const logView = useServerFn(registerView);
  const updateEntryPath = useServerFn(setVersionEntryPath);

  const [versionId, setVersionId] = useState<string>("");
  const [viewerUrl, setViewerUrl] = useState<string>("");
  const [savingEntry, setSavingEntry] = useState(false);

  const query = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => fetchReport({ data: { id: reportId } }),
  });

  const report = query.data?.report;
  const versions = query.data?.versions ?? [];
  const activeVersionId =
    versionId || (report?.current_version_id as string | null) || versions[0]?.id || "";

  useEffect(() => {
    if (!activeVersionId) return;
    let cancelled = false;
    void makeToken({ data: { versionId: activeVersionId } })
      .then((result) => {
        if (!cancelled) setViewerUrl(result.url);
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "No se pudo abrir el informe"),
      );
    return () => {
      cancelled = true;
    };
  }, [activeVersionId, makeToken]);

  useEffect(() => {
    if (report?.id) void logView({ data: { id: report.id as string } });
  }, [report?.id, logView]);

  async function changeStatus(status: Status) {
    await updateStatus({ data: { id: reportId, status } });
    await queryClient.invalidateQueries();
    toast.success("Estado actualizado");
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar este informe y todas sus versiones?")) return;
    await removeReport({ data: { id: reportId } });
    await queryClient.invalidateQueries();
    toast.success("Informe eliminado");
    navigate({ to: "/dashboard" });
  }

  const area = report?.areas as { name: string; color: string | null; id: string } | null;
  const viewer = me?.viewer ?? null;
  const reportRef = {
    area_id: (report?.area_id as string | undefined) ?? area?.id ?? null,
    author_id: (report?.author_id as string | undefined) ?? null,
  };
  const mayChangeStatus = canChangeStatus(viewer, reportRef);
  const mayDelete = canDeleteReport(viewer, reportRef);
  const mayAddVersion = canAddVersion(viewer, reportRef);

  const activeVersion = versions.find((version) => version.id === activeVersionId);
  const htmlPages = ((activeVersion?.html_pages as string[] | null) ?? []).filter(Boolean);
  const currentEntry = (activeVersion?.entry_path as string | undefined) ?? "";

  async function changeEntryPath(page: string) {
    if (!activeVersionId || page === currentEntry) return;
    setSavingEntry(true);
    try {
      await updateEntryPath({ data: { versionId: activeVersionId, entryPath: page } });
      await queryClient.invalidateQueries();
      const result = await makeToken({ data: { versionId: activeVersionId } });
      setViewerUrl(result.url);
      toast.success("Página principal actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar la página");
    } finally {
      setSavingEntry(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto  px-8 py-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Volver al panel
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: `${area?.color ?? "#1e40af"}1a`,
                  color: area?.color ?? "#1e40af",
                }}
              >
                {area?.name ?? "Sin proceso"}
              </span>
              <Badge variant="secondary">
                {STATUS_LABEL[(report?.status as Status) ?? "nuevo"]}
              </Badge>
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
              {report?.title ?? "Cargando…"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {report?.description ?? ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {report?.author_name ?? "Autor"} ·{" "}
              {report?.created_at ? formatDateTime(report.created_at as string) : ""} ·{" "}
              {Number(report?.view_count ?? 0)} visualizaciones
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={activeVersionId} onValueChange={setVersionId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Versión" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {version.version} · {formatBytes(Number(version.size_bytes))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
                toast.success("Enlace copiado");
              }}
            >
              <Share2 className="size-4" /> Compartir
            </Button>
            <Button variant="outline" asChild disabled={!viewerUrl}>
              <a href={viewerUrl || "#"} target="_blank" rel="noreferrer">
                <Maximize2 className="size-4" /> Pantalla completa
              </a>
            </Button>
            {mayAddVersion && (
              <Button asChild>
                <Link
                  to="/upload"
                  search={{
                    reportId,
                    areaId: area?.id,
                    title: (report?.title as string) ?? "",
                  }}
                >
                  <Upload className="size-4" /> Nueva versión
                </Link>
              </Button>
            )}
          </div>
        </div>

        {report && !isApproved(report.status as string) && (
          <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            Este informe está <strong>pendiente de aprobación</strong>. Solo lo ven su autor, el
            líder del proceso y los administradores hasta que se apruebe.
          </div>
        )}

        {(mayChangeStatus || mayDelete) && (
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Aprobación
            </span>
            {mayChangeStatus && (
              <>
                {report?.status !== "revisado" ? (
                  <>
                    <Button size="sm" onClick={() => void changeStatus("revisado")}>
                      Aprobar y publicar
                    </Button>
                    <Button
                      size="sm"
                      variant={report?.status === "en_revision" ? "secondary" : "outline"}
                      onClick={() => void changeStatus("en_revision")}
                    >
                      Marcar en revisión
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void changeStatus("en_revision")}
                  >
                    Retirar aprobación
                  </Button>
                )}
              </>
            )}
            {!mayChangeStatus && (
              <span className="text-xs text-muted-foreground">
                Solo el líder del proceso o un administrador puede aprobar.
              </span>
            )}
            {mayDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => void handleDelete()}
              >
                <Trash2 className="size-4" /> Eliminar
              </Button>
            )}
          </div>
        )}

        {htmlPages.length > 1 && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Página principal
            </span>
            <Select
              value={currentEntry}
              onValueChange={(page) => void changeEntryPath(page)}
              disabled={!mayAddVersion || savingEntry}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Selecciona la página" />
              </SelectTrigger>
              <SelectContent>
                {htmlPages.map((page) => (
                  <SelectItem key={page} value={page}>
                    {page}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {mayAddVersion
                ? "Se usa en el visor y en la miniatura del informe."
                : "Solo el autor o el líder del proceso puede cambiarla."}
            </span>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span>Visor interactivo{currentEntry ? ` · ${currentEntry}` : ""}</span>

            {viewerUrl && (
              <a
                href={viewerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Abrir en pestaña <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {viewerUrl ? (
            <iframe
              key={viewerUrl}
              src={viewerUrl}
              title={(report?.title as string) ?? "Informe"}
              className="h-[70vh] w-full bg-white"
              sandbox="allow-scripts allow-downloads"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
              Preparando el informe…
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-display text-sm font-semibold">
            Historial de versiones
          </h2>
          <ul className="divide-y divide-border">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium">{version.version}</span>
                <span className="text-muted-foreground">
                  {version.file_count} archivo(s) · {formatBytes(Number(version.size_bytes))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(version.created_at as string)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
