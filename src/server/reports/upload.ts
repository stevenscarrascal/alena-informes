/**
 * Publicación de un informe: descomprime el paquete, lo sube a S3 y registra la
 * versión, todo en el servidor.
 *
 * Antes el navegador subía archivo por archivo directamente al almacenamiento y
 * luego informaba del prefijo, el tamaño y el número de archivos — datos que el
 * cliente controlaba. Ahora lo único que llega del cliente es el archivo
 * original y el entry point elegido; el resto se calcula aquí.
 */
import JSZip from "jszip";
import { eq, sql } from "drizzle-orm";

import { db, newId, reportVersions, reports } from "@/server/db";
import { logActivity } from "@/server/activity";
import { notifyReportSubmitted } from "@/server/reports/notify";
import { putObject } from "@/server/storage/s3";
import { nextVersionLabel, slugify } from "@/lib/portal-helpers";
import { canAddVersion, canUploadToArea, type Viewer } from "@/lib/permissions";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 400;

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  csv: "text/csv",
  pdf: "application/pdf",
};

export function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export class UploadError extends Error {}

type ExtractedFile = { path: string; body: Buffer };

/**
 * Rechaza rutas que se salgan del prefijo del informe. El ZIP viene de fuera,
 * así que se trata como entrada hostil (zip slip).
 */
function safeRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.endsWith("/")) return null;
  if (normalized.includes("..")) return null;
  if (/^[a-zA-Z]:/.test(normalized)) return null;
  if (normalized.length > 300) return null;
  return normalized;
}

function stripCommonRoot(paths: string[]): string | null {
  const roots = new Set(paths.map((p) => (p.includes("/") ? p.split("/")[0] : "")));
  if (roots.size !== 1) return null;
  const root = [...roots][0] ?? "";
  return root === "" ? null : root;
}

/** Expande un .html suelto o un .zip a la lista de archivos a almacenar. */
export async function extractPackage(file: {
  name: string;
  buffer: Buffer;
}): Promise<{ files: ExtractedFile[]; htmlPages: string[]; totalBytes: number }> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".html") || name.endsWith(".htm")) {
    return {
      files: [{ path: "index.html", body: file.buffer }],
      htmlPages: ["index.html"],
      totalBytes: file.buffer.byteLength,
    };
  }

  if (!name.endsWith(".zip")) {
    throw new UploadError("Formato no admitido. Sube un archivo .html o un .zip");
  }

  const zip = await JSZip.loadAsync(file.buffer);
  const rawPaths = Object.keys(zip.files).filter(
    (p) => !zip.files[p]?.dir && !p.startsWith("__MACOSX/") && !p.split("/").pop()?.startsWith("."),
  );
  if (!rawPaths.length) throw new UploadError("El archivo .zip está vacío");
  if (rawPaths.length > MAX_FILES) {
    throw new UploadError(`El .zip contiene demasiados archivos (máximo ${MAX_FILES})`);
  }

  const root = stripCommonRoot(rawPaths);
  const files: ExtractedFile[] = [];
  let totalBytes = 0;

  for (const rawPath of rawPaths) {
    const entry = zip.files[rawPath];
    if (!entry) continue;

    const relative = root ? rawPath.slice(root.length + 1) : rawPath;
    const path = safeRelativePath(relative);
    if (!path) continue;

    const body = Buffer.from(await entry.async("uint8array"));
    totalBytes += body.byteLength;
    // El tamaño descomprimido también se limita: un zip bomb no puede
    // detectarse por el tamaño del archivo subido.
    if (totalBytes > MAX_UPLOAD_BYTES) {
      throw new UploadError("El contenido descomprimido supera el límite de 15 MB");
    }
    files.push({ path, body });
  }

  if (!files.length) throw new UploadError("El .zip no contiene archivos válidos");

  const htmlPages = files
    .map((f) => f.path)
    .filter((p) => /\.html?$/i.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));

  if (!htmlPages.length) throw new UploadError("El .zip no contiene ningún archivo .html");

  return { files, htmlPages, totalBytes };
}

