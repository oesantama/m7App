# OrbitM7 — Memoria del Proyecto para Claude

> Sistema de Gestión Logística — Milla 7 S.A.S.
> Versión: 1.9.56 | Última actualización: junio 2026

---

## Descripción General

**OrbitM7** es una plataforma web de gestión logística integral para Milla 7 S.A.S. construida en React + TypeScript en el frontend y Express + TypeScript en el backend, con base de datos PostgreSQL.

La aplicación maneja: planificación de rutas, gestión de flota, asignación de conductores, trazabilidad de facturas, conciliación, inventarios, documentos legales y más.

---

## Stack Tecnológico

### Frontend
- **React 18** + TypeScript + Vite (dev server: `localhost:5174`)
- **Tailwind CSS** para estilos (sin componentes externos de UI)
- **Recharts** para gráficos
- **sonner** para toasts y notificaciones (**no react-hot-toast**)
- **leaflet** para mapas
- **zustand** para estado global
- **lucide-react** para íconos
- **xlsx / exceljs** para exportación Excel
- **jspdf** para generación de PDF cliente
- **puppeteer** para capturas y PDF servidor
- **html2canvas / html-to-image** para exportación de gráficos

### Backend
- **Express** + TypeScript ejecutado directamente con `tsx backend/server.ts`
- **Puerto interno:** 8080 (contenedor) → **puerto externo:** 8081 (host)
- **PostgreSQL** vía `pg` (pool de conexiones)
- **jsonwebtoken** para autenticación
- **nodemailer / resend** para emails
- **multer** para uploads de archivos
- **node-cron** para tareas programadas
- **puppeteer** para generación de PDFs con capturas

### Infraestructura
- **Podman containers:**
  - `m7app_postgres-podman_1` — PostgreSQL
  - `m7app_backend-podman_1` — Express API
  - `m7app_frontend-podman_1` — Vite frontend
- **Volumen del backend:** solo `backend/` está montado en `/app/backend`
  - ⚠️ NO montar `docs/` en la raíz — usar `backend/docs/` para archivos persistentes
- **Producción:** DigitalOcean Droplet (2 vCPUs / 4GB RAM / $24/mo) con Coolify

### IA
- **Gemini AI** (`gemini-2.0-flash` vía API REST)
  - Claves en `.env` como `GEMINI_API_KEY=clave1,clave2,...clave7` (7 claves rotatorias)
  - Cuota gratuita diaria — si hay 429 el script rota a la siguiente clave
  - Se usa para generación inteligente de manuales de usuario
- **Anthropic Claude** (vía Claude Code CLI para desarrollo)

---

## Estructura de Directorios

```
m7App/
├── components/          # 56 componentes React principales
│   ├── HelpDesk.tsx     # ✅ Mesa de ayuda (visor de manuales)
│   ├── ConsultaFacturas.tsx
│   ├── RoutePlanner.tsx
│   ├── FleetManager.tsx
│   └── ...
├── backend/
│   ├── server.ts        # Entry point Express
│   ├── controllers/     # 66 controladores
│   │   └── helpdesk.controller.ts  # ✅ API manuales
│   ├── routes/
│   │   └── helpdesk.routes.ts      # ✅ Rutas /api/helpdesk/
│   ├── docs/            # ✅ Dentro del volumen montado
│   │   ├── manuals/     # Markdown de manuales generados
│   │   └── pdf/         # PDFs generados por Puppeteer
│   └── middleware/
│       └── auth.ts      # authenticateToken JWT
├── scripts/
│   └── generate-manual.js  # ✅ Generador IA + estático + screenshots
├── .claude/
│   ├── settings.json    # ✅ Hook PostToolUse activado
│   └── hooks/
│       └── post-edit.sh # ✅ Dispara generate-manual.js en background
├── public/
│   ├── logo-encuesta.png  # ✅ Logo planillas (rectangular MILLA SIE7E)
│   └── logo-m7.png        # Logo ícono cuadrado (NO usar en PDFs)
├── App.tsx              # Router principal (switch en renderContent)
├── CLAUDE.md            # Este archivo — memoria del proyecto
└── .env                 # Variables de entorno (no en git)
```

