# Gestión Humana — Hoja de Vida de Activos y Mensajería

Dos módulos dentro de **Gestión Humana (MOD-09)**:

| Página | Ruta (`pages.route`) | Clave de permiso | Para quién |
|---|---|---|---|
| `PAG-80` Hoja de Vida Activos | `gestion-humana-activos` | `ACTIVOS_GH` | Gestión Humana / administración |
| `PAG-81` Mensajería | `gestion-humana-mensajeria` | `MENSAJERIA_GH` | Gestión Humana (panel de envíos) |
| `PAG-82` Mis Envíos | `gestion-humana-mis-envios` | `MENSAJERIA_MENSAJERO` | Mensajeros (vista móvil) |

Todo se crea con las migraciones versionadas `007_gh_activos_mensajeria.ts` y `008_gh_maestras_ids.ts` (en `backend/migrations/`), que corren solas al arrancar el backend.

**Regla:** en BD se guardan siempre los **IDs de las maestras**, nunca texto libre:

| Dato | Maestra | Dónde se administra |
|---|---|---|
| Tipo de activo | `gh_activos_tipos` | Gestión Humana → Misceláneos → **Tipos de Activo** |
| Marca | `marcas` (`MAR-xx`) | Configuración Maestros → **Marcas** |
| Proveedor | `prov_cliente` (NIT) | Configuración Maestros → **Prov Cliente** |
| Estado de activo | `estados`: EST-24 Operativo, EST-25 En mantenimiento, EST-26 Dañado, EST-27 Dado de baja | Configuración Maestros → Estados |
| Estado de envío | `estados`: EST-03 Pendiente, EST-10 Asignado, EST-11 En ruta, EST-12 Entregado, EST-13 Devuelto, EST-28 Fallido, EST-29 Cancelado | Configuración Maestros → Estados |
| Área / responsable / remitente / mensajero | `gh_areas`, `gh_personal` | Gestión Humana |

---

## 1. Hoja de Vida de Activos

Registra cada activo físico (cámaras, puertas/portones, montacargas, camas, impresoras, otros) y **todo lo que le pasa**: mantenimientos, gastos, incidencias, cambios de responsable o ubicación y la baja.

- **Código automático** `ACT-00001`.
- **Tipo, marca, proveedor y estado** se eligen de las maestras (ver tabla arriba). Si un valor no existe, se crea en su maestra y aparece en el select.
- **Filtro por fechas**: el listado abre con **lo corrido del mes en curso** y muestra los activos con movimiento en el rango (registro, mantenimiento, gasto, incidencia…), con su costo del período y el acumulado. "Ver todo el inventario" ignora la fecha.
- **Frecuencia de mantenimiento**: al registrar un mantenimiento se recalcula `proximo_mantenimiento = fecha + frecuencia`.
- **Cambios automáticos**: si al editar la ficha cambia el responsable o la ubicación, se crea solo un evento `CAMBIO_RESPONSABLE` / `CAMBIO_UBICACION`.
- **Soportes**: hasta 6 fotos o PDF por evento (fotos ≤ 5 MB, PDF ≤ 10 MB), guardados en Drive.
- **Borrado lógico** (`deleted_at`): la hoja de vida nunca se pierde.
- **Indicadores**: abren con el **mes en curso** y el acumulado del **año**. Se filtran por rango de fechas, tipo y área. Muestran gasto del período y del año, eventos y activos nuevos del período, el estado actual del inventario, costo por tipo y por evento, los 5 más costosos y los mantenimientos de los próximos 15 días.

### Tablas

```
gh_activos_tipos (id, nombre, estado)
gh_activos (id, codigo, tipo_id→gh_activos_tipos, nombre, serial, marca_id→marcas, modelo, ubicacion,
            area_id→gh_areas, responsable_id→gh_personal, proveedor_id→prov_cliente, fecha_adquisicion,
            costo_inicial, estado_id→estados, criticidad[BAJA|MEDIA|ALTA],
            frecuencia_mantenimiento_dias, proximo_mantenimiento, created_by, updated_by, deleted_at…)
gh_activos_eventos (id, activo_id, tipo_evento, fecha, descripcion, costo, proveedor_id→prov_cliente, factura,
                    estado_resultante_id→estados, datos_cambio JSONB, created_by, created_by_name, created_at)
gh_activos_archivos (id, activo_id, evento_id, mime, tamano_bytes, sha256, drive_path, local_path,
                     estado_subida[PENDIENTE|SUBIDO|ERROR], reintentos, ultimo_error…)
```

