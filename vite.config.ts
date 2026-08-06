import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// El backend corre en Node autohospedado: mysql2, nodemailer y el SDK de S3
// necesitan APIs de Node, así que Nitro compila con el preset `node-server`.
export default defineConfig(({ command }) => ({
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  server: { host: "::", port: 8080 },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirige la entrada de servidor de TanStack Start a src/server.ts
      // (nuestro envoltorio de errores SSR). Nitro construye desde ahí.
      server: { entry: "server" },
      // Barrera cliente/servidor: cualquier módulo bajo src/server/** se
      // sustituye por un stub en el bundle del navegador. Ahí viven mysql2,
      // nodemailer, el SDK de S3 y las credenciales; solo se usan dentro de
      // handlers de server functions, que el compilador ya elimina del cliente.
      importProtection: {
        behavior: "mock",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
    viteReact(),
  ],
}));
