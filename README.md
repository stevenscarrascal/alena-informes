# Alena · Informes

Portal interno para publicar, versionar y consultar informes HTML por área.

Backend propio sobre **MySQL** (datos), **SMTP** (correo) y **S3** (archivos),
sobre TanStack Start (SSR + server functions) desplegado como Node autohospedado.

## Desarrollo

No usa Docker: los tres servicios (MySQL, S3, correo) los da
[Herd](https://herd.laravel.com) en local.

1. En Herd, activa el servicio **MySQL** y crea la base `informes`.
2. En Herd, activa **S3** (bucket `informes`) y el **mailcatcher**.
3. Copia `.env.example` a `.env` — los valores por defecto ya apuntan a Herd
   (`root@127.0.0.1:3306`, `http://localhost:9000`, `127.0.0.1:2526`). Ajusta
   `SESSION_SECRET` con:
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

```sh
bun install
bun run db:push               # aplica el esquema (usa db:migrate en producción)
bun run db:seed               # matriz de permisos por defecto
bun run dev                   # http://localhost:8080
```

El primer usuario que se registra en `/auth` se convierte en administrador.
Los correos de invitación/recuperación caen en el mailcatcher de Herd (revisa
su panel para ver el enlace, ya que no hay bandeja real en desarrollo).

## Producción

Sin Docker: se construye y se corre directamente con Node.

```sh
bun run build                 # Nitro compila con el preset node-server
bun run start                 # node .output/server/index.mjs
```

`.env` en producción debe apuntar a servicios reales: MySQL gestionado,
**DigitalOcean Spaces** (mismas variables `AWS_*`, solo cambian
`AWS_ENDPOINT`/`AWS_BUCKET`/credenciales) y un SMTP real (`MAIL_*`, con
`MAIL_ENCRYPTION=tls` normalmente). Ver `.env.example` para el detalle de cada
variable. Ninguna lleva prefijo `VITE_` — todas las credenciales quedan en el
servidor, nunca en el navegador.

## Estructura

- `src/routes/` — páginas y rutas de servidor (TanStack Start, file-based).
- `src/lib/*.functions.ts` — server functions (la API del portal).
- `src/lib/permissions.ts` — matriz de capacidades por rol/área.
- `src/server/` — acceso a datos (Drizzle/MySQL), autenticación por cookie,
  autorización (`scope.ts`, sustituye a RLS), S3 y SMTP.
- `src/server/db/schema.ts` — esquema; `drizzle/` guarda las migraciones.

## Built with

- TanStack Start · TypeScript · React · Tailwind CSS
- MySQL (Drizzle ORM) · SMTP (Nodemailer) · S3 (AWS SDK)
