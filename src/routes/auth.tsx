import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlenaLogo, ThemeToggle } from "@/components/portal/theme";

import {
  acceptInvite,
  bootstrapSignUp,
  getBootstrapStatus,
  requestPasswordReset,
  signIn,
} from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthSearch = {
  type?: "invite" | "recovery" | undefined;
  token?: string | undefined;
};

export const Route = createFileRoute("/auth")({
  // El enlace del correo llega como ?type=invite&token=… Antes era el hash
  // `#type=invite` que ponía Supabase Auth.
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    type: search["type"] === "invite" || search["type"] === "recovery" ? search["type"] : undefined,
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Acceso | Alena - Informes" },
      {
        name: "description",
        content: "Ingresa al portal interno para consultar y publicar informes HTML por área.",
      },
      { property: "og:title", content: "Acceso | Alena - Informes" },
      {
        property: "og:description",
        content: "Ingresa al portal interno para consultar y publicar informes HTML por área.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "recovery" | "bootstrap" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const bootstrapStatus = useServerFn(getBootstrapStatus);
  const createAdmin = useServerFn(bootstrapSignUp);
  const login = useServerFn(signIn);
  const activate = useServerFn(acceptInvite);
  const forgotPassword = useServerFn(requestPasswordReset);

  const hasToken = Boolean(search.type && search.token);
  const [mode, setMode] = useState<Mode>(hasToken ? "recovery" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasToken) return;
    void bootstrapStatus({}).then((status) => {
      if (!status.hasAdmin) setMode("bootstrap");
    });
  }, [bootstrapStatus, hasToken]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "recovery") {
        await activate({ data: { token: search.token ?? "", password } });
        toast.success("Contraseña establecida");
        navigate({ to: "/dashboard" });
        return;
      }

      if (mode === "forgot") {
        await forgotPassword({ data: { email } });
        toast.success("Si el correo existe, te enviamos un enlace para restablecerla");
        setMode("login");
        return;
      }

      if (mode === "bootstrap") {
        await createAdmin({ data: { email, password, fullName } });
        toast.success("Cuenta de administrador creada");
        navigate({ to: "/dashboard" });
        return;
      }

      await login({ data: { email, password } });
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "recovery"
      ? "Define tu contraseña"
      : mode === "bootstrap"
        ? "Crea la cuenta de administrador"
        : mode === "forgot"
          ? "Recupera tu acceso"
          : "Alena - Informes";

  const description =
    mode === "recovery"
      ? search.type === "invite"
        ? "Estás activando tu invitación. Elige una contraseña para entrar."
        : "Elige una contraseña nueva para volver a entrar."
      : mode === "bootstrap"
        ? "Aún no hay administradores. La primera cuenta gestionará áreas e invitaciones."
        : mode === "forgot"
          ? "Te enviaremos un enlace para definir una contraseña nueva."
          : "El acceso es por invitación. Ingresa con el correo de tu empresa.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <AlenaLogo alt="Alena" className="h-10 w-auto" />
            <ThemeToggle />
          </div>
          <CardTitle className="font-display text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === "bootstrap" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
            )}
            {mode !== "recovery" && (
              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                />
              </div>
            )}
            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Procesando…"
                : mode === "recovery"
                  ? "Guardar y entrar"
                  : mode === "forgot"
                    ? "Enviar enlace"
                    : "Entrar"}
            </Button>
          </form>

          {mode === "login" && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode("forgot")}
            >
              Olvidé mi contraseña
            </button>
          )}
          {mode === "forgot" && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode("login")}
            >
              Volver al inicio de sesión
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
