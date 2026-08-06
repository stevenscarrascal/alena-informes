import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Mail, Plus, Trash2, UserPlus } from "lucide-react";

import { AppShell } from "@/components/portal/AppShell";
import {
  adminDeleteArea,
  adminGetDirectory,
  adminInviteUser,
  adminResendInvite,
  adminSaveArea,
  adminSetMember,
  adminSetPassword,
  adminSetRole,
} from "@/lib/portal.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administración | Alena - Informes" },
      {
        name: "description",
        content: "Gestiona áreas, miembros, roles e invitaciones del portal interno de informes.",
      },
      { property: "og:title", content: "Administración | Alena - Informes" },
      {
        property: "og:description",
        content: "Gestiona áreas, miembros, roles e invitaciones del portal interno de informes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const queryClient = useQueryClient();
  const fetchDirectory = useServerFn(adminGetDirectory);
  const saveArea = useServerFn(adminSaveArea);
  const deleteArea = useServerFn(adminDeleteArea);
  const setMember = useServerFn(adminSetMember);
  const inviteUser = useServerFn(adminInviteUser);
  const setRole = useServerFn(adminSetRole);
  const resendInvite = useServerFn(adminResendInvite);
  const setPassword = useServerFn(adminSetPassword);

  const directory = useQuery({ queryKey: ["directory"], queryFn: () => fetchDirectory({}) });

  const [areaName, setAreaName] = useState("");
  const [areaColor, setAreaColor] = useState("#1e40af");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteJob, setInviteJob] = useState("");
  const [inviteArea, setInviteArea] = useState("");
  const [inviteAdmin, setInviteAdmin] = useState(false);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [lastInviteMode, setLastInviteMode] = useState<"invite" | "recovery" | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ocurrió un error");
    } finally {
      setBusy(false);
    }
  }

  const areas = directory.data?.areas ?? [];
  const profiles = directory.data?.profiles ?? [];
  const members = directory.data?.members ?? [];
  const roles = directory.data?.roles ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">Administración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crea áreas, asigna miembros e invita empleados al portal.
        </p>

        <Tabs defaultValue="areas" className="mt-6">
          <TabsList>
            <TabsTrigger value="areas">Áreas y miembros</TabsTrigger>
            <TabsTrigger value="people">Personas</TabsTrigger>
          </TabsList>

          <TabsContent value="areas" className="space-y-6 pt-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-display text-sm font-semibold">Nueva área</h2>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1 space-y-2">
                  <Label htmlFor="areaName">Nombre</Label>
                  <Input
                    id="areaName"
                    value={areaName}
                    onChange={(e) => setAreaName(e.target.value)}
                    placeholder="Ej. Sistemas"
                    maxLength={60}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="areaColor">Color</Label>
                  <Input
                    id="areaColor"
                    type="color"
                    value={areaColor}
                    onChange={(e) => setAreaColor(e.target.value)}
                    className="h-9 w-16 p-1"
                  />
                </div>
                <Button
                  disabled={busy || areaName.trim().length < 2}
                  onClick={() =>
                    void run(async () => {
                      await saveArea({ data: { name: areaName.trim(), color: areaColor } });
                      setAreaName("");
                    }, "Área creada")
                  }
                >
                  <Plus className="size-4" /> Crear
                </Button>
              </div>
            </div>

            {areas.map((area) => {
              const areaMembers = members.filter((m) => m.area_id === area.id);
              return (
                <div key={area.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: area.color ?? "#1e40af" }}
                      />
                      <h3 className="font-display text-base font-semibold">{area.name}</h3>
                      <Badge variant="secondary">{areaMembers.length} miembros</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void run(() => deleteArea({ data: { id: area.id } }), "Área eliminada")
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <ul className="mt-4 space-y-2">
                    {areaMembers.map((member) => {
                      const profile = profiles.find((p) => p.id === member.user_id);
                      return (
                        <li
                          key={`${member.area_id}-${member.user_id}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <span>{profile?.full_name ?? profile?.email ?? member.user_id}</span>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              Líder
                              <Switch
                                checked={member.is_lead}
                                onCheckedChange={(checked) =>
                                  void run(
                                    () =>
                                      setMember({
                                        data: {
                                          areaId: area.id,
                                          userId: member.user_id,
                                          isLead: checked,
                                        },
                                      }),
                                    "Miembro actualizado",
                                  )
                                }
                              />
                            </label>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void run(
                                  () =>
                                    setMember({
                                      data: {
                                        areaId: area.id,
                                        userId: member.user_id,
                                        remove: true,
                                      },
                                    }),
                                  "Miembro retirado",
                                )
                              }
                            >
                              Quitar
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-3">
                    <Select
                      onValueChange={(userId) =>
                        void run(
                          () => setMember({ data: { areaId: area.id, userId } }),
                          "Miembro agregado",
                        )
                      }
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Agregar miembro…" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles
                          .filter((p) => !areaMembers.some((m) => m.user_id === p.id))
                          .map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.full_name ?? profile.email}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="people" className="space-y-6 pt-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-display text-sm font-semibold">Invitar empleado</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="inviteName">Nombre completo</Label>
                  <Input
                    id="inviteName"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">Correo</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteJob">Cargo</Label>
                  <Input
                    id="inviteJob"
                    value={inviteJob}
                    onChange={(e) => setInviteJob(e.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Área inicial</Label>
                  <Select value={inviteArea} onValueChange={setInviteArea}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin área" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <Switch checked={inviteAdmin} onCheckedChange={setInviteAdmin} />
                Otorgar rol de administrador
              </label>
              <Button
                className="mt-4"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await inviteUser({
                      data: {
                        email: inviteEmail.trim(),
                        fullName: inviteName.trim(),
                        ...(inviteJob ? { jobTitle: inviteJob.trim() } : {}),
                        ...(inviteArea ? { areaId: inviteArea } : {}),
                        makeAdmin: inviteAdmin,
                        redirectTo: `${window.location.origin}/auth`,
                      },
                    });
                    setInviteEmail("");
                    setInviteName("");
                    setInviteJob("");
                  }, "Invitación enviada")
                }
              >
                <UserPlus className="size-4" /> Enviar invitación
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-3 font-display text-sm font-semibold">
                Personas del portal
              </h2>
              <ul className="divide-y divide-border">
                {profiles.map((profile) => {
                  const isAdmin = roles.some((r) => r.user_id === profile.id && r.role === "admin");
                  return (
                    <li key={profile.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{profile.full_name ?? "Sin nombre"}</p>
                          <p className="text-xs text-muted-foreground">{profile.email}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const result = await resendInvite({
                                  data: {
                                    userId: profile.id,
                                    redirectTo: `${window.location.origin}/auth`,
                                  },
                                });
                                setLastInviteMode(result.mode);
                              }, "Correo enviado")
                            }
                          >
                            <Mail className="size-4" /> Reenviar invitación
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPasswordFor(passwordFor === profile.id ? null : profile.id)
                            }
                          >
                            <KeyRound className="size-4" /> Contraseña
                          </Button>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Admin
                            <Switch
                              checked={isAdmin}
                              onCheckedChange={(checked) =>
                                void run(
                                  () =>
                                    setRole({ data: { userId: profile.id, makeAdmin: checked } }),
                                  "Rol actualizado",
                                )
                              }
                            />
                          </label>
                        </div>
                      </div>

                      {passwordFor === profile.id && (
                        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 p-3">
                          <div className="min-w-56 flex-1 space-y-2">
                            <Label htmlFor={`pwd-${profile.id}`}>Nueva contraseña</Label>
                            <Input
                              id={`pwd-${profile.id}`}
                              type="text"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Mínimo 8 caracteres"
                              maxLength={72}
                            />
                          </div>
                          <Button
                            disabled={busy || newPassword.length < 8}
                            onClick={() =>
                              void run(async () => {
                                await setPassword({
                                  data: { userId: profile.id, password: newPassword },
                                });
                                setNewPassword("");
                                setPasswordFor(null);
                              }, "Contraseña actualizada")
                            }
                          >
                            Guardar contraseña
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {lastInviteMode && (
                <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                  {lastInviteMode === "invite"
                    ? "Se reenvió la invitación original para activar la cuenta."
                    : "La cuenta ya estaba activa: se envió un enlace para restablecer la contraseña."}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
