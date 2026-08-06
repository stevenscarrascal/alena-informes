export type Status = "nuevo" | "en_revision" | "revisado";

export const STATUS_LABEL: Record<Status, string> = {
  nuevo: "PENDIENTE",
  en_revision: "EN REVISIÓN",
  revisado: "APROBADO",
};

/** Un informe solo es visible para el resto del área cuando está aprobado. */
export function isApproved(status: string | null | undefined): boolean {
  return status === "revisado";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export function nextVersionLabel(count: number): string {
  return `v${count}.0.0`;
}
