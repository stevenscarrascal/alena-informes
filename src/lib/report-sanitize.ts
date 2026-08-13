/**
 * Saneado del HTML de los informes antes de servirlo en el visor.
 * Se ejecuta en el servidor; el iframe siempre corre además en un sandbox
 * de origen opaco, así que esto es una segunda capa de defensa.
 */

/** Dominios permitidos para cargar librerías (gráficas, estilos, fuentes). */
export const ALLOWED_SCRIPT_HOSTS = [
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "cdn.plot.ly",
  "d3js.org",
  "code.jquery.com",
];

const ALLOWED_STYLE_HOSTS = [...ALLOWED_SCRIPT_HOSTS, "fonts.googleapis.com"];
const ALLOWED_FONT_HOSTS = [...ALLOWED_SCRIPT_HOSTS, "fonts.gstatic.com"];

/** Política de contenido aplicada al documento del informe. */
export const REPORT_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${ALLOWED_SCRIPT_HOSTS.map((h) => `https://${h}`).join(" ")}`,
  `style-src 'self' 'unsafe-inline' ${ALLOWED_STYLE_HOSTS.map((h) => `https://${h}`).join(" ")}`,
  `font-src 'self' data: ${ALLOWED_FONT_HOSTS.map((h) => `https://${h}`).join(" ")}`,
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "sandbox allow-scripts allow-downloads",
].join("; ");

function hostAllowed(url: string, allowed: string[]): boolean {
  const value = url.trim();
  if (!value) return false;
  // Rutas relativas del propio informe.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//")) return true;
  if (/^data:image\//i.test(value)) return true;
  try {
    const parsed = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (parsed.protocol !== "https:") return false;
    return allowed.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? "";
}

/**
 * El paquete subido se sirve bajo `/api/public/r/{token}/...`, no en la raíz
 * del sitio. Una ruta como `/img/x.png` —válida cuando el informe vivía en su
 * propio dominio— apunta ahora al router de la app y da 404. Como `<base>`
 * está bloqueado a propósito (podría redirigir todas las rutas relativas a
 * otro origen), la única forma segura de arreglarlo es reescribir cada ruta
 * que empiece por una sola barra al prefijo real del informe.
 *
 * No toca protocolo-relativas (`//cdn...`), absolutas con esquema
 * (`https://...`), ni nada que ya sea relativo (`img/x.png`, `../x.png`):
 * esas ya resuelven bien solas.
 */
function rewriteRootRelative(value: string, basePath: string): string {
  if (!/^\/(?!\/)/.test(value)) return value;
  return basePath + value.slice(1);
}

const URL_ATTRS = /\s(src|href|poster|xlink:href)\s*=\s*("([^"]*)"|'([^']*)')/gi;

function rewriteAttributeUrls(html: string, basePath: string): string {
  return html.replace(
    URL_ATTRS,
    (full, attrName: string, _quoted: string, dq?: string, sq?: string) => {
      const value = dq ?? sq ?? "";
      const rewritten = rewriteRootRelative(value, basePath);
      if (rewritten === value) return full;
      const quote = dq !== undefined ? '"' : "'";
      return ` ${attrName}=${quote}${rewritten}${quote}`;
    },
  );
}

function rewriteSrcset(html: string, basePath: string): string {
  return html.replace(
    /\ssrcset\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (full, _quoted: string, dq?: string, sq?: string) => {
      const raw = dq ?? sq ?? "";
      const rewritten = raw
        .split(",")
        .map((entry) => {
          const trimmed = entry.trim();
          const spaceIdx = trimmed.indexOf(" ");
          const url = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
          const descriptor = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx);
          return rewriteRootRelative(url, basePath) + descriptor;
        })
        .join(", ");
      const quote = dq !== undefined ? '"' : "'";
      return ` srcset=${quote}${rewritten}${quote}`;
    },
  );
}

/** Reescribe `url(/…)` dentro de CSS (bloques `<style>`, atributos `style="…"` o un .css entero). */
export function rewriteCssUrls(css: string, basePath: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote: string, rawUrl: string) => {
    const url = rawUrl.trim();
    const rewritten = rewriteRootRelative(url, basePath);
    if (rewritten === url) return full;
    return `url(${quote}${rewritten}${quote})`;
  });
}

/**
 * Elimina scripts de orígenes no permitidos, marcos anidados, plugins
 * embebidos, `<base>` y URLs `javascript:`. Reescribe además las rutas
 * absolutas del propio paquete para que apunten a `basePath`.
 */
export function sanitizeReportHtml(
  html: string,
  basePath: string,
): { html: string; removed: number } {
  let removed = 0;
  let output = html;

  // <script src="..."> de dominios no permitidos (se elimina el bloque completo).
  output = output.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<script\b[^>]*\/>/gi, (block) => {
    const openTag = /<script\b[^>]*>/i.exec(block)?.[0] ?? block;
    const src = attr(openTag, "src");
    if (src !== null && !hostAllowed(src, ALLOWED_SCRIPT_HOSTS)) {
      removed += 1;
      return `<!-- script externo bloqueado por seguridad -->`;
    }
    return block;
  });

  // <link rel="stylesheet"> externos no permitidos.
  output = output.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attr(tag, "href");
    if (href !== null && !hostAllowed(href, ALLOWED_STYLE_HOSTS)) {
      removed += 1;
      return "<!-- recurso externo bloqueado -->";
    }
    return tag;
  });

  // Marcos anidados y plugins embebidos.
  output = output.replace(
    /<(iframe|object|embed|applet|frame|frameset|portal)\b[\s\S]*?(<\/\1\s*>|>)/gi,
    () => {
      removed += 1;
      return "<!-- contenido embebido bloqueado -->";
    },
  );

  // <base> puede reescribir todas las rutas relativas.
  output = output.replace(/<base\b[^>]*>/gi, () => {
    removed += 1;
    return "";
  });

  // URLs javascript: en atributos.
  output = output.replace(
    /\s(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi,
    () => {
      removed += 1;
      return ' href="#"';
    },
  );

  // <meta http-equiv="refresh"> hacia destinos externos.
  output = output.replace(/<meta\b[^>]*http-equiv\s*=\s*("|')?refresh\1?[^>]*>/gi, () => {
    removed += 1;
    return "";
  });

  // Rutas absolutas (/img/x.png) del propio paquete → prefijo real del informe.
  output = rewriteAttributeUrls(output, basePath);
  output = rewriteSrcset(output, basePath);
  output = rewriteCssUrls(output, basePath);

  const meta = `<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP.replace(/"/g, "'")}">`;
  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (tag) => `${tag}\n${meta}`);
  } else {
    output = `${meta}\n${output}`;
  }

  return { html: output, removed };
}

/** SVG servido directamente: se eliminan scripts y manejadores de eventos. */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "");
}