### Endpoints `/api/gh-activos` (JWT + permiso `ACTIVOS_GH`)

| Método | Ruta | Acción | Descripción |
|---|---|---|---|
| GET | `/catalogos` | view | Tipos, marcas, proveedores y estados (maestras) |
| GET | `/dashboard?desde&hasta&tipo_id&area_id` | view | Indicadores (por defecto, mes en curso) |
| GET | `/?desde&hasta&todos&q&tipo_id&estado_id&area_id&marca_id&proveedor_id&mant_vencido&page&pageSize` | view | Listado paginado (por defecto, mes en curso) |
| GET | `/:id` | view | Ficha + eventos + archivos |
| POST | `/` | create | Crear activo |
| PUT | `/:id` | edit | Editar (registra cambios de responsable/ubicación) |
| DELETE | `/:id` | delete | Borrado lógico |
| POST | `/:id/eventos` | create | Multipart: `tipo_evento, fecha, descripcion, costo, proveedor_id, factura, estado_resultante_id` + `archivos[]` |
| GET | `/archivos/:archivoId` | view | Descarga el soporte (vía backend) |

---

## 2. Mensajería

Trazabilidad de lo que se le entrega a un mensajero, con **firma del mensajero al recoger**, **firma del destinatario al entregar** y **fotos de evidencia**.

### Flujo de estados

```
                 asignar                recoger                     entregar
  PENDIENTE ───────────────▶ ASIGNADO ─────────────▶ EN_CAMINO ─────────────────▶ ENTREGADO
      │                       │   ▲    (firma mensajero    │   (firma destinatario
      │ cancelar              │   │     + foto paquete)    │    + foto + quién recibe)
      ▼                       │   │                        │
  CANCELADO ◀─────────────────┘   │ reintentar             │ incidencia (foto + motivo)
                                  │                        ▼
                                  └──────────────────── FALLIDO ──devolver──▶ DEVUELTO
```

| Transición | Quién | Requisito |
|---|---|---|
| PENDIENTE → ASIGNADO | Panel | Mensajero con perfil MENSAJERO |
| ASIGNADO → ASIGNADO (reasignar) / PENDIENTE | Panel | — |
| PENDIENTE/ASIGNADO → CANCELADO | Panel | Motivo |
| ASIGNADO → EN_CAMINO | Mensajero | Firma del mensajero (PNG) + foto del paquete |
| EN_CAMINO → ENTREGADO | Mensajero | Firma del destinatario + foto de la entrega + nombre de quien recibe |
| EN_CAMINO → FALLIDO | Mensajero | Foto + motivo |
| FALLIDO → ASIGNADO (reintento) | Panel | Mensajero |
| FALLIDO → DEVUELTO | Panel | Motivo |

Las reglas viven en `backend/services/gh-mensajeria.logic.ts`, cubiertas por tests. El panel **no puede** marcar un envío como recogido o entregado: eso solo lo hace el mensajero, con sus evidencias.

### Tracking

`ENV-AAMMDD-NNNN`, con consecutivo diario (hora de Colombia). Ejemplo: `ENV-261021-0003`.

### Perfil MENSAJERO (`ROL-04`)

1. En **Gestión Humana → Personal**, el mensajero debe existir como colaborador, con su **cédula**.
2. En **Seguridad & Acceso → Usuarios**, se crea su usuario con **rol MENSAJERO** y el **mismo número de documento**. Al crearlo hereda solo el permiso de *Mis Envíos* (`PAG-82`).
3. El enlace usuario ↔ colaborador se hace por cédula (`users.document_number = gh_personal.cedula`). Sin ese enlace, el mensajero no aparece para asignarle envíos.

### Notificaciones WhatsApp

