/**
 * exito-email.service.ts
 * Servicio de Notificaciones por Correo Electrónico para la Operación Go Éxito v2.0
 * Eventos clave:
 *  1. Recogida en Tienda / Nodo Éxito completada por Conductor (RECOGIDA_TIENDA / Id guía = 2)
 *  2. Recepción y Verificación en Bodega Milla 7 para Enrutamiento (EN_ALMACEN / EST-33)
 */

import pool from '../config/database.js';
import { sendEmail } from './notification.service.js';
import { nowColombiaDateTimeStr } from '../utils/date.util.js';

// URL base de los enlaces en los correos a Éxito. Antes caía por defecto al servidor viejo de
// sandbox (dominio retirado) incluso en producción si faltaba APP_URL.
const exitoAppBaseUrl = () =>
  process.env.APP_URL ||
  process.env.PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' && String(process.env.APP_ENV || '').toUpperCase() !== 'DEVELOP'
    ? 'https://orbitm7.m7apps.com'
    : 'https://devsm7.m7apps.com');

export interface ExitoEmailConfig {
  recogidaTienda: string[];
  recepcionAlmacen: string[];
  habilitado: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const parts = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_REGEX.test(e));
  return Array.from(new Set(parts));
}

export class ExitoEmailService {
  /**
   * Obtiene la lista de correos destinatarios configurados para un evento operativo
   */
  static async getNotificationEmails(
    tipo: 'RECOGIDA_TIENDA' | 'RECEPCION_ALMACEN',
    nodoId?: number
  ): Promise<{ emails: string[]; enabled: boolean; nodoEmail?: string | null }> {
    try {
      const configRes = await pool.query(
        `SELECT clave, valor FROM exito_msj_configuracion
         WHERE clave IN (
           'NOTIFICACIONES_CORREOS_HABILITADO',
           'NOTIFICACIONES_CORREOS_RECOGIDA_TIENDA',
           'NOTIFICACIONES_CORREOS_RECEPCION_ALMACEN',
           'NOTIFICACIONES_CORREOS_GENERAL'
         )`
      );

      const map = new Map<string, string>();
      for (const row of configRes.rows) {
        map.set(row.clave, row.valor);
      }

      const enabled = map.get('NOTIFICACIONES_CORREOS_HABILITADO') !== 'false';

      const key =
        tipo === 'RECOGIDA_TIENDA'
          ? 'NOTIFICACIONES_CORREOS_RECOGIDA_TIENDA'
          : 'NOTIFICACIONES_CORREOS_RECEPCION_ALMACEN';

      const specificList = parseEmailList(map.get(key));
      const generalList = parseEmailList(map.get('NOTIFICACIONES_CORREOS_GENERAL'));

      const combined = new Set<string>([...specificList, ...generalList]);

      let nodoEmail: string | null = null;
      if (nodoId) {
        const nodoRes = await pool.query(
          `SELECT contacto_email FROM exito_msj_nodos WHERE id = $1 LIMIT 1`,
          [nodoId]
        );
        nodoEmail = nodoRes.rows[0]?.contacto_email?.trim() || null;
        if (nodoEmail && EMAIL_REGEX.test(nodoEmail)) {
          combined.add(nodoEmail.toLowerCase());
        }
      }

      return {
        emails: Array.from(combined),
        enabled,
        nodoEmail,
      };
    } catch (err: any) {
      console.error('[EXITO-EMAIL] Error consultando correos:', err.message);
      return { emails: [], enabled: true };
    }
  }

  /**
   * Consulta toda la configuración de correos de notificación para mostrar en la interfaz
   */
  static async getConfig(): Promise<ExitoEmailConfig> {
    const configRes = await pool.query(
      `SELECT clave, valor, updated_at, updated_by FROM exito_msj_configuracion
       WHERE clave IN (
         'NOTIFICACIONES_CORREOS_HABILITADO',
         'NOTIFICACIONES_CORREOS_RECOGIDA_TIENDA',
         'NOTIFICACIONES_CORREOS_RECEPCION_ALMACEN'
       )`
    );

    const map = new Map<string, { valor: string; updated_at?: string; updated_by?: string }>();
    for (const row of configRes.rows) {
      map.set(row.clave, row);
    }

    const habilitado = map.get('NOTIFICACIONES_CORREOS_HABILITADO')?.valor !== 'false';
    const recogidaTienda = parseEmailList(map.get('NOTIFICACIONES_CORREOS_RECOGIDA_TIENDA')?.valor);
    const recepcionAlmacen = parseEmailList(map.get('NOTIFICACIONES_CORREOS_RECEPCION_ALMACEN')?.valor);

    const lastUpdatedRow = configRes.rows.sort((a, b) => {
      const da = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const db = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return db - da;
    })[0];

    return {
      recogidaTienda,
      recepcionAlmacen,
      habilitado,
      updatedAt: lastUpdatedRow?.updated_at || undefined,
      updatedBy: lastUpdatedRow?.updated_by || undefined,
    };
  }

