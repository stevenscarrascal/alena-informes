import nodemailer, { type Transporter } from "nodemailer";

import { mailConfig } from "@/server/env";

const globalForMail = globalThis as unknown as { __alenaMailer?: Transporter };

function transporter(): Transporter {
  if (!globalForMail.__alenaMailer) {
    const { from: _from, ...options } = mailConfig();
    globalForMail.__alenaMailer = nodemailer.createTransport(options);
  }
  return globalForMail.__alenaMailer;
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  await transporter().sendMail({ from: mailConfig().from, ...options });
}

/** Comprueba la conexión SMTP sin enviar nada. Útil en un healthcheck. */
export async function verifySmtp(): Promise<void> {
  await transporter().verify();
}