---

## Sistema de Manuales (HelpDesk) — IMPLEMENTADO ✅

### Flujo completo

```
Editar componente .tsx
       ↓
PostToolUse hook (.claude/hooks/post-edit.sh)
       ↓
node scripts/generate-manual.js <archivo> [en background]
       ↓
┌─────────────────────────────────────────────────────┐
│ 1. Extraer nombre del componente                    │
│ 2. Consultar DB → módulo y página de navegación     │
│ 3. Intentar Gemini AI (gemini-2.0-flash)            │
│    └── Si 429: rotar entre 7 claves                 │
│    └── Si falla: análisis estático avanzado         │
│ 4. Análisis estático extrae:                        │
│    - Tabs por tipo (type Tab='x'|'y')               │
│    - Campos por sub-componente (brace-counting)     │
│    - Botones, columnas, permisos, modales           │
│ 5. Puppeteer toma capturas de pantalla:             │
│    - Login automático (directorti@millasiete.com)   │
│    - Navega via sidebar al módulo/página            │
│    - Captura general + por tab con resaltado rojo   │
│ 6. Genera PDF con logo + capturas anotadas          │
│ 7. Guarda en backend/docs/manuals/ y pdf/           │
└─────────────────────────────────────────────────────┘
       ↓
Disponible en HelpDesk de la app
```

### API endpoints (`/api/helpdesk/` — requieren JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/manuals` | Lista todos los manuales |
| `GET` | `/manuals/:name` | Contenido markdown de un manual |
| `GET` | `/manuals/:name/pdf` | Descarga el PDF |
| `POST` | `/generate` | Genera manual de un componente |
| `POST` | `/generate-all` | Genera todos los manuales (background) |

### Navegación en la app

La página de HelpDesk está registrada en la DB:

```sql
-- Módulo: MOD-05 | Página: PAG-66
-- route: 'helpdesk' | parent_id: MOD-05
```

En `App.tsx`:
```typescript
case 'helpdesk':
  return <React.Suspense fallback={...}><HelpDesk /></React.Suspense>;
```

---

## Autenticación

- JWT almacenado en `localStorage` con clave `m7_token`
- Middleware: `authenticateToken` en `backend/middleware/auth.ts`
- Todas las rutas `/api/helpdesk/` están protegidas
- Credenciales admin local: `directorti@millasiete.com` / `admin123`

---

## Base de Datos

- PostgreSQL en contenedor `m7app_postgres-podman_1`
- Acceso directo: `podman exec m7app_postgres-podman_1 psql -U m7_admin -d m7_logistica`
- Tablas clave: `modules`, `pages`, `users`, `roles`
- Navegación DB-driven: `pages.route` → `case` en `App.tsx renderContent`

---

## Componentes Principales Implementados

| Componente | Módulo | Estado |
|-----------|--------|--------|
| `RoutePlanner.tsx` | Planificación de Rutas (ILS+Or-opt+OSRM) | ✅ |
| `FleetManager.tsx` | Gestión de Flota | ✅ |
| `AssignmentManager.tsx` | Asignación Conductores/Vehículos | ✅ |
| `ConsultaFacturas.tsx` | Trazabilidad de Facturas (2 tabs) | ✅ |
| `ConciliacionFacturas.tsx` | Conciliación (4 tabs: PDT, planilla) | ✅ |
| `ExecutiveDashboard.tsx` | Dashboard Ejecutivo BI | ✅ |
| `BlindCount.tsx` | Conteo Ciego de Inventario | ✅ |
| `HelpDesk.tsx` | Mesa de Ayuda — visor de manuales | ✅ |
| `HelpChat.tsx` | Chat de soporte IA | ✅ |
| `Login.tsx` | Autenticación (campo email: `type="text"`) | ✅ |

