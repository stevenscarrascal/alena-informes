/**
 * Aviso por correo de revisión.
 *
 * Cuando quien publica un informe (o una nueva versión) no es administrador ni
 * líder del área, avisa por correo a quienes sí pueden aprobarlo:
 * administradores y líderes de esa área.
 */
import { and, eq } from "drizzle-orm";

import { areaMembers, areas, db, userRoles, users } from "@/server/db";
import { appUrl } from "@/server/env";
import { reportReviewEmail } from "@/server/mail/templates";
import { sendMail } from "@/server/mail/transport";

export async function notifyReportSubmitted(options: {
  reportId: string;
  areaId: string;
  title: string;
  versionLabel: string;
  isNewReport: boolean;
  authorId: string;
}): Promise<void> {
  const [area, admins, leads, author] = await Promise.all([
    db.select({ name: areas.name }).from(areas).where(eq(areas.id, options.areaId)).limit(1),
    db
      .select({ email: users.email })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(eq(userRoles.role, "admin")),
    db
      .select({ email: users.email })
      .from(users)
      .innerJoin(areaMembers, eq(areaMembers.userId, users.id))
      .where(and(eq(areaMembers.areaId, options.areaId), eq(areaMembers.isLead, true))),
    db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, options.authorId))
      .limit(1),
  ]);

  const recipients = [...new Set([...admins, ...leads].map((r) => r.email))];
  if (!recipients.length) return;

  const mail = reportReviewEmail({
    title: options.title,
    areaName: area[0]?.name ?? "el proceso",
    authorName: author[0]?.fullName || "Un miembro del equipo",
    versionLabel: options.versionLabel,
    isNewReport: options.isNewReport,
    url: `${appUrl()}/reports/${options.reportId}`,
  });

  // Envíos individuales, no un solo correo con todos en copia: así ningún
  // destinatario ve la lista completa de administradores/líderes del área.
  await Promise.all(recipients.map((to) => sendMail({ to, ...mail })));
}
