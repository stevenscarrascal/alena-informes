import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileArchive, UploadCloud } from "lucide-react";

import { AppShell, useMe } from "@/components/portal/AppShell";
import {
  MAX_UPLOAD_BYTES,
  prepareUpload,
  uploadReport,
  type PreparedUpload,
} from "@/lib/report-upload";
import { canUploadToArea } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UploadSearch = {
  reportId?: string | undefined;
  areaId?: string | undefined;
  title?: string | undefined;
};

export const Route = createFileRoute("/_authenticated/upload")({
  validateSearch: (search: Record<string, unknown>): UploadSearch => ({
    reportId: typeof search["reportId"] === "string" ? search["reportId"] : undefined,
    areaId: typeof search["areaId"] === "string" ? search["areaId"] : undefined,
    title: typeof search["title"] === "string" ? search["title"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Cargar informe | Alena - Informes" },
      {
        name: "description",
        content:
          "Sube un informe en HTML o un ZIP con index.html, CSS y JS al proceso correspondiente.",
      },
      { property: "og:title", content: "Cargar informe | Alena - Informes" },
      {
        property: "og:description",
        content:
          "Sube un informe en HTML o un ZIP con index.html, CSS y JS al proceso correspondiente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/_authenticated/upload" });

  const [title, setTitle] = useState(search.title ?? "");
  const [description, setDescription] = useState("");
  const [areaId, setAreaId] = useState(search.areaId ?? "");
  const [prepared, setPrepared] = useState<PreparedUpload | null>(null);
  const [fileName, setFileName] = useState("");
  const [entryPath, setEntryPath] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const viewer = me?.viewer ?? null;
  const uploadAreas = (me?.areas ?? []).filter((area) => canUploadToArea(viewer, area.id));

  async function handleFile(file: File) {
    try {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error("El archivo supera el límite de 15 MB");
      }
      const result = await prepareUpload(file);
      setPrepared(result);
      setFileName(file.name);
      setEntryPath(result.entryPath ?? "");
      if (!title) setTitle(file.name.replace(/\.(zip|html?)$/i, ""));
      if (!result.entryPath) {
        toast.info("El ZIP no tiene index.html: indica cuál es el archivo principal");
      }
    } catch (error) {
      setPrepared(null);
      toast.error(error instanceof Error ? error.message : "No se pudo leer el archivo");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!prepared) {
      toast.error("Adjunta un archivo .html o .zip");
      return;
    }
    if (!areaId) {
      toast.error("Selecciona el proceso responsable");
      return;
    }
    if (!canUploadToArea(viewer, areaId)) {
      toast.error("No perteneces al proceso seleccionado");
      return;
    }
    if (!entryPath) {
      toast.error("Indica cuál es el archivo HTML principal");
      return;
    }

    setBusy(true);
    setProgress(2);
    try {
      const result = await uploadReport(
        prepared,
        {
          title,
          areaId,
          entryPath,
          ...(description ? { description } : {}),
          ...(search.reportId ? { reportId: search.reportId } : {}),
        },
        setProgress,
      );
      setProgress(100);
      await queryClient.invalidateQueries();
      toast.success("Informe publicado");
      navigate({ to: "/reports/$reportId", params: { reportId: result.reportId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo publicar el informe");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-5 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {search.reportId ? "Nueva versión del informe" : "Cargar nuevo informe"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admite un archivo .html o un .zip con index.html junto a sus CSS y JS.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="title">Título del informe</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Auditoría de servidores Q3"
              required
              maxLength={140}
            />
          </div>

          <div className="space-y-2">
            <Label>Proceso responsable</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un proceso" />
              </SelectTrigger>
              <SelectContent>
                {uploadAreas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción breve</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Resumen del contenido del informe"
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <UploadCloud className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Arrastra tu archivo aquí</p>
            <p className="text-xs text-muted-foreground">.html o .zip (máx. 15 MB)</p>
            <input
              id="file"
              type="file"
              accept=".html,.htm,.zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => document.getElementById("file")?.click()}
            >
              Seleccionar archivo
            </Button>
            {prepared && (
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <FileArchive className="size-3" /> {fileName} · {prepared.fileCount} archivo(s)
              </p>
            )}
          </div>

          {prepared && prepared.htmlCandidates.length > 1 && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
              <Label>Archivo HTML principal</Label>
              <p className="text-xs text-muted-foreground">
                El ZIP contiene varios HTML. Elige el que abre el informe.
              </p>
              <Select value={entryPath} onValueChange={setEntryPath}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el HTML principal" />
                </SelectTrigger>
                <SelectContent>
                  {prepared.htmlCandidates.map((candidate) => (
                    <SelectItem key={candidate} value={candidate}>
                      {candidate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {busy && <Progress value={progress} />}

          {!uploadAreas.length && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Aún no perteneces a ningún proceso. Pide a un administrador que te asigne uno para poder
              publicar informes.
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy || !uploadAreas.length}>
            {busy ? "Publicando…" : "Publicar informe"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