Se envían a través de Evolution API (instancia `WA_ALERTS_INSTANCE` o la primera conectada):

| Evento | Remitente | Destinatario | Mensajero |
|---|---|---|---|
| Asignado | — | — | ✅ |
| En camino | ✅ | ✅ | — |
| Entregado | ✅ | ✅ | — |
| Fallido | ✅ | ✅ | — |
| Alerta +24 h | ✅ | ✅ | — |

El celular del remitente sale de `gh_personal.celular_corporativo` (o `celular_personal`). El del destinatario es el que se registra en el envío. Ningún fallo de WhatsApp bloquea la operación.

### Alertas (cron cada hora)

- **ATRASADO**: envío abierto con más de `GH_MENSAJERIA_HORAS_ALERTA` horas (24 por defecto). Se notifica por WhatsApp una sola vez.
- **SIN_ASIGNAR**: pendiente sin mensajero por más de `GH_MENSAJERIA_HORAS_SIN_ASIGNAR` horas (4 por defecto).
- **FALLIDO**: entrega fallida pendiente de gestión.

Se resuelven solas cuando el envío se cierra o cambia la condición. Solo puede haber una alerta abierta por envío y tipo.

### Modo sin conexión (solo mensajero)

- La lista de *Mis Envíos* queda en caché en el celular.
- Si no hay señal al recoger, entregar o reportar, la acción completa (campos, firma y foto) se guarda en **IndexedDB** y se envía sola al volver la conexión (evento `online` y reintento cada minuto).
- Cada acción lleva un `client_uuid`: si llega dos veces, el servidor la reconoce y no la duplica.
- Se guardan dos horas: la de captura en el celular (`capturado_at`) y la del servidor (`created_at`).
- Si el servidor rechaza una acción encolada (por ejemplo, el envío fue reasignado mientras tanto), el mensajero ve el motivo y la descarta.

### Tablas

```
gh_mensajeria_envios  (tracking, remitente_id→gh_personal, tipo, contenido, cantidad, peso_kg, valor_declarado,
                       prioridad, destinatario_*, mensajero_id→gh_personal, estado_id→estados, intentos, fecha_asignacion,
                       fecha_recogida, fecha_entrega_real, receptor_nombre, receptor_documento, observaciones…)
gh_mensajeria_eventos (envio_id, estado_anterior_id→estados, estado_nuevo_id→estados, motivo, lat, lng, precision_m, ip, user_agent,
                       client_uuid UNIQUE, capturado_at, user_id, user_name, created_at)
gh_mensajeria_archivos(envio_id, evento_id, tipo[FIRMA_MENSAJERO|FIRMA_DESTINATARIO|FOTO_PAQUETE|FOTO_ENTREGA|
                       FOTO_INCIDENCIA], firmante_nombre, firmante_documento, mime, tamano_bytes, sha256,
                       drive_path, estado_subida, lat, lng…)
gh_mensajeria_alertas (envio_id, tipo[ATRASADO|SIN_ASIGNAR|FALLIDO], detalle, notificada, resuelta…)
```

### Endpoints `/api/gh-mensajeria` (JWT)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/mensajeros` | MENSAJERIA_GH view | Usuarios ROL-04 enlazados a GH, con su carga actual |
| GET | `/dashboard` | MENSAJERIA_GH view | Indicadores del día |
| GET | `/alertas` | MENSAJERIA_GH view | Alertas abiertas |
| GET | `/envios?q&estado&mensajero_id&remitente_id&desde&hasta&atrasados&page` | MENSAJERIA_GH view | Listado (documentos enmascarados). `estado=ABIERTOS` para los no cerrados |
| GET | `/envios/:id` | MENSAJERIA_GH view | Detalle + eventos + archivos |
| POST | `/envios` | MENSAJERIA_GH create | Crear (si trae `mensajero_id` queda ASIGNADO) |
| POST | `/envios/:id/estado` | MENSAJERIA_GH edit | `{ estado, motivo?, mensajero_id? }` |
| GET | `/mis-envios` | MENSAJERIA_MENSAJERO view | Envíos del mensajero autenticado |
| GET | `/mis-envios/:id` | MENSAJERIA_MENSAJERO view | Detalle (solo si es suyo) |
| POST | `/mis-envios/:id/recoger` | MENSAJERIA_MENSAJERO edit | Multipart: `firma` (PNG), `foto`, `lat`, `lng`, `client_uuid`, `capturado_at` |
| POST | `/mis-envios/:id/entregar` | MENSAJERIA_MENSAJERO edit | + `receptor_nombre`, `receptor_documento` |
| POST | `/mis-envios/:id/incidencia` | MENSAJERIA_MENSAJERO edit | `foto`, `motivo`, … |
| GET | `/archivos/:archivoId` | admin o mensajero asignado | Firma/foto (vía backend) |

