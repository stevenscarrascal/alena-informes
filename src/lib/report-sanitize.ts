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
  "sandbox allow-scripts allow-popups allow-downloads",
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
 * Elimina scripts de orígenes no permitidos, marcos anidados, plugins
 * embebidos, `<base>` y URLs `javascript:`.
 */
export function sanitizeReportHtml(html: string): { html: string; removed: number } {
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
