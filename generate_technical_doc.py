#!/usr/bin/env python3
import base64
import os
import subprocess

with open('public/logo-m7.png', 'rb') as f:
    logo_base64 = base64.b64encode(f.read()).decode('utf-8')

html_content = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Lineamientos Técnicos de Integración de Paqueteras con Go Éxito — Milla 7 Logistics</title>
<style>
  @page {{
    size: letter portrait;
    margin: 15mm 15mm 18mm 15mm;
    @bottom-right {{
      content: "Página " counter(page) " de " counter(pages);
      font-size: 8pt;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #64748b;
      font-weight: bold;
    }}
    @bottom-left {{
      content: "Milla 7 Logistics S.A.S. · Lineamientos Técnicos Go Éxito v2.0";
      font-size: 8pt;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #64748b;
    }}
  }}

  *, *:before, *:after {{
    box-sizing: border-box;
  }}

  body {{
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
    color: #1e293b;
    line-height: 1.5;
    font-size: 9.5pt;
    margin: 0;
    padding: 0;
    background: #fff;
  }}

  .page {{
    page-break-after: always;
    position: relative;
  }}

  .page:last-child {{
    page-break-after: avoid;
  }}

  /* Encabezado Corporativo Tipo Ficha Técnica */
  .header-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
    border: 1.5px solid #0f172a;
  }}

  .header-table td {{
    border: 1px solid #cbd5e1;
    padding: 8px 12px;
    vertical-align: middle;
  }}

  .header-table .logo-col {{
    width: 22%;
    text-align: center;
    background: #ffffff;
    border-right: 1.5px solid #0f172a;
  }}

  .header-table .logo-col img {{
    max-height: 48px;
    max-width: 130px;
    object-fit: contain;
  }}

  .header-table .title-col {{
    width: 58%;
    text-align: center;
    font-size: 10pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.3;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-right: 1.5px solid #0f172a;
  }}

  .header-table .meta-col {{
    width: 20%;
    font-size: 8pt;
    color: #334155;
    line-height: 1.4;
    background: #f8fafc;
  }}

  .header-table .meta-col strong {{
    color: #0f172a;
  }}

  /* Portada */
  .cover-container {{
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 860px;
    padding: 10px 0;
    text-align: center;
  }}

  .cover-hero {{
    margin-top: 40px;
    margin-bottom: 30px;
  }}

  .cover-hero img {{
    max-width: 240px;
    max-height: 110px;
    object-fit: contain;
    margin-bottom: 30px;
  }}

  .cover-title {{
    font-size: 22pt;
    font-weight: 900;
    color: #0f2d59;
    letter-spacing: -0.5px;
    line-height: 1.25;
    text-transform: uppercase;
    margin: 0 auto 15px auto;
    max-width: 680px;
  }}

  .cover-subtitle {{
    font-size: 13pt;
    font-weight: 600;
    color: #0284c7;
    margin-bottom: 45px;
    letter-spacing: 0.2px;
  }}

  .cover-meta-table {{
    width: 85%;
    margin: 0 auto 35px auto;
    border-collapse: collapse;
    border: 1px solid #cbd5e1;
    font-size: 9.5pt;
    text-align: left;
  }}

  .cover-meta-table td {{
    padding: 9px 14px;
    border: 1px solid #cbd5e1;
  }}

  .cover-meta-table td.label {{
    width: 32%;
    font-weight: 700;
    background: #f1f5f9;
    color: #1e293b;
  }}

  .cover-meta-table td.value {{
    color: #334155;
  }}

  /* Banner de Condición de Uso */
  .condition-banner {{
    width: 90%;
    margin: 20px auto 0 auto;
    background: #ecfdf5;
    border: 1.5px solid #a7f3d0;
    border-left: 6px solid #10b981;
    border-radius: 6px;
    padding: 14px 18px;
    text-align: left;
    font-size: 9.5pt;
    line-height: 1.45;
    color: #065f46;
  }}

  .condition-banner strong {{
    color: #047857;
    font-weight: 800;
  }}

  /* Tipografía y Secciones */
  h1 {{
    font-size: 13pt;
    font-weight: 800;
    color: #0f2d59;
    border-bottom: 2px solid #0284c7;
    padding-bottom: 4px;
    margin-top: 18px;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }}

  h2 {{
    font-size: 10.5pt;
    font-weight: 700;
    color: #0369a1;
    margin-top: 14px;
    margin-bottom: 6px;
    border-left: 3px solid #0284c7;
    padding-left: 8px;
  }}

  h3 {{
    font-size: 9.5pt;
    font-weight: 700;
    color: #334155;
    margin-top: 10px;
    margin-bottom: 4px;
  }}

  p, ul, ol {{
    margin-top: 4px;
    margin-bottom: 8px;
  }}

  ul, ol {{
    padding-left: 20px;
  }}

  li {{
    margin-bottom: 3px;
  }}

  table.data-table {{
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 14px 0;
    font-size: 8.5pt;
  }}

  table.data-table th {{
    background: #0f2d59;
    color: #ffffff;
    font-weight: 700;
    text-align: left;
    padding: 6px 9px;
    border: 1px solid #0f2d59;
    font-size: 8.5pt;
  }}

  table.data-table td {{
    padding: 5px 8px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
  }}

  table.data-table tr:nth-child(even) {{
    background: #f8fafc;
  }}

  code {{
    font-family: 'Consolas', 'Courier New', monospace;
    background: #f1f5f9;
    color: #0f172a;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 8.5pt;
  }}

  pre {{
    font-family: 'Consolas', 'Courier New', monospace;
    background: #0f172a;
    color: #f8fafc;
    padding: 10px 12px;
    border-radius: 5px;
    font-size: 8pt;
    line-height: 1.35;
    overflow-x: auto;
    margin: 6px 0 10px 0;
  }}

  .badge-tag {{
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
  }}
  .badge-active {{ background: #dcfce7; color: #15803d; }}
  .badge-p1 {{ background: #fee2e2; color: #b91c1c; }}
  .badge-info {{ background: #e0f2fe; color: #0369a1; }}

  /* Tabla de Contenido / Índice */
  .toc-table {{
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 20px 0;
    font-size: 9pt;
  }}

  .toc-table td {{
    padding: 6px 8px;
    border-bottom: 1px dotted #cbd5e1;
  }}

  .toc-table .toc-num {{
    font-weight: 700;
    color: #0284c7;
    width: 35px;
  }}

  .toc-table .toc-title {{
    font-weight: 600;
    color: #1e293b;
  }}

  .toc-table .toc-page {{
    text-align: right;
    font-weight: 700;
    color: #64748b;
    width: 45px;
  }}

  .notice-box {{
    background: #f8fafc;
    border-left: 4px solid #0284c7;
    padding: 8px 12px;
    margin: 8px 0;
    font-size: 8.5pt;
  }}
</style>
</head>
<body>

<!-- ========================================== -->
<!-- PÁGINA 1: PORTADA INSTITUCIONAL             -->
<!-- ========================================== -->
<div class="page cover-container">
  <!-- Encabezado Institucional -->
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7 Logistics"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col">
        <strong>Código:</strong> 001<br>
        <strong>Versión:</strong> 2.0<br>
        <strong>Año:</strong> 2026
      </td>
    </tr>
  </table>

  <!-- Cuerpo de Portada -->
  <div class="cover-hero">
    <img src="data:image/png;base64,{logo_base64}" alt="Milla 7 Logistics"><br>
    <div class="cover-title">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</div>
    <div class="cover-subtitle">Guías, rótulos, recogidas, cancelaciones y tracking</div>

    <table class="cover-meta-table">
      <tr>
        <td class="label">Propietario / Operador:</td>
        <td class="value"><strong>Milla 7 Logistics S.A.S.</strong> (Operador Paquetero Urbano)</td>
      </tr>
      <tr>
        <td class="label">Cliente / Plataforma:</td>
        <td class="value"><strong>Grupo Éxito</strong> (Go Éxito v2.0 — Mensajería Misma Ciudad)</td>
      </tr>
      <tr>
        <td class="label">Versión / Vigencia:</td>
        <td class="value"><strong>Versión 2.0 / Año 2026</strong></td>
      </tr>
      <tr>
        <td class="label">Alcance Operativo:</td>
        <td class="value">Recogida en Tiendas Éxito, Despacho Urbano, Entregas Same Day / Next Day y Devoluciones</td>
      </tr>
      <tr>
        <td class="label">Clasificación:</td>
        <td class="value">Confidencial B2B — Uso Técnico e Integración de Sistemas</td>
      </tr>
    </table>

    <div class="condition-banner">
      <strong>Condición de uso:</strong> Las URLs definitivas de endpoints, credenciales API, capacidades de despacho final y ventanas operativas se formalizan por proveedor durante el onboarding y mediante canales seguros de aprovisionamiento. Ninguna credencial sensible queda embebida en este documento.
    </div>
  </div>

  <div style="font-size: 8pt; color: #94a3b8; text-align: center;">
    Medellín, Colombia · Milla 7 Logistics S.A.S. · Todos los derechos reservados.
  </div>
</div>

<!-- ========================================== -->
<!-- PÁGINA 2: CONTROL DEL DOCUMENTO E ÍNDICE   -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col"><strong>Código:</strong> 001<br><strong>Versión:</strong> 2.0<br><strong>Año:</strong> 2026</td>
    </tr>
  </table>

  <h1>Tabla de Contenido / Índice</h1>
  <table class="toc-table">
    <tr><td class="toc-num">1.</td><td class="toc-title">Control del documento</td><td class="toc-page">Pág. 2</td></tr>
    <tr><td class="toc-num">2.</td><td class="toc-title">Objetivo general</td><td class="toc-page">Pág. 3</td></tr>
    <tr><td class="toc-num">3.</td><td class="toc-title">Alcance operativo (Misma Ciudad / Urbano)</td><td class="toc-page">Pág. 3</td></tr>
    <tr><td class="toc-num">4.</td><td class="toc-title">Principios técnicos obligatorios (Seguridad y PII)</td><td class="toc-page">Pág. 3</td></tr>
    <tr><td class="toc-num">5.</td><td class="toc-title">Modelo de integración y arquitectura de carpetas Drive</td><td class="toc-page">Pág. 4</td></tr>
    <tr><td class="toc-num">6.</td><td class="toc-title">Contrato técnico (Encabezados, Formato JSON y Códigos HTTP)</td><td class="toc-page">Pág. 4</td></tr>
    <tr><td class="toc-num">7.</td><td class="toc-title">Servicios funcionales B2B</td><td class="toc-page">Pág. 5</td></tr>
    <tr><td class="toc-num"></td><td class="toc-title" style="padding-left: 20px;">7.1 Creación de guía y rótulo térmico on-demand</td><td class="toc-page">Pág. 5</td></tr>
    <tr><td class="toc-num"></td><td class="toc-title" style="padding-left: 20px;">7.2 Solicitud de recogida en nodo tienda (COLLECT_GUIDE)</td><td class="toc-page">Pág. 6</td></tr>
    <tr><td class="toc-num"></td><td class="toc-title" style="padding-left: 20px;">7.3 Anulación de guía e idempotencia</td><td class="toc-page">Pág. 6</td></tr>
    <tr><td class="toc-num"></td><td class="toc-title" style="padding-left: 20px;">7.4 Notificación de tracking saliente / Webhook hacia Go Éxito</td><td class="toc-page">Pág. 7</td></tr>
    <tr><td class="toc-num">8.</td><td class="toc-title">Disponibilidad, concurrencia y límites (SLO / Rate Limit)</td><td class="toc-page">Pág. 7</td></tr>
    <tr><td class="toc-num">9.</td><td class="toc-title">Resiliencia, reintentos escalonados y Circuit Breaker</td><td class="toc-page">Pág. 8</td></tr>
    <tr><td class="toc-num">10.</td><td class="toc-title">Alertas operativas automáticas (WhatsApp y Correo)</td><td class="toc-page">Pág. 8</td></tr>
    <tr><td class="toc-num">11.</td><td class="toc-title">Especificaciones físicas de rótulos térmicos (4x6" vs 10x10 cm)</td><td class="toc-page">Pág. 9</td></tr>
    <tr><td class="toc-num">12.</td><td class="toc-title">Alineación de ambientes (QA / Sandbox vs Producción)</td><td class="toc-page">Pág. 9</td></tr>
  </table>

  <h1>1. Control del Documento</h1>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 12%;">Versión</th>
        <th style="width: 18%;">Fecha</th>
        <th style="width: 28%;">Autor / Cargo</th>
        <th>Descripción del Cambio</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>v1.0</strong></td>
        <td>15/10/2026</td>
        <td>Equipo TI Milla 7</td>
        <td>Definición inicial de endpoints de mensajería y generación de guías.</td>
      </tr>
      <tr>
        <td><strong>v2.0</strong></td>
        <td>09/11/2026</td>
        <td>Dirección TI / Arquitectura</td>
        <td>Alineación completa a estándar Go Éxito v2.0: reintentos 24h, Circuit Breaker, rótulos en RAM, aislamiento Sandbox sin crons y alertas operativas por correo/WhatsApp.</td>
      </tr>
    </tbody>
  </table>

  <table class="data-table" style="margin-top: 15px;">
    <thead>
      <tr>
        <th style="width: 33%;">Elaborado por</th>
        <th style="width: 33%;">Revisado por</th>
        <th style="width: 34%;">Aprobado por</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Ing. de Integraciones B2B</strong><br>Milla 7 Logistics S.A.S.</td>
        <td><strong>Director de Tecnología (TI)</strong><br>directorti@millasiete.com</td>
        <td><strong>Gerencia de Operaciones</strong><br>Milla 7 Logistics S.A.S.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ========================================== -->
<!-- PÁGINA 3: OBJETIVO, ALCANCE Y PRINCIPIOS   -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col"><strong>Código:</strong> 001<br><strong>Versión:</strong> 2.0<br><strong>Año:</strong> 2026</td>
    </tr>
  </table>

  <h1>2. Objetivo General</h1>
  <p>
    Establecer el marco arquitectónico, funcional y de seguridad para la integración de servicios entre la plataforma <strong>Go Éxito v2.0</strong> (Grupo Éxito) y el núcleo logístico <strong>OrbitM7</strong> (Milla 7 Logistics S.A.S.). Esta integración permite la creación desatendida de guías de mensajería urbana, generación e impresión de rótulos térmicos estandarizados, asignación dinámica de flota inhouse, confirmación de recogida en tiendas, trazabilidad en tiempo real vía Webhook y gestión de devoluciones al nodo local.
  </p>

  <h1>3. Alcance Operativo (Misma Ciudad / Urbano)</h1>
  <p>
    La presente especificación aplica exclusivamente a operaciones de <strong>última milla urbana (misma ciudad)</strong> bajo dos modalidades de servicio:
  </p>
  <ul>
    <li><strong>Same Day (Mismo Día):</strong> Pedidos generados con corte operativo (11:00 AM) para recogida en tienda en horas de la mañana y entrega al cliente final en la tarde/noche del mismo día.</li>
    <li><strong>Next Day (Día Siguiente):</strong> Pedidos recogidos durante la tarde en tiendas Éxito, ingresados y verificados en el almacén de consolidación de Milla 7, y distribuidos en ruta urbana a primera hora de la mañana siguiente.</li>
  </ul>
  <div class="notice-box">
    <strong>Aclaración Operativa:</strong> Al tratarse de mensajería urbana local, los estados de transporte nacional (como <em>Id Guía = 3: En Transporte</em> o <em>Id Guía = 4: En Reexpedición</em>) no aplican. Milla 7 recibe el paquete directamente en la tienda y lo entrega en el domicilio del cliente sin intermediación de troncales nacionales.
  </div>

  <h1>4. Principios Técnicos Obligatorios</h1>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Principio</th>
        <th>Regla Técnica Exigida</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Protección de PII</strong></td>
        <td>
          Prohibido exponer datos personales (nombres, teléfonos, cédulas, correos) en URLs, parámetros Query String o logs públicos. Los datos viajan cifrados únicamente en el cuerpo JSON mediante HTTPS TLS 1.2+.
        </td>
      </tr>
      <tr>
        <td><strong>Credenciales Seguras</strong></td>
        <td>
          Está estrictamente prohibido enviar llaves API o tokens en la URL. Toda autenticación se realiza mediante la cabecera HTTP <code>x-api-key</code> o <code>Authorization: Bearer &lt;token&gt;</code>.
        </td>
      </tr>
      <tr>
        <td><strong>Idempotencia Estricta</strong></td>
        <td>
          Toda creación o anulación exige la cabecera <code>Idempotency-Key</code>. Las solicitudes repetidas con la misma llave dentro de una ventana de 24 horas devuelven la respuesta original exacta (HTTP 200) sin duplicar guías ni transacciones.
        </td>
      </tr>
      <tr>
        <td><strong>Zona Horaria Oficial</strong></td>
        <td>
          Todas las marcas de tiempo se registran y transmiten en formato ISO-8601 estandarizado para Colombia: <code>YYYY-MM-DDTHH:mm:ss-05:00</code> (<code>America/Bogota</code>).
        </td>
      </tr>
      <tr>
        <td><strong>Rótulos en RAM</strong></td>
        <td>
          Para garantizar latencias sub-segundo, los rótulos térmicos PDF y códigos ZPL se generan dinámicamente en memoria RAM bajo demanda, evitando transferencias pesadas en el POST de creación.
        </td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ========================================== -->
<!-- PÁGINA 4: MODELO DE INTEGRACIÓN Y CONTRATO -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col"><strong>Código:</strong> 001<br><strong>Versión:</strong> 2.0<br><strong>Año:</strong> 2026</td>
    </tr>
  </table>

  <h1>5. Modelo de Integración y Repositorio Google Drive</h1>
  <p>
    La arquitectura opera bajo un modelo de desacoplamiento asíncrono con persistencia en Google Drive empresarial. Las evidencias fotográficas y firmas capturadas en campo por el conductor se indexan en la siguiente estructura jerárquica:
  </p>
  <pre>exito_fulfillment/
├── {{Same_Day | Next_Day}}/
│   ├── Recogidas/{{año}}/{{mes}}/{{guia}}/ (Foto paquetes + Firma encargado tienda)
│   ├── Entregas/{{año}}/{{mes}}/{{guia}}/  (Foto fachada + Firma cliente en pantalla)
│   ├── Novedades/{{año}}/{{mes}}/{{guia}}/ (Foto causal no entrega / dirección errónea)
│   └── Devoluciones/{{año}}/{{mes}}/{{nodo}}/ (Planilla devolución firmada en tienda)</pre>

  <h1>6. Contrato Técnico</h1>

  <h2>6.1. Encabezados HTTP Obligatorios</h2>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Encabezado</th>
        <th style="width: 15%;">Tipo</th>
        <th>Descripción y Obligatoriedad</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>Content-Type</code></td>
        <td>String</td>
        <td>Obligatorio: <code>application/json; charset=utf-8</code>.</td>
      </tr>
      <tr>
        <td><code>x-api-key</code></td>
        <td>String</td>
        <td>Obligatorio: Llave de autenticación aprovisionada por ambiente.</td>
      </tr>
      <tr>
        <td><code>x-correlation-id</code></td>
        <td>UUID v4</td>
        <td>Obligatorio: Identificador único de trazabilidad de extremo a extremo.</td>
      </tr>
      <tr>
        <td><code>Idempotency-Key</code></td>
        <td>String</td>
        <td>Obligatorio en POST: Identificador retenido por 24 horas para evitar duplicidad.</td>
      </tr>
      <tr>
        <td><code>x-exito-env</code></td>
        <td>String</td>
        <td>Opcional: <code>SANDBOX</code> | <code>QA</code> | <code>PROD</code>.</td>
      </tr>
    </tbody>
  </table>

  <h2>6.2. Estructura Canónica de Mensajes JSON</h2>
  <p>Todas las peticiones y respuestas cumplen con el estándar bicameral de Go Éxito:</p>
  <pre>{{
  "header": {{
    "applicationId": "GO_EXITO",
    "transactionDate": "2026-11-09T08:30:00-05:00",
    "transactionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }},
  "data": {{
    "operationType": "CREATE_GUIDE_REQUEST",
    "data": {{ /* Carga útil de negocio */ }}
  }}
}}</pre>

  <h2>6.3. Códigos de Respuesta HTTP Estandarizados</h2>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 12%;">Código</th>
        <th style="width: 28%;">Significado</th>
        <th>Comportamiento de la Plataforma</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>200 OK</code></td>
        <td>Operación exitosa / Idempotente</td>
        <td>Respuesta a consulta o replay idempotente sin alteración de datos.</td>
      </tr>
      <tr>
        <td><code>201 Created</code></td>
        <td>Guía creada exitosamente</td>
        <td>Guía persistida en OrbitM7 y rótulo disponible para descarga.</td>
      </tr>
      <tr>
        <td><code>400 Bad Request</code></td>
        <td>JSON malformado o campos faltantes</td>
        <td>Error de esquema; el cliente debe corregir el payload antes de reintentar.</td>
      </tr>
      <tr>
        <td><code>401 / 403</code></td>
        <td>Falla de autenticación</td>
        <td>Llave inválida o presencia indebida de credenciales en Query String.</td>
      </tr>
      <tr>
        <td><code>409 Conflict</code></td>
        <td>Conflicto de estado operativo</td>
        <td>Por ejemplo, anulación de una guía que ya fue recogida o entregada.</td>
      </tr>
      <tr>
        <td><code>429 Too Many Req</code></td>
        <td>Límite de tasa superado</td>
        <td>Retorna encabezado <code>Retry-After</code> con los segundos de espera.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ========================================== -->
<!-- PÁGINA 5: SERVICIOS FUNCIONALES B2B        -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col"><strong>Código:</strong> 001<br><strong>Versión:</strong> 2.0<br><strong>Año:</strong> 2026</td>
    </tr>
  </table>

  <h1>7. Servicios Funcionales B2B</h1>

  <h2>7.1. Creación de Guía y Rótulo Térmico On-Demand</h2>
  <p><strong>Endpoint:</strong> <code>POST /api/v1/guides</code></p>
  <p>
    Permite a Go Éxito generar una guía de despacho urbano. OrbitM7 valida la cobertura por código DANE y barrio, genera el número de guía único, calcula la ruta de reparto y disponibiliza el rótulo térmico listo para impresión.
  </p>
  <pre>// Payload de Petición (Go Éxito -> Milla 7)
{{
  "header": {{
    "applicationId": "GO_EXITO",
    "transactionDate": "2026-11-09T09:00:00-05:00",
    "transactionId": "11111111-2222-3333-4444-555555555555"
  }},
  "data": {{
    "operationType": "CREATE_GUIDE_REQUEST",
    "data": {{
      "numero_pedido": "PED-14123456789-01",
      "codigo_dependencia": "0011",
      "tipo_operacion": "SAME_DAY",
      "nombre_remitente": "ÉXITO POBLADO",
      "direccion_remitente": "CL 10 # 43E 135",
      "ciudad_remitente": "05001000",
      "nombre_destinatario": "CARLOS ANDRES RESTREPO",
      "nit_destinatario": "1020304050",
      "direccion_destinatario": "CRA 43A # 1-50 APTO 502",
      "barrio_destinatario": "POBLADO",
      "ciudad_destinatario": "05001000",
      "celular_destinatario": "3104567890",
      "cant_cajas": "1",
      "peso": "2.5",
      "valor_declarado": "120000",
      "contenido": "MERCANCIA GENERAL EXITO"
    }}
  }}
}}</pre>

  <p><strong>Estructura de Respuesta Exitosa (HTTP 201 Created):</strong></p>
  <pre>{{
  "transactionId": "11111111-2222-3333-4444-555555555555",
  "result": "OK",
  "code": "GUIDE_CREATED",
  "data": {{
    "guideNumber": "90889079025",
    "orderNumber": "PED-14123456789-01",
    "status": "1",
    "statusDescription": "Guía generada",
    "label": {{
      "format": "PDF",
      "url": "/api/exito-mensajeria/guias/por-numero/90889079025/rotulo.pdf"
    }},
    "PAQUETERA_GET_LABELS_RESPONSE": {{
      "rotulos": "JVBERi0xLjcKJYGBgYEKCjcgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGU...",
      "url_rotulo_drive": "/api/exito-mensajeria/guias/por-numero/90889079025/rotulo.pdf"
    }}
  }}
}}</pre>

  <h2>Consulta / Reimpresión de Rótulo Térmico</h2>
  <p><strong>Endpoint:</strong> <code>GET /api/v1/guides/{{guideNumber}}/label</code></p>
  <p>
    Permite recuperar el rótulo en cualquier momento de la operación en formato PDF vectorial o binario Base64 listo para alimentar colas de impresión.
  </p>
</div>

<!-- ========================================== -->
<!-- PÁGINA 6: RECOGIDAS Y ANULACIÓN            -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col"><strong>Código:</strong> 001<br><strong>Versión:</strong> 2.0<br><strong>Año:</strong> 2026</td>
    </tr>
  </table>

  <h2>7.2. Solicitud de Recogida en Tienda (COLLECT_GUIDE)</h2>
  <p><strong>Endpoint:</strong> <code>POST /api/v1/pickups</code></p>
  <p>
    Permite notificar formalmente que los paquetes de un pedido se encuentran embalados y listos en la tienda para ser recogidos por el conductor de Milla 7.
  </p>
  <pre>{{
  "header": {{
    "applicationId": "GO_EXITO",
    "transactionDate": "2026-11-09T10:00:00-05:00",
    "transactionId": "9f8e7d6c-5b4a-3210-fedc-ba9876543210"
  }},
  "data": {{
    "operationType": "COLLECT_GUIDE",
    "data": {{
      "referencia": "90889079025",
      "guiaInicial": "90889079025",
      "fechaRecogida": "2026-11-09",
      "ciudadOrigen": "05001000",
      "ciudadDestino": "05001000",
      "direccion": "CL 10 # 43E 135",
      "unidades": 1,
      "valorDeclarado": 120000
    }}
  }}
}}</pre>

  <h2>7.3. Anulación Idempotente de Guía</h2>
  <p><strong>Endpoint:</strong> <code>POST /api/v1/guides/{{guideNumber}}/cancel</code></p>
  <p>
    Cancela una guía antes de que el vehículo realice la recogida física en la tienda. Si la guía ya fue recogida o se encuentra en reparto, el sistema responde con <code>HTTP 409 Conflict</code> indicando que el paquete debe seguir el flujo de novedad y retorno.
  </p>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Escenario</th>
        <th style="width: 15%;">Código HTTP</th>
        <th>Comportamiento y Mensaje</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Guía en espera de recogida</strong></td>
        <td><code>200 OK</code></td>
        <td>Anulación exitosa; la guía pasa a estado CANCELADA (Id guía = 8).</td>
      </tr>
      <tr>
        <td><strong>Segunda petición (Idempotente)</strong></td>
        <td><code>200 OK</code></td>
        <td>Retorna el mismo resultado confirmando que ya se encontraba anulada.</td>
      </tr>
      <tr>
        <td><strong>Guía ya recogida en tienda</strong></td>
        <td><code>409 Conflict</code></td>
        <td>Rechaza la anulación: el vehículo ya tiene custodia física del paquete.</td>
      </tr>
    </tbody>
  </table>

  <h2>7.4. Consulta Síncrona de Trazabilidad</h2>
  <p><strong>Endpoint:</strong> <code>GET /api/v1/guides/{{guideNumber}}</code></p>
  <p>
    Devuelve el estado operativo en tiempo real, histórico cronológico de cambios de estado, y enlaces a las evidencias fotográficas y firmas custodiadas en Google Drive.
  </p>
</div>

<!-- ========================================== -->
<!-- PÁGINA 7: WEBHOOK DE TRACKING Y SLOS       -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col"><strong>Código:</strong> 001<br><strong>Versión:</strong> 2.0<br><strong>Año:</strong> 2026</td>
    </tr>
  </table>

  <h2>7.5. Notificación Saliente vía Webhook hacia Go Éxito</h2>
  <p>
    Milla 7 notifica inmediatamente cada avance de estado hacia el Webhook provisto por Go Éxito. La siguiente matriz resume la homologación oficial de estados:
  </p>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 10%;">Id Guía</th>
        <th style="width: 22%;">Estado Homologado</th>
        <th style="width: 22%;">Momento Operativo Milla 7</th>
        <th>Evidencia Adjunta en Notificación</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>1</code></td>
        <td>Guía generada</td>
        <td>Creación vía API o Inhouse</td>
        <td>Enlace al rótulo térmico PDF on-demand.</td>
      </tr>
      <tr>
        <td><code>2</code></td>
        <td>Recogido en punto</td>
        <td>Conductor recibe en tienda Éxito</td>
        <td>Foto de paquetes + Firma del encargado de tienda.</td>
      </tr>
      <tr>
        <td><code>5</code></td>
        <td>En reparto</td>
        <td>Vehículo sale de bodega en ruta</td>
        <td>Placa, conductor asignado y remisión de ruta.</td>
      </tr>
      <tr>
        <td><code>6</code></td>
        <td>Entregado</td>
        <td>Entrega final al cliente</td>
        <td>Firma digital del cliente + Foto de fachada/paquete.</td>
      </tr>
      <tr>
        <td><code>7</code></td>
        <td>Novedad en reparto</td>
        <td>Intento de entrega no efectivo</td>
        <td>Foto causal + Causal homologada (motivo / reason_code).</td>
      </tr>
      <tr>
        <td><code>8</code></td>
        <td>Cancelado</td>
        <td>Anulación antes de recogida</td>
        <td>Registro de auditoría del usuario que anuló.</td>
      </tr>
      <tr>
        <td><code>9</code></td>
        <td>Devolución</td>
        <td>Retorno definitivo a tienda</td>
        <td>Acta de devolución firmada en el nodo local.</td>
      </tr>
    </tbody>
  </table>

  <h1>8. Disponibilidad, Concurrencia y Límites (SLO)</h1>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 30%;">Métrica de Servicio</th>
        <th style="width: 25%;">Objetivo SLO</th>
        <th>Mecanismo de Control</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Disponibilidad de API</strong></td>
        <td><strong>≥ 99.5%</strong> mensual</td>
        <td>Monitoreo activo continuo y cluster de workers Node.js.</td>
      </tr>
      <tr>
        <td><strong>Latencia percentil 95 (p95)</strong></td>
        <td><strong>≤ 2,000 ms</strong></td>
        <td>Generación de PDFs en memoria y consultas indexadas.</td>
      </tr>
      <tr>
        <td><strong>Latencia percentil 99 (p99)</strong></td>
        <td><strong>≤ 4,000 ms</strong></td>
        <td>Procesamiento asíncrono de fotos hacia Google Drive.</td>
      </tr>
      <tr>
        <td><strong>Límite de peticiones</strong></td>
        <td><strong>60 req / minuto</strong></td>
        <td>Rate limiter por IP con respuesta HTTP 429 y Retry-After.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ========================================== -->
<!-- PÁGINA 8: RESILIENCIA Y ALERTAS            -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col"><strong>Código:</strong> 001<br><strong>Versión:</strong> 2.0<br><strong>Año:</strong> 2026</td>
    </tr>
  </table>

  <h1>9. Resiliencia, Reintentos y Circuit Breaker</h1>
  <p>
    Para garantizar que ningún evento de tracking se pierda ante caídas de red o intermitencias en los servidores de Go Éxito, Milla 7 implementa una política escalonada de reintentos durante 24 horas:
  </p>
  <ul>
    <li><strong>Ventana de Reintentos Exponenciales:</strong> Inmediato (0s), 1 min, 2 min, 5 min, 15 min, 30 min, 1 hora, 2 horas... hasta completar 24 horas continuas.</li>
    <li><strong>Circuit Breaker Automático:</strong> Si el webhook de Go Éxito experimenta una tasa de fallas ≥ 50% en una ventana de 30 segundos, el circuito se abre por 60 segundos, pausando envíos para evitar sobrecargar el endpoint remoto y reteniendo los eventos en cola.</li>
    <li><strong>Dead Letter Queue (DLQ):</strong> Si tras 24 horas el evento no pudo ser entregado, pasa a la cola DLQ para auditoría y reprocesamiento manual con un solo clic desde el panel Inhouse.</li>
  </ul>

  <h1>10. Alertas Operativas Automáticas (WhatsApp y Correo)</h1>
  <p>
    OrbitM7 cuenta con un motor de notificaciones push multi-canal configurables desde el módulo <strong>Alertas WhatsApp / Correo</strong>, garantizando que el equipo de operaciones esté informado en tiempo real:
  </p>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 28%;">Evento Operativo</th>
        <th style="width: 15%;">Canales</th>
        <th>Contenido Notificado</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Recogida en Punto / Tienda</strong><br><code>EXITO_RECOGIDA_PUNTO</code></td>
        <td>Correo / WhatsApp</td>
        <td>Notificación inmediata cuando el conductor realiza el checkout en la tienda Éxito: código de recogida, nodo, placa, conductor, total de guías/cajas y enlace a la remisión firmada.</td>
      </tr>
      <tr>
        <td><strong>Recepción en Almacén M7</strong><br><code>EXITO_RECEPCION_ALMACEN</code></td>
        <td>Correo / WhatsApp</td>
        <td>Notificación inmediata cuando las guías llegan al almacén urbano de Milla 7 y son verificadas por el personal de bodega mediante pistoleo.</td>
      </tr>
      <tr>
        <td><strong>Novedades y Rechazos</strong><br><code>EXITO_NOVEDAD</code></td>
        <td>Correo / WhatsApp</td>
        <td>Alerta prioritaria ante intentos fallidos de entrega, cliente ausente, dirección no encontrada o rechazo de mercancía con foto de evidencia.</td>
      </tr>
      <tr>
        <td><strong>Alerta Técnica DLQ (P1)</strong><br><code>EXITO_DLQ</code></td>
        <td>Correo / WhatsApp</td>
        <td>Alerta crítica al equipo de soporte TI cuando un evento de tracking supera las 24 horas sin poder entregarse al webhook de Go Éxito.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ========================================== -->
<!-- PÁGINA 9: RÓTULOS TÉRMICOS Y ENTORNOS      -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">Lineamientos Técnicos de Integración de Paqueteras con Go Éxito</td>
      <td class="meta-col"><strong>Código:</strong> 001<br><strong>Versión:</strong> 2.0<br><strong>Año:</strong> 2026</td>
    </tr>
  </table>

  <h1>11. Especificaciones Físicas de Rótulos Térmicos</h1>
  <p>
    Los rótulos generados por Milla 7 cumplen con los más altos estándares de legibilidad para escáneres láser y cámaras ópticas:
  </p>
  <ul>
    <li><strong>Dimensiones Disponibles:</strong> Formato estándar industrial de <strong>4 × 6 pulgadas (100 × 150 mm)</strong> y adaptación opcional a <strong>100 × 100 mm (10 × 10 cm)</strong>.</li>
    <li><strong>Código de Barras 1D (Code 128):</strong> Codificación dual de alta densidad para el <em>Número de Guía</em> y el <em>Número de Pedido</em>.</li>
    <li><strong>Código Bidimensional (QR Code):</strong> Enlace criptográfico de consulta rápida para trazabilidad en campo mediante smartphone.</li>
    <li><strong>Formatos Soportados:</strong> PDF vectorial de alta resolución (203 / 300 DPI) y código nativo <strong>ZPL (Zebra Programming Language)</strong> para impresoras térmicas de red.</li>
  </ul>

  <h1>12. Alineación de Entornos (QA / Sandbox vs Producción)</h1>
  <p>
    En cumplimiento estricto de las condiciones de seguridad, las credenciales no se encuentran embebidas en este documento. A continuación se presentan las especificaciones arquitectónicas de cada entorno:
  </p>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Parámetro</th>
        <th style="width: 37%;">Ambiente QA / Sandbox Dedicado</th>
        <th style="width: 38%;">Ambiente de Producción Milla 7</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Servidor y Host</strong></td>
        <td>VPS Dedicado Contabo (Alemania / 6 vCPUs, 12 GB RAM)</td>
        <td>Infraestructura Cloud DigitalOcean Droplet</td>
      </tr>
      <tr>
        <td><strong>Base URL API</strong></td>
        <td><code>https://devsm7.santamariapp.com/api/v1</code></td>
        <td><code>https://apiapps.m7apps.com/api/v1</code></td>
      </tr>
      <tr>
        <td><strong>Contrato OpenAPI 3.0.3</strong></td>
        <td><code>https://devsm7.santamariapp.com/api/exito-mensajeria/openapi.json</code></td>
        <td><code>https://apiapps.m7apps.com/api/exito-mensajeria/openapi.json</code></td>
      </tr>
      <tr>
        <td><strong>Portal Operativo Inhouse</strong></td>
        <td><code>https://devsm7.santamariapp.com/exito-mensajeria-inhouse</code></td>
        <td><code>https://orbitm7.m7apps.com/exito-mensajeria-inhouse</code></td>
      </tr>
      <tr>
        <td><strong>Ejecución de CRONs</strong></td>
        <td><span class="badge-tag badge-active">Deshabilitados (DISABLE_CRON=true)</span></td>
        <td>Activos para scheduler y reportes periódicos</td>
      </tr>
      <tr>
        <td><strong>Carpeta Google Drive</strong></td>
        <td><code>exito_fulfillment/Sandbox/</code></td>
        <td><code>exito_fulfillment/</code></td>
      </tr>
      <tr>
        <td><strong>Autenticación B2B</strong></td>
        <td>Vía cabecera <code>x-api-key</code> formalizada en el onboarding</td>
        <td>Vía cabecera <code>x-api-key</code> formalizada en el onboarding</td>
      </tr>
    </tbody>
  </table>

  <div class="notice-box" style="margin-top: 15px;">
    <strong>Formalización de Canales:</strong> Las credenciales activas del ambiente Sandbox (<code>x-api-key</code>) y la URL del Webhook de retorno son suministradas formalmente por los canales oficiales de soporte técnico (directorti@millasiete.com) tras la firma de los acuerdos de confidencialidad de datos.
  </div>
</div>

</body>
</html>
'''

with open('DOCUMENTO_TECNICO_INTEGRACION_MILLA7_GO_EXITO_V2.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("HTML generado exitosamente.")
