/**
 * Plantillas de los correos transaccionales del portal.
 *
 * Sustituyen a los correos implícitos de Supabase Auth. Se envían en HTML con
 * alternativa en texto plano, y los estilos van en línea porque los clientes de
 * correo ignoran las hojas de estilo externas.
 */

const BRAND = "#1e40af";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(options: {
  heading: string;
  intro: string;
  buttonLabel: string;
  url: string;
  footer: string;
}): string {
  const { heading, intro, buttonLabel, url, footer } = options;
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">Alena · Informes</p>
              <h1 style="margin:12px 0 0 0;font-size:22px;line-height:1.3;color:#111827;">${escapeHtml(heading)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 0 32px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <a href="${escapeHtml(url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(buttonLabel)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">Si el botón no funciona, copia este enlace en tu navegador:</p>
              <p style="margin:0;font-size:12px;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:${BRAND};">${escapeHtml(url)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">${escapeHtml(footer)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function plain(lines: string[]): string {
  return `${lines.join("\n\n")}\n`;
}

export type MailContent = { subject: string; html: string; text: string };

export function inviteEmail(options: {
  fullName: string;
  url: string;
  hours: number;
}): MailContent {
  const nombre = options.fullName.trim().split(" ")[0] || "hola";
  const intro =
    "Te han dado acceso al portal interno de informes de Alena. Define tu contraseña para entrar.";
  const footer = `El enlace caduca en ${options.hours} horas. Si no esperabas esta invitación, puedes ignorar este mensaje.`;

  return {
    subject: "Tu acceso al portal de informes de Alena",
    html: layout({
      heading: `${nombre[0]?.toUpperCase()}${nombre.slice(1)}, te damos la bienvenida`,
      intro,
      buttonLabel: "Definir mi contraseña",
      url: options.url,
      footer,
    }),
    text: plain([intro, options.url, footer]),
  };
}

export function reportReviewEmail(options: {
  title: string;
  areaName: string;
  authorName: string;
  versionLabel: string;
  isNewReport: boolean;
  url: string;
}): MailContent {
  const intro = options.isNewReport
    ? `${options.authorName} publicó un informe nuevo en el Proceso ${options.areaName} y está pendiente de tu revisión.`
    : `${options.authorName} publicó una nueva versión (${options.versionLabel}) de un informe en el Proceso ${options.areaName} y está pendiente de tu revisión.`;
  const footer = `Recibes este aviso porque eres administrador o líder del Proceso ${options.areaName}.`;

  return {
    subject: `Informe para revisar: ${options.title}`,
    html: layout({
      heading: "Informe pendiente de revisión",
      intro,
      buttonLabel: "Revisar informe",
      url: options.url,
      footer,
    }),
    text: plain([intro, options.url, footer]),
  };
}

export function recoveryEmail(options: { url: string; hours: number }): MailContent {
  const intro =
    "Recibimos una solicitud para restablecer la contraseña de tu cuenta del portal de informes.";
  const footer = `El enlace caduca en ${options.hours} hora(s) y solo se puede usar una vez. Si no lo solicitaste, ignora este correo: tu contraseña actual sigue siendo válida.`;

  return {
    subject: "Restablece tu contraseña · Alena Informes",
    html: layout({
      heading: "Restablece tu contraseña",
      intro,
      buttonLabel: "Elegir una contraseña nueva",
      url: options.url,
      footer,
    }),
    text: plain([intro, options.url, footer]),
  };
}