  /**
   * Guarda o actualiza la configuración de correos en la base de datos
   */
  static async saveConfig(
    data: {
      recogidaTienda?: string | string[];
      recepcionAlmacen?: string | string[];
      habilitado?: boolean;
    },
    user: string = 'SISTEMA'
  ): Promise<ExitoEmailConfig> {
    const recogidaStr = Array.isArray(data.recogidaTienda)
      ? data.recogidaTienda.join(', ')
      : String(data.recogidaTienda || '');

    const recepcionStr = Array.isArray(data.recepcionAlmacen)
      ? data.recepcionAlmacen.join(', ')
      : String(data.recepcionAlmacen || '');

    const habStr = data.habilitado === false ? 'false' : 'true';

    await pool.query(
      `INSERT INTO exito_msj_configuracion (clave, valor, descripcion, updated_by, updated_at)
       VALUES
         ('NOTIFICACIONES_CORREOS_HABILITADO', $1, 'Habilita o desactiva alertas por correo de la Operación Éxito', $4, NOW()),
         ('NOTIFICACIONES_CORREOS_RECOGIDA_TIENDA', $2, 'Correos destino al completar recogida en Tienda Éxito', $4, NOW()),
         ('NOTIFICACIONES_CORREOS_RECEPCION_ALMACEN', $3, 'Correos destino al recibir paquetes en Bodega Milla 7', $4, NOW())
       ON CONFLICT (clave) DO UPDATE SET
         valor = EXCLUDED.valor,
         descripcion = EXCLUDED.descripcion,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [habStr, recogidaStr, recepcionStr, user]
    );

    return this.getConfig();
  }

  /**
   * Envía la notificación formal por correo de Recogida en Tienda Éxito completada
   */
  static async notifyPickupCompleted(params: {
    codigoRecogida: string;
    nodoNombre: string;
    codigoDependencia?: string;
    placa: string;
    conductorNombre: string;
    conductorCedula?: string;
    totalGuias: number;
    totalCajas: number;
    guias: Array<{
      numero_guia: string;
      numero_pedido: string;
      nombre_destinatario: string;
      barrio_destinatario?: string;
      ciudad_destinatario_nombre?: string;
      cant_cajas?: number;
      peso_kg?: number;
    }>;
    remisionUrl?: string;
    fotoDriveUrl?: string;
    nodoId?: number;
  }): Promise<{ sent: boolean; emails: string[]; warning?: string }> {
    const { emails, enabled } = await this.getNotificationEmails('RECOGIDA_TIENDA', params.nodoId);

    if (!enabled) {
      return { sent: false, emails: [], warning: 'NOTIFICATIONS_DISABLED' };
    }

    if (emails.length === 0) {
      return { sent: false, emails: [], warning: 'NO_EMAILS_CONFIGURED' };
    }

    const fechaCol = nowColombiaDateTimeStr();
    const appBaseUrl = exitoAppBaseUrl();
    const remisionLink = params.remisionUrl
      ? params.remisionUrl.startsWith('http')
        ? params.remisionUrl
        : `${appBaseUrl}${params.remisionUrl}`
      : `${appBaseUrl}/api/exito-mensajeria/planillas/${encodeURIComponent(params.codigoRecogida)}/pdf`;

    const guiasTableRows = params.guias
      .slice(0, 50)
      .map(
        (g, i) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px;">
          <td style="padding: 8px 10px; font-weight: bold; color: #1e293b;">${i + 1}</td>
          <td style="padding: 8px 10px; font-weight: 700; color: #7c3aed;">${g.numero_guia}</td>
          <td style="padding: 8px 10px; color: #475569;">${g.numero_pedido}</td>
          <td style="padding: 8px 10px; color: #0f172a;">${g.nombre_destinatario}</td>
          <td style="padding: 8px 10px; color: #4338ca;">${g.barrio_destinatario || 'URBANO'} (${g.ciudad_destinatario_nombre || 'LOCAL'})</td>
          <td style="padding: 8px 10px; text-align: center; font-weight: bold;">${g.cant_cajas || 1} cj</td>
          <td style="padding: 8px 10px; text-align: right; color: #334155;">${Number(g.peso_kg || 1).toFixed(2)} kg</td>
        </tr>`
      )
      .join('');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <!-- ENCABEZADO -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 24px 28px; color: #ffffff;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #c084fc; text-transform: uppercase; background: rgba(192, 132, 252, 0.15); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(192, 132, 252, 0.3);">
              OPERACIÓN ÉXITO · RECOGIDA EN TIENDA
            </span>
            <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">
              ${fechaCol} (Hora COL)
            </span>
          </div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">
            📦 Recogida Completada en Tienda Éxito
          </h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #cbd5e1;">
            Los paquetes fueron recibidos en el nodo del Éxito por Milla 7 Logistics y van en tránsito hacia la bodega urbana.
          </p>
        </div>

        <!-- TARJETA DE RESUMEN OPERATIVO -->
        <div style="padding: 24px 28px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 40%;">Remisión de Recogida:</td>
              <td style="padding: 6px 0; font-size: 14px; font-weight: 800; color: #0f172a;">${params.codigoRecogida}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Nodo / Tienda Éxito:</td>
              <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${params.nodoNombre} ${params.codigoDependencia ? `(Nodo ${params.codigoDependencia})` : ''}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Vehículo / Placa Asignada:</td>
              <td style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #b45309;">
                <span style="background-color: #fef3c7; color: #78350f; padding: 2px 8px; border-radius: 6px; border: 1px solid #fde68a;">
                  🚚 ${params.placa}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Conductor Responsable:</td>
              <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #0f172a;">${params.conductorNombre} ${params.conductorCedula ? `(CC ${params.conductorCedula})` : ''}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Volumen Recogido:</td>
              <td style="padding: 6px 0; font-size: 14px; font-weight: 800; color: #6b21a8;">
                ${params.totalGuias} guía(s) · ${params.totalCajas} caja(s)/bulto(s)
              </td>
            </tr>
          </table>

          <div style="margin-top: 18px; text-align: center;">
            <a href="${remisionLink}" target="_blank" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 13px; padding: 12px 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3);">
              📄 Ver / Descargar Remisión Digital PDF (REC-EX)
            </a>
          </div>
        </div>

