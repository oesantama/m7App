# INFORME DE DIAGNÓSTICO TÉCNICO Y AUDITORÍA MULTIDISCIPLINAR
**Proyecto:** Milla Siete (OrbitM7 / milla-siete-m7)  
**Versión Actual:** 1.9.65  
**Fecha de Auditoría:** 16 de Octubre de 2026  
**Equipo Auditor:** Tech Lead, Full-Stack/Mobile Engineer, QA & Ciberseguridad, UI/UX Specialist, Database Specialist  

---

## 1. FICHA TÉCNICA DEL STACK TECNOLÓGICO

| Capa / Dimensión | Tecnología / Herramienta | Versión / Detalle |
| :--- | :--- | :--- |
| **Entorno & Lenguaje** | Node.js (Alpine) / TypeScript | Node v20, TypeScript ~5.8.2 (ESM nativo) |
| **Frontend Framework** | React SPA | React 19.2.3, React-DOM 19.2.3 |
| **Mobile / PWA** | Vite PWA Plugin | `vite-plugin-pwa` 1.2.0 (Service Workers, Cache offline) |
| **Build & Bundler** | Vite | Vite 6.2.0, Rollup con chunking manual |
| **Estilos & UI** | Tailwind CSS v4 | `@tailwindcss/vite` 4.0.0, Lucide React, Sonner (toasts) |
| **Manejo de Estado** | Zustand | Zustand 5.0.11 |
| **Backend Framework** | Express | Express 5.2.1 (Clustering de 2 workers + líder) |
| **Motor de Base de Datos** | PostgreSQL | PostgreSQL 15-alpine (vía `pg` 8.17.2, sin ORM) |
| **Mensajería & WhatsApp** | Evolution API v1.8.2 / Baileys | Integración directa y microservicio contenedorizado |
| **Infraestructura & Contenedores** | Docker / Podman / Coolify | Compose multi-servicio (backend, frontend, postgres, backup, evolution) |
| **Autenticación** | JWT Asimétrico | RS256 con par de llaves PEM (private.pem / public.pem) |
| **IA & Procesamiento** | Google Gemini API / Tesseract / Puppeteer | Gemini 2.0 Flash / OCR en español e inglés / Chrome Headless |

---

## 2. EVALUACIÓN Y AUDITORÍA MULTIDISCIPLINAR

### 2.1. Tech Lead & Software Architect
- **Estructura Monolítica Híbrida sin Workspaces:** El repositorio mezcla en la misma raíz el backend y el frontend con un único `package.json`. Esto obliga a los Dockerfiles a ejecutar scripts ad-hoc para borrar dependencias en tiempo de build (`node -e "delete pkg.dependencies..."`), lo que fragiliza la reproducibilidad del entorno y rompe el lockfile.
- **Acoplamiento de Capas:** Los controladores de Express asumen la lógica de negocio, validación, consultas SQL crudas y generación de archivos (PDF/Excel), sin una separación en capas de *Repositories* o *Data Access Layer (DAL)*.
- **Manejo del Cluster:** Bien resuelto el problema del líder de cron/migraciones con variable de entorno `M7_LEADER`, pero la concurrencia en modificaciones de base de datos durante el arranque (`restoreSystem`) es riesgosa en despliegues con réplicas.

### 2.2. Senior Full-Stack & Mobile Engineer
- **Capacidades Móviles y PWA:** La plataforma implementa capacidades avanzadas de PWA para operación logística de campo (trazabilidad de entregas, captura de firmas con `react-signature-canvas`, geolocalización satelital y cámara).
- **Riesgo de Compatibilidad React 19:** React 19 es reciente y varias dependencias (`react-signature-canvas`, librerías de tipos) obligan al uso de `--legacy-peer-deps` o versiones alfa.
- **Cliente API Monolítico:** `services/api.ts` supera las 2,900 líneas de código concentrando cientos de funciones fetch en un solo módulo, lo que dificulta el tree-shaking y el mantenimiento modular.

