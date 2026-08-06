/**
 * Siembra la matriz de permisos global (16 filas: 8 capacidades × 2 roles).
 * Es idempotente: reejecutarlo no duplica ni pisa las reglas existentes.
 *
 *   bun run db:seed
 */
import "dotenv/config";

import { sql } from "drizzle-orm";

import { areaKeyOf, db, newId, permissionSettings } from "./index";
import { CAPABILITIES, CONFIGURABLE_ROLES, DEFAULT_MATRIX } from "@/lib/permissions";

async function main() {
  const rows = CONFIGURABLE_ROLES.flatMap((role) =>
    CAPABILITIES.map((capability) => ({
      id: newId(),
      role,
      areaId: null,
      areaKey: areaKeyOf(null),
      capability,
      allowed: DEFAULT_MATRIX[role][capability],
    })),
  );

  // El índice único (role, capability, area_key) hace que la reejecución no
  // duplique; la asignación de `capability` a sí misma es un no-op deliberado
  // para no sobrescribir reglas que el administrador ya haya cambiado.
  await db
    .insert(permissionSettings)
    .values(rows)
    .onDuplicateKeyUpdate({ set: { capability: sql`${permissionSettings.capability}` } });

  console.log(`Matriz de permisos lista (${rows.length} reglas globales).`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
