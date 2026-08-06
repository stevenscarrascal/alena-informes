import { createMiddleware } from "@tanstack/react-start";

import { readSession } from "./session";
import { loadViewer } from "./viewer";

/** Error de autorización con código, para distinguirlo de un fallo interno. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Sustituye a `requireSupabaseAuth`.
 *
 * Lee la sesión de la cookie y construye el `Viewer` una sola vez por petición.
 * Antes cada server function volvía a cargarlo con `loadViewer(supabase, userId)`;
 * ahora llega resuelto en el contexto.
 */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await readSession();
  if (!user) throw new AuthError("Sesión no válida o expirada");

  const viewer = await loadViewer(user.id);
  return next({ context: { user, userId: user.id, viewer } });
});

/** Para las funciones de administración: exige además el rol admin. */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireAuth])
  .server(async ({ next, context }) => {
    if (!context.viewer.isAdmin) {
      throw new AuthError("Acción restringida a administradores");
    }
    return next();
  });
