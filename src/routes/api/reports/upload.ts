import { createFileRoute } from "@tanstack/react-router";

import { readSession } from "@/server/auth/session";
import { loadViewer } from "@/server/auth/viewer";
import { MAX_UPLOAD_BYTES, publishReport, UploadError } from "@/server/reports/upload";

/**
 * Publica un informe (o una nueva versión).
 *
 * Es una ruta de servidor y no una server function porque recibe el archivo por
 * multipart: así el navegador puede reportar el progreso de subida con XHR.
 * Se autentica con la misma cookie de sesión que el resto del portal.
 */
export const Route = createFileRoute("/api/reports/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await readSession();
        if (!user) return json({ error: "Sesión no válida o expirada" }, 401);

        // Corta antes de leer el cuerpo cuando el cliente declara el tamaño.
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > MAX_UPLOAD_BYTES * 1.1) {
          return json({ error: "El archivo supera el límite de 15 MB" }, 413);
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "No se pudo leer el formulario" }, 400);
        }

        const file = form.get("file");
        if (!(file instanceof File)) return json({ error: "Falta el archivo" }, 400);
        if (file.size > MAX_UPLOAD_BYTES) {
          return json({ error: "El archivo supera el límite de 15 MB" }, 413);
        }

        const title = text(form, "title");
        const areaId = text(form, "areaId");
        const entryPath = text(form, "entryPath");
        const description = text(form, "description");
        const reportId = text(form, "reportId");

        if (title.length < 3 || title.length > 140) {
          return json({ error: "El título debe tener entre 3 y 140 caracteres" }, 400);
        }
        if (!isUuid(areaId)) return json({ error: "Área no válida" }, 400);
        if (reportId && !isUuid(reportId)) return json({ error: "Informe no válido" }, 400);
        if (!entryPath) return json({ error: "Falta la página principal" }, 400);

        try {
          const result = await publishReport({
            viewer: await loadViewer(user.id),
            userId: user.id,
            ...(reportId ? { reportId } : {}),
            title,
            ...(description ? { description: description.slice(0, 1000) } : {}),
            areaId,
            entryPath,
            file: { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) },
          });
          return json(result, 200);
        } catch (error) {
          if (error instanceof UploadError) return json({ error: error.message }, 400);
          console.error(error);
          return json({ error: "No se pudo publicar el informe" }, 500);
        }
      },
    },
  },
});

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
