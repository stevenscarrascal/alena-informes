/**
 * Autenticación del portal: alta inicial, inicio y cierre de sesión,
 * activación de invitaciones y recuperación de contraseña.
 *
 * Reemplaza a `supabase.auth.*`. El navegador nunca maneja tokens: la sesión
 * viaja en una cookie httpOnly que el servidor emite y valida.
 */
import { createServerFn } from "@tanstack/react-start";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { db, newId, userRoles, users } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  readSession,
} from "@/server/auth/session";
import { consumeToken, sendRecovery } from "@/server/auth/invitations";

const PASSWORD = z.string().min(8).max(72);
const EMAIL = z.string().trim().toLowerCase().email().max(255);

/** Mensaje único para credenciales inválidas: no revela si el correo existe. */
const BAD_CREDENTIALS = "Correo o contraseña incorrectos";

async function adminCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userRoles)
    .where(eq(userRoles.role, "admin"));
  return row?.value ?? 0;
}

/** ¿Existe ya algún usuario/administrador? Decide si `/auth` muestra el alta inicial. */
export const getBootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const [[usersRow], admins] = await Promise.all([
    db.select({ value: count() }).from(users),
    adminCount(),
  ]);
  return { hasUsers: (usersRow?.value ?? 0) > 0, hasAdmin: admins > 0 };
});

/** Usuario de la sesión actual, o null. Lo usa el guard de `/_authenticated`. */
export const getSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const user = await readSession();
  if (!user) return null;
  return { id: user.id, email: user.email, fullName: user.fullName };
});

/**
 * Crea la cuenta de administrador inicial.
 *
 * Solo funciona mientras no exista ningún admin. Sustituye al par
 * `signUp` + `claimFirstAdmin`, que en el diseño anterior se ejecutaba tras
 * cada inicio de sesión.
 */
export const bootstrapSignUp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: EMAIL,
        password: PASSWORD,
        fullName: z.string().trim().min(2).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    if ((await adminCount()) > 0) {
      throw new Error("El portal ya tiene administrador. Inicia sesión con tu cuenta.");
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);
    if (existing) throw new Error("Ese correo ya está registrado");

    const userId = newId();
    await db.insert(users).values({
      id: userId,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      fullName: data.fullName,
      emailVerifiedAt: new Date(),
      lastSignInAt: new Date(),
    });
    await db.insert(userRoles).values([
      { id: newId(), userId, role: "admin" },
      { id: newId(), userId, role: "empleado" },
    ]);

    await createSession(userId);
    return { ok: true };
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ email: EMAIL, password: z.string().min(1).max(72) }).parse(data),
  )
  .handler(async ({ data }) => {
    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    // Sin contraseña definida = invitación pendiente. Mismo mensaje que un
    // correo inexistente para no filtrar qué cuentas existen.
    if (!user?.passwordHash) throw new Error(BAD_CREDENTIALS);
    if (!(await verifyPassword(user.passwordHash, data.password))) {
      throw new Error(BAD_CREDENTIALS);
    }

    await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
    await createSession(user.id);
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  return { ok: true };
});

/**
 * Activa una invitación o completa una recuperación: valida el token de un
 * solo uso, fija la contraseña y abre sesión.
 */
export const acceptInvite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().min(32).max(128), password: PASSWORD }).parse(data),
  )
  .handler(async ({ data }) => {
    const consumed = await consumeToken(data.token);
    if (!consumed) {
      throw new Error("El enlace no es válido o ya caducó. Pide uno nuevo al administrador.");
    }

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(data.password),
        emailVerifiedAt: new Date(),
        lastSignInAt: new Date(),
      })
      .where(eq(users.id, consumed.userId));

    // Cambiar la contraseña invalida las sesiones abiertas antes de crear la nueva.
    await destroyAllSessions(consumed.userId);
    await createSession(consumed.userId);
    return { ok: true };
  });

/**
 * Envía un enlace de recuperación. Responde siempre igual, exista o no la
 * cuenta, para no permitir enumerar correos.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ email: EMAIL }).parse(data))
  .handler(async ({ data }) => {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (user) {
      try {
        await sendRecovery(user);
      } catch (error) {
        console.error("No se pudo enviar el correo de recuperación", error);
      }
    }
    return { ok: true };
  });
