import { eq } from "drizzle-orm";

import { areaMembers, areas, db, permissionSettings, userRoles } from "@/server/db";
import { CAPABILITIES, type Capability, type PermissionRule, type Viewer } from "@/lib/permissions";

/** Reglas configuradas de la matriz de permisos, filtrando capacidades desconocidas. */
export async function loadRules(): Promise<PermissionRule[]> {
  const rows = await db
    .select({
      role: permissionSettings.role,
      area_id: permissionSettings.areaId,
      capability: permissionSettings.capability,
      allowed: permissionSettings.allowed,
    })
    .from(permissionSettings);

  return rows.filter((r): r is PermissionRule => CAPABILITIES.includes(r.capability as Capability));
}

/**
 * Rol efectivo del usuario: si es admin, si lidera áreas y en cuáles es miembro.
 *
 * Como en el modelo anterior, un administrador cuenta como miembro de todas las
 * áreas: `canViewArea` exige pertenencia y de otro modo un admin sin áreas
 * asignadas no vería nada.
 */
export async function loadViewer(userId: string): Promise<Viewer> {
  const [roles, memberships, rules] = await Promise.all([
    db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)),
    db
      .select({ areaId: areaMembers.areaId, isLead: areaMembers.isLead })
      .from(areaMembers)
      .where(eq(areaMembers.userId, userId)),
    loadRules(),
  ]);

  const isAdmin = roles.some((r) => r.role === "admin");
  let memberAreaIds = memberships.map((m) => m.areaId);

  if (isAdmin) {
    const all = await db.select({ id: areas.id }).from(areas);
    memberAreaIds = [...new Set([...memberAreaIds, ...all.map((a) => a.id)])];
  }

  return {
    userId,
    isAdmin,
    memberAreaIds,
    leadAreaIds: memberships.filter((m) => m.isLead).map((m) => m.areaId),
    rules,
  };
}
