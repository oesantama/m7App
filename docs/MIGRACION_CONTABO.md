# Migración OrbitM7: DigitalOcean → Contabo

Objetivo: mover producción al servidor nuevo **sin perder ningún dato**.
Regla de oro: **desde el respaldo final hasta el cambio de DNS, nadie puede escribir en DigitalOcean.**
Eso lo garantiza el modo mantenimiento (`MAINTENANCE_MODE=true`).

Scripts: `scripts/migracion/` (probados localmente: respaldo → restauración → verificación de 250 tablas
sin diferencias; detectan una sola fila faltante).

---

## Servidores y dominios (verificado por DNS el 15-nov-2026)

| Servidor | IP | Dominios que apuntan hoy | Rol |
|---|---|---|---|
| DigitalOcean (actual prod) | 138.68.245.236 | `orbitm7.m7apps.com`, `apiapps.m7apps.com` | Producción. `main` despliega aquí por Coolify |
| Contabo (nuevo) | 86.48.23.143 | `devsm7.m7apps.com` | Pruebas hoy; producción después de la migración |
| Servidor viejo `santamariapp.com` | 45.137.192.195 | (dominio retirado) | Se apaga; `santamariapp.com` ya no se usa en ningún entorno |

**Los nombres de producción no cambian.** Después de la migración, `orbitm7.m7apps.com` y
`apiapps.m7apps.com` siguen siendo producción. Pruebas es `devsm7.m7apps.com`; `qa.m7apps.com` es un
alias opcional del mismo entorno de pruebas.

### Éxito

- Producción: `https://apiapps.m7apps.com`, sin cambios para ellos. Pasa a Contabo con el cambio de DNS.
- Sandbox: **cambia** de `devsm7.santamariapp.com` a `https://devsm7.m7apps.com`. Ya está actualizado en
  el PDF técnico, el HTML, el Markdown y el OpenAPI. **Hay que enviarles el PDF y el JSON nuevos.**
- Si tenían guías de prueba en el sandbox viejo y las necesitan, respaldar esa BD antes de apagar 45.137.192.195.
- CORS acepta solo `*.m7apps.com`.
- Pruebas nunca envía el webhook de tracking a la URL de producción de Éxito si `APP_ENV` es
  `develop`/`DEVELOP` o `NODE_ENV=staging`.

---

## Cómo está montado Contabo (revisado el 15-nov-2026)

No usa Coolify: son tres `docker compose` detrás de un nginx del host, con certificados de certbot.

| Carpeta | Contenedores | Puertos (solo 127.0.0.1) | Despliegue |
|---|---|---|---|
| `/opt/m7-prod` | `m7-prod-backend`, `m7-prod-frontend`, `m7-prod-postgres` (BD `m7_logistica_prod`) | 5001 / 5002 | `/opt/deploy-prod.sh` (git pull de `main`) |
| `/opt/m7-qa` | `m7-qa-backend`, `m7-qa-frontend`, `m7-qa-postgres` (BD `m7_logistica_qa`) | 5011 / 5012 | `/opt/deploy-qa.sh` (git pull de `develop`) |
| `/opt/m7-services` | `m7-evolution` (+ `m7-evolution-postgres`), `m7-redis`, `m7-ollama` | 8081 / 6379 / 11434 | manual |

- nginx (`/etc/nginx/sites-enabled/m7-vhosts.conf`):
  - pruebas: `devsm7.m7apps.com`, `qa.m7apps.com` → 5012 (HTTPS);
  - producción: `orbitm7.m7apps.com`, `apiapps.m7apps.com` → 5002 (HTTPS se emite el día del cambio de DNS);
  - WhatsApp: `wa.m7apps.com`, `evolution.m7apps.com` → 8081 (HTTPS).
- Firewall (ufw): solo 22, 80 y 443. Ollama, Redis y las BD **no** están expuestas.
- Archivos persistentes en el host: `/opt/m7-*/storage/{uploads,docs,keys}`.
- Respaldo de producción: `/opt/m7-respaldo-diario.sh` a la **1:00 a. m. y 3:00 p. m.** (hora Colombia;
  el servidor quedó en `America/Bogota`), definido en `/etc/cron.d/m7-respaldo`.
  - Guarda BD prod, BD Evolution y storage en `/var/backups/m7` (14 días).
  - Sube cada respaldo a **Google Drive** `gdrive_cumplidos:m7_backups/contabo/<fecha>` (30 días), con las
    mismas credenciales que usaba DigitalOcean (`/root/.rclone.env`). Log: `/var/log/m7-respaldo.log`.
  - Histórico de DigitalOcean (16 respaldos, 9,1 GB) copiado en `/var/backups/m7/historico_digitalocean`.
