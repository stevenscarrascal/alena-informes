/**
 * Esquema MySQL del portal.
 *
 * Diferencias respecto al Postgres anterior que conviene tener presentes:
 * - `auth.users` y `profiles` se fusionan en una sola tabla `users`: la
 *   autenticación ahora vive en esta base, no en un servicio externo.
 * - No hay RLS. Toda la autorización es explícita y está en `src/server/scope.ts`
 *   (lecturas) y en `src/lib/permissions.ts` (escrituras).
 * - `report_versions.html_pages` era `text[]`; aquí es una columna JSON.
 * - Los índices únicos parciales de `permission_settings` no existen en MySQL:
 *   se emulan con la columna generada `area_key`.
 * - Los triggers `set_updated_at` se sustituyen por ON UPDATE CURRENT_TIMESTAMP.
 */
import { type InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const id = () => char("id", { length: 36 }).primaryKey();
const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () => timestamp("updated_at").notNull().defaultNow().onUpdateNow();

/* --------------------------- Personas --------------------------- */

/** Sustituye a `auth.users` + `profiles`. `password_hash` es null mientras la invitación está pendiente. */
export const users = mysqlTable("users", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  fullName: varchar("full_name", { length: 120 }).notNull().default(""),
  jobTitle: varchar("job_title", { length: 120 }),
  avatarUrl: text("avatar_url"),
  emailVerifiedAt: timestamp("email_verified_at"),
  lastSignInAt: timestamp("last_sign_in_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userRoles = mysqlTable(
  "user_roles",
  {
    id: id(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["admin", "empleado"]).notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("user_roles_user_role_uniq").on(t.userId, t.role)],
);

/* ---------------------------- Áreas ---------------------------- */

export const areas = mysqlTable("areas", {
  id: id(),
  name: varchar("name", { length: 60 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: varchar("description", { length: 300 }),
  icon: varchar("icon", { length: 40 }).notNull().default("Folder"),
  color: varchar("color", { length: 20 }).notNull().default("#1e40af"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** `is_lead` es lo que define el rol "líder": no existe como fila en user_roles. */
export const areaMembers = mysqlTable(
  "area_members",
  {
    id: id(),
    areaId: char("area_id", { length: 36 })
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isLead: boolean("is_lead").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique("area_members_area_user_uniq").on(t.areaId, t.userId)],
);

/* --------------------------- Informes --------------------------- */

export const reports = mysqlTable(
  "reports",
  {
    id: id(),
    title: varchar("title", { length: 140 }).notNull(),
    description: text("description"),
    areaId: char("area_id", { length: 36 })
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["nuevo", "en_revision", "revisado"]).notNull().default("nuevo"),
    authorId: char("author_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referenceCode: varchar("reference_code", { length: 60 }),
    // Sin clave foránea a propósito: evita la referencia circular con
    // report_versions (que a su vez referencia reports).
    currentVersionId: char("current_version_id", { length: 36 }),
    viewCount: int("view_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_reports_area").on(t.areaId)],
);

export const reportVersions = mysqlTable(
  "report_versions",
  {
    id: id(),
    reportId: char("report_id", { length: 36 })
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 20 }).notNull(),
    versionNumber: int("version_number").notNull().default(1),
    entryPath: varchar("entry_path", { length: 300 }).notNull(),
    // Todas las páginas HTML del paquete, para poder cambiar el entry point.
    htmlPages: json("html_pages").$type<string[]>().notNull(),
    storagePrefix: varchar("storage_prefix", { length: 200 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    fileCount: int("file_count").notNull().default(1),
    uploadedBy: char("uploaded_by", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_versions_report").on(t.reportId),
    // Cierra la carrera de subidas concurrentes que el esquema anterior tenía
    // abierta (version_number se calculaba como count + 1 sin restricción).
    unique("report_versions_number_uniq").on(t.reportId, t.versionNumber),
  ],
);

export const activityLog = mysqlTable(
  "activity_log",
  {
    id: id(),
    userId: char("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    areaId: char("area_id", { length: 36 }).references(() => areas.id, { onDelete: "cascade" }),
    reportId: char("report_id", { length: 36 }).references(() => reports.id, {
      onDelete: "cascade",
    }),
    action: varchar("action", { length: 60 }).notNull(),
    detail: varchar("detail", { length: 500 }),
    createdAt: createdAt(),
  },
  (t) => [index("idx_activity_created").on(t.createdAt)],
);

/* ------------------------ Acceso al visor ------------------------ */

/** Enlaces temporales para servir los archivos del informe. Solo los emite el servidor. */
export const viewTokens = mysqlTable(
  "view_tokens",
  {
    token: char("token", { length: 64 }).primaryKey(),
    versionId: char("version_id", { length: 36 })
      .notNull()
      .references(() => reportVersions.id, { onDelete: "cascade" }),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("idx_view_tokens_expires").on(t.expiresAt)],
);

/* --------------------------- Permisos --------------------------- */

/**
 * Matriz configurable. `area_id` NULL = regla global.
 *
 * Postgres usaba dos índices únicos parciales (uno para las globales y otro
 * para las de área). MySQL no los soporta, así que `area_key` normaliza el NULL
 * a '-' y un único índice cubre ambos casos, habilitando además un
 * INSERT ... ON DUPLICATE KEY UPDATE real.
 *
 * `area_key` no es una columna generada a propósito: MySQL prohíbe
 * ON DELETE CASCADE sobre una columna de la que depende una columna generada, y
 * la cascada de `area_id` es justo lo que limpia las excepciones al borrar un
 * área. La mantiene la aplicación con `areaKeyOf()`; como `area_id` nunca se
 * actualiza y la fila entera desaparece con el área, no puede desincronizarse.
 */
export const permissionSettings = mysqlTable(
  "permission_settings",
  {
    id: id(),
    role: mysqlEnum("role", ["lider", "empleado"]).notNull(),
    areaId: char("area_id", { length: 36 }).references(() => areas.id, { onDelete: "cascade" }),
    capability: varchar("capability", { length: 40 }).notNull(),
    allowed: boolean("allowed").notNull().default(false),
    areaKey: char("area_key", { length: 36 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("permission_settings_uniq").on(t.role, t.capability, t.areaKey)],
);

/** Clave de unicidad de una regla: el área, o '-' para la regla global. */
export function areaKeyOf(areaId: string | null | undefined): string {
  return areaId ?? "-";
}

/* ------------------------ Autenticación ------------------------ */

/** Sesión por cookie. Solo se guarda el SHA-256 del token, nunca el token. */
export const sessions = mysqlTable(
  "sessions",
  {
    id: id(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
    userAgent: varchar("user_agent", { length: 255 }),
    ip: varchar("ip", { length: 45 }),
  },
  (t) => [index("idx_sessions_user").on(t.userId)],
);

/**
 * Tokens de un solo uso para invitación y recuperación de contraseña.
 * Sustituye a los enlaces con hash `#type=invite` de Supabase Auth.
 */
export const authTokens = mysqlTable(
  "auth_tokens",
  {
    id: id(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", ["invite", "recovery"]).notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("idx_auth_tokens_user").on(t.userId)],
);

/* ----------------------------- Tipos ----------------------------- */

export type User = InferSelectModel<typeof users>;
export type Area = InferSelectModel<typeof areas>;
export type AreaMember = InferSelectModel<typeof areaMembers>;
export type Report = InferSelectModel<typeof reports>;
export type ReportVersion = InferSelectModel<typeof reportVersions>;
export type ActivityEntry = InferSelectModel<typeof activityLog>;
export type Session = InferSelectModel<typeof sessions>;
