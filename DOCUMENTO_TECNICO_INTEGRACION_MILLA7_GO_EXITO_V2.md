# 📘 DOCUMENTO TÉCNICO DE INTEGRACIÓN Y ACCESOS QA
**Transportadora / Paquetera:** Milla Siete S.A.S. (Plataforma **OrbitM7 v1.9.65**)  
**Cliente:** Grupo Éxito — Ecosistema **Go Éxito**  
**Referencia Normativa:** *Lineamientos Técnicos de Integración para Paqueteras v2.0 (2026)*  
**Modalidad Operativa:** Operación Urbana Misma Ciudad (*Same-Day* y *Next-Day*)  
**Zona Horaria Oficial:** `America/Bogota` (`UTC-5`, formato ISO 8601 con offset `-05:00`)

---

## 1. ARQUITECTURA Y ESTÁNDARES DE COMUNICACIÓN (SECCIÓN 3)

| Parámetro Técnico | Especificación Implementada en OrbitM7 |
| :--- | :--- |
| **Protocolo** | `HTTPS` obligatorio con `TLS 1.2+` (HSTS activo). |
| **Formato de Mensajes** | `JSON` codificado en `UTF-8` (`Content-Type: application/json; charset=utf-8`). |
| **Versionamiento de API** | `/api/v1/...` |
| **Estándar de Fechas y Horas** | **Hora Oficial de Colombia (`America/Bogota`, `UTC-5`)** en formato `ISO 8601` (`YYYY-MM-DDTHH:mm:ss-05:00`) y fechas `YYYY-MM-DD`. |
| **Trazabilidad Distribuida** | Cabecera `x-correlation-id` (UUID v4) aceptada y propagada en cada respuesta y webhook. |
| **Idempotencia** | Cabecera `Idempotency-Key` soportada en todas las operaciones `POST` con ventana de deduplicación de **48 horas** (`> 24h` requeridas). |
| **Generación de Rótulos PDF** | **Generación 100% On-Demand en memoria RAM** (formato térmico `4x6"` con QR y Code-128) al momento de crear o consultar la guía, retornando Base64 y URL directa sin latencia de almacenamiento en disco. |

---

## 2. SEGURIDAD Y AUTENTICACIÓN (SECCIÓN 4)

- **Esquema de Autenticación:** Credenciales exclusivas por ambiente (**QA / Sandbox** vs. **Producción**) enviadas únicamente por cabeceras HTTP:
  - `x-api-key: <API_KEY_ASIGNADA>`
  - o `Authorization: Bearer <TOKEN_ASIGNADO>`
- **Bloqueo de Credenciales en URL (Sección 4.2):** Cualquier petición que incluya `api_key`, `apikey`, `token` o `secret` en los parámetros de consulta (*query string*) es rechazada automáticamente con **`HTTP 401 CREDENTIALS_IN_QUERY_FORBIDDEN`**.
- **Protección de Datos Personales (Ley 1581 / Sección 13):** Enmascaramiento automático de PII (nombres, direcciones, teléfonos, correos y documentos) en logs técnicos y métricas.

---

## 3. HOMOLOGACIÓN DE ESTADOS — OPERACIÓN URBANA MISMA CIUDAD (SECCIÓN 5)

Dado que **Milla Siete** realiza la recogida en los nodos/tiendas del Grupo Éxito y la entrega final al destinatario **dentro de la misma ciudad** (sin tránsito troncal nacional entre ciudades), se utilizan los siguientes estados oficiales del catálogo Go Éxito v2.0:

| Id Paquete (Go Éxito) | Estado en Go Éxito | Id Guía (Milla 7) | Estado Transportadora (Milla 7) | Uso en Operación Urbana Misma Ciudad |
| :---: | :--- | :---: | :--- | :--- |
| **`2`** | En espera de recogida | **`1`** | **Guía generada** | **ACTIVO:** Al crear guía (`POST /api/v1/guides`). |
| **`2`** |Disponible | **`1`** | **Guía generada** | **ACTIVO:** Al solicitar recogida (`POST /api/v1/pickups`). |
| **`3`** | En transporte | **`2`** | **En ciudad origen** *(Recogido en Nodo)* | **ACTIVO:** Al completar el Checkout de recogida en tienda Éxito. |
| *(3)* | *(En transporte)* | *(3)* | *(En transporte nacional)* | **NO APLICA (Omitido):** Sin movimiento inter-ciudades. |
| *(3)* | *(En transporte)* | *(4)* | *(En ciudad destino)* | **NO APLICA (Omitido):** Misma ciudad de origen y destino. |
| **`3`** | En transporte | **`5`** | **En reparto** | **ACTIVO:** Al salir el vehículo a reparto urbano de última milla. |
| **`4`** | Entregado | **`6`** | **Entregado** | **ACTIVO:** Entrega exitosa con foto y firma digital. |
| **`6`** | Cancelado | **`7`** | **Cancelado** | **ACTIVO:** Guía anulada antes de recogida física. |
| **`8`** | Devolución | **`9`** | **Devolución** | **ACTIVO:** Rechazo en entrega o agotamiento de 3 intentos. |

