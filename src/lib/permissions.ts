/**
 * Modelo de permisos granulares del portal.
 *
 * Roles:
 * - admin   → acceso total, no configurable.
 * - lider   → gestiona las áreas donde es líder, según la matriz configurable.
 * - empleado→ sus áreas asignadas, según la matriz configurable.
 *
 * La matriz vive en la tabla `permission_settings`: una regla global por rol
 * (area_id = null) y, opcionalmente, excepciones por área.
 */

export type RoleKey = "admin" | "lider" | "empleado" | "invitado";

/** Roles cuyos permisos se pueden configurar desde la administración. */
export const CONFIGURABLE_ROLES = ["lider", "empleado"] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export const CAPABILITIES = [
  "ver_informes",
  "publicar_informe",
  "nueva_version_propia",
  "nueva_version_ajena",
  "cambiar_estado",
  "eliminar_propio",
  "eliminar_ajeno",
  "ver_actividad",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  ver_informes: "Ver informes del proceso",
  publicar_informe: "Publicar informes nuevos",
  nueva_version_propia: "Subir versión de informes propios",
  nueva_version_ajena: "Subir versión de informes de otros",
  cambiar_estado: "Aprobar informes del proceso",
  eliminar_propio: "Eliminar informes propios",
  eliminar_ajeno: "Eliminar informes de otros",
  ver_actividad: "Ver el historial de actividad",
};

export const CAPABILITY_HINT: Record<Capability, string> = {
  ver_informes: "Acceso al panel, la tabla del proceso y el visor.",
  publicar_informe: "Habilita el formulario de carga en ese proceso.",
  nueva_version_propia: "Actualizar informes que la persona creó.",
  nueva_version_ajena: "Actualizar informes creados por cualquier miembro.",
  cambiar_estado: "Aprobar o devolver a revisión un informe para que sea visible.",
  eliminar_propio: "Borrar sus propios informes y archivos.",
  eliminar_ajeno: "Borrar informes de cualquier miembro del proceso.",
  ver_actividad: "Sección Actividad con el registro global de los procesos.",
};

/** Valores por defecto si no existe regla en la base de datos. */
export const DEFAULT_MATRIX: Record<ConfigurableRole, Record<Capability, boolean>> = {
  lider: {
    ver_informes: true,
    publicar_informe: true,
    nueva_version_propia: true,
    nueva_version_ajena: true,
    cambiar_estado: true,
    eliminar_propio: true,
    eliminar_ajeno: true,
    ver_actividad: true,
  },
  empleado: {
    ver_informes: true,
    publicar_informe: true,
    nueva_version_propia: true,
    nueva_version_ajena: false,
    cambiar_estado: false,
    eliminar_propio: true,
    eliminar_ajeno: false,
    ver_actividad: false,
  },
};

export type PermissionRule = {
  role: ConfigurableRole;
  area_id: string | null;
  capability: Capability;
  allowed: boolean;
};

export type Viewer = {
  userId: string;
  isAdmin: boolean;
  memberAreaIds: string[];
  leadAreaIds: string[];
  rules?: PermissionRule[];
};

export const ROLE_LABEL: Record<RoleKey, string> = {
  admin: "Administrador",
  lider: "Líder de proceso",
  empleado: "Empleado",
  invitado: "Sin procesos asignados",
};

export const ROLE_DESCRIPTION: Record<RoleKey, string> = {
  admin: "Ve todos los procesos, administra procesos, miembros, roles, invitaciones y permisos.",
  lider: "Gestiona los informes de los procesos que lidera, según la matriz configurada.",
  empleado: "Trabaja en los procesos donde es miembro, según la matriz configurada.",
  invitado: "Todavía no pertenece a ningún proceso, por lo que no puede ver ni publicar informes.",
};

export function roleOf(viewer: Viewer | null | undefined): RoleKey {
  if (!viewer) return "invitado";
  if (viewer.isAdmin) return "admin";
  if (viewer.leadAreaIds.length) return "lider";
  if (viewer.memberAreaIds.length) return "empleado";
  return "invitado";
}

/* --------------------------- Matriz --------------------------- */

