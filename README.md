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

## Producción (VPS / CloudPanel)

Sin Docker: la app se compila y se arranca directamente con Node. El flujo
recomendado en un VPS con CloudPanel es:

1. Subir el repositorio al directorio de la app.
2. Instalar dependencias con `npm install`.
3. Crear un `.env` a partir de `.env.example` con las credenciales reales.
4. Ejecutar la build de producción.
5. Arrancar el proceso con la URL pública, el host y el puerto del servidor.

```sh
npm install
npm run build
PORT=3000 HOST=0.0.0.0 NODE_ENV=production node .output/server/index.mjs
```

En CloudPanel normalmente se configura:

- App root: la raíz del proyecto
- Runtime: Node
- Startup command: `npm install && npm run build && PORT=3000 HOST=0.0.0.0 NODE_ENV=production node .output/server/index.mjs`
- Reverse proxy / domain: apuntar el dominio a la app y dejar el backend
  escuchando en `127.0.0.1:3000` o `0.0.0.0:3000` según el panel.

Variables importantes en producción:

- `APP_URL`: la URL pública del portal, por ejemplo `https://informes.tudominio.com`
- `SESSION_SECRET`: secreto fuerte para cookies y tokens
- `DATABASE_URL`: MySQL del VPS o un servicio gestionado
- `AWS_*`: bucket S3 o compatible (DigitalOcean Spaces, MinIO, etc.)
- `MAIL_*`: SMTP real, normalmente `MAIL_ENCRYPTION=tls`

`.env` en producción debe apuntar a servicios reales: MySQL gestionado,
**DigitalOcean Spaces** (mismas variables `AWS_*`, solo cambian
`AWS_ENDPOINT`/`AWS_BUCKET`/credenciales) y un SMTP real (`MAIL_*`, con
`MAIL_ENCRYPTION=tls` normalmente). Ver `.env.example` para el detalle de cada
variable. Ninguna lleva prefijo `VITE_` — todas las credenciales quedan en el
servidor, nunca en el navegador.

### Recomendaciones de CloudPanel

- Usa un dominio propio para `APP_URL` y el SSL del panel.
- Asegúrate de que el puerto de la app coincida con el puerto configurado en
  CloudPanel o el reverse proxy.
- Si el hosting reinicia la app al cambiar código, deja el comando de inicio
  fijo y ejecuta la compilación antes del arranque.
- Si usas un servicio S3 compatible, `AWS_USE_PATH_STYLE_ENDPOINT=true` suele
  ser necesario para Spaces/MinIO.

### Comprobaciones rápidas tras desplegar

```sh
npm run build
node .output/server/index.mjs
```

Si la app responde en la URL pública y el login/registro funciona, el
servicio ya está listo para producción.

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