        <!-- LISTADO DE GUÍAS -->
        <div style="padding: 24px 28px;">
          <h2 style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #334155; margin: 0 0 12px 0;">
            Detalle de Guías Recogidas (${params.totalGuias}):
          </h2>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background-color: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 8px 10px;">#</th>
                  <th style="padding: 8px 10px;">Guía</th>
                  <th style="padding: 8px 10px;">Pedido</th>
                  <th style="padding: 8px 10px;">Destinatario</th>
                  <th style="padding: 8px 10px;">Destino</th>
                  <th style="padding: 8px 10px; text-align: center;">Cajas</th>
                  <th style="padding: 8px 10px; text-align: right;">Peso</th>
                </tr>
              </thead>
              <tbody>
                ${guiasTableRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- PIE DE PÁGINA -->
        <div style="background-color: #f8fafc; padding: 16px 28px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          Mensaje automático generado por <strong>OrbitM7 · Milla 7 Logistics</strong> · Integración Go Éxito v2.0.<br/>
          Por favor no responda a este correo electrónico.
        </div>
      </div>
    `;

    try {
      await sendEmail(
        emails,
        `📦 Recogida Éxito: ${params.nodoNombre} (${params.totalGuias} guías / ${params.totalCajas} cjs) — ${params.codigoRecogida}`,
        html
      );
      return { sent: true, emails };
    } catch (err: any) {
      console.error('[EXITO-EMAIL] Error enviando correo de recogida:', err.message);
      return { sent: false, emails, warning: err.message };
    }
  }

  /**
   * Envía la notificación formal por correo de Recepción y Verificación en Bodega Milla 7 para Enrutamiento
   */
  static async notifyWarehouseReception(params: {
    responsableBodega: string;
    totalGuias: number;
    totalCajas: number;
    observaciones?: string;
    recogidaId?: number;
    codigoRecogida?: string;
    placa?: string;
    nodoNombre?: string;
    guias: Array<{
      numero_guia: string;
      numero_pedido: string;
      nombre_destinatario: string;
      barrio_destinatario?: string;
      ciudad_destinatario_nombre?: string;
      cant_cajas?: number;
      peso_kg?: number;
    }>;
  }): Promise<{ sent: boolean; emails: string[]; warning?: string }> {
    const { emails, enabled } = await this.getNotificationEmails('RECEPCION_ALMACEN');

    if (!enabled) {
      return { sent: false, emails: [], warning: 'NOTIFICATIONS_DISABLED' };
    }

    if (emails.length === 0) {
      return { sent: false, emails: [], warning: 'NO_EMAILS_CONFIGURED' };
    }

    const fechaCol = nowColombiaDateTimeStr();
    const appBaseUrl = exitoAppBaseUrl();

    const guiasTableRows = params.guias
      .slice(0, 50)
      .map(
        (g, i) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px;">
          <td style="padding: 8px 10px; font-weight: bold; color: #1e293b;">${i + 1}</td>
          <td style="padding: 8px 10px; font-weight: 700; color: #059669;">${g.numero_guia}</td>
          <td style="padding: 8px 10px; color: #475569;">${g.numero_pedido}</td>
          <td style="padding: 8px 10px; color: #0f172a;">${g.nombre_destinatario}</td>
          <td style="padding: 8px 10px; color: #1d4ed8;">${g.barrio_destinatario || 'URBANO'}</td>
          <td style="padding: 8px 10px; text-align: center; font-weight: bold;">${g.cant_cajas || 1} cj</td>
          <td style="padding: 8px 10px; text-align: right; color: #334155;">${Number(g.peso_kg || 1).toFixed(2)} kg</td>
        </tr>`
      )
      .join('');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <!-- ENCABEZADO -->
        <div style="background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%); padding: 24px 28px; color: #ffffff;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #6ee7b7; text-transform: uppercase; background: rgba(110, 231, 183, 0.15); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(110, 231, 183, 0.3);">
              BODEGA MILLA 7 · EN ALMACÉN (EST-33)
            </span>
            <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">
              ${fechaCol} (Hora COL)
            </span>
          </div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">
            🏢 Recepción en Almacén M7 para Enrutamiento
          </h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #cbd5e1;">
            Los paquetes fueron recibidos y verificados con lector láser en la bodega principal de Milla 7. Han quedado habilitados para la asignación y despacho de rutas de reparto.
          </p>
        </div>