---

## 3. Evidencias y Google Drive

### Estructura

Todo cuelga de una carpeta raíz con la convención del Drive (`<TEMA> MILLA 7`):

```
gdrive_cumplidos:GESTION HUMANA MILLA 7/
├── HOJA DE VIDA ACTIVOS/
│   └── {TIPO}/                                   p. ej. MONTACARGAS
│       └── {ACT-00002 - NOMBRE DEL ACTIVO}/
│           └── {AÑO}/
│               └── 2026-10-20 MANTENIMIENTO PREVENTIVO #2-1.jpg
└── MENSAJERIA/
    └── {AÑO}/
        └── {MM - MES}/                           p. ej. 10 - OCTUBRE
            └── {ENV-261021-0005 - DESTINATARIO}/
                ├── FIRMAS/      FIRMA MENSAJERO #12.png, FIRMA DESTINATARIO #16.png
                └── EVIDENCIAS/  FOTO PAQUETE #12.jpg, FOTO INCIDENCIA #13.jpg, FOTO ENTREGA #16.jpg
```

- El año y el mes son los de Colombia (no los del servidor en UTC).
- El `#n` es el número de evento. Si un envío se reintenta, la segunda recogida genera una firma nueva en vez de sobrescribir la primera.
- En desarrollo la raíz es `GESTION HUMANA MILLA 7 (PRUEBAS)`, para no mezclar pruebas con evidencias reales.
- Las rutas se arman en un solo lugar: `rutaArchivoActivo` / `rutaArchivoEnvio` en `gh-storage.service.ts`.

### Cómo se sube

1. El backend valida el **tipo real** por los primeros bytes (PNG/JPEG/WEBP/PDF). No confía en la extensión: un HTML o SVG renombrado se rechaza. Límites: firma ≤ 512 KB (solo PNG), foto ≤ 5 MB, PDF ≤ 10 MB.
2. Calcula el **SHA-256** y lo guarda en BD como huella de la evidencia.
3. Deja el archivo en `backend/docs/gh-cola/` (permisos 600) y responde de inmediato.
4. En segundo plano lo sube con `rclone copyto` y borra la copia local. Si falla, el cron lo reintenta cada 5 minutos (máx. 10 intentos; el error queda en `ultimo_error`).

### Cómo se consulta

Las evidencias **nunca** se publican con links de Drive. Siempre pasan por `GET …/archivos/:id`, que exige JWT y permiso (en Mensajería, además, ser el mensajero asignado). El backend las lee con `rclone cat`.

> **Equivalente a URL firmada:** rclone no ofrece URLs firmadas con expiración, y `rclone link` genera enlaces públicos. El proxy autenticado cumple el mismo objetivo: solo quien tiene sesión válida y permiso ve el archivo, y el acceso muere con la sesión.

### Valor probatorio

- Firmas y fotos quedan con hash SHA-256, hora del servidor, usuario, IP, user-agent y GPS (si el celular lo permite).
- `gh_mensajeria_eventos` y `gh_mensajeria_archivos` son de **solo inserción**: no hay endpoints para editar ni borrar.
- La foto se re-codifica en el celular (máx. 1600 px, JPEG 80 %). Eso **elimina el EXIF**; la ubicación oficial es la del evento.
- Para verificar que un archivo de Drive no fue alterado: `sha256sum archivo` debe coincidir con `sha256` en BD.

### Retención y respaldo