---

## 4. CATÁLOGO DE ENDPOINTS Y CONTRATOS DE INTEGRACIÓN (SECCIONES 6 Y 7)

### 4.1. Creación de Guía y Rótulo (`POST /api/v1/guides`)
- **SLA:** `p95 <= 800 ms`, `p99 <= 1500 ms`
- **Headers requeridos:**
  - `Content-Type: application/json; charset=utf-8`
  - `x-api-key: <API_KEY>`
  - `x-correlation-id: <UUID>`
  - `Idempotency-Key: <UUID>`
- **Request Body (Compatible con contrato canónico y `CREATE_GUIDE_REQUEST`):**
```json
{
  "CREATE_GUIDE_REQUEST": {
    "header": {
      "transactionId": "e377600a-64e0-4d8a-be30-4272521647eb",
      "applicationId": " GoExito "
    },
    "data": {
      "pedido": "1412345678-01",
      "contenedor": "E123456-01-P-1",
      "modalidad_pedido": "FIRME",
      "tipo_servicio": "1",
      "codigo_dependencia": "0054",
      "nombre_remitente": "ÉXITO WOW ENVIGADO",
      "nit_remitente": "890900608-9",
      "direccion_remitente": "CR 48 # 34B SUR 29",
      "ciudad_remitente": "05266000",
      "nombre_destinatario": "MARIA FERNANDA GOMEZ",
      "nit_destinatario": "1037654321",
      "direccion_destinatario": "CL 37 SUR # 43A - 52 APTO 402",
      "barrio_destinatario": "EL DORADO",
      "ciudad_destinatario": "05266000",
      "celular_destinatario": "3001234567",
      "cant_cajas": "1",
      "peso": "2.5",
      "alto": "25",
      "ancho": "20",
      "largo": "30",
      "valor_declarado": "185000",
      "contenido": "MERCANCIA GENERAL EXITO",
      "observaciones": "Entregar en portería"
    }
  }
}
```
- **Response Exitosa (`201 Created`):**
```json
{
  "transactionId": "e377600a-64e0-4d8a-be30-4272521647eb",
  "timestamp": "2026-11-05T08:30:00-05:00",
  "result": "OK",
  "code": "GUIDE_CREATED",
  "message": "Guía creada exitosamente. Rótulo PDF generado en memoria bajo demanda.",
  "data": {
    "guideNumber": "M7E-85012345678",
    "orderNumber": "1412345678-01",
    "container": "E123456-01-P-1",
    "operationType": "SAME_DAY",
    "status": "1",
    "statusDescription": "Guía generada",
    "label": {
      "format": "PDF",
      "url": "/api/exito-mensajeria/guias/por-numero/M7E-85012345678/rotulo.pdf",
      "expiresAt": "2026-11-12T08:30:00-05:00"
    },
    "PAQUETERA_CREATE_GUIDE_RESPONSE": {
      "url_terceros": "/api/exito-mensajeria/guias/por-numero/M7E-85012345678/rotulo.pdf",
      "pdf_guia": "found",
      "referencia": "M7E-85012345678",
      "codigo_remision": "REM-5850123-45678",
      "id_remision": 101
    },
    "PAQUETERA_GET_LABELS_RESPONSE": {
      "error": false,
      "rotulosRd": "",
      "rotulos": "JVBERi0xLjcK...",
      "errorMessage": ""
    }
  }
}
```

---

### 4.2. Consulta / Reimpresión de Rótulo PDF On-Demand (`GET /api/v1/guides/{guideNumber}/label`)
- Genera en tiempo real el PDF `4x6"` en memoria RAM:
  - Si se invoca estándar (`Accept: application/json`), retorna el objeto `PAQUETERA_GET_LABELS_RESPONSE` con `rotulos` en Base64.
  - Si se invoca con `?format=pdf`, retorna directamente el flujo binario `application/pdf` listo para impresión térmica.

---