        <!-- RESUMEN OPERATIVO -->
        <div style="padding: 24px 28px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 40%;">Responsable de Bodega:</td>
              <td style="padding: 6px 0; font-size: 14px; font-weight: 800; color: #0f172a;">${params.responsableBodega}</td>
            </tr>
            ${params.codigoRecogida ? `
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Remisión / Acta de Recogida:</td>
              <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${params.codigoRecogida}</td>
            </tr>` : ''}
            ${params.placa ? `
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Vehículo / Placa de Entrega:</td>
              <td style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #b45309;">
                <span style="background-color: #fef3c7; color: #78350f; padding: 2px 8px; border-radius: 6px; border: 1px solid #fde68a;">
                  🚚 ${params.placa}
                </span>
              </td>
            </tr>` : ''}
            ${params.nodoNombre ? `
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Nodo de Origen Éxito:</td>
              <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${params.nodoNombre}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Total Paquetes Ingresados:</td>
              <td style="padding: 6px 0; font-size: 14px; font-weight: 800; color: #059669;">
                ${params.totalGuias} guía(s) · ${params.totalCajas} caja(s)/bulto(s)
              </td>
            </tr>
            ${params.observaciones ? `
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Observaciones:</td>
              <td style="padding: 6px 0; font-size: 13px; color: #334155;">${params.observaciones}</td>
            </tr>` : ''}
          </table>

          <div style="margin-top: 18px; text-align: center;">
            <a href="${appBaseUrl}/exito-mensajeria-despacho" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 13px; padding: 12px 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.3);">
              🚀 Ir a Despacho Inteligente de Rutas Urbanas
            </a>
          </div>
        </div>

        <!-- LISTADO DE GUÍAS -->
        <div style="padding: 24px 28px;">
          <h2 style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #334155; margin: 0 0 12px 0;">
            Guías Verificadas e Ingresadas a Bodega (${params.totalGuias}):
          </h2>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background-color: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 8px 10px;">#</th>
                  <th style="padding: 8px 10px;">Guía</th>
                  <th style="padding: 8px 10px;">Pedido</th>
                  <th style="padding: 8px 10px;">Destinatario</th>
                  <th style="padding: 8px 10px;">Barrio</th>
                  <th style="padding: 8px 10px; text-align: center;">Cajas</th>
                  <th style="padding: 8px 10px; text-align: right;">Peso</th>
                </tr>
              </thead>
              <tbody>
                ${guiasTableRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- PIE DE PÁGINA -->
        <div style="background-color: #f8fafc; padding: 16px 28px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          Mensaje automático generado por <strong>OrbitM7 · Milla 7 Logistics</strong> · Operación Almacén.<br/>
          Por favor no responda a este correo electrónico.
        </div>
      </div>
    `;

    try {
      await sendEmail(
        emails,
        `🏢 Ingreso a Almacén M7 (${params.totalGuias} guías / ${params.totalCajas} cjs) — Listas para Enrutamiento`,
        html
      );
      return { sent: true, emails };
    } catch (err: any) {
      console.error('[EXITO-EMAIL] Error enviando correo de recepción:', err.message);
      return { sent: false, emails, warning: err.message };
    }
  }
}

