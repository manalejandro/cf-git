# cf-git

**Gestor de Repositorios Git para el Fediverso**

cf-git es una plataforma federada de alojamiento de repositorios Git construida sobre Cloudflare Workers. Te permite alojar repositorios Git que se federan a través de ActivityPub — sube código, comparte commits y colabora en todo el fediverso.

Construido con Next.js 16, Cloudflare Workers (D1, Colas, Email, Turnstile) y ActivityPub.

## Características

- **Federación ActivityPub** — Cada creación de repositorio y commit se federa a tus seguidores automáticamente
- **Gestión de Repositorios** — Crea, clona y administra repositorios Git
- **Clonar Repos Externos** — Clona repositorios desde GitHub, GitLab o cualquier servicio Git
- **Migrar Repositorios** — Migra repositorios existentes a cf-git
- **Sincronización por Cron** — Los repositorios externos se sincronizan automáticamente cada 6 horas
- **Autenticación** — Registro/Inicio de sesión con protección Turnstile captcha
- **Verificación de Correo** — Verifica tu correo usando el Servicio de Email de Cloudflare
- **Gestión de Contraseñas** — Cambio de contraseña, flujo de olvido/restablecimiento
- **Búsqueda Federada** — Busca cuentas en todo el fediverso vía WebFinger
- **Límites de Tamaño** — Límites de tamaño de repositorio (configurables, 100MB por defecto)
- **Compatible con ActivityPub** — Funciona con Mastodon, Pleroma y otro software del fediverso

## Stack Tecnológico

- **Framework:** Next.js 16 (con adaptador OpenNext Cloudflare)
- **Plataforma:** Cloudflare Workers
- **Base de Datos:** Cloudflare D1 (SQLite)
- **Colas:** Cloudflare Workers Queues (para envío ActivityPub)
- **Correo:** Cloudflare Email Service (binding send email)
- **Autenticación:** Turnstile captcha + PBKDF2 para hash de contraseñas
- **Federación:** ActivityPub (Firmas HTTP, WebFinger, NodeInfo)
- **Frontend:** React 19, Tailwind CSS v4

## Inicio Rápido

### Requisitos

- Node.js 20+
- Cuenta de Cloudflare con D1, Colas y Email Service habilitados

### Configuración

```bash
git clone https://github.com/anomalyco/cf-git.git
cd cf-git
npm install
```

### Configurar Entorno

Crea un archivo `.env` con tus credenciales de Cloudflare:

```env
CLOUDFLARE_API_TOKEN=tu_token
CLOUDFLARE_ACCOUNT_ID=tu_id_de_cuenta
```

### Configurar Base de Datos

```bash
npx wrangler d1 create cf-git
# Actualiza database_id en wrangler.toml con el ID creado
npm run db:migrate
```

### Configurar Colas

```bash
npx wrangler queues create cf-git-delivery
```

### Desarrollo

```bash
npm run dev
```

### Despliegue

```bash
npm run deploy
```

### Variables de Entorno (en wrangler.toml)

| Variable | Descripción | Por Defecto |
|----------|-------------|-------------|
| `INSTANCE_TITLE` | Nombre de la instancia | cf-git |
| `INSTANCE_DESCRIPTION` | Descripción de la instancia | Git repository manager for the fediverse |
| `INSTANCE_URL` | URL de la instancia | https://cf-git.com |
| `TURNSTILE_SITE_KEY` | Clave pública de Turnstile | - |
| `TURNSTILE_SECRET_KEY` | Clave secreta de Turnstile | - |
| `EMAIL_FROM` | Dirección del remitente | noreply@cf-git.com |
| `EMAIL_FROM_NAME` | Nombre del remitente | cf-git |
| `MAX_REPO_SIZE_MB` | Tamaño máximo de repositorio en MB | 100 |
| `MAX_REPO_FILE_SIZE_MB` | Tamaño máximo de archivo individual en MB | 25 |

## Endpoints ActivityPub

| Endpoint | Descripción |
|----------|-------------|
| `/.well-known/webfinger` | Descubrimiento WebFinger |
| `/.well-known/nodeinfo` | Descubrimiento NodeInfo |
| `/nodeinfo/2.0` | Payload NodeInfo 2.0 |
| `/users/{usuario}` | Actor ActivityPub |
| `/users/{usuario}/inbox` | Bandeja de entrada del usuario |
| `/users/{usuario}/outbox` | Bandeja de salida del usuario |
| `/users/{usuario}/followers` | Colección de seguidores |
| `/users/{usuario}/following` | Colección de seguidos |
| `/inbox` | Bandeja de entrada compartida |
| `/objects/{id}` | Objeto ActivityPub |

## Rutas API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registrar nueva cuenta |
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/auth/verify-email` | Verificar correo |
| POST | `/api/auth/forgot-password` | Solicitar restablecimiento de contraseña |
| POST | `/api/auth/reset-password` | Restablecer contraseña |
| POST | `/api/auth/resend-verification` | Reenviar verificación de correo |
| POST | `/api/auth/change-password` | Cambiar contraseña |
| GET | `/api/repos` | Listar repositorios |
| POST | `/api/repos` | Crear repositorio |
| GET | `/api/repos/{nombre}` | Obtener detalles del repositorio |
| DELETE | `/api/repos/{nombre}` | Eliminar repositorio |
| GET | `/api/repos/search` | Buscar repositorios |
| POST | `/api/repos/sync` | Sincronizar repositorio externo |
| POST | `/api/follow` | Seguir a un usuario |
| POST | `/api/unfollow` | Dejar de seguir a un usuario |
| GET | `/api/notifications` | Listar notificaciones |
| GET | `/api/notifications/count` | Contar notificaciones no leídas |
| GET | `/api/v1/accounts/search` | Buscar cuentas |
| GET | `/api/v1/instance` | Información de la instancia |

## Licencia

MIT
