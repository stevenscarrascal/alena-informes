/**
 * API del portal (TanStack Start server functions) sobre MySQL, SMTP y S3.
 *
 * Las firmas, los validadores y las formas de respuesta son las mismas que
 * cuando el backend era Supabase, para que las páginas no cambien.
 *
 * Autorización, ahora que no hay RLS:
 * - Lecturas de informes y actividad → filtros de `@/server/scope`.
 * - Escrituras → predicados de `@/lib/permissions`.
 * - Administración → middleware `requireAdmin`.
 * Ninguna consulta debe saltarse esas capas: son la única barrera.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, like, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin, requireAuth } from "@/server/auth/middleware";
import { sendInvite, sendRecovery } from "@/server/auth/invitations";
import { destroyAllSessions } from "@/server/auth/session";
import { loadRules } from "@/server/auth/viewer";
import { hashPassword } from "@/server/auth/password";
import {
  activityLog,
  areaKeyOf,
  areaMembers,
  areas,
  db,
  escapeLike,
  newId,
  permissionSettings,
  reportVersions,
  reports,
  userRoles,
  users,
  viewTokens,
} from "@/server/db";
import { allOf, visibleActivityWhere, visibleReportsWhere } from "@/server/scope";
import { logActivity } from "@/server/activity";
import { notifyReportApproved } from "@/server/reports/notify";
import { deleteByPrefix } from "@/server/storage/s3";
import {
  toActivity,
  toArea,
  toAreaRef,
  toProfile,
  toReport,
  toVersion,
  toVersionRef,
} from "@/server/serialize";
import { slugify } from "@/lib/portal-helpers";
import {
  canAddVersion,
  canChangeStatus,
  canDeleteReport,
  canViewActivity,
  CAPABILITIES,
} from "@/lib/permissions";

const VIEW_TOKEN_TTL_MS = 1000 * 60 * 60 * 3;

/* --------------------------- Utilidades --------------------------- */

/** Mapa id → nombre para los autores indicados. */
async function namesFor(ids: (string | null)[]): Promise<Record<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return {};
  const rows = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(inArray(users.id, unique));
  return Object.fromEntries(rows.map((r) => [r.id, r.fullName]));
}

/** Emite tokens de visualización y aprovecha para limpiar los caducados. */
async function issueViewTokens(
  entries: { versionId: string; userId: string }[],
): Promise<Record<string, string>> {
  if (!entries.length) return {};
  const expiresAt = new Date(Date.now() + VIEW_TOKEN_TTL_MS);
  const rows = entries.map((entry) => ({
    token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
    versionId: entry.versionId,
    userId: entry.userId,
    expiresAt,
  }));

  await db.insert(viewTokens).values(rows);
  // La tabla crecía sin límite: cada carga del panel emitía hasta 60 filas y
  // nada las borraba.
  await db.delete(viewTokens).where(lt(viewTokens.expiresAt, new Date()));

  return Object.fromEntries(rows.map((row) => [row.versionId, row.token]));
}

/** Informe visible para el usuario, o null. Aplica el filtro que sustituye a RLS. */
async function findVisibleReport(viewer: Parameters<typeof visibleReportsWhere>[0], id: string) {
  const [row] = await db
    .select()
    .from(reports)
    .where(allOf(eq(reports.id, id), visibleReportsWhere(viewer)))
    .limit(1);
  return row ?? null;
}

/* ---------------------------- Consultas ---------------------------- */

/** Perfil, rol y áreas del usuario actual. */
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { user, viewer } = context;
    const allAreas = await db.select().from(areas).orderBy(asc(areas.name));

    const visibleAreas = allAreas.filter(
      (area) => viewer.isAdmin || viewer.memberAreaIds.includes(area.id),
    );

    return {
      profile: toProfile(user),
      isAdmin: viewer.isAdmin,
      areas: visibleAreas.map(toArea),
      allAreas: (viewer.isAdmin ? allAreas : visibleAreas).map(toArea),
      leadAreaIds: viewer.leadAreaIds,
      memberAreaIds: viewer.memberAreaIds,
      rules: viewer.rules ?? [],
      viewer,
    };
  });

