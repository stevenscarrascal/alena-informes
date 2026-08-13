import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, Check, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";

import { AppShell, useMe } from "@/components/portal/AppShell";
import {
  adminClearAreaOverrides,
  adminGetDirectory,
  adminGetPermissions,
  adminSetPermission,
} from "@/lib/portal.functions";
import {
  CAPABILITIES,
  CAPABILITY_HINT,
  CAPABILITY_LABEL,
  CONFIGURABLE_ROLES,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  canUploadToArea,
  canViewActivity,
  canViewArea,
  resolveRule,
  type Capability,
  type ConfigurableRole,
  type PermissionRule,
  type RoleKey,
  type Viewer,
} from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({
    meta: [
      { title: "Permisos por rol y proceso | Alena - Informes" },
      {
        name: "description",
        content:
          "Configura en caliente qué puede hacer cada rol en cada proceso y previsualiza la experiencia de líderes y empleados.",
      },
      { property: "og:title", content: "Permisos por rol y proceso | Alena - Informes" },
      {
        property: "og:description",
        content:
          "Configura en caliente qué puede hacer cada rol en cada proceso y previsualiza la experiencia de líderes y empleados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PermissionsPage,
});

const GLOBAL = "__global__";

function PermissionsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const fetchPermissions = useServerFn(adminGetPermissions);
  const fetchDirectory = useServerFn(adminGetDirectory);
  const savePermission = useServerFn(adminSetPermission);
  const clearOverrides = useServerFn(adminClearAreaOverrides);

  const permissions = useQuery({
    queryKey: ["permissions"],
    queryFn: () => fetchPermissions({}),
  });
  const directory = useQuery({ queryKey: ["directory"], queryFn: () => fetchDirectory({}) });

  const [scope, setScope] = useState<string>(GLOBAL);
  const [previewRole, setPreviewRole] = useState<RoleKey>("empleado");
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState<PermissionRule[] | null>(null);

  const areas = directory.data?.areas ?? [];
  const rules = draft ?? permissions.data?.rules ?? [];
  const areaId = scope === GLOBAL ? null : scope;
  const currentArea = areas.find((a) => a.id === areaId) ?? null;

  const hasOverrides = useMemo(
    () => Boolean(areaId) && rules.some((r) => r.area_id === areaId),
    [rules, areaId],
  );

  function valueOf(role: ConfigurableRole, capability: Capability) {
    return resolveRule(rules, role, capability, areaId);
  }

  function isOverride(role: ConfigurableRole, capability: Capability) {
    return Boolean(
      areaId &&
      rules.some((r) => r.role === role && r.capability === capability && r.area_id === areaId),
    );
  }

  async function toggle(role: ConfigurableRole, capability: Capability, allowed: boolean) {
    const key = `${role}:${capability}`;
    setPending(key);
    // Cambio en caliente: la matriz y la vista previa reflejan el valor al instante.
    const next: PermissionRule[] = [
      ...rules.filter(
        (r) => !(r.role === role && r.capability === capability && r.area_id === areaId),
      ),
      { role, capability, area_id: areaId, allowed },
    ];
    setDraft(next);
    try {
      await savePermission({ data: { role, areaId, capability, allowed } });
      await queryClient.invalidateQueries();
      setDraft(null);
      toast.success(
        `${ROLE_LABEL[role]}: ${CAPABILITY_LABEL[capability]} ${allowed ? "permitido" : "bloqueado"}`,
      );
    } catch (error) {
      setDraft(null);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el permiso");
    } finally {
      setPending(null);
    }
  }

  async function resetArea() {
    if (!areaId) return;
    setPending("reset");
    try {
      await clearOverrides({ data: { areaId } });
      await queryClient.invalidateQueries();
      setDraft(null);
      toast.success("Excepciones del proceso eliminadas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo restablecer");
    } finally {
      setPending(null);
    }
  }

  /** Usuario ficticio para la vista previa, con las reglas actuales en memoria. */
  const previewViewer: Viewer | null = useMemo(() => {
    const target = areaId ?? areas[0]?.id ?? null;
    if (!target) return null;
    if (previewRole === "admin") {
      return {
        userId: "preview",
        isAdmin: true,
        memberAreaIds: areas.map((a) => a.id),
        leadAreaIds: areas.map((a) => a.id),
        rules,
      };
    }
    if (previewRole === "invitado") {
      return { userId: "preview", isAdmin: false, memberAreaIds: [], leadAreaIds: [], rules };
    }
    return {
      userId: "preview",
      isAdmin: false,
      memberAreaIds: [target],
      leadAreaIds: previewRole === "lider" ? [target] : [],
      rules,
    };
  }, [previewRole, areaId, areas, rules]);

  // Va después de todos los hooks: un return antes rompía el orden de llamada
  // de React en cuanto la página la abría alguien sin rol de administrador.
  if (me && !me.isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-5 py-16 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-3 font-display text-xl font-bold">Sección restringida</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Solo los administradores pueden configurar los permisos del portal.
          </p>
        </div>
      </AppShell>
    );
  }

  const previewAreaId = areaId ?? areas[0]?.id ?? null;
  const previewArea = areas.find((a) => a.id === previewAreaId) ?? null;

  const previewChecks = previewViewer
    ? [
        { label: "Panel y tabla del proceso", ok: canViewArea(previewViewer, previewAreaId) },
        { label: "Botón «Cargar informe»", ok: canUploadToArea(previewViewer, previewAreaId) },
        { label: "Sección «Actividad»", ok: canViewActivity(previewViewer) },
        {
          label: "Cambiar estado de revisión",
          ok:
            previewRole === "admin" ||
            (canViewArea(previewViewer, previewAreaId) &&
              resolveRule(
                rules,
                previewRole === "lider" ? "lider" : "empleado",
                "cambiar_estado",
                previewAreaId,
              )),
        },
        {
          label: "Nueva versión de informes de otros",
          ok:
            previewRole === "admin" ||
            (canViewArea(previewViewer, previewAreaId) &&
              resolveRule(
                rules,
                previewRole === "lider" ? "lider" : "empleado",
                "nueva_version_ajena",
                previewAreaId,
              )),
        },
        {
          label: "Eliminar informes de otros",
          ok:
            previewRole === "admin" ||
            (canViewArea(previewViewer, previewAreaId) &&
              resolveRule(
                rules,
                previewRole === "lider" ? "lider" : "empleado",
                "eliminar_ajeno",
                previewAreaId,
              )),
        },
        { label: "Administración del portal", ok: previewRole === "admin" },
      ]
    : [];

  return (
    <AppShell>
      <div className="mx-auto px-8 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">Permisos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define qué puede hacer cada rol, de forma global o con excepciones por proceso. Los cambios
          se aplican de inmediato.
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Alcance</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL}>Reglas globales (todos los procesos)</SelectItem>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {currentArea && (
            <Button
              variant="outline"
              disabled={!hasOverrides || pending === "reset"}
              onClick={() => void resetArea()}
            >
              <RotateCcw className="size-4" /> Volver a las reglas globales
            </Button>
          )}
          {currentArea && hasOverrides && <Badge variant="secondary">Proceso personalizado</Badge>}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Acción</th>
                  <th className="px-4 py-3 text-center font-medium">Administrador</th>
                  {CONFIGURABLE_ROLES.map((role) => (
                    <th key={role} className="px-4 py-3 text-center font-medium">
                      {ROLE_LABEL[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CAPABILITIES.map((capability) => (
                  <tr key={capability}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{CAPABILITY_LABEL[capability]}</p>
                      <p className="text-xs text-muted-foreground">{CAPABILITY_HINT[capability]}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">Siempre</td>
                    {CONFIGURABLE_ROLES.map((role) => (
                      <td key={role} className="px-4 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={valueOf(role, capability)}
                            disabled={pending === `${role}:${capability}`}
                            onCheckedChange={(checked) => void toggle(role, capability, checked)}
                            aria-label={`${ROLE_LABEL[role]} · ${CAPABILITY_LABEL[capability]}`}
                          />
                          {isOverride(role, capability) && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              excepción
                            </span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-display text-sm font-semibold">Vista previa</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Qué vería una persona con este rol en{" "}
                <strong>{previewArea?.name ?? "el proceso seleccionado"}</strong>.
              </p>
              <div className="mt-3">
                <Select value={previewRole} onValueChange={(v) => setPreviewRole(v as RoleKey)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                    <SelectItem value="lider">{ROLE_LABEL.lider}</SelectItem>
                    <SelectItem value="empleado">{ROLE_LABEL.empleado}</SelectItem>
                    <SelectItem value="invitado">{ROLE_LABEL.invitado}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{ROLE_DESCRIPTION[previewRole]}</p>

              {!previewArea && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Crea un proceso para poder previsualizar la experiencia.
                </p>
              )}

              <ul className="mt-4 space-y-2">
                {previewChecks.map((check) => (
                  <li key={check.label} className="flex items-center gap-2 text-sm">
                    {check.ok ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <X className="size-4 text-muted-foreground" />
                    )}
                    <span className={check.ok ? "" : "text-muted-foreground line-through"}>
                      {check.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-5 text-xs text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Upload className="size-4" /> Menú simulado
              </p>
              <ul className="mt-2 space-y-1">
                <li>
                  Panel {previewViewer && canViewArea(previewViewer, previewAreaId) ? "✓" : "—"}
                </li>
                <li>
                  Cargar informe{" "}
                  {previewViewer && canUploadToArea(previewViewer, previewAreaId) ? "✓" : "—"}
                </li>
                <li className="flex items-center gap-1">
                  <Activity className="size-3" /> Actividad{" "}
                  {previewViewer && canViewActivity(previewViewer) ? "✓" : "—"}
                </li>
                <li>Administración {previewRole === "admin" ? "✓" : "—"}</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
