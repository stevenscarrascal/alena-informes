/**
 * Conversión de las filas de Drizzle (camelCase, fechas como Date) al formato
 * que el frontend ya consumía de PostgREST: claves snake_case y fechas en
 * ISO 8601 UTC.
 *
 * Mantener estas formas intactas es lo que permite reemplazar el backend sin
 * reescribir las páginas.
 */
import { iso } from "@/server/db";
import type { ActivityEntry, Area, Report, ReportVersion, User } from "@/server/db";

export type AreaDTO = ReturnType<typeof toArea>;
export type VersionDTO = ReturnType<typeof toVersion>;
export type ProfileDTO = ReturnType<typeof toProfile>;

export function toArea(area: Area) {
  return {
    id: area.id,
    name: area.name,
    slug: area.slug,
    description: area.description,
    icon: area.icon,
    color: area.color,
    created_at: iso(area.createdAt),
    updated_at: iso(area.updatedAt),
  };
}

/** Versión reducida que se incrusta dentro de un informe (embed de PostgREST). */
export function toAreaRef(area: Pick<Area, "id" | "name" | "slug" | "color" | "icon"> | null) {
  if (!area?.id) return null;
  return { id: area.id, name: area.name, slug: area.slug, color: area.color, icon: area.icon };
}

export function toVersion(version: ReportVersion) {
  return {
    id: version.id,
    report_id: version.reportId,
    version: version.version,
    version_number: version.versionNumber,
    entry_path: version.entryPath,
    html_pages: version.htmlPages ?? [],
    storage_prefix: version.storagePrefix,
    size_bytes: Number(version.sizeBytes ?? 0),
    file_count: version.fileCount,
    uploaded_by: version.uploadedBy,
    created_at: iso(version.createdAt),
  };
}

/** Resumen de la versión actual que `listReports` incrusta en cada informe. */
export function toVersionRef(
  version: Pick<ReportVersion, "id" | "version" | "sizeBytes" | "createdAt"> | null,
) {
  if (!version?.id) return null;
  return {
    id: version.id,
    version: version.version,
    size_bytes: Number(version.sizeBytes ?? 0),
    created_at: iso(version.createdAt),
  };
}

export function toReport(
  report: Report,
  extra: {
    areas?: ReturnType<typeof toAreaRef>;
    report_versions?: ReturnType<typeof toVersionRef>;
    author_name?: string | null;
  } = {},
) {
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    area_id: report.areaId,
    status: report.status,
    author_id: report.authorId,
    reference_code: report.referenceCode,
    current_version_id: report.currentVersionId,
    view_count: report.viewCount,
    created_at: iso(report.createdAt),
    updated_at: iso(report.updatedAt),
    ...extra,
  };
}

/** El antiguo `profiles`: los datos públicos del usuario, sin el hash. */
export function toProfile(user: Omit<User, "passwordHash"> | User) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    job_title: user.jobTitle,
    avatar_url: user.avatarUrl,
    created_at: iso(user.createdAt),
    updated_at: iso(user.updatedAt),
  };
}

export function toActivity(
  entry: ActivityEntry,
  extra: { areas?: { name: string; slug: string } | null; author_name?: string | null } = {},
) {
  return {
    id: entry.id,
    user_id: entry.userId,
    area_id: entry.areaId,
    report_id: entry.reportId,
    action: entry.action,
    detail: entry.detail,
    created_at: iso(entry.createdAt),
    ...extra,
  };
}