### 2.3. QA & Cybersecurity Auditor
- **[CRÍTICO] Clave Privada RSA Rastreada en Git:** El archivo `backend/config/keys/private.pem` (usado para firmar tokens JWT RS256) está registrado y comiteado en el repositorio git. Cualquier persona con acceso al código o historial puede forjar tokens con rol SuperAdmin (`ROL-01`).
- **[CRÍTICO] Fuga de Credenciales OAuth y DB en Docker Compose:** `docker-compose.yml` contiene credenciales hardcodeadas comiteadas en git: `RCLONE_CONFIG_GDRIVE_CUMPLIDOS_TOKEN`, refresh tokens de Google OAuth, Client IDs, Client Secrets y la contraseña maestra de PostgreSQL (`m7_master_password`).
- **[CRÍTICO] Exposición de Gemini API Key en el Bundle Frontend:** `vite.config.ts` inyecta directamente `process.env.GEMINI_API_KEY` en el código estático compilado del cliente, exponiendo la llave de IA en texto plano a cualquier usuario del navegador.
- **[CRÍTICO] Endpoint de Ejecución SQL Remota Arbitraria:** `backend/controllers/admin.controller.ts` expone `/api/admin/sql` ejecutando consultas directas sin parametrizar (`pool.query(query)`).
- **[MEDIO] Ejecución de Contenedores como Root:** `Dockerfile.backend` ejecuta la aplicación con UID 0 (root) incluyendo un navegador Chromium, aumentando la superficie de impacto ante exploits de Puppeteer o Ghostscript.

### 2.4. UI/UX & Frontend Specialist
- **Enrutamiento Manual sin Router Declarativo:** `App.tsx` (1,443 líneas) implementa un enrutador artesanal basado en `window.location.hash` y `window.location.pathname` dentro de listeners de `useEffect`, limitando la gestión de historial del navegador, deep linking limpio y renderizado condicional optimizado.
- **Diseño Visual y Consistencia:** Se utiliza Tailwind CSS v4 con una interfaz oscura/moderna, toasts reactivos (`sonner`) y lazy loading por módulos mediante `lazyWithRetry`.
- **Rendimiento Visual en Listados Grandes:** Módulos de logística y conciliación procesan grandes volúmenes de registros en tablas sin virtualización de DOM (e.g. `react-window` o `tanstack-virtual`), lo cual genera degradación de memoria en dispositivos móviles.

### 2.5. Database & Data Modeling Specialist
- **Gestor Relacional:** PostgreSQL 15 con pool de conexiones `pg` configurado a 10 conexiones en producción para adaptarse a servidores de recursos limitados (768MB RAM).
- **Ausencia de Transacciones ACID en Operaciones Compuestas:** Flujos de despacho, devoluciones y anulación de conciliaciones realizan múltiples `INSERT` / `UPDATE` secuenciales sin bloques `BEGIN ... COMMIT / ROLLBACK`. Un fallo intermedio deja registros huérfanos.
- **Migraciones en Tiempo de Ejecución:** `backend/services/migration.service.ts` ejecuta DDL dinámicos (`ALTER TABLE`, `CREATE INDEX`) cada vez que el servidor arranca, generando bloqueos de tablas y ralentizando los cold-starts.
- **Serialización de Zonas Horarias:** Correcto uso de `setTypeParser` para OID 1082 (DATE) y 1114 (TIMESTAMP) evitando desfasajes UTC con la hora de Colombia (`America/Bogota`).

---

## 3. CHECKLIST DE TAREAS PRIORIZADAS

