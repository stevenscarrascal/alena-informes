import { activityLog, db, newId } from "@/server/db";

/** Registra una entrada en el historial de actividad. */
export async function logActivity(entry: {
  userId: string | null;
  areaId?: string | null;
  reportId?: string | null;
  action: string;
  detail?: string | null;
}): Promise<void> {
  await db.insert(activityLog).values({
    id: newId(),
    userId: entry.userId,
    areaId: entry.areaId ?? null,
    reportId: entry.reportId ?? null,
    action: entry.action,
    detail: entry.detail?.slice(0, 500) ?? null,
  });
}
