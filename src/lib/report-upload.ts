import JSZip from "jszip";

/**
 * Lado cliente de la publicación de informes.
 *
 * El navegador ya no sube archivos al almacenamiento: solo inspecciona el
 * paquete para poder ofrecer el selector de página principal, y envía el
 * archivo original al servidor, que es quien descomprime, valida y sube a S3.
 */

export type PreparedUpload = {
  file: File;
  htmlCandidates: string[];
  entryPath: string | null;
  fileCount: number;
  totalBytes: number;
};

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function stripCommonRoot(paths: string[]): string | null {
  const roots = new Set(paths.map((p) => (p.includes("/") ? p.split("/")[0] : "")));
  if (roots.size !== 1) return null;
  const root = [...roots][0] ?? "";
  return root === "" ? null : root;
}

/** Inspecciona un .html o un .zip sin subir nada. */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".html") || name.endsWith(".htm")) {
    return {
      file,
      htmlCandidates: ["index.html"],
      entryPath: "index.html",
      fileCount: 1,
      totalBytes: file.size,
    };
  }

  if (!name.endsWith(".zip")) {
    throw new Error("Formato no admitido. Sube un archivo .html o un .zip");
  }

  const zip = await JSZip.loadAsync(file);
  const rawPaths = Object.keys(zip.files).filter(
    (p) => !zip.files[p]?.dir && !p.startsWith("__MACOSX/") && !p.split("/").pop()?.startsWith("."),
  );
  if (!rawPaths.length) throw new Error("El archivo .zip está vacío");

  const root = stripCommonRoot(rawPaths);
  const paths = rawPaths
    .map((rawPath) => (root ? rawPath.slice(root.length + 1) : rawPath))
    .filter(Boolean);

  const htmlCandidates = paths
    .filter((p) => /\.html?$/i.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));

  if (!htmlCandidates.length) {
    throw new Error("El .zip no contiene ningún archivo .html");
  }

  const indexAtRoot = htmlCandidates.find((p) => p.toLowerCase() === "index.html");

  return {
    file,
    htmlCandidates,
    entryPath: indexAtRoot ?? (htmlCandidates.length === 1 ? (htmlCandidates[0] ?? null) : null),
    fileCount: paths.length,
    totalBytes: file.size,
  };
}

export type PublishFields = {
  title: string;
  areaId: string;
  entryPath: string;
  description?: string | undefined;
  reportId?: string | undefined;
};

/**
 * Envía el paquete al servidor.
 *
 * Usa XMLHttpRequest en lugar de fetch porque es la única forma de conocer el
 * progreso de subida y mantener la barra que ya tenía la interfaz.
 */
export function uploadReport(
  prepared: PreparedUpload,
  fields: PublishFields,
  onProgress?: (percent: number) => void,
): Promise<{ reportId: string; versionId: string }> {
  const form = new FormData();
  form.append("file", prepared.file, prepared.file.name);
  form.append("title", fields.title);
  form.append("areaId", fields.areaId);
  form.append("entryPath", fields.entryPath);
  if (fields.description) form.append("description", fields.description);
  if (fields.reportId) form.append("reportId", fields.reportId);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/reports/upload");
    request.withCredentials = true;

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      // Se reserva el último tramo para el procesado en el servidor.
      onProgress?.(Math.round((event.loaded / event.total) * 90));
    });

    request.addEventListener("load", () => {
      let payload: { reportId?: string; versionId?: string; error?: string } = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        reject(new Error("Respuesta inesperada del servidor"));
        return;
      }
      if (request.status >= 200 && request.status < 300 && payload.reportId) {
        resolve({ reportId: payload.reportId, versionId: payload.versionId ?? "" });
      } else {
        reject(new Error(payload.error ?? "No se pudo publicar el informe"));
      }
    });

    request.addEventListener("error", () => reject(new Error("Fallo de red al subir el informe")));
    request.addEventListener("abort", () => reject(new Error("Subida cancelada")));

    request.send(form);
  });
}