- Los scripts de migración se ejecutan con el contenedor explícito, por ejemplo
  `PG_CONTAINER=m7-qa-postgres BACKEND_CONTAINER=m7-qa-backend`: hay varios PostgreSQL y no adivinan.

## Variables de entorno por servidor (Contabo: `/opt/m7-*/docker-compose.yml`)

| Variable | Producción | Pruebas | Nota |
|---|---|---|---|
| `NODE_ENV` | `production` | `production` | |
| `APP_ENV` | `PROD` | `DEVELOP` | Pruebas → webhook Éxito a QA |
| `APP_URL` | `https://orbitm7.m7apps.com` | `https://devsm7.m7apps.com` | Enlaces de correos (Éxito, recuperación, firmas) |
| `DISABLE_CRON` | *(vacío)* | `true` | Pruebas con datos reales no debe disparar envíos |
| `EMAIL_ENABLED` | `true` | `true` | Recuperación de contraseña y notificaciones |
| `RESEND_API_KEY` / `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` | reales | reales | Ver nota de correo abajo |
| `EMAIL_FROM` | remitente verificado | igual | Debe ser de un dominio verificado en Resend |
| `OLLAMA_HOST` | `http://ollama:11434` (o la IP interna) | igual | **No** `localhost` dentro de contenedores |
| `GEMINI_API_KEY` | claves | claves | |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | instancia de prod | instancia propia de pruebas | Nunca la misma sesión de WhatsApp en dos servidores |
| `EXITO_WEBHOOK_URL_PROD` / `_QA`, `EXITO_WEBHOOK_API_KEY_*` | copiar de DO | copiar de DO | |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` o volumen `m7_keys` | copiar de DO | propias | Si cambian, todos vuelven a iniciar sesión (no se pierden datos) |
| `MAINTENANCE_MODE` | *(vacío)* | *(vacío)* | Solo `true` en DigitalOcean durante la ventana |

**Correo en pruebas:** con correo habilitado y copia de producción, pruebas *puede* escribirles a
usuarios reales si alguien dispara una acción, como reenviar novedades. Por eso `DISABLE_CRON=true` y
la desactivación de Dogama tras restaurar. Para la recuperación de contraseña es intencional y sí
debe funcionar.

**Contabo y correo:** Resend envía por HTTPS (puerto 443) y no lo afecta ningún bloqueo de puertos.
Si se usa SMTP, Contabo puede limitar el puerto 25: usar 465 o 587.

## IA local (Ollama) en Contabo

- El orquestador usa `llama3:8b` (chat, resúmenes) y `qwen2.5-coder:7b` (código). Con 48 GB de RAM
  caben los dos (≈ 5 GB cada uno en Q4).
- Una sola instancia de Ollama sirve a producción y a pruebas.
- **Seguridad:** Ollama no tiene autenticación. El puerto 11434 **no** debe quedar expuesto a Internet.
  Hay dos opciones:
  - Correrlo como servicio en Coolify, en la misma red que los backends, con `OLLAMA_HOST=http://ollama:11434`.
  - Instalarlo en el host escuchando solo en la IP de la red Docker, con el firewall cerrando 11434 hacia afuera.
- Modelos: `ollama pull llama3:8b && ollama pull qwen2.5-coder:7b`.
- Validar: `GET /api/system/diagnostico?probar_ia=1` (genera una respuesta real y mide el tiempo).

---

## Diagnóstico del servidor (para validar cada entorno)

Solo SuperAdmin, con sesión iniciada:

- `GET https://<dominio>/api/system/diagnostico` revisa base de datos (esquema completo y
  migraciones), correo, WhatsApp (instancias conectadas), Ollama (modelos instalados), Gemini y la
  coherencia de las variables. Devuelve `todo_ok` y la lista de `fallidos`.
- `GET .../api/system/diagnostico?probar_ia=1` además le pide una respuesta real a Ollama.
- `POST .../api/system/diagnostico/correo-prueba` con `{"to":"su@correo"}` envía un correo real.