/** Informes visibles con filtros de área y búsqueda. */
export const listReports = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      areaId?: string | undefined;
      areaIds?: string[] | undefined;
      search?: string | undefined;
      limit?: number | undefined;
    }) =>
      z
        .object({
          areaId: z.string().uuid().optional(),
          areaIds: z.array(z.string().uuid()).max(50).optional(),
          search: z.string().max(120).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const areaIds = data.areaIds?.length ? data.areaIds : data.areaId ? [data.areaId] : [];

    // Los embeds de PostgREST (`areas(...)`, `report_versions!fkey(...)`) pasan
    // a ser LEFT JOIN y se vuelven a anidar más abajo.
    const rows = await db
      .select({ report: reports, area: areas, version: reportVersions })
      .from(reports)
      .leftJoin(areas, eq(areas.id, reports.areaId))
      .leftJoin(reportVersions, eq(reportVersions.id, reports.currentVersionId))
      .where(
        allOf(
          visibleReportsWhere(context.viewer),
          areaIds.length ? inArray(reports.areaId, areaIds) : undefined,
          data.search ? like(reports.title, `%${escapeLike(data.search)}%`) : undefined,
        ),
      )
      .orderBy(desc(reports.createdAt))
      .limit(data.limit ?? 60);

    const authors = await namesFor(rows.map((row) => row.report.authorId));

    return rows.map((row) =>
      toReport(row.report, {
        areas: toAreaRef(row.area),
        report_versions: toVersionRef(row.version),
        author_name: authors[row.report.authorId] ?? null,
      }),
    );
  });

