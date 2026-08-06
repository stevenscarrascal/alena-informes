/**
 * Acceso tipado a la configuración del backend.
 *
 * Todo se lee de process.env (src/server.ts carga el .env). Ninguna de estas
 * variables lleva prefijo VITE_: nada de esto puede llegar al navegador.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return value === "true" || value === "1";
}

export const isProduction = process.env["NODE_ENV"] === "production";

/** URL pública del portal, sin barra final. Base de los enlaces de correo. */
export function appUrl(): string {
  return optional("APP_URL", "http://localhost:8080").replace(/\/+$/, "");
}

export function sessionSecret(): string {
  return required("SESSION_SECRET");
}

/** Nombres de variables del driver `s3` de Laravel: los mismos que da Herd y DigitalOcean Spaces. */
export function s3Config() {
  const endpoint = optional("AWS_ENDPOINT");
  return {
    bucket: required("AWS_BUCKET"),
    region: optional("AWS_DEFAULT_REGION", "us-east-1"),
    // Vacío = AWS S3 real; con valor = compatible (MinIO, Spaces, R2…).
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: bool("AWS_USE_PATH_STYLE_ENDPOINT", Boolean(endpoint)),
    credentials: {
      accessKeyId: required("AWS_ACCESS_KEY_ID"),
      secretAccessKey: required("AWS_SECRET_ACCESS_KEY"),
    },
  };
}

/**
 * `MAIL_ENCRYPTION` sigue la convención de Laravel: "tls" (STARTTLS explícito,
 * típico en el puerto 587), "ssl" (TLS implícito, típico en el 465) o
 * "null"/vacío (sin cifrado, típico de un buzón de pruebas local).
 */
function mailEncryption(value: string): { secure: boolean; requireTLS?: true; ignoreTLS?: true } {
  switch (value.trim().toLowerCase()) {
    case "ssl":
      return { secure: true };
    case "tls":
      return { secure: false, requireTLS: true };
    default:
      return { secure: false, ignoreTLS: true };
  }
}

export function mailConfig() {
  const username = optional("MAIL_USERNAME");
  const password = optional("MAIL_PASSWORD");
  return {
    host: required("MAIL_HOST"),
    port: Number(optional("MAIL_PORT", "587")),
    ...mailEncryption(optional("MAIL_ENCRYPTION")),
    // Los buzones de prueba (mailpit, el mailcatcher de Herd) no piden
    // credenciales. Si falta la contraseña, Nodemailer igual intenta el
    // mecanismo PLAIN con MAIL_USERNAME y falla con "Missing credentials for
    // PLAIN" — hace falta el par completo, no basta con el usuario.
    ...(username && password ? { auth: { user: username, pass: password } } : {}),
    from: {
      name: optional("MAIL_FROM_NAME", "Alena Informes"),
      address: optional("MAIL_FROM_ADDRESS", "no-reply@localhost"),
    },
  };
}
