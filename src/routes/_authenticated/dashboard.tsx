import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, FileText, Plus, Search, X } from "lucide-react";

import { AppShell, useMe } from "@/components/portal/AppShell";
import { getStats, listReports } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_LABEL, formatBytes, formatDate, type Status } from "@/lib/portal-helpers";
import { ReportPreview, usePreviewUrls } from "@/components/portal/ReportPreview";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel de informes | Alena - Informes" },
      {
        name: "description",
        content:
          "Consulta los informes recientes de tus Procesos, filtra por departamento y busca por título.",
      },
      { property: "og:title", content: "Panel de informes | Alena - Informes" },
      {
        property: "og:description",
        content:
          "Consulta los informes recientes de tus Procesos, filtra por departamento y busca por título.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const statusVariant: Record<Status, string> = {
  nuevo: "bg-primary/10 text-primary",
  en_revision: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  revisado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

function DashboardPage() {
  const { data: me } = useMe();
  const fetchReports = useServerFn(listReports);
  const fetchStats = useServerFn(getStats);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const areas = me?.areas ?? [];
  const selectedAreas = useMemo(
    () => areas.filter((a) => selectedAreaIds.includes(a.id)),
    [areas, selectedAreaIds],
  );

  const reports = useQuery({
    queryKey: ["reports", selectedAreaIds, search],
    queryFn: () =>
      fetchReports({
        data: {
          ...(selectedAreaIds.length ? { areaIds: selectedAreaIds } : {}),
          ...(search ? { search } : {}),
        },
      }),
  });
  const previews = usePreviewUrls(
    (reports.data ?? []).map((r) => (r.report_versions as { id: string } | null)?.id),
  );
  const stats = useQuery({
    queryKey: ["stats", selectedAreaIds],
    queryFn: () => fetchStats({ data: selectedAreaIds.length ? { areaIds: selectedAreaIds } : {} }),
  });

  return (
    <AppShell>
      <div className="mx-auto  px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Panel de informes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Informes recientes de {me?.areas?.length ?? 0} proceso(s) con acceso.
            </p>
          </div>
          <Button asChild>
            <Link to="/upload">
              <Plus className="size-4" /> Cargar nuevo informe
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Informes", value: stats.data?.total ?? 0 },
            { label: "Pendientes", value: stats.data?.pending ?? 0 },
            { label: "Aprobados", value: stats.data?.reviewed ?? 0 },
            { label: "Visualizaciones", value: stats.data?.views ?? 0 },
            { label: "Almacenado", value: formatBytes(stats.data?.bytes ?? 0) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar informe por título…"
              className="pl-9"
              maxLength={120}
            />
          </div>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={selectedAreaIds.length ? "secondary" : "outline"}
                className="min-w-44 justify-between gap-2"
              >
                <span className="truncate">
                  {selectedAreaIds.length === 0
                    ? "Filtrar por proceso"
                    : selectedAreaIds.length === 1
                      ? selectedAreas[0]?.name
                      : `${selectedAreaIds.length} procesos seleccionados`}
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar proceso…" />
                <CommandList>
                  <CommandEmpty>No se encontraron procesos.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setSelectedAreaIds([]);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedAreaIds.length === 0}
                        className="mr-2"
                        aria-hidden
                        tabIndex={-1}
                      />
                      <span className={cn(selectedAreaIds.length === 0 && "font-medium")}>
                        Todas las Procesos
                      </span>
                      {selectedAreaIds.length === 0 && (
                        <Check className="ml-auto size-4 text-primary" />
                      )}
                    </CommandItem>
                    {areas.map((area) => {
                      const checked = selectedAreaIds.includes(area.id);
                      return (
                        <CommandItem
                          key={area.id}
                          onSelect={() => {
                            setSelectedAreaIds((prev) =>
                              prev.includes(area.id)
                                ? prev.filter((id) => id !== area.id)
                                : [...prev, area.id],
                            );
                          }}
                          className="cursor-pointer"
                        >
                          <Checkbox checked={checked} className="mr-2" aria-hidden tabIndex={-1} />
                          <span className={cn(checked && "font-medium")}>{area.name}</span>
                          {checked && <Check className="ml-auto size-4 text-primary" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedAreaIds.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => setSelectedAreaIds([])}
            >
              <X className="size-4" />
              Limpiar
            </Button>
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}

          {reports.data?.map((report) => {
            const area = report.areas as { name: string; color: string | null } | null;
            const version = report.report_versions as {
              id: string;
              version: string;
              size_bytes: number;
              created_at: string;
            } | null;
            const previewUrl = version?.id ? previews.data?.[version.id] : undefined;
            const authorName = report.author_name;
            return (
              <Link
                key={report.id}
                to="/reports/$reportId"
                params={{ reportId: report.id }}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <ReportPreview
                  url={previewUrl}
                  title={report.title as string}
                  className="mb-4 h-32 w-full"
                />
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      backgroundColor: `${area?.color ?? "#1e40af"}1a`,
                      color: area?.color ?? "#1e40af",
                    }}
                  >
                    {area?.name ?? "Sin proceso"}
                  </span>
                  <Badge
                    variant="secondary"
                    className={statusVariant[(report.status as Status) ?? "nuevo"]}
                  >
                    {STATUS_LABEL[(report.status as Status) ?? "nuevo"]}
                  </Badge>
                </div>
                <h2 className="mt-4 font-display text-base font-semibold leading-snug group-hover:text-primary overflow-hidden text-ellipsis whitespace-nowrap">
                  {report.title}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {report.description ?? "Sin descripción"}
                </p>
                <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" />
                    {version?.version ?? "v1.0.0"} · {formatBytes(Number(version?.size_bytes ?? 0))}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Eye className="size-3" />
                      {Number(report.view_count ?? 0)}
                    </span>
                    {formatDate(report.created_at as string)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {authorName ?? "Autor desconocido"}
                </p>
              </Link>
            );
          })}
        </div>

        {reports.data?.length === 0 && !reports.isLoading && (
          <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no hay informes visibles. Carga el primero para empezar.
            </p>
            <Button asChild className="mt-4">
              <Link to="/upload">Cargar informe</Link>
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