/** Métricas de las áreas visibles. */
export const getStats = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { areaId?: string | undefined; areaIds?: string[] | undefined }) =>
    z
      .object({
        areaId: z.string().uuid().optional(),
        areaIds: z.array(z.string().uuid()).max(50).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const areaIds = data.areaIds?.length ? data.areaIds : data.areaId ? [data.areaId] : [];
    const where = allOf(
      visibleReportsWhere(context.viewer),
      areaIds.length ? inArray(reports.areaId, areaIds) : undefined,
    );

    // Se agrega en SQL, no en JavaScript como antes.
    const [totals] = await db
      .select({
        total: sql<number>`count(*)`,
        reviewed: sql<number>`sum(case when ${reports.status} = 'revisado' then 1 else 0 end)`,
        views: sql<number>`coalesce(sum(${reports.viewCount}), 0)`,
      })
      .from(reports)
      .where(where);

    const [versionTotals] = await db
      .select({
        versions: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum(${reportVersions.sizeBytes}), 0)`,
      })
      .from(reportVersions)
      .innerJoin(reports, eq(reports.id, reportVersions.reportId))
      .where(where);

    const total = Number(totals?.total ?? 0);
    const reviewed = Number(totals?.reviewed ?? 0);

    return {
      total,
      pending: total - reviewed,
      reviewed,
      views: Number(totals?.views ?? 0),
      versions: Number(versionTotals?.versions ?? 0),
      bytes: Number(versionTotals?.bytes ?? 0),
    };
  });

/** Un informe con su área y su historial de versiones. */
export const getReport = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const [row] = await db
      .select({ report: reports, area: areas })
      .from(reports)
      .leftJoin(areas, eq(areas.id, reports.areaId))
      .where(allOf(eq(reports.id, data.id), visibleReportsWhere(context.viewer)))
      .limit(1);

    if (!row) throw new Error("Informe no encontrado o sin acceso");

    const [authors, versions] = await Promise.all([
      namesFor([row.report.authorId]),
      db
        .select()
        .from(reportVersions)
        .where(eq(reportVersions.reportId, data.id))
        .orderBy(desc(reportVersions.versionNumber)),
    ]);

    return {
      report: toReport(row.report, {
        areas: toAreaRef(row.area),
        author_name: authors[row.report.authorId] ?? null,
      }),
      versions: versions.map(toVersion),
    };
  });

/** Actividad reciente en las áreas visibles. */
export const getActivity = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (!canViewActivity(context.viewer)) {
      throw new Error("La actividad global es visible para líderes y administradores");
    }

    const rows = await db
      .select({ entry: activityLog, area: areas })
      .from(activityLog)
      .leftJoin(areas, eq(areas.id, activityLog.areaId))
      .where(visibleActivityWhere(context.viewer))
      .orderBy(desc(activityLog.createdAt))
      .limit(80);

    const authors = await namesFor(rows.map((row) => row.entry.userId));

    return rows.map((row) =>
      toActivity(row.entry, {
        areas: row.area ? { name: row.area.name, slug: row.area.slug } : null,
        author_name: row.entry.userId ? (authors[row.entry.userId] ?? null) : null,
      }),
    );
  });

/* ------------------------- Visor de informes ------------------------- */

/** Enlace temporal para mostrar un informe en el visor. */
export const createViewToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { versionId: string }) =>
    z.object({ versionId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const [version] = await db
      .select({ id: reportVersions.id, entryPath: reportVersions.entryPath })
      .from(reportVersions)
      .innerJoin(reports, eq(reports.id, reportVersions.reportId))
      .where(allOf(eq(reportVersions.id, data.versionId), visibleReportsWhere(context.viewer)))
      .limit(1);

    if (!version) throw new Error("Versión no encontrada o sin acceso");

    const tokens = await issueViewTokens([{ versionId: version.id, userId: context.userId }]);
    return { url: `/api/public/r/${tokens[version.id]}/${version.entryPath}` };
  });

/** Enlaces temporales en lote, para las miniaturas del panel. */
export const createPreviewTokens = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { versionIds: string[] }) =>
    z.object({ versionIds: z.array(z.string().uuid()).max(60) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!data.versionIds.length) return {} as Record<string, string>;

    const versions = await db
      .select({ id: reportVersions.id, entryPath: reportVersions.entryPath })
      .from(reportVersions)
      .innerJoin(reports, eq(reports.id, reportVersions.reportId))
      .where(
        allOf(inArray(reportVersions.id, data.versionIds), visibleReportsWhere(context.viewer)),
      );

    if (!versions.length) return {} as Record<string, string>;

    const tokens = await issueViewTokens(
      versions.map((version) => ({ versionId: version.id, userId: context.userId })),
    );

    const urls: Record<string, string> = {};
    for (const version of versions) {
      urls[version.id] = `/api/public/r/${tokens[version.id]}/${version.entryPath}`;
    }
    return urls;
  });

/** Registra la visualización de un informe. */
export const registerView = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const report = await findVisibleReport(context.viewer, data.id);
    if (!report) return { ok: false };

    // Incremento atómico: antes era leer-modificar-escribir y perdía visitas
    // con accesos simultáneos.
    await db
      .update(reports)
      .set({ viewCount: sql`${reports.viewCount} + 1` })
      .where(eq(reports.id, data.id));

    await logActivity({
      userId: context.userId,
      areaId: report.areaId,
      reportId: report.id,
      action: "informe_visto",
      detail: report.title,
    });
    return { ok: true };
  });

/* -------------------------- Ciclo de vida -------------------------- */

/** Cambia el estado de revisión de un informe. */
export const setReportStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { id: string; status: "nuevo" | "en_revision" | "revisado" }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["nuevo", "en_revision", "revisado"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const report = await findVisibleReport(context.viewer, data.id);
    if (!report) throw new Error("Informe no encontrado o sin acceso");

    const target = { area_id: report.areaId, author_id: report.authorId };
    if (!canChangeStatus(context.viewer, target)) {
      throw new Error("Solo líderes procesos o administradores cambian el estado de revisión");
    }

    await db.update(reports).set({ status: data.status }).where(eq(reports.id, data.id));
    await logActivity({
      userId: context.userId,
      areaId: report.areaId,
      reportId: data.id,
      action: "estado_actualizado",
      detail: `${report.title} → ${data.status}`,
    });

    // No debe tumbar el cambio de estado si el correo falla.
    if (data.status === "revisado" && report.status !== "revisado") {
      try {
        await notifyReportApproved({
          reportId: report.id,
          areaId: report.areaId,
          title: report.title,
          authorId: report.authorId,
          approverId: context.userId,
        });
      } catch (error) {
        console.error("No se pudo enviar el aviso de aprobación", error);
      }
    }
    return { ok: true };
  });

/** Cambia la página HTML principal (entry point) de una versión. */
export const setVersionEntryPath = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        versionId: z.string().uuid(),
        entryPath: z.string().min(3).max(300),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const [row] = await db
      .select({ version: reportVersions, report: reports })
      .from(reportVersions)
      .innerJoin(reports, eq(reports.id, reportVersions.reportId))
      .where(allOf(eq(reportVersions.id, data.versionId), visibleReportsWhere(context.viewer)))
      .limit(1);

    if (!row) throw new Error("Versión no encontrada o sin acceso");

    const pages = row.version.htmlPages ?? [];
    if (pages.length && !pages.includes(data.entryPath)) {
      throw new Error("La página indicada no pertenece a esta versión");
    }

    const target = { area_id: row.report.areaId, author_id: row.report.authorId };
    if (!canAddVersion(context.viewer, target)) {
      throw new Error("Solo el autor o el líder del proceso puede cambiar la página principal");
    }

    await db
      .update(reportVersions)
      .set({ entryPath: data.entryPath })
      .where(eq(reportVersions.id, data.versionId));
    return { ok: true, entryPath: data.entryPath };
  });

/** Elimina un informe, sus versiones y sus archivos en S3. */
export const deleteReport = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const report = await findVisibleReport(context.viewer, data.id);
    if (!report) throw new Error("Informe no encontrado o sin acceso");

    const target = { area_id: report.areaId, author_id: report.authorId };
    if (!canDeleteReport(context.viewer, target)) {
      throw new Error("Solo el autor, el líder del proceso o un administrador puede eliminarlo");
    }

    const versions = await db
      .select({ storagePrefix: reportVersions.storagePrefix })
      .from(reportVersions)
      .where(eq(reportVersions.reportId, data.id));

    // Primero los archivos: si algo falla, la fila sigue ahí y la operación se
    // puede reintentar. Al revés quedarían objetos huérfanos e inalcanzables.
    for (const version of versions) {
      await deleteByPrefix(version.storagePrefix);
    }

    // Las versiones caen por ON DELETE CASCADE.
    await db.delete(reports).where(eq(reports.id, data.id));
    return { ok: true };
  });

/* ------------------------- Administración ------------------------- */

/** Áreas, miembros, personas y roles (solo administradores). */
export const adminGetDirectory = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const [areaRows, memberRows, userRows, roleRows] = await Promise.all([
      db.select().from(areas).orderBy(asc(areas.name)),
      db.select().from(areaMembers),
      db.select().from(users).orderBy(asc(users.fullName)),
      db.select({ user_id: userRoles.userId, role: userRoles.role }).from(userRoles),
    ]);

    return {
      areas: areaRows.map(toArea),
      members: memberRows.map((m) => ({
        id: m.id,
        area_id: m.areaId,
        user_id: m.userId,
        is_lead: m.isLead,
      })),
      profiles: userRows.map(toProfile),
      roles: roleRows,
    };
  });

/** Crea o actualiza un área. */
export const adminSaveArea = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(300).optional(),
        icon: z.string().trim().max(40).default("Folder"),
        color: z.string().trim().max(20).default("#1e40af"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const payload = {
      name: data.name,
      slug: slugify(data.name),
      description: data.description ?? null,
      icon: data.icon,
      color: data.color,
    };

    if (data.id) {
      await db.update(areas).set(payload).where(eq(areas.id, data.id));
      return { id: data.id };
    }

    const id = newId();
    await db.insert(areas).values({ id, ...payload });
    return { id };
  });

/** Elimina un área con todos sus informes. */
export const adminDeleteArea = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    // Los archivos no caen por la cascada de MySQL: hay que borrarlos en S3.
    const versions = await db
      .select({ storagePrefix: reportVersions.storagePrefix })
      .from(reportVersions)
      .innerJoin(reports, eq(reports.id, reportVersions.reportId))
      .where(eq(reports.areaId, data.id));

    for (const version of versions) {
      await deleteByPrefix(version.storagePrefix);
    }

    await db.delete(areas).where(eq(areas.id, data.id));
    return { ok: true };
  });

/** Mueve un informe a otro proceso (área). */
export const adminMoveReport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { id: string; areaId: string }) =>
    z.object({ id: z.string().uuid(), areaId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const [report] = await db.select().from(reports).where(eq(reports.id, data.id)).limit(1);
    if (!report) throw new Error("Informe no encontrado");

    const [targetArea] = await db.select().from(areas).where(eq(areas.id, data.areaId)).limit(1);
    if (!targetArea) throw new Error("Proceso de destino no encontrado");

    if (report.areaId === data.areaId) return { ok: true };

    const [previousArea] = await db
      .select()
      .from(areas)
      .where(eq(areas.id, report.areaId))
      .limit(1);

    await db.update(reports).set({ areaId: data.areaId }).where(eq(reports.id, data.id));

    await logActivity({
      userId: context.userId,
      areaId: data.areaId,
      reportId: data.id,
      action: "informe_movido",
      detail: `${report.title}: ${previousArea?.name ?? "?"} → ${targetArea.name}`,
    });
    return { ok: true };
  });

/** Asigna, actualiza o retira un miembro de un área. */
export const adminSetMember = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        areaId: z.string().uuid(),
        userId: z.string().uuid(),
        isLead: z.boolean().default(false),
        remove: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    if (data.remove) {
      await db
        .delete(areaMembers)
        .where(and(eq(areaMembers.areaId, data.areaId), eq(areaMembers.userId, data.userId)));
      return { ok: true };
    }

    await db
      .insert(areaMembers)
      .values({ id: newId(), areaId: data.areaId, userId: data.userId, isLead: data.isLead })
      .onDuplicateKeyUpdate({ set: { isLead: data.isLead } });
    return { ok: true };
  });

/** Invita a una persona por correo. */
export const adminInviteUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        fullName: z.string().trim().min(2).max(120),
        jobTitle: z.string().trim().max(120).optional(),
        areaId: z.string().uuid().optional(),
        makeAdmin: z.boolean().default(false),
        // Se acepta por compatibilidad con la interfaz; el enlace se construye
        // en el servidor a partir de APP_URL.
        redirectTo: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    const userId = existing?.id ?? newId();

    if (existing) {
      await db
        .update(users)
        .set({ fullName: data.fullName, jobTitle: data.jobTitle ?? null })
        .where(eq(users.id, userId));
    } else {
      await db.insert(users).values({
        id: userId,
        email: data.email,
        fullName: data.fullName,
        jobTitle: data.jobTitle ?? null,
        // Sin contraseña hasta que active la invitación.
        passwordHash: null,
      });
      // Sustituye al trigger handle_new_user de Postgres.
      await db.insert(userRoles).values({ id: newId(), userId, role: "empleado" });
    }

    if (data.makeAdmin) {
      await db
        .insert(userRoles)
        .values({ id: newId(), userId, role: "admin" })
        .onDuplicateKeyUpdate({ set: { role: "admin" } });
    }

    if (data.areaId) {
      await db
        .insert(areaMembers)
        .values({ id: newId(), areaId: data.areaId, userId, isLead: false })
        .onDuplicateKeyUpdate({ set: { isLead: false } });
    }

    await sendInvite({ id: userId, email: data.email, fullName: data.fullName });
    return { ok: true };
  });

/** Otorga o retira el rol de administrador. */
export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), makeAdmin: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.makeAdmin) {
      await db
        .insert(userRoles)
        .values({ id: newId(), userId: data.userId, role: "admin" })
        .onDuplicateKeyUpdate({ set: { role: "admin" } });
      return { ok: true };
    }

    if (data.userId === context.userId) throw new Error("No puedes retirarte el rol de admin");
    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, data.userId), eq(userRoles.role, "admin")));
    return { ok: true };
  });

/**
 * Reenvía la invitación o, si la cuenta ya se usó, un enlace de recuperación.
 * Mantiene la bifurcación por `last_sign_in_at` del comportamiento anterior.
 */
export const adminResendInvite = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        redirectTo: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const [account] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        lastSignInAt: users.lastSignInAt,
      })
      .from(users)
      .where(eq(users.id, data.userId))
      .limit(1);

    if (!account) throw new Error("No se encontró la cuenta");

    if (account.lastSignInAt) {
      await sendRecovery(account);
      return { ok: true, mode: "recovery" as const, email: account.email };
    }

    await sendInvite(account);
    return { ok: true, mode: "invite" as const, email: account.email };
  });

/** Define manualmente la contraseña de una persona del portal. */
export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(8).max(72),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const [account] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, data.userId))
      .limit(1);
    if (!account) throw new Error("No se encontró la cuenta");

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(data.password), emailVerifiedAt: new Date() })
      .where(eq(users.id, data.userId));

    // Cambiar la contraseña desde administración cierra las sesiones abiertas.
    await destroyAllSessions(data.userId);
    return { ok: true };
  });

/* ------------------- Permisos granulares ------------------- */

/** Matriz de permisos configurada (global + excepciones por área). */
export const adminGetPermissions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => ({ rules: await loadRules() }));

/** Crea o actualiza una regla de permiso. Se aplica en caliente. */
export const adminSetPermission = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        role: z.enum(["lider", "empleado"]),
        areaId: z.string().uuid().nullable().default(null),
        capability: z.enum(CAPABILITIES),
        allowed: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Upsert real gracias al índice único (role, capability, area_key); antes
    // se emulaba con un select seguido de update o insert.
    await db
      .insert(permissionSettings)
      .values({
        id: newId(),
        role: data.role,
        areaId: data.areaId,
        areaKey: areaKeyOf(data.areaId),
        capability: data.capability,
        allowed: data.allowed,
      })
      .onDuplicateKeyUpdate({ set: { allowed: data.allowed } });

    await logActivity({
      userId: context.userId,
      areaId: data.areaId,
      action: "permiso_actualizado",
      detail: `${data.role} · ${data.capability} → ${data.allowed ? "permitido" : "bloqueado"}`,
    });
    return { ok: true };
  });

/** Elimina las excepciones de un área para volver a la regla global. */
export const adminClearAreaOverrides = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        areaId: z.string().uuid(),
        role: z.enum(["lider", "empleado"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await db
      .delete(permissionSettings)
      .where(
        allOf(
          eq(permissionSettings.areaId, data.areaId),
          data.role ? eq(permissionSettings.role, data.role) : undefined,
        ),
      );
    return { ok: true };
  });