Desde el navegador, con la sesión abierta, en la consola (F12):
```js
fetch('/api/system/diagnostico?probar_ia=1',{headers:{Authorization:'Bearer '+localStorage.getItem('m7_token')}}).then(r=>r.json()).then(console.log)
```

---

## ✅ Validación en pruebas: criterio para pasar a producción

Todo esto en `https://devsm7.m7apps.com`, ya restaurado con la copia de producción:

1. [ ] `03_verificar.sh` → **✅ Datos completos**.
2. [ ] Diagnóstico → `baseDatos`, `correo`, `ollama`, `ollama_generacion`, `gemini` y `entorno` en OK.
   `whatsapp` en OK con la instancia de pruebas.
3. [ ] **Correo:** el correo de prueba llega (revisar spam).
4. [ ] **Recuperación de contraseña**, con un usuario de prueba:
   - "¿Olvidó su contraseña?" → llega el correo → el enlace abre `devsm7.m7apps.com/?reset=...`;
   - se fija la contraseña nueva y se inicia sesión con ella;
   - el mismo enlace usado otra vez debe ser rechazado.
5. [ ] **Inicio de sesión** con 3 roles distintos; cada uno ve solo sus módulos.
6. [ ] **GH → Asignación y Devolución:** consultar, crear con reposición, ver detalle, informe de
   antigüedad con varias operaciones. **Salidas a proveedor** carga.
7. [ ] **Documentos:** consulta histórica, corrección de archivos, reenvío de novedades.
8. [ ] **Éxito** (sandbox): crear guía, rótulo PDF, consulta por número; el tracking va a la URL **QA**.
9. [ ] **Grupo Inter:** listado público y cargue de cumplido.
10. [ ] **Planificador de rutas** y mapas cargan, sin errores de CSP en la consola (F12).
11. [ ] **Capacitaciones:** un video de YouTube y un PDF se ven.
12. [ ] **IA:** HelpChat responde (Gemini u Ollama).
13. [ ] **Modo mantenimiento:** poner `MAINTENANCE_MODE=true` en **pruebas**, redeploy, y confirmar
    la pantalla "Migración en curso" y que el login responde 503. Quitarlo de nuevo.
14. [ ] **Ensayo cronometrado:** cuánto tardaron respaldo + copia + restauración + verificación.
    Esa es la duración mínima de la ventana real.
15. [ ] Éxito recibió el PDF/JSON nuevos y su sandbox responde en `https://devsm7.m7apps.com/api/v1`.

Con los 15 puntos en verde se agenda la ventana de producción (Fase C).

---

## Qué se migra

| Dato | Dónde vive | Cómo se copia |
|---|---|---|
| BD principal `m7_logistica` | volumen `m7_logistica_data` | `pg_dump -Fc` → `pg_restore` |
| BD `evolution` (WhatsApp) | mismo PostgreSQL | `pg_dump -Fc` → `pg_restore` |
| Llaves JWT (`m7_keys`) | volumen Docker | tar del volumen. Sin esto todas las sesiones y firmas JWT cambian |
| Sesión WhatsApp (`evolution_instances`, `evolution_store`) | volúmenes Docker | tar del volumen (solo en la migración final) |
| Archivos generados (PDF perfiles, BASC, noticias, manuales) | `/app/backend/docs`, `/app/public/uploads` dentro del contenedor backend | tar desde el contenedor |
| Variables de entorno de Coolify | panel de Coolify | **copiar a mano** (no están en git) |
| Archivos en Google Drive | Drive | no se mueven |

---

## Modo mantenimiento (servidor viejo)

En Coolify → backend de DigitalOcean → *Environment Variables*:

```
MAINTENANCE_MODE=true
# opcionales
MAINTENANCE_MESSAGE=OrbitM7 se está migrando a un nuevo servidor. Volvemos hoy a las 10:00 p. m.
MAINTENANCE_RETRY_AFTER=3600
```

Guardar y **Redeploy** del backend. Con eso:

- Toda la API responde **503** con `Retry-After`: login, usuarios con sesión abierta, webhooks de
  Éxito y Grupo Inter, formularios públicos. **Nada se escribe en la BD.**
- La app web cierra la sesión del usuario (borra el token) y muestra la pantalla **"Migración en curso"**.
  Revisa cada minuto y se recarga sola cuando el servidor vuelve a estar disponible.
