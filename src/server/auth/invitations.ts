/**
 * Invitaciones y recuperación de contraseña.
 *
 * Sustituye a `inviteUserByEmail` / `resetPasswordForEmail` de Supabase Auth:
 * se emite un token de un solo uso, se guarda su hash y se envía por SMTP un
 * enlace a `/auth?type=invite|recovery&token=…`.
 */
import { and, eq, isNull } from "drizzle-orm";

import { authTokens, db, newId, users } from "@/server/db";
import { appUrl } from "@/server/env";
import { inviteEmail, recoveryEmail } from "@/server/mail/templates";
import { sendMail } from "@/server/mail/transport";
import { generateToken, hashToken } from "./tokens";

export const INVITE_TTL_HOURS = 48;
export const RECOVERY_TTL_HOURS = 1;

export type TokenType = "invite" | "recovery";

async function issueToken(userId: string, type: TokenType, ttlHours: number): Promise<string> {
  const token = generateToken();

  // Un solo enlace vivo por tipo: los anteriores dejan de servir.
  await db
    .delete(authTokens)
    .where(
      and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)),
    );

  await db.insert(authTokens).values({
    id: newId(),
    userId,
    type,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
  });

  return token;
}

function linkFor(type: TokenType, token: string): string {
  return `${appUrl()}/auth?type=${type}&token=${token}`;
}

export async function sendInvite(user: {
  id: string;
  email: string;
  fullName: string;
}): Promise<void> {
  const token = await issueToken(user.id, "invite", INVITE_TTL_HOURS);
  const mail = inviteEmail({
    fullName: user.fullName || user.email,
    url: linkFor("invite", token),
    hours: INVITE_TTL_HOURS,
  });
  await sendMail({ to: user.email, ...mail });
}

export async function sendRecovery(user: { id: string; email: string }): Promise<void> {
  const token = await issueToken(user.id, "recovery", RECOVERY_TTL_HOURS);
  const mail = recoveryEmail({
    url: linkFor("recovery", token),
    hours: RECOVERY_TTL_HOURS,
  });
  await sendMail({ to: user.email, ...mail });
}

export type ConsumedToken = { userId: string; email: string };

/**
 * Valida y consume un token de invitación o recuperación.
 * Devuelve null si no existe, ya se usó o caducó.
 */
export async function consumeToken(token: string): Promise<ConsumedToken | null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;

  const [row] = await db
    .select({
      tokenId: authTokens.id,
      userId: users.id,
      email: users.email,
      expiresAt: authTokens.expiresAt,
      usedAt: authTokens.usedAt,
    })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(eq(authTokens.tokenHash, hashToken(token)))
    .limit(1);

  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;

  // Marcado condicional: si dos peticiones llegan a la vez, solo una consume el
  // token (`used_at IS NULL` deja de cumplirse para la segunda).
  const [result] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, row.tokenId), isNull(authTokens.usedAt)));

  if (result.affectedRows !== 1) return null;

  return { userId: row.userId, email: row.email };
}
