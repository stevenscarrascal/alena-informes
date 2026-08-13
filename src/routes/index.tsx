import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileCode2,
  FolderKanban,
  History,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";

import dashboardImg from "@/assets/landing-dashboard.jpg";
import reportImg from "@/assets/landing-report.jpg";
import { AlenaLogo, ThemeToggle } from "@/components/portal/theme";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Alena - Informes | Portal de informes HTML por proceso" },
      {
        name: "description",
        content:
          "Alena centraliza los informes HTML que tu equipo genera con IA: carga, versiona, comparte y visualiza cada informe por proceso con permisos granulares.",
      },
      { property: "og:title", content: "Alena - Informes | Portal de informes HTML por proceso" },
      {
        property: "og:description",
        content:
          "Alena centraliza los informes HTML que tu equipo genera con IA: carga, versiona, comparte y visualiza cada informe por proceso con permisos granulares.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const stats = [
  { value: "1 clic", label: "Publicar un informe" },
  { value: "HTML + ZIP", label: "Formatos soportados" },
  { value: "100%", label: "Sandbox seguro" },
  { value: "∞", label: "Versiones por informe" },
];

const features = [
  {
    icon: Upload,
    title: "Carga HTML o ZIP",
    body: "Sube un .html o un .zip con index.html, CSS y JS. Si hay varias páginas, tú eliges cuál es la principal.",
  },
  {
    icon: FolderKanban,
    title: "Procesos y miembros",
    body: "Crea procesos, asigna líderes y miembros, y mantén cada informe visible solo para quien corresponde.",
  },
  {
    icon: FileCode2,
    title: "Visor interactivo",
    body: "Los informes se ven completos y navegables, con gráficos funcionando y miniaturas reales en el listado.",
  },
  {
    icon: History,
    title: "Versiones y estados",
    body: "Cada carga genera una versión nueva con historial, tamaño y estado de revisión (nuevo, en revisión, revisado).",
  },
  {
    icon: ShieldCheck,
    title: "Sandbox y saneado",
    body: "El HTML se sanea, se sirve con CSP estricta y se renderiza en un iframe de origen opaco.",
  },
  {
    icon: Users,
    title: "Permisos granulares",
    body: "Matriz por rol y por proceso, con excepciones puntuales y vista previa de lo que verá cada persona.",
  },
];

const steps = [
  {
    n: "01",
    title: "Genera tu informe con IA",
    body: "ChatGPT, Claude o tu herramienta favorita exportan un HTML.",
  },
  {
    n: "02",
    title: "Cárgalo en tu proceso",
    body: "Arrastra el .html o el .zip; detectamos el index automáticamente.",
  },
  {
    n: "03",
    title: "Compártelo con tu equipo",
    body: "Tu proceso lo ve al instante, con versiones y estado de revisión.",
  },
];

const examples = [
  {
    area: "Sistemas",
    title: "Auditoría de servidores Q3",
    status: "Revisado",
    color: "#1e40af",
    bars: [60, 82, 45, 90, 70, 55],
  },
  {
    area: "Comercial",
    title: "Pipeline y conversión mensual",
    status: "En revisión",
    color: "#0d9488",
    bars: [35, 50, 68, 74, 88, 96],
  },
  {
    area: "Talento humano",
    title: "Rotación y clima laboral",
    status: "Nuevo",
    color: "#b45309",
    bars: [80, 42, 63, 51, 77, 38],
  },
];

function MiniChart({ bars, color }: { bars: number[]; color: string }) {
  return (
    <div className="flex h-24 items-end gap-1.5" aria-hidden="true">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all"
          style={{
            height: `${h}%`,
            backgroundColor: color,
            opacity: 0.35 + (i / bars.length) * 0.65,
          }}
        />
      ))}
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <AlenaLogo className="h-9 w-auto" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link to="/auth">Ingresar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(60%_60%_at_50%_50%,var(--color-primary)_0%,transparent_70%)] opacity-15"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Activity className="size-3.5 text-primary" />
                Intranet corporativa
              </p>
              <h1 className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-6xl">
                Los informes de tu equipo,
                <span className="text-primary"> en un solo portal</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                Alena centraliza los informes HTML que cada proceso genera con IA: se cargan, se
                versionan y se consultan en un visor interactivo. Sin correos ni archivos sueltos.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/auth">
                    Entrar al portal
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/dashboard">Ver mi panel</Link>
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {["Acceso por invitación", "Versionado automático", "Permisos por proceso"].map(
                  (t) => (
                    <li key={t} className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-primary" />
                      {t}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                <img
                  src={dashboardImg}
                  alt="Panel de Alena mostrando informes por proceso con gráficos y métricas"
                  width={1600}
                  height={1008}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-b border-border bg-muted/30">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="font-display text-3xl font-bold text-foreground">{s.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Todo lo que necesita un portal de informes
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Pensado para equipos que producen documentación con IA y necesitan orden, trazabilidad y
            control de acceso.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Viewer showcase */}
        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              <img
                src={reportImg}
                alt="Informe HTML con gráficos renderizado dentro del visor de Alena"
                width={1200}
                height={912}
                loading="lazy"
                className="w-full"
              />
            </div>
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Tus gráficos siguen vivos
              </h2>
              <p className="mt-4 text-muted-foreground">
                No convertimos tu informe en una imagen ni en un PDF plano: se renderiza el HTML
                real con sus estilos y scripts permitidos, dentro de un sandbox aislado.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Gráficos de Chart.js, Plotly o ECharts funcionando",
                  "Miniaturas reales en el panel y en la tabla del proceso",
                  "Selector de página principal cuando el ZIP trae varias",
                  "Descarga y pantalla completa desde el visor",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Examples */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Ejemplos de informes
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Así se ven las tarjetas en el panel: proceso, estado de revisión y una vista previa del
            contenido.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {examples.map((ex) => (
              <article
                key={ex.title}
                className="flex flex-col rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ backgroundColor: ex.color }} />
                    {ex.area}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {ex.status}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                  {ex.title}
                </h3>
                <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                  <MiniChart bars={ex.bars} color={ex.color} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">v3 · actualizado hace 2 días</p>
              </article>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Del prompt al portal en tres pasos
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="rounded-xl border border-border bg-card p-6">
                  <span className="font-display text-4xl font-bold text-primary/25">{s.n}</span>
                  <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
              ¿Listo para ordenar los informes de tu organización?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              El acceso es por invitación: un administrador crea las procesos y suma a cada persona.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Entrar al portal
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <AlenaLogo className="h-7 w-auto" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Alena · Portal interno de informes
          </p>
        </div>
      </footer>
    </div>
  );
}
