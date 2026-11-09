#!/usr/bin/env python3
import base64
import os
import subprocess

with open('utils/logoMillaSiete.ts', 'r') as f:
    text = f.read()
logo_base64 = text.split("'")[1].split(',')[1]

html_content = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Propuesta Ejecutiva de Modernización de Infraestructura — Milla 7 Logistics</title>
<style>
  @page {{
    size: letter portrait;
    margin: 10mm 14mm 12mm 14mm;
    @bottom-right {{
      content: "Página " counter(page) " de " counter(pages);
      font-size: 8pt;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #64748b;
      font-weight: bold;
    }}
    @bottom-left {{
      content: "Milla 7 Logistics S.A.S. · Documento Confidencial de Decisión Gerencial";
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
    line-height: 1.4;
    font-size: 8.8pt;
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

  /* Encabezado Corporativo */
  .header-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    border: 1.5px solid #0f172a;
  }}

  .header-table td {{
    border: 1px solid #cbd5e1;
    padding: 5px 8px;
    vertical-align: middle;
  }}

  .header-table .logo-col {{
    width: 25%;
    text-align: center;
    background: #ffffff;
    border-right: 1.5px solid #0f172a;
  }}

  .header-table .logo-col img {{
    max-height: 40px;
    max-width: 130px;
    object-fit: contain;
  }}

  .header-table .title-col {{
    width: 55%;
    text-align: center;
    font-size: 9.5pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.25;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-right: 1.5px solid #0f172a;
  }}

  .header-table .meta-col {{
    width: 20%;
    font-size: 7.5pt;
    color: #334155;
    line-height: 1.35;
    background: #f8fafc;
  }}

  /* Metadatos de la propuesta */
  .meta-grid {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    background: #f1f5f9;
    border-left: 4px solid #0284c7;
  }}

  .meta-grid td {{
    padding: 5px 8px;
    font-size: 8.2pt;
  }}

  .meta-grid td strong {{
    color: #0f2d59;
  }}

  h1 {{
    font-size: 11pt;
    font-weight: 800;
    color: #0f2d59;
    border-bottom: 2px solid #0284c7;
    padding-bottom: 2px;
    margin-top: 10px;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }}

  h2 {{
    font-size: 9.5pt;
    font-weight: 700;
    color: #0369a1;
    margin-top: 8px;
    margin-bottom: 4px;
    border-left: 3px solid #0284c7;
    padding-left: 6px;
  }}

  p {{
    margin-top: 2px;
    margin-bottom: 5px;
    text-align: justify;
  }}

  ul, ol {{
    margin-top: 2px;
    margin-bottom: 5px;
    padding-left: 18px;
  }}

  li {{
    margin-bottom: 2px;
  }}

  /* Tablas de datos comparativas */
  table.comp-table {{
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0 8px 0;
    font-size: 8.2pt;
  }}

  table.comp-table th {{
    background: #0f2d59;
    color: #ffffff;
    font-weight: 700;
    text-align: center;
    padding: 5px 6px;
    border: 1px solid #0f2d59;
  }}

  table.comp-table td {{
    padding: 4px 6px;
    border: 1px solid #cbd5e1;
    text-align: center;
  }}

  table.comp-table td.left {{
    text-align: left;
    font-weight: 600;
    color: #1e293b;
  }}

  table.comp-table tr:nth-child(even) {{
    background: #f8fafc;
  }}

  .badge-danger {{
    background: #fee2e2;
    color: #991b1b;
    font-weight: 700;
    padding: 1.5px 5px;
    border-radius: 3px;
    display: inline-block;
  }}

  .badge-success {{
    background: #dcfce7;
    color: #166534;
    font-weight: 800;
    padding: 1.5px 5px;
    border-radius: 3px;
    display: inline-block;
  }}

  .badge-highlight {{
    background: #e0f2fe;
    color: #0369a1;
    font-weight: 800;
    padding: 1.5px 5px;
    border-radius: 3px;
    display: inline-block;
  }}

  /* Cajas de Alerta y Resumen */
  .highlight-card {{
    background: #f0fdf4;
    border: 1.5px solid #86efac;
    border-radius: 5px;
    padding: 8px 10px;
    margin: 8px 0 0 0;
  }}

  .highlight-card h3 {{
    margin: 0 0 3px 0;
    color: #15803d;
    font-size: 9pt;
    font-weight: 800;
  }}

  .stat-grid {{
    display: flex;
    justify-content: space-between;
    margin: 8px 0;
    gap: 8px;
  }}

  .stat-box {{
    flex: 1;
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 5px;
    padding: 6px 6px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }}

  .stat-box .val {{
    font-size: 14pt;
    font-weight: 900;
    color: #0284c7;
    line-height: 1.1;
  }}

  .stat-box .desc {{
    font-size: 7pt;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    margin-top: 1px;
  }}

  /* Firmas */
  .signature-table {{
    width: 100%;
    margin-top: 18px;
    border-collapse: collapse;
  }}

  .signature-table td {{
    width: 50%;
    padding: 8px 25px;
    text-align: center;
    vertical-align: top;
  }}

  .sig-line {{
    border-top: 1.5px solid #334155;
    margin-top: 40px;
    padding-top: 4px;
    font-size: 8pt;
  }}
</style>
</head>
<body>

<!-- ========================================== -->
<!-- PÁGINA 1: CASO DE NEGOCIO Y COMPARATIVA    -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7 Logistics"></td>
      <td class="title-col">PROPUESTA TÉCNICO-FINANCIERA: MODERNIZACIÓN DE INFRAESTRUCTURA CLOUD</td>
      <td class="meta-col">
        <strong>Código:</strong> IT-PROP-2026-02<br>
        <strong>Versión:</strong> 1.0<br>
        <strong>Fecha:</strong> 09/Nov/2026
      </td>
    </tr>
  </table>

  <table class="meta-grid">
    <tr>
      <td><strong>Para:</strong> Gerencia General / Dirección Administrativa y Financiera</td>
      <td><strong>De:</strong> Dirección de Tecnología (TI) & Infraestructura</td>
    </tr>
    <tr>
      <td><strong>Asunto:</strong> Aprobación de Adquisición de Servidor Cloud VPS de Alta Capacidad para OrbitM7</td>
      <td><strong>Impacto:</strong> Operación Grupo Éxito, Despacho Urbano y Ahorro Tecnológico</td>
    </tr>
  </table>

  <h1>1. Resumen Ejecutivo y Necesidad del Negocio</h1>
  <p>
    Con la entrada formal en producción de la <strong>integración B2B con Grupo Éxito (Go Éxito v2.0)</strong>, la plataforma logística <strong>OrbitM7</strong> pasa a gestionar un flujo transaccional continuo y crítico: creación desatendida de miles de guías, generación de rótulos térmicos en tiempo real, control de doble pistoleo en tiendas y bodega, enrutamiento inteligente de flota urbana y sincronización de Webhooks 24/7.
  </p>
  <p>
    Actualmente, la plataforma opera en un servidor básico de <strong>DigitalOcean</strong> por el cual se pagan aproximadamente <strong>$24.00 USD mensuales</strong>. No obstante, este servidor cuenta únicamente con <strong>1 núcleo de CPU y 2 GB de memoria RAM</strong>, lo que representa un cuello de botella inminente y un alto riesgo de caída por saturación de memoria (<em>Out of Memory - OOM</em>) ante el volumen transaccional de Grupo Éxito.
  </p>
  <p>
    Se ha seleccionado una oportunidad de aprovisionamiento de un <strong>Cloud VPS dedicado de nivel empresarial (12 núcleos de CPU y 48 GB de memoria RAM)</strong> por un costo de <strong>$24.00 a $30.00 USD mensuales</strong>. Esto significa multiplicar la capacidad por <strong>24 veces en memoria y 12 veces en procesamiento por el mismo presupuesto</strong>.
  </p>

  <div class="stat-grid">
    <div class="stat-box">
      <div class="val">+1.200%</div>
      <div class="desc">Potencia CPU (12 núcleos)</div>
    </div>
    <div class="stat-box">
      <div class="val">+2.400%</div>
      <div class="desc">Memoria RAM (48 GB)</div>
    </div>
    <div class="stat-box">
      <div class="val">+800%</div>
      <div class="desc">Disco SSD (400 GB)</div>
    </div>
    <div class="stat-box">
      <div class="val">$0.50 / GB</div>
      <div class="desc">Costo RAM vs $12.00 actual</div>
    </div>
  </div>

  <h1>2. Cuadro Comparativo: Servidor Actual vs. Nuevo Servidor Propuesto</h1>
  <table class="comp-table">
    <thead>
      <tr>
        <th style="width: 25%;">Componente / Recurso</th>
        <th style="width: 28%;">Infraestructura Actual (DigitalOcean)</th>
        <th style="width: 32%;">Nueva Infraestructura Propuesta (Cloud VPS 12)</th>
        <th style="width: 15%;">Ventaja Milla 7</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="left">Capacidad de Procesamiento</td>
        <td>1 vCPU (Básico compartido)</td>
        <td><strong>12 vCPUs de Alto Rendimiento</strong></td>
        <td><span class="badge-success">12x Potencia</span></td>
      </tr>
      <tr>
        <td class="left">Memoria RAM Operativa</td>
        <td>2 GB RAM <span class="badge-danger">Riesgo Saturación</span></td>
        <td><strong>48 GB RAM Dedicada</strong></td>
        <td><span class="badge-success">24x Memoria</span></td>
      </tr>
      <tr>
        <td class="left">Almacenamiento de Datos</td>
        <td>50 GB SSD</td>
        <td><strong>400 GB SSD Ultra-rápido</strong></td>
        <td><span class="badge-success">8x Espacio</span></td>
      </tr>
      <tr>
        <td class="left">Velocidad de Puerto Red</td>
        <td>100 Mbit/s</td>
        <td><strong>Puerto de 800 Mbit/s</strong></td>
        <td><span class="badge-highlight">8x Ancho Banda</span></td>
      </tr>
      <tr>
        <td class="left">Copias Snapshot del Proveedor</td>
        <td>No incluidas (Costo adicional)</td>
        <td><strong>3 Snapshots automáticos incluidos</strong></td>
        <td><span class="badge-success">Incluidos gratis</span></td>
      </tr>
      <tr>
        <td class="left">Ubicación y Latencia</td>
        <td>San Francisco, EE.UU. (~130 ms)</td>
        <td><strong>St. Louis / Centro EE.UU. (~75 ms)</strong></td>
        <td><span class="badge-highlight">40% menor latencia</span></td>
      </tr>
      <tr>
        <td class="left">Costo Mensual Aproximado</td>
        <td><strong>~$24.00 USD / mes</strong></td>
        <td><strong>$24.00 a $30.00 USD / mes</strong></td>
        <td><span class="badge-success">Mismo Precio</span></td>
      </tr>
    </tbody>
  </table>

  <div class="highlight-card">
    <h3>Análisis de Eficiencia de Costo por Gigabyte de Memoria</h3>
    <p style="margin: 0; font-size: 8pt;">
      En el servidor actual se paga una tarifa equivalente a <strong>$12.00 USD por cada GB de RAM</strong>. Con el servidor propuesto, la compañía pagará únicamente <strong>$0.50 USD por cada GB de RAM</strong>. Se trata de un incremento monumental en rendimiento, velocidad de respuesta y estabilidad sin impactar el presupuesto financiero de la empresa.
    </p>
  </div>
</div>

<!-- ========================================== -->
<!-- PÁGINA 2: BENEFICIOS, MITIGACIÓN Y FIRMAS -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">PROPUESTA TÉCNICO-FINANCIERA: MODERNIZACIÓN DE INFRAESTRUCTURA CLOUD</td>
      <td class="meta-col">
        <strong>Código:</strong> IT-PROP-2026-02<br>
        <strong>Versión:</strong> 1.0<br>
        <strong>Fecha:</strong> 09/Nov/2026
      </td>
    </tr>
  </table>

  <h1>3. Justificación Técnica y Beneficios para la Operación</h1>
  <ul>
    <li>
      <strong>Soporte Ininterrumpido para Grupo Éxito:</strong> La generación de rótulos térmicos en formato PDF vectorial se realiza directamente en la memoria RAM del servidor. Pasar de 2 GB a 48 GB garantiza que decenas de operarios y conductores puedan procesar despachos en paralelo sin experimentar congelamientos o lentitud en las tiendas.
    </li>
    <li>
      <strong>Optimización Extrema de Base de Datos (PostgreSQL):</strong> El motor de base de datos podrá asignar 8 a 16 GB exclusivos para caché de datos (<em>shared_buffers</em> y <em>work_mem</em>), lo que permite ejecutar reportes históricos, cruces de inventario y conciliaciones de despacho en milésimas de segundo.
    </li>
    <li>
      <strong>Exclusividad y Aislamiento Corporativo:</strong> Este nuevo servidor será <strong>100% exclusivo para el núcleo logístico OrbitM7</strong>. No compartirá recursos con otros proyectos, eliminando cualquier riesgo de interferencia externa.
    </li>
    <li>
      <strong>Estrategia de Respaldo Redundante (Doble Capa de Seguridad):</strong>
      <ol>
        <li><strong>Capa Externa Automatizada:</strong> Milla 7 ya cuenta con el script programado que extrae e importa volcados de base de datos directamente a <strong>Google Drive dos veces al día</strong> de forma desatendida.</li>
        <li><strong>Capa de Infraestructura:</strong> El nuevo proveedor incluye <strong>3 snapshots completos de la máquina</strong> para recuperación instantánea ante cualquier imprevisto técnico.</li>
      </ol>
    </li>
  </ul>

  <h1>4. Plan de Migración y Continuidad del Servicio (Cero Downtime)</h1>
  <p>
    La Dirección de TI ejecutará la transición bajo un protocolo de migración en caliente sin interrumpir la operación:
  </p>
  <table class="comp-table">
    <thead>
      <tr>
        <th style="width: 15%;">Fase</th>
        <th style="width: 35%;">Actividad Técnica</th>
        <th style="width: 25%;">Impacto Operativo</th>
        <th style="width: 25%;">Tiempo Estimado</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Fase 1</strong></td>
        <td class="left">Aprovisionamiento del VPS, configuración de seguridad (Firewall, Docker, Nginx, SSL).</td>
        <td>Ninguno (Servidor nuevo independiente)</td>
        <td>30 minutos</td>
      </tr>
      <tr>
        <td><strong>Fase 2</strong></td>
        <td class="left">Restauración del último backup de datos y verificación de integridad.</td>
        <td>Ninguno (Operación continúa en DigitalOcean)</td>
        <td>15 minutos</td>
      </tr>
      <tr>
        <td><strong>Fase 3</strong></td>
        <td class="left">Sincronización final y redirección de dominios (<code>m7apps.com</code> / <code>orbitm7.m7apps.com</code>).</td>
        <td>Cero caída (Ventana nocturna de bajo tráfico)</td>
        <td>10 minutos</td>
      </tr>
    </tbody>
  </table>

  <h1>5. Conclusión y Recomendación de TI</h1>
  <p>
    Continuar en la infraestructura actual de DigitalOcean representa un costo ineficiente ($24 USD por solo 2 GB) y expone la operación de Grupo Éxito a riesgos severos de indisponibilidad. La adquisición del nuevo servidor dedicado de <strong>12 vCPUs y 48 GB RAM</strong> es una decisión técnica y económicamente impecable que dota a Milla 7 de una infraestructura de clase mundial lista para respaldar el crecimiento de la empresa.
  </p>

  <table class="signature-table">
    <tr>
      <td>
        <div class="sig-line">
          <strong>Ing. Oscar Santamaría</strong><br>
          Director de Tecnología (TI) & Infraestructura<br>
          Milla 7 Logistics S.A.S.
        </div>
      </td>
      <td>
        <div class="sig-line">
          <strong>Aprobado por: Gerencia General</strong><br>
          Dirección Administrativa y Financiera<br>
          Milla 7 Logistics S.A.S.
        </div>
      </td>
    </tr>
  </table>
</div>

</body>
</html>
'''

with open('PROPUESTA_MIGRACION_VPS_ALTA_CAPACIDAD_MILLA7.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("HTML regenerado con ajuste de márgenes.")