- Drive conserva los archivos indefinidamente. Si se define una política de retención (p. ej. 5 años), se puede borrar por carpeta de año en `Envios/{AÑO}`.
- Las tablas entran en el backup general de PostgreSQL. Los archivos dependen del respaldo de la cuenta de Google Drive.

---

## 4. Seguridad aplicada

- JWT global (`server.ts`) + `requirePermission` por endpoint. La propiedad del envío se valida en el controlador (un mensajero no puede ver ni tocar envíos de otro: responde 404).
- SQL siempre parametrizado; listas cerradas para estados, tipos y prioridades; límites de longitud en todos los textos.
- `rclone` se invoca con `spawn` y argumentos separados (sin shell) y los nombres de carpeta pasan por `safeSegment`.
- Rate limit de 60 subidas cada 5 min por IP; multer en memoria con límite de tamaño y de cantidad de archivos.
- Respuestas de archivos con `X-Content-Type-Options: nosniff` y `Cache-Control: private`.
- Documento del destinatario enmascarado en listados (`******6789`).

---

## 5. Variables de entorno (opcionales)

```bash
GH_DRIVE_REMOTE=gdrive_cumplidos          # remoto rclone (por defecto el mismo de Hojas de Vida)
GH_DRIVE_BASE="GESTION HUMANA MILLA 7"     # carpeta raíz; en dev: "GESTION HUMANA MILLA 7 (PRUEBAS)"
GH_MENSAJERIA_HORAS_ALERTA=24             # umbral de atraso
GH_MENSAJERIA_HORAS_SIN_ASIGNAR=4         # umbral de pendiente sin mensajero
GH_MENSAJERIA_WA_ENABLED=true             # por defecto solo en producción
WA_ALERTS_INSTANCE=...                    # instancia Evolution (ya existente)
```

---

## 6. Comandos

```bash
# Migraciones: se aplican solas al arrancar el backend. Manualmente:
curl -X POST http://localhost:8081/api/admin/migrations/run -H "Authorization: Bearer <token>"

# Tests de estas funcionalidades
npx vitest run backend/tests/gh-mensajeria.logic.test.ts backend/tests/gh-storage.validation.test.ts

# Ver cola de subidas pendientes
podman exec m7app_postgres-podman_1 psql -U m7_admin -d m7_logistica -c \
  "SELECT tipo, estado_subida, reintentos, ultimo_error FROM gh_mensajeria_archivos WHERE estado_subida <> 'SUBIDO'"
```

### Prueba del flujo completo

1. Crear un colaborador en **Personal** con cédula y celular.
2. Crear un usuario con **rol MENSAJERO** y la misma cédula.
3. Asignar a un usuario de GH los permisos de *Hoja de Vida Activos* y *Mensajería*.
4. En **Mensajería → Nuevo envío**: remitente, contenido, destinatario (con celular) y mensajero.
5. Entrar como mensajero desde el celular → **Mis Envíos** → *Recoger envío*: foto + firma.
6. *Entregar*: nombre de quien recibe, foto y firma del destinatario.
7. En el panel, abrir el envío: línea de tiempo, firmas, fotos y hash.

---

## 7. Manual rápido del mensajero

1. Entra a OrbitM7 desde el celular con tu usuario. Verás **Mis Envíos**.
2. Cada tarjeta muestra a quién va, la dirección y qué llevas. Usa **Llamar** o **Cómo llegar** si lo necesitas.
3. **Al recoger**: toca *Recoger envío*, toma la foto del paquete, firma con el dedo y confirma.
4. **Al entregar**: toca *Entregar*, escribe el nombre (y documento) de quien recibe, toma la foto, **pásale el celular para que firme** y toca *Marcar como entregado*.
5. **Si no puedes entregar**: toca *Incidencia*, elige qué pasó, toma una foto (fachada, puerta cerrada, etc.) y reporta. Gestión Humana programará otro intento.
6. **Sin señal**: trabaja normal. Verás "Guardado en el celular" y se enviará solo cuando vuelva la conexión. No cierres sesión mientras haya acciones por sincronizar.
7. Si algo sale en rojo como "no se pudo registrar", léelo y avisa a Gestión Humana.
