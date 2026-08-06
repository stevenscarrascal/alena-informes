import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db, reportVersions, viewTokens } from "@/server/db";
import { getObject } from "@/server/storage/s3";
import { REPORT_CSP, sanitizeReportHtml, sanitizeSvg } from "@/lib/report-sanitize";

const TEXT_TYPES: Record<string, string> = {
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

/**
 * Sirve los archivos de un informe con un token temporal.
 *
 * El bucket de S3 es privado: esta ruta es el único camino de lectura, y de
 * paso sanea el HTML y el SVG antes de entregarlos. El token caduca y solo se
 * emite a quien tiene acceso al informe.
 */
export const Route = createFileRoute("/api/public/r/$token/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        const requested = decodeURIComponent(params._splat ?? "");
        if (!/^[a-f0-9]{32,80}$/i.test(token)) {
          return new Response("Token inválido", { status: 400 });
        }
        if (!requested || requested.includes("..") || requested.startsWith("/")) {
          return new Response("Ruta inválida", { status: 400 });
        }

        const [row] = await db
          .select({
            expiresAt: viewTokens.expiresAt,
            storagePrefix: reportVersions.storagePrefix,
          })
          .from(viewTokens)
          .innerJoin(reportVersions, eq(reportVersions.id, viewTokens.versionId))
          .where(eq(viewTokens.token, token))
          .limit(1);

        if (!row) return new Response("Token no encontrado", { status: 404 });
        if (row.expiresAt.getTime() < Date.now()) {
          return new Response("El enlace del informe expiró", { status: 410 });
        }

        const file = await getObject(`${row.storagePrefix}/${requested}`);
        if (!file) return new Response("Archivo no encontrado", { status: 404 });

        const ext = requested.split(".").pop()?.toLowerCase() ?? "";
        const baseHeaders: Record<string, string> = {
          "content-type": TEXT_TYPES[ext] ?? "application/octet-stream",
          "cache-control": "private, max-age=300",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "x-frame-options": "SAMEORIGIN",
        };

        if (ext === "html" || ext === "htm") {
          const { html } = sanitizeReportHtml(file.body.toString("utf8"));
          return new Response(html, {
            headers: { ...baseHeaders, "content-security-policy": REPORT_CSP },
          });
        }

        if (ext === "svg") {
          return new Response(sanitizeSvg(file.body.toString("utf8")), {
            headers: {
              ...baseHeaders,
              "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
            },
          });
        }

        return new Response(new Uint8Array(file.body), { headers: baseHeaders });
      },
    },
  },
});