- No arrancan los cron (sincronizaciones, alertas, correos programados).
- `/health` sigue en 200 para que Coolify no reinicie el contenedor en bucle.
- `GET /api/maintenance-status` → `{"maintenance":true,"message":"..."}` para comprobarlo.

Para salir del modo: quitar la variable (o `false`) y redeploy.

> Navegadores con la versión anterior en caché (PWA) igual reciben el 503: no pueden entrar,
> solo ven un error genérico en lugar del aviso. Avisar por WhatsApp/correo antes de empezar.

---

## Fase A — Ensayo en pruebas (devsm7) con copia de producción

Sirve para dos cosas: que pruebas tenga el mismo esquema que producción (hoy le faltan 148 tablas
y varias columnas, por eso fallan Asignación y Devolución y Salidas en GH) y practicar la migración real.

1. **Antes de restaurar, en Coolify de pruebas:**
   - `DISABLE_CRON=true`, `APP_ENV=DEVELOP` y `APP_URL=https://devsm7.m7apps.com` en el backend
     (el webhook de Éxito va a QA y los enlaces de correo vuelven a pruebas).
   - **No** poner `RESEND_API_KEY` ni credenciales SMTP reales: con datos reales, pruebas podría
     enviar correos a clientes y personal.
2. En DigitalOcean (en caliente, sin mantenimiento):
   `./01_respaldo_origen.sh` → copiar la carpeta a Contabo (`rsync -avP`).
3. En Contabo: `docker stop m7-qa-backend`, luego
   `CONFIRMAR=SI PG_CONTAINER=m7-qa-postgres BACKEND_CONTAINER=m7-qa-backend ./02_restaurar_destino.sh <carpeta>`
   (el paso 5 copia archivos con el backend arrancado: `docker start m7-qa-backend` y repetirlo si lo pide).
   **sin** `RESTAURAR_VOLUMENES=SI`: no copiar la sesión de WhatsApp a pruebas, porque dos servidores
   con la misma sesión se desconectan entre sí.
4. Desactivar en pruebas lo que envía mensajes hacia afuera:
   ```sql
   UPDATE dogama_email_config SET is_active = false;
   ```
5. `docker start m7-qa-backend` y `PG_CONTAINER=m7-qa-postgres ./03_verificar.sh <carpeta> https://devsm7.m7apps.com`.
6. Probar a mano los módulos críticos (GH Asignación y Devolución, Documentos, Éxito, Grupo Inter,
   Planificador de rutas). Medir cuánto tardó cada paso: eso define la ventana de mantenimiento real.

---

## Fase B — Preparación (1–2 días antes)

- [ ] Producción desplegada en Contabo en Coolify con **el mismo commit** que DigitalOcean y todas
      las variables de entorno copiadas (DB_*, JWT, RESEND, GEMINI, EXITO_*, EVOLUTION_*, Drive/rclone).
- [ ] **Bajar el TTL del DNS** a 300 s (5 min) de `orbitm7.m7apps.com`, `evolution.m7apps.com` y
      demás subdominios, **al menos 24 h antes** (lo que dure el TTL actual).
- [ ] Certificados: Coolify en Contabo pide el SSL de Let's Encrypt cuando el DNS ya apunta.
      Prever 1–5 minutos sin HTTPS después del cambio.
- [ ] Avisar a usuarios y a Éxito / Grupo Inter la fecha y hora de la ventana.
- [ ] Confirmar con Éxito que **reintentan** ante 503 (si no, acordar reenvío manual de lo que
      llegue durante la ventana).
- [ ] Espacio en disco en ambos servidores ≥ 3 × tamaño del respaldo.

## Fase C — Ventana de migración (día D)