---

## Convenciones del Proyecto

### UI / Frontend
- Siempre usar **sonner** para toasts, nunca `react-hot-toast`
- Logo para PDFs/planillas: `public/logo-encuesta.png` (rectangular "MILLA SIE7E GRUPO LOGISTICO")
- Logo ícono en app: `public/logo-m7.png` (cuadrado)
- Tailwind CSS sin librerías de componentes externas
- Rutas no son URL — son valores en `page` state, switch en `renderContent`

### Backend
- Archivos persistentes → `backend/docs/` (único directorio montado en container)
- TypeScript directo con `tsx` — sin compilación
- Importaciones con `.js` extension (ESM): `import X from './x.js'`
- Todos los endpoints nuevos van en `backend/routes/index.ts`

### Git
- Rama principal: `main`
- Usuario git: `oesantama`
- No commitear `.env` ni archivos de credenciales

---

## Contacto Institucional (para manuales y PDFs)

- **Empresa:** Milla 7 S.A.S. — MILLA SIE7E GRUPO LOGISTICO
- **Sistema:** OrbitM7 — Plataforma de Gestión Logística
- **Soporte email:** `directorti@millasiete.com`
- **WhatsApp soporte:** `3011825161`

---

## Variables de Entorno Clave (`.env`)

```bash
DATABASE_URL=...          # PostgreSQL connection string
PORT=8080                 # Backend port (container interno)
GEMINI_API_KEY=k1,k2,...  # Claves Gemini separadas por coma (7 claves)
JWT_SECRET=...
VITE_APP_DEMO_EMAIL=admin@millasiete.com   # ⚠️ No usar para login real (401)
VITE_APP_DEMO_PASSWORD=admin123
```

---

## Comandos Útiles

```bash
# Iniciar backend (desarrollo)
tsx backend/server.ts

# Generar manual de un componente
node scripts/generate-manual.js components/ConsultaFacturas.tsx

# Regenerar todos los manuales
curl -X POST http://localhost:8081/api/helpdesk/generate-all \
  -H "Authorization: Bearer <token>"

# Consultar DB
podman exec m7app_postgres-podman_1 psql -U m7_admin -d m7_logistica

# Ver logs del backend en container
podman logs -f m7app_backend-podman_1

# Reiniciar backend
podman restart m7app_backend-podman_1
```

---

## Próximos Pasos

- [ ] Esperar reset de cuota Gemini (diaria) y regenerar manuales con IA completa
- [ ] Agregar más módulos a la DB para que tengan ruta navegable en capturas
- [ ] Implementar anotaciones numeradas avanzadas en screenshots (ej: "① Campo factura")
- [ ] Considerar upgrade a Gemini API de pago para cuota ilimitada
- [ ] Agregar búsqueda de texto en HelpDesk
- [ ] Soporte multiidioma en manuales (español/inglés)

---

## Estado del Sistema de Manuales

| Componente | Manual | PDF | Screenshots |
|-----------|--------|-----|-------------|
| ConsultaFacturas | ✅ | ✅ (439KB) | ✅ 3 capturas |
| ExecutiveDashboard | ✅ | ✅ (294KB) | ✅ con capturas |
| AssignmentManager | ✅ | ✅ | — (sin ruta DB) |
| BlindCount | ✅ | ✅ | — (sin ruta DB) |
| ConciliacionFacturas | ✅ | ✅ | — (sin ruta DB) |
| FleetManager | ✅ | ✅ | — (sin ruta DB) |
| HelpChat | ✅ | ✅ | — (sin ruta DB) |
| Login | ✅ | ✅ | — (sin ruta DB) |
| RoutePlanner | ✅ | ✅ | — (sin ruta DB) |

> Los módulos con "sin ruta DB" tienen un `route` en la tabla `pages` que no ha sido registrado.
> Para activar capturas: agregar/actualizar el campo `route` en la tabla `pages` para ese módulo.
