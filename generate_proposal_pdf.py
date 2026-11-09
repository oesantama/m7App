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
    margin: 8mm 13mm 9mm 13mm;
    @bottom-right {{
      content: "Página " counter(page) " de " counter(pages);
      font-size: 7.5pt;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #64748b;
      font-weight: bold;
    }}
    @bottom-left {{
      content: "Milla 7 Logistics S.A.S. · Documento Confidencial de Decisión Gerencial";
      font-size: 7.5pt;
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
    line-height: 1.32;
    font-size: 8.3pt;
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
    margin-bottom: 6px;
    border: 1.5px solid #0f172a;
  }}

  .header-table td {{
    border: 1px solid #cbd5e1;
    padding: 3.5px 7px;
    vertical-align: middle;
  }}

  .header-table .logo-col {{
    width: 25%;
    text-align: center;
    background: #ffffff;
    border-right: 1.5px solid #0f172a;
  }}

  .header-table .logo-col img {{
    max-height: 36px;
    max-width: 125px;
    object-fit: contain;
  }}

  .header-table .title-col {{
    width: 55%;
    text-align: center;
    font-size: 8.8pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    border-right: 1.5px solid #0f172a;
  }}

  .header-table .meta-col {{
    width: 20%;
    font-size: 7pt;
    color: #334155;
    line-height: 1.3;
    background: #f8fafc;
  }}

  /* Metadatos de la propuesta */
  .meta-grid {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6px;
    background: #f1f5f9;
    border-left: 4px solid #0284c7;
  }}

  .meta-grid td {{
    padding: 3.5px 7px;
    font-size: 7.8pt;
  }}

  .meta-grid td strong {{
    color: #0f2d59;
  }}

  h1 {{
    font-size: 9.8pt;
    font-weight: 800;
    color: #0f2d59;
    border-bottom: 1.5px solid #0284c7;
    padding-bottom: 1.5px;
    margin-top: 6px;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.2px;
  }}

  p {{
    margin-top: 1.5px;
    margin-bottom: 3.5px;
    text-align: justify;
  }}

  ul, ol {{
    margin-top: 1.5px;
    margin-bottom: 3.5px;
    padding-left: 15px;
  }}

  li {{
    margin-bottom: 1.5px;
  }}

  /* Tablas de datos comparativas */
  table.comp-table {{
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 5px 0;
    font-size: 7.7pt;
  }}

  table.comp-table th {{
    background: #0f2d59;
    color: #ffffff;
    font-weight: 700;
    text-align: center;
    padding: 3.5px 4.5px;
    border: 1px solid #0f2d59;
  }}

  table.comp-table td {{
    padding: 3px 4.5px;
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
    padding: 1px 3.5px;
    border-radius: 3px;
    display: inline-block;
    font-size: 6.8pt;
  }}

  .badge-success {{
    background: #dcfce7;
    color: #166534;
    font-weight: 800;
    padding: 1px 4.5px;
    border-radius: 3px;
    display: inline-block;
    font-size: 7pt;
  }}

  .badge-highlight {{
    background: #e0f2fe;
    color: #0369a1;
    font-weight: 800;
    padding: 1px 4.5px;
    border-radius: 3px;
    display: inline-block;
    font-size: 7pt;
  }}

  /* Cajas de Alerta y Resumen */
  .highlight-card {{
    background: #f0fdf4;
    border: 1.5px solid #86efac;
    border-radius: 4px;
    padding: 5px 8px;
    margin: 5px 0 0 0;
  }}

  .highlight-card h3 {{
    margin: 0 0 2px 0;
    color: #15803d;
    font-size: 8.2pt;
    font-weight: 800;
  }}

  .ai-card {{
    background: #faf5ff;
    border: 1.5px solid #d8b4fe;
    border-radius: 4px;
    padding: 5px 8px;
    margin: 4px 0 5px 0;
  }}

  .ai-card h3 {{
    margin: 0 0 2px 0;
    color: #7e22ce;
    font-size: 8.2pt;
    font-weight: 800;
  }}

  .stat-grid {{
    display: flex;
    justify-content: space-between;
    margin: 5px 0;
    gap: 5px;
  }}

  .stat-box {{
    flex: 1;
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 4px;
    padding: 4px 3px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }}

  .stat-box .val {{
    font-size: 11.5pt;
    font-weight: 900;
    color: #0284c7;
    line-height: 1.1;
  }}

  .stat-box .desc {{
    font-size: 6.5pt;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    margin-top: 1px;
  }}

  .callout-box {{
    background: #eff6ff;
    border-left: 3.5px solid #0284c7;
    border-radius: 4px;
    padding: 4px 7px;
    margin: 3px 0 4px 0;
    font-size: 7.6pt;
  }}

  /* Firmas */
  .signature-table {{
    width: 100%;
    margin-top: 10px;
    border-collapse: collapse;
  }}

  .signature-table td {{
    width: 50%;
    padding: 4px 20px;
    text-align: center;
    vertical-align: top;
  }}

  .sig-line {{
    border-top: 1.5px solid #334155;
    margin-top: 30px;
    padding-top: 3px;
    font-size: 7.5pt;
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
        <strong>Versión:</strong> 2.1 (Actualizada)<br>
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
      <td><strong>Asunto:</strong> Aprobación de Adquisición de Servidor Cloud VPS Core 12 para OrbitM7</td>
      <td><strong>Impacto:</strong> Operación Grupo Éxito, IA Local sin Costo de Tokens y Ahorro TI</td>
    </tr>
  </table>

  <h1>1. Resumen Ejecutivo y Necesidad del Negocio</h1>
  <p>
    Con la entrada formal en producción de la <strong>integración B2B con Grupo Éxito (Go Éxito v2.0)</strong>, la plataforma logística <strong>OrbitM7</strong> pasa a gestionar un flujo transaccional continuo de misión crítica: creación desatendida de miles de guías, generación de rótulos térmicos en tiempo real, control de doble pistoleo en tiendas y bodega, enrutamiento inteligente de flota urbana y sincronización de Webhooks 24/7.
  </p>
  <p>
    Actualmente, la plataforma opera en un servidor básico de <strong>DigitalOcean</strong> por el cual se pagan aproximadamente <strong>$25.74 USD mensuales</strong>. Dicho servidor cuenta con solo <strong>2 vCPUs y 4 GB de memoria RAM</strong> con 50 GB de disco y ancho de banda medido, lo que representa un cuello de botella inminente y hace inviable cualquier incorporación de Inteligencia Artificial propia o analítica avanzada.
  </p>
  <p>
    Se propone migrar a un <strong>Cloud VPS dedicado de nivel empresarial (12 vCPUs, 48 GB de RAM, 400 GB SSD, Tráfico Ilimitado, 3 Snapshots y Capacidad de IA Local On-Premise)</strong> por una tarifa equivalente de <strong>$24.00 a $30.00 USD mensuales</strong> ($24.00/mes contratando ciclo de 24 meses). Obtenemos <strong>12 veces más memoria (+1.100%)</strong> y <strong>6 veces más procesamiento (+500%)</strong> por el mismo presupuesto actual.
  </p>

  <div class="stat-grid">
    <div class="stat-box">
      <div class="val">+500%</div>
      <div class="desc">CPU (12 vs 2 vCPUs)</div>
    </div>
    <div class="stat-box">
      <div class="val">+1.100%</div>
      <div class="desc">RAM (48 GB vs 4 GB)</div>
    </div>
    <div class="stat-box">
      <div class="val">+700%</div>
      <div class="desc">Disco (400 vs 50 GB)</div>
    </div>
    <div class="stat-box">
      <div class="val">Ilimitado</div>
      <div class="desc">Tráfico Red (800 Mbit)</div>
    </div>
    <div class="stat-box">
      <div class="val">$0.50 / GB</div>
      <div class="desc">Costo RAM vs $6.43 actual</div>
    </div>
  </div>

  <h1>2. Cuadro Comparativo: Servidor Actual vs. Nuevo Servidor Propuesto</h1>
  <table class="comp-table">
    <thead>
      <tr>
        <th style="width: 25%;">Componente / Recurso</th>
        <th style="width: 27%;">Infraestructura Actual (DigitalOcean)</th>
        <th style="width: 33%;">Nueva Infraestructura Propuesta (Cloud VPS 12)</th>
        <th style="width: 15%;">Ventaja Milla 7</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="left">Capacidad de Procesamiento</td>
        <td>2 vCPUs (Básico compartido)</td>
        <td><strong>12 vCPUs de Alto Rendimiento</strong></td>
        <td><span class="badge-success">6x Potencia</span></td>
      </tr>
      <tr>
        <td class="left">Memoria RAM Operativa</td>
        <td>4 GB RAM (Límite crítico)</td>
        <td><strong>48 GB RAM Dedicada</strong></td>
        <td><span class="badge-success">12x Memoria</span></td>
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
        <td class="left">Transferencia de Datos</td>
        <td>Límite medido (Cobro excedente)</td>
        <td><strong>Tráfico Ilimitado (Política uso justo)</strong></td>
        <td><span class="badge-success">Sin cobros extra</span></td>
      </tr>
      <tr>
        <td class="left">Inteligencia Artificial Local (LLM)</td>
        <td><span class="badge-danger">Inviable (Falta RAM)</span></td>
        <td><strong>Habilitada On-Premise (Llama/Mistral/Qwen)</strong></td>
        <td><span class="badge-success">$0 Costo Tokens</span></td>
      </tr>
      <tr>
        <td class="left">Copias Snapshot del Proveedor</td>
        <td>No incluidas (Costo mensual extra)</td>
        <td><strong>3 Snapshots automáticos incluidos</strong></td>
        <td><span class="badge-success">Incluidos gratis ($0)</span></td>
      </tr>
      <tr>
        <td class="left">Ubicación y Latencia</td>
        <td>San Francisco, EE.UU. (~130 ms)</td>
        <td><strong>St. Louis / Centro EE.UU. (~75 ms)</strong></td>
        <td><span class="badge-highlight">40% menor latencia</span></td>
      </tr>
      <tr>
        <td class="left">Costo Mensual Estimado</td>
        <td><strong>~$25.74 USD / mes</strong></td>
        <td><strong>$24.00 a $30.00 USD / mes</strong></td>
        <td><span class="badge-success">Mismo Precio</span></td>
      </tr>
    </tbody>
  </table>

  <div class="highlight-card">
    <h3>Análisis Financiero: Costo Unitario por Gigabyte de Memoria</h3>
    <p style="margin: 0; font-size: 7.7pt;">
      En el servidor actual pagamos <strong>$6.43 USD mensuales por cada GB de RAM</strong> ($25.74 / 4 GB). Con el nuevo servidor, el costo unitario se reduce a únicamente <strong>$0.50 USD por cada GB de RAM</strong> ($24.00 / 48 GB). Es decir, obtenemos <strong>12 veces más memoria por el 92% menos de costo unitario</strong>, garantizando capacidad para alojar el sistema transaccional y la IA corporativa sin elevar el presupuesto financiero.
    </p>
  </div>
</div>

<!-- ========================================== -->
<!-- PÁGINA 2: BENEFICIOS, IA LOCAL Y FIRMAS    -->
<!-- ========================================== -->
<div class="page">
  <table class="header-table">
    <tr>
      <td class="logo-col"><img src="data:image/png;base64,{logo_base64}" alt="Milla 7"></td>
      <td class="title-col">PROPUESTA TÉCNICO-FINANCIERA: MODERNIZACIÓN DE INFRAESTRUCTURA CLOUD</td>
      <td class="meta-col">
        <strong>Código:</strong> IT-PROP-2026-02<br>
        <strong>Versión:</strong> 2.1 (Actualizada)<br>
        <strong>Fecha:</strong> 09/Nov/2026
      </td>
    </tr>
  </table>

  <h1>3. Justificación Técnica: Potencia y Soporte Operativo</h1>
  <ul>
    <li>
      <strong>Generación Concurrente de Rótulos Grupo Éxito:</strong> El renderizado térmico en formato PDF vectorial corre en la memoria RAM del servidor. Pasar a 48 GB garantiza que decenas de despachadores, auxiliares y conductores operen al mismo tiempo sin lentitud.
    </li>
    <li>
      <strong>Tráfico Ilimitado y Puerto de 800 Mbit/s:</strong> La transferencia ilimitada blinda la empresa ante cualquier sobrecosto por consumo de datos en descargas masivas de guías, sincronización continua de Webhooks o tráfico de la aplicación web y móvil.
    </li>
    <li>
      <strong>Optimización de Base de Datos (PostgreSQL):</strong> Se podrán destinar 8 a 16 GB de RAM para caché ultrarrápida (<em>shared_buffers</em>), ejecutando reportes históricos, cruces de inventario y liquidaciones de remisiones en milisegundos.
    </li>
    <li>
      <strong>Exclusividad y Aislamiento Corporativo:</strong> El servidor será <strong>100% exclusivo para el ecosistema OrbitM7</strong>, garantizando total seguridad y confidencialidad.
    </li>
  </ul>

  <h1>4. Innovación Estratégica: IA Local On-Premise sin Límites ni Cobro de Tokens</h1>
  <div class="ai-card">
    <h3>Ventaja Competitiva: Inteligencia Artificial Soberana dentro del Servidor Propio</h3>
    <p style="margin: 0; font-size: 7.6pt;">
      Con 48 GB de RAM y 12 vCPUs, OrbitM7 y PostgreSQL consumen entre 10 y 12 GB, dejando <strong>más de 30 GB de memoria libre</strong>. Esto permite desplegar un motor de IA local (LLM como Llama 3.1 8B, Mistral 7B o Qwen 2.5) directamente en el servidor sin depender de servicios externos.
    </p>
  </div>
  <ul>
    <li>
      <strong>Cero Costos Recurrentes por Consumo de Tokens:</strong> No se pagan tarifas por consulta ni suscripciones a APIs de terceros (OpenAI, Anthropic). Consultas ilimitadas para todo el equipo sin temor a bloqueos por saldo o cuotas mensuales.
    </li>
    <li>
      <strong>100% Privacidad y Protección de Datos (Habeas Data - Ley 1581):</strong> La información sensible de clientes, pedidos de Grupo Éxito, nombres de destinatarios y datos de conductores jamás sale del servidor de Milla 7 hacia servidores externos en la nube.
    </li>
    <li>
      <strong>Usos Operativos Inmediatos en OrbitM7:</strong>
      <ol>
        <li><em>Asistente Inteligente en Chat:</em> Soporte interactivo 24/7 en la aplicación para responder dudas a operarios y conductores sobre rutas, políticas y guías.</li>
        <li><em>Normalización y Validación de Direcciones:</em> Corrección automática de direcciones mal digitadas antes de salir a reparto.</li>
        <li><em>Clasificación Automática de Novedades:</em> Categorización semántica de motivos de no entrega y generación de reportes ejecutivos.</li>
      </ol>
    </li>
  </ul>

  <h1>5. Seguridad con Snapshots y Plan de Migración en Caliente</h1>
  <div class="callout-box">
    <strong>¿Qué es un Snapshot?</strong> Es una «fotografía congelada» de todo el servidor (sistema operativo, base de datos y archivos). Si ocurre un error crítico, permite restaurar la máquina entera a su estado previo en <strong>menos de 2 minutos</strong> (frente a 4 horas de un backup tradicional). Se complementa con el script de Milla 7 que respalda la base de datos a Google Drive 2 veces al día.
  </div>
  <table class="comp-table">
    <thead>
      <tr>
        <th style="width: 14%;">Fase</th>
        <th style="width: 38%;">Actividad Técnica</th>
        <th style="width: 26%;">Impacto Operativo</th>
        <th style="width: 22%;">Tiempo Estimado</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Fase 1</strong></td>
        <td class="left">Aprovisionamiento VPS, hardening de seguridad (Firewall, SSL, Docker).</td>
        <td>Ninguno (Servidor independiente)</td>
        <td>30 minutos</td>
      </tr>
      <tr>
        <td><strong>Fase 2</strong></td>
        <td class="left">Restauración y homologación de backup completo de base de datos.</td>
        <td>Ninguno (Producción activa en DO)</td>
        <td>15 minutos</td>
      </tr>
      <tr>
        <td><strong>Fase 3</strong></td>
        <td class="left">Sincronización final delta y redirección de dominios DNS corporativos.</td>
        <td>Cero caída (Transición transparente)</td>
        <td>10 minutos</td>
      </tr>
    </tbody>
  </table>

  <p style="margin-top: 4px; font-size: 7.7pt;">
    <strong>Recomendación Final:</strong> Por la misma inversión mensual (~$24-$30 USD), pasamos de 4 GB a 48 GB de RAM, habilitamos IA local sin cobro de tokens, blindamos la operación de Grupo Éxito y obtenemos respaldo con Snapshots. Se solicita aprobación inmediata para proceder con la orden.
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

print("HTML actualizado con IA Local On-Premise, Tráfico Ilimitado y Snapshots.")