/** Resuelve una capacidad: excepción del área → regla global → valor por defecto. */
export function resolveRule(
  rules: PermissionRule[] | undefined,
  role: ConfigurableRole,
  capability: Capability,
  areaId?: string | null,
): boolean {
  const list = rules ?? [];
  if (areaId) {
    const areaRule = list.find(
      (r) => r.role === role && r.capability === capability && r.area_id === areaId,
    );
    if (areaRule) return areaRule.allowed;
  }
  const globalRule = list.find(
    (r) => r.role === role && r.capability === capability && r.area_id === null,
  );
  if (globalRule) return globalRule.allowed;
  return DEFAULT_MATRIX[role][capability];
}

/** Rol efectivo del usuario dentro de un área concreta. */
export function roleInArea(
  viewer: Viewer | null | undefined,
  areaId: string | null | undefined,
): RoleKey {
  if (!viewer) return "invitado";
  if (viewer.isAdmin) return "admin";
  if (!areaId) return roleOf(viewer);
  if (viewer.leadAreaIds.includes(areaId)) return "lider";
  if (viewer.memberAreaIds.includes(areaId)) return "empleado";
  return "invitado";
}

/** ¿Puede el usuario ejecutar `capability` dentro de `areaId`? */
export function can(
  viewer: Viewer | null | undefined,
  capability: Capability,
  areaId?: string | null,
): boolean {
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  const role = roleInArea(viewer, areaId);
  if (role !== "lider" && role !== "empleado") return false;
  return resolveRule(viewer.rules, role, capability, areaId ?? null);
}

/* ------------------------------ Áreas ------------------------------ */

export function canViewArea(viewer: Viewer | null | undefined, areaId: string | null | undefined) {
  if (!viewer || !areaId) return false;
  if (viewer.isAdmin) return true;
  if (!viewer.memberAreaIds.includes(areaId)) return false;
  return can(viewer, "ver_informes", areaId);
}

export function isLeadOf(viewer: Viewer | null | undefined, areaId: string | null | undefined) {
  if (!viewer || !areaId) return false;
  return viewer.isAdmin || viewer.leadAreaIds.includes(areaId);
}

/** Solo los administradores crean, editan o eliminan áreas y gestionan personas y permisos. */
export function canManagePortal(viewer: Viewer | null | undefined) {
  return Boolean(viewer?.isAdmin);
}

/* ----------------------------- Informes ----------------------------- */

export type ReportRef = { area_id?: string | null; author_id?: string | null };

/** Publicar un informe o una nueva versión requiere pertenecer al área y tener el permiso. */
export function canUploadToArea(
  viewer: Viewer | null | undefined,
  areaId: string | null | undefined,
) {
  if (!canViewArea(viewer, areaId)) return false;
  return can(viewer, "publicar_informe", areaId);
}

export function canViewReport(viewer: Viewer | null | undefined, report: ReportRef) {
  return canViewArea(viewer, report.area_id);
}

export function canAddVersion(viewer: Viewer | null | undefined, report: ReportRef) {
  if (!canViewArea(viewer, report.area_id)) return false;
  const own = report.author_id === viewer?.userId;
  return can(viewer, own ? "nueva_version_propia" : "nueva_version_ajena", report.area_id);
}

export function canChangeStatus(viewer: Viewer | null | undefined, report: ReportRef) {
  if (!canViewArea(viewer, report.area_id)) return false;
  return can(viewer, "cambiar_estado", report.area_id);
}

export function canDeleteReport(viewer: Viewer | null | undefined, report: ReportRef) {
  if (!canViewArea(viewer, report.area_id)) return false;
  const own = report.author_id === viewer?.userId;
  return can(viewer, own ? "eliminar_propio" : "eliminar_ajeno", report.area_id);
}

/** Historial de actividad: admin, o quien tenga el permiso en alguna de sus áreas. */
export function canViewActivity(viewer: Viewer | null | undefined) {
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  return viewer.memberAreaIds.some((areaId) => can(viewer, "ver_actividad", areaId));
}

/** Áreas donde el usuario puede publicar. */
export function uploadableAreaIds(viewer: Viewer | null | undefined): string[] {
  if (!viewer) return [];
  return viewer.memberAreaIds.filter((areaId) => canUploadToArea(viewer, areaId));
}

/** Áreas visibles para el usuario. */
export function visibleAreaIds(viewer: Viewer | null | undefined): string[] {
  if (!viewer) return [];
  return viewer.memberAreaIds.filter((areaId) => canViewArea(viewer, areaId));
}