export type PublishInput = {
  viewer: Viewer;
  userId: string;
  reportId?: string | undefined;
  title: string;
  description?: string | undefined;
  areaId: string;
  entryPath: string;
  file: { name: string; buffer: Buffer };
};

/** Sube los archivos y crea el informe o la nueva versión. */
export async function publishReport(
  input: PublishInput,
): Promise<{ reportId: string; versionId: string }> {
  if (!canUploadToArea(input.viewer, input.areaId)) {
    throw new UploadError("No perteneces al área seleccionada");
  }

  let reportId = input.reportId;

  if (reportId) {
    const [existing] = await db
      .select({ areaId: reports.areaId, authorId: reports.authorId })
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);
    if (!existing) throw new UploadError("Informe no encontrado o sin acceso");
    if (!canAddVersion(input.viewer, { area_id: existing.areaId, author_id: existing.authorId })) {
      throw new UploadError("Solo el autor o el líder del área puede publicar nuevas versiones");
    }
  }

  const { files, htmlPages, totalBytes } = await extractPackage(input.file);

  const entryPath = htmlPages.includes(input.entryPath) ? input.entryPath : htmlPages[0]!;
  const storagePrefix = `${input.areaId}/${slugify(input.title)}-${Date.now().toString(36)}`;

  // Primero S3: si falla, no queda una versión apuntando a archivos inexistentes.
  for (const file of files) {
    await putObject(`${storagePrefix}/${file.path}`, file.body, contentTypeFor(file.path));
  }

  const versionId = newId();
  const isNewReport = !reportId;
  let versionLabel = nextVersionLabel(1);

  await db.transaction(async (tx) => {
    if (!reportId) {
      reportId = newId();
      await tx.insert(reports).values({
        id: reportId,
        title: input.title,
        description: input.description ?? null,
        areaId: input.areaId,
        authorId: input.userId,
      });
    }

    // El número de versión se deriva del máximo existente; la restricción
    // única (report_id, version_number) corta cualquier colisión concurrente.
    const [current] = await tx
      .select({ max: sql<number | null>`max(${reportVersions.versionNumber})` })
      .from(reportVersions)
      .where(eq(reportVersions.reportId, reportId));
    const versionNumber = Number(current?.max ?? 0) + 1;
    versionLabel = nextVersionLabel(versionNumber);

    await tx.insert(reportVersions).values({
      id: versionId,
      reportId,
      version: versionLabel,
      versionNumber,
      entryPath,
      htmlPages,
      storagePrefix,
      sizeBytes: totalBytes,
      fileCount: files.length,
      uploadedBy: input.userId,
    });

    await tx
      .update(reports)
      .set({
        currentVersionId: versionId,
        status: versionNumber === 1 ? "nuevo" : "en_revision",
        title: input.title,
        description: input.description ?? null,
      })
      .where(eq(reports.id, reportId));
  });

  await logActivity({
    userId: input.userId,
    areaId: input.areaId,
    reportId: reportId!,
    action: isNewReport ? "informe_creado" : "version_publicada",
    detail: `${input.title} (${versionLabel})`,
  });

  // Quien no es admin ni líder del área no puede aprobar su propio informe:
  // avisa a quienes sí pueden. No debe tumbar la subida si el correo falla.
  const isReviewer = input.viewer.isAdmin || input.viewer.leadAreaIds.includes(input.areaId);
  if (!isReviewer) {
    try {
      await notifyReportSubmitted({
        reportId: reportId!,
        areaId: input.areaId,
        title: input.title,
        versionLabel,
        isNewReport,
        authorId: input.userId,
      });
    } catch (error) {
      console.error("No se pudo enviar el aviso de revisión", error);
    }
  }

  return { reportId: reportId!, versionId };
}