### Prioridad: [Crítico]
- [x] **[CYBER-01] Rotación y Purga de Claves Criptográficas:** Llaves RSA (`private.pem` y `public.pem`) desindexadas del control de Git (`git rm --cached`) y blindadas en `.gitignore`. *(Nota: Para servidores remotos preexistentes, purgar historial previo con `git filter-repo` y regenerar llaves)*.
- [x] **[CYBER-02] Limpieza de Secretos en Docker Compose:** Removidos tokens de Google Drive, OAuth refresh tokens y secretos de `docker-compose.yml` y `docker-compose.coolify.yml`. Migración completa a variables de entorno (`.env` y variables en Coolify/Podman).
- [x] **[CYBER-03] Blindaje de Gemini API en Backend:** Eliminada inyección en `vite.config.ts`. Eliminada fuga de API Key en `/config/gemini-key` (ahora devuelve solo booleano `hasKey`). Chatbot y visión migrados a endpoints backend dedicados (`/api/ai/chat` y `/api/ai/analyze`). Eliminado código obsoleto con SDK de cliente.
- [x] **[CYBER-04] Restricción y Auditoría de Endpoint SQL:** Cifrado simétrico AES-256-GCM en tránsito, tabla inmutable `audit_superadmin_sql` y salvaguarda estricta bloqueando comandos destructivos (`DROP DATABASE/SCHEMA`, gestión de roles/usuarios `GRANT/REVOKE`).

### Prioridad: [Medio]
- [x] **[DB-01] Implementar Transacciones en Flujos Críticos:** Operaciones multi-tabla (despacho, picking, vehículos, inventarios) corregidas para usar clientes dedicados del pool con `BEGIN`, `COMMIT` y `ROLLBACK` garantizando atomicidad ACID.
- [x] **[SEC-01] Principio de Menor Privilegio en Docker:** Configurado usuario no privilegiado (`USER node`) con asignación de permisos `chown` en `Dockerfile.backend`.
- [x] **[ARCH-01] Modularización de `services/api.ts`:** Monolito desacoplado en módulos temáticos aislados en `services/api/` (`client.ts`, `dogama.api.ts`, `admin.api.ts`, `validation.api.ts`, `basc.api.ts`, `fulfillment.api.ts`, `training.api.ts`, `noticias.api.ts`, `cyber.api.ts`), conservando 100% de compatibilidad hacia atrás mediante re-exportación consolidada y tipado exacto.
- [x] **[FE-01] Virtualización de Tablas Logísticas:** Integrada virtualización reactiva basada en `@tanstack/react-virtual` directamente en el componente central `components/shared/DataTable.tsx` (utilizado en más de 80 vistas). Optimiza el consumo de RAM en móviles y listas densas (planillas, hojas de vida, conciliaciones) manteniendo encabezados sticky y scroll fluido.

### Prioridad: [Deuda Técnica]
- [x] **[DB-02] Migración a Sistema Versionado de Migraciones:** Reemplazado el escaneo masivo de `UNIVERSAL_SCHEMA` con `ALTER TABLE / CREATE INDEX` en cada arranque por un motor transaccional de migraciones versionadas (`backend/migrations/runner.ts`). Gestionado bajo candado consultivo de PostgreSQL (`pg_try_advisory_lock`), tabla inmutable `_schema_migrations` y catálogo modular (`001_baseline_core_schema`, `002_dispatch_delivery_tables`, `003_auxiliary_and_gh_tables`, `004_performance_indexes`, `005_master_seeds_and_modules`, `006_audit_and_security_tables`). Los arranques y reinicios ahora verifican el esquema en ~100ms con 0 bloqueos de tablas. Endpoints administrativos añadidos en `/api/admin/migrations`.
- [x] **[FE-02] Adopción de React Router Declarativo:** Implementado `react-router-dom` envolviendo `<App />` en `index.tsx`, centralizando todas las rutas públicas (`/publico/...`, `/public/...`, `/portal/...`, etc.) en `components/routes/PublicRoutes.tsx` y sincronizando bidireccionalmente el historial del navegador (`useLocation`, `useNavigate`) con `activeTab` para soporte de botones Atrás/Adelante y deep linking directo.
- [x] **[ARCH-02] Estructuración de Monorepo / Workspaces:** Configurado monorepo con `npm workspaces` declarando el workspace `backend` (`m7-backend`), dotado de su propio `backend/package.json` modular. Eliminadas por completo las podas ad-hoc (`node -e "delete pkg.dependencies..."`) en `Dockerfile.backend`, `Dockerfile.frontend` y `Dockerfile.backend.dev`, restaurando la reproducibilidad nativa del lockfile y optimizando las capas de caché en compilaciones de producción.