### 4.3. Solicitud de Recogida en Nodo (`POST /api/v1/pickups`)
- **SLA:** `p95 <= 800 ms`
- **Request Body (`COLLECT_GUIDE`):**
```json
{
  "COLLECT_GUIDE": {
    "header": {
      "transactionId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "applicationId": "GoExito"
    },
    "data": {
      "guias": ["M7E-85012345678"],
      "codigoDependencia": "0054",
      "fechaRecogida": "2026-11-05",
      "franjaHoraria": "08:00-12:00",
      "totalPaquetes": 1
    }
  }
}
```
- **Response (`200 OK`):** Retorna `pickupConfirmationId`, cambia la guía a `Disponible` (`Id guía = 1`) y la habilita en la App Móvil de recogida en tienda.

---

### 4.4. Anulación Idempotente de Guía (`POST /api/v1/guides/{guideNumber}/cancel`)
- **Regla de negocio:** Permite anular guías en estado `1` (*Guía generada / Disponible*). Si la guía ya fue recogida físicamente en el nodo (`Id guía >= 2`), retorna `409 GUIDE_ALREADY_PICKED_UP`. Si ya estaba anulada, retorna `200 OK` idempotente.
- **Request Body:**
```json
{
  "reasonCode": "ORDER_CANCELLED_BY_CUSTOMER",
  "reasonDescription": "Cliente canceló la compra antes del despacho",
  "cancelledBy": "GO_EXITO"
}
```

---

### 4.5. Consulta Síncrona de Estado y Soportes (`GET /api/v1/guides/{guideNumber}`)
- Permite a Grupo Éxito consultar en cualquier momento el estado actual (`status`), el historial de eventos con timestamps en hora Colombia (`-05:00`) y las URLs de evidencias fotográficas y firmas almacenadas en Google Drive.

---

### 4.6. Notificación Saliente de Estados hacia Webhook Go Éxito (Sección 7.4 y 9)
- **Estructura enviada por Milla Siete al Webhook de Grupo Éxito:**
```json
{
  "header": {
    "transactionId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "transactionDate": "2026-11-05T10:15:30-05:00",
    "source": "PAQUETERA"
  },
  "data": {
    "guide": "M7E-85012345678",
    "orderNumber": "1412345678-01",
    "status": "6",
    "eventDate": "2026-11-05T10:15:30-05:00",
    "observation": "Entregado satisfactoriamente al destinatario."
  }
}
```
- **Política de Resiliencia Implementada:**
  - Timeout por intento: `5 segundos`.
  - Calendario automático de reintentos: Inmediato (`0s`), `1 min`, `2 min`, `5 min`, `15 min`, `30 min`, y cada `30 min` hasta completar **24 horas** (`DLQ`), más botón de **Reenvío Manual por Contingencia** desde la Torre de Control Inhouse de Milla Siete.

---

## 5. INFORMACIÓN Y ACCESOS AL AMBIENTE DE QA / SANDBOX

| Recurso | Valor / Configuración QA |
| :--- | :--- |
| **Base URL Ambiente QA / Sandbox** | `https://devsm7.santamariapp.com/api/v1` |
| **Base URL Ambiente Producción** | `https://apiapps.m7apps.com/api/v1` |
| **Especificación OpenAPI 3.0.3 (JSON)** | `https://devsm7.santamariapp.com/api/exito-mensajeria/openapi.json` *(También adjunta a este correo)* |
| **Portal Web Operativo QA (Inhouse/Rutas)** | `https://devsm7.santamariapp.com/exito-mensajeria-inhouse` |
| **Header de Autenticación QA** | `x-api-key: m7-exito-sandbox-key-2026` |
| **Header de Ambiente** | `x-exito-env: SANDBOX` *(o `QA`)* |
| **Header de Trazabilidad** | `x-correlation-id: <UUID-v4>` |
| **Header de Idempotencia** | `Idempotency-Key: <UUID-v4>` |
| **Endpoint Crear Guía** | `POST https://orbitm7.m7apps.com/api/v1/guides` |
| **Endpoint Consultar Rótulo PDF** | `GET https://orbitm7.m7apps.com/api/v1/guides/{guideNumber}/label` |
| **Endpoint Solicitar Recogida** | `POST https://orbitm7.m7apps.com/api/v1/pickups` |
| **Endpoint Anular Guía** | `POST https://orbitm7.m7apps.com/api/v1/guides/{guideNumber}/cancel` |
| **Endpoint Consultar Estado/Trazabilidad** | `GET https://orbitm7.m7apps.com/api/v1/guides/{guideNumber}` |
