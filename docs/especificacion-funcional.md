# Portal de Informes — Plataforma interna de informes HTML

Plataforma corporativa donde los empleados suben informes hechos con IA (HTML o ZIP) y los visualizan dentro del portal, organizados por áreas/departamentos.

## Alcance

### 1. Acceso (solo por invitación)

- Página pública `/` mínima con marca y botón "Iniciar sesión".
- `/auth`: login por email/contraseña. Sin registro abierto.
- Un administrador invita empleados por email desde `/admin`; el invitado recibe correo y define su contraseña.
- Perfil de usuario: nombre, cargo, avatar.
- Roles en tabla aparte: `admin` (gestiona áreas y miembros) y `empleado`.

### 2. Áreas / departamentos

- El admin crea, edita y elimina áreas (nombre, descripción, icono, color).
- Asignación de miembros por área, con rol dentro del área: miembro o líder.
- Un usuario puede pertenecer a varias áreas.
- Visibilidad: un informe solo lo ven los miembros de su área (y los admins).

### 3. Carga de informes

Formulario tipo imagen 4: título, área propietaria, descripción breve, y zona de arrastrar/soltar.

- Acepta `.html` suelto o `.zip` con `index.html` + css/js/imágenes.
- El ZIP se descomprime en el navegador; se buscan candidatos `.html`:
  - Si existe `index.html` (en raíz o en la carpeta única de nivel superior), se usa automáticamente.
  - Si no existe, se muestra una lista de los `.html` encontrados para que el usuario elija el principal.
  - Si no hay ningún `.html`, error claro.
- Archivos guardados en almacenamiento privado bajo `informes/{id}/...` conservando rutas relativas.
- Límite de tamaño (15 MB por defecto) y validación de tipos.
- Al volver a subir sobre un informe existente se crea una nueva versión (v1.0.0, v1.1.0…) manteniendo el historial.

### 4. Visualización

- Vista de informe tipo imagen 2: cabecera con título, autor, fecha, etiqueta de área, y acciones Compartir / Descargar / Pantalla completa.
- El HTML se renderiza en un `iframe` aislado (sandbox) servido desde una ruta interna que resuelve los recursos relativos del ZIP con URLs firmadas.
- Registro de vista: quién lo abrió y cuándo.

### 5. Paneles

- `/dashboard` (imagen 1): tarjetas de informes recientes de mis áreas, buscador, barra lateral de filtro por área, botón flotante "Subir Nuevo Informe", indicador de cuota de almacenamiento.
- `/areas/{slug}` (imagen 3): tabla con nombre, versión, tamaño, estado, última modificación, descarga y menú de acciones; paginación; tarjetas de métricas arriba (total informes, espacio usado, pendientes, etc.).
- `/historial`: actividad reciente (subidas, cambios de estado, vistas).
- Estados del informe: NUEVO, EN REVISIÓN, REVISADO (cambiables por líder de área o admin).

### 6. Diseño

Corporativo sobrio siguiendo las referencias: azul institucional profundo, fondo claro, tipografía sans legible, tarjetas con borde suave, barra lateral fija. Todo en tokens semánticos, interfaz en español.

## Detalles técnicos

- Lovable Cloud para base de datos, autenticación y almacenamiento privado.
- Tablas: `profiles`, `user_roles` (+ función `has_role`), `areas`, `area_members`, `reports`, `report_versions`, `report_files`, `activity_log`.
- RLS: lectura de informes restringida a miembros del área vía función `is_area_member(uid, area_id)` en `security definer`; escritura solo para el autor, líder del área o admin.
- Bucket privado `reports`; acceso a los archivos mediante URLs firmadas generadas en funciones de servidor tras validar pertenencia al área.
- Descompresión del ZIP en el cliente con `fszip` (JSZip) para detectar el HTML principal antes de subir.
- El iframe usa `sandbox="allow-scripts"` sin `allow-same-origin` para aislar el informe del portal.
- Rutas protegidas bajo `_authenticated/`; datos vía server functions con el usuario autenticado.

## Fuera de alcance por ahora

Comentarios en informes, notificaciones por email de nuevos informes, y analítica avanzada.
