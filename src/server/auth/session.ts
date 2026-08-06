import { and, eq, gt, lt } from "drizzle-orm";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";

import { db, newId, sessions, users, type User } from "@/server/db";
import { isProduction } from "@/server/env";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "alena_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días
/** Solo se prolonga la sesión si le queda menos de esto, para no escribir en cada petición. */
const RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 24; // 1 día

function expiryFromNow(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

/**
 * Crea la sesión y deja la cookie en la respuesta.
 * El token viaja solo en la cookie; en la base queda su SHA-256.
 */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = expiryFromNow();

  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: getRequestHeader("user-agent")?.slice(0, 255) ?? null,
    ip: getRequestIP({ xForwardedFor: true })?.slice(0, 45) ?? null,
  });

  writeCookie(token, expiresAt);
  await purgeExpiredSessions();
}

function writeCookie(token: string, expiresAt: Date): void {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    // `lax` deja pasar la navegación desde los enlaces del correo y sigue
    // bloqueando los POST entre sitios (además del middleware CSRF).
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionUser = Omit<User, "passwordHash">;

/**
 * Devuelve el usuario de la sesión activa, o null.
 * Renueva la cookie de forma perezosa cuando está cerca de caducar.
 */
export async function readSession(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;

  if (row.session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - RENEW_THRESHOLD_MS) {
    const expiresAt = expiryFromNow();
    await db
      .update(sessions)
      .set({ expiresAt, lastUsedAt: new Date() })
      .where(eq(sessions.id, row.session.id));
    writeCookie(token, expiresAt);
  }

  const { passwordHash: _passwordHash, ...user } = row.user;
  return user;
}

/** Cierra la sesión actual y borra la cookie. */
export async function destroySession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

/** Revoca todas las sesiones de una persona (cambio de contraseña por admin). */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