| # | Dónde | Acción |
|---|---|---|
| 1 | DigitalOcean | `MAINTENANCE_MODE=true` + redeploy del backend. Verificar `curl https://orbitm7.m7apps.com/api/maintenance-status` → `true` |
| 2 | DigitalOcean | Esperar 1–2 min a que terminen peticiones en curso |
| 3 | DigitalOcean | `./01_respaldo_origen.sh` (debe decir `MAINTENANCE_MODE en backend: true`) |
| 4 | DigitalOcean | Detener Evolution (Stop) para liberar la sesión de WhatsApp |
| 5 | → Contabo | `rsync -avP` de la carpeta del respaldo |
| 6 | Contabo | `docker stop m7-prod-backend` |
| 7 | Contabo | `CONFIRMAR=SI PG_CONTAINER=m7-prod-postgres BACKEND_CONTAINER=m7-prod-backend ./02_restaurar_destino.sh <carpeta>`. **Sin** `RESTAURAR_VOLUMENES`: Evolution en Contabo es otra versión con su propia BD, y WhatsApp se vuelve a vincular con QR (paso 13). Copiar las llaves JWT de DO a `/opt/m7-prod/storage/keys` para no cerrar sesiones |
| 8 | Contabo | `docker start m7-prod-backend`; `PG_CONTAINER=m7-prod-postgres ./03_verificar.sh <carpeta>` → **✅ Datos completos** |
| 9 | Contabo | Prueba interna sin DNS: en el PC propio, `/etc/hosts` → `IP_CONTABO orbitm7.m7apps.com`, iniciar sesión y probar |
| 10 | DNS | Registros A de `orbitm7`, `apiapps` y `evolution` (.m7apps.com) → 86.48.23.143 |
| 10b | Contabo | Certificados: `certbot --nginx -d orbitm7.m7apps.com -d apiapps.m7apps.com -d evolution.m7apps.com` (1–2 min sin HTTPS) |
| 11 | — | Verificar con `dig +short orbitm7.m7apps.com` desde varias redes; quitar la línea de `/etc/hosts` |
| 12 | DigitalOcean | **Dejar en mantenimiento** (no apagar): quien todavía resuelva la IP vieja ve el aviso y no escribe datos ahí |
| 13 | Contabo | Vincular WhatsApp (QR) en Alertas WhatsApp; diagnóstico `todo_ok`; webhook de Éxito recibiendo |

**Si el paso 8 falla** (❌ diferencias): no cambiar el DNS. Repetir 5–8. Mientras tanto DigitalOcean
sigue intacto y en mantenimiento; para volver atrás basta con `MAINTENANCE_MODE=false` en DigitalOcean.

## Fase D — Después

- Mantener el droplet de DigitalOcean **en mantenimiento y con su volumen intacto 7 días** como respaldo.
- Subir de nuevo el TTL del DNS (3600 s).
- Confirmar los respaldos automáticos (`m7-backup` / rclone a Drive) en Contabo.
- Apagar el droplet y, más adelante, destruirlo.

---

## Riesgos conocidos

- **Credenciales en el repositorio:** `docker-compose.coolify.yml` tiene valores por defecto de
  rclone (client secret y refresh token de Google Drive). Rotarlos y dejarlos solo en Coolify antes
  de la migración.
- **Esquema por migraciones incompleto:** una base creada desde cero solo con `backend/migrations`
  queda con 103 de 251 tablas. Por eso el destino se restaura desde el respaldo y **no** se debe
  crear producción "en limpio".
- Los archivos que el backend guarda dentro del contenedor (`/app/backend/docs`, `/app/public/uploads`)
  no están en un volumen en `docker-compose.coolify.yml`: lo generado en ejecución no sobrevive a que
  Coolify recree el contenedor. Conviene montarlos como volumen en Contabo (no verificado en el
  servidor: revisar con `docker inspect` antes de la ventana).

---

## Estado final (15-nov-2026)

- Migración completada: 251 tablas verificadas, 0 filas faltantes. DNS `orbitm7` y `apiapps` → Contabo, HTTPS válido.
- DigitalOcean quedó en `MAINTENANCE_MODE=true` (en `/data/coolify/applications/j00k…/.env`). **No hacer Redeploy allí.**
- Ramas: `main` = producción (`/opt/deploy-prod.sh`), `develop` = pruebas (`/opt/deploy-qa.sh`). No hay otras.
- Antes de cancelar DigitalOcean (recomendado 2–3 días después):
  1. WhatsApp de producción vinculado con el número de soporte 301 182 5161 y la sesión vieja cerrada en el celular.
  2. Borrar en DigitalOcean la llave `contabo-m7-migracion` de `/root/.ssh/authorized_keys`.
  3. Borrar `/root/m7_respaldo_*` en ambos servidores (tienen datos reales).
  4. Cancelar Coolify y el droplet; revisar que no queden snapshots, volúmenes ni IP reservadas.
