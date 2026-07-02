/**
 * hv-alertas.service.ts
 * Cron job que revisa vencimientos de documentos de Hojas de Vida y envía alertas.
 * Se ejecuta cada día a las 7:00 AM.
 */

import cron from 'node-cron';
import pool from '../config/database.js';
import * as nodemailer from 'nodemailer';

const ALERTAS_ENABLED = process.env.HV_ALERTAS_EMAIL_ENABLED !== 'false';
const ALERT_INTERVALS = [90, 30, 15, 7]; // días antes del vencimiento

interface DocumentoAlerta {
    id: number;
    solicitud_id: string;
    nombre_doc: string;
    nombre_entidad: string;
    tipo_entidad: string;
    tipo_tercero: string;
    fecha_vencimiento: Date;
    dias_restantes: number;
    dias_alerta_config: number[];
    email_contacto: string | null;
}

function getTransporter() {
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    return nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
}

async function obtenerDocumentosProximosAVencer(): Promise<DocumentoAlerta[]> {
    const { rows } = await pool.query(`
        SELECT
            d.id,
            d.solicitud_id,
            d.nombre_doc,
            d.fecha_vencimiento,
            (d.fecha_vencimiento - CURRENT_DATE) AS dias_restantes,
            s.nombre_entidad,
            s.tipo_entidad,
            s.datos_json,
            t.nombre AS tipo_tercero,
            r.dias_alerta_1, r.dias_alerta_2, r.dias_alerta_3, r.dias_alerta_4
        FROM hv_documentos d
        JOIN hv_solicitudes s ON s.id = d.solicitud_id
        LEFT JOIN hv_tipos_tercero t ON t.id = s.tipo_tercero_id
        LEFT JOIN hv_tipos_documento_req r ON r.id = d.tipo_doc_req_id
        WHERE d.fecha_vencimiento IS NOT NULL
          AND d.estado = 'aprobado'
          AND d.fecha_vencimiento >= CURRENT_DATE
          AND d.fecha_vencimiento <= CURRENT_DATE + 90
        ORDER BY d.fecha_vencimiento ASC
    `);

    return rows.map((row: any) => ({
        id: row.id,
        solicitud_id: row.solicitud_id,
        nombre_doc: row.nombre_doc,
        nombre_entidad: row.nombre_entidad,
        tipo_entidad: row.tipo_entidad,
        tipo_tercero: row.tipo_tercero || 'N/A',
        fecha_vencimiento: row.fecha_vencimiento,
        dias_restantes: Number(row.dias_restantes),
        dias_alerta_config: [
            row.dias_alerta_1 || 90,
            row.dias_alerta_2 || 30,
            row.dias_alerta_3 || 15,
            row.dias_alerta_4 || 7,
        ],
        email_contacto: row.datos_json?.email || null,
    }));
}

async function yaSeEnvioAlertaHoy(documentoId: number, diasRestantes: number): Promise<boolean> {
    const { rows } = await pool.query(
        `SELECT 1 FROM hv_alertas_vencimiento
         WHERE documento_id=$1 AND dias_restantes=$2
           AND notificado_at::date = CURRENT_DATE`,
        [documentoId, diasRestantes]
    );
    return rows.length > 0;
}

async function registrarAlertaEnviada(documentoId: number, diasRestantes: number, metodo: string) {
    await pool.query(
        `INSERT INTO hv_alertas_vencimiento
         (documento_id, tipo_alerta, dias_restantes, notificado_at, canal)
         VALUES ($1, 'vencimiento', $2, NOW(), $3)`,
        [documentoId, diasRestantes, metodo]
    ).catch(() => {});
}

async function enviarEmailAlerta(doc: DocumentoAlerta, diasRestantes: number) {
    const transporter = getTransporter();
    const destinos = [process.env.HV_ALERTAS_EMAIL_TO || 'directorti@millasiete.com'];
    if (doc.email_contacto) destinos.push(doc.email_contacto);

    const nivel = diasRestantes <= 7 ? '🔴 URGENTE' : diasRestantes <= 15 ? '🟠 IMPORTANTE' : '🟡 AVISO';
    const fechaStr = new Date(doc.fecha_vencimiento).toLocaleDateString('es-CO');

    const asunto = `${nivel} — Documento por vencer en ${diasRestantes} días: ${doc.nombre_doc}`;
    const cuerpo = `
<div style="font-family:Arial,sans-serif;max-width:600px">
  <h2 style="color:#c0392b">${nivel} — Documento próximo a vencer</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Entidad</td>
        <td style="padding:8px">${doc.nombre_entidad}</td></tr>
    <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Tipo</td>
        <td style="padding:8px">${doc.tipo_entidad === 'vehiculo' ? 'Vehículo' : doc.tipo_tercero}</td></tr>
    <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Documento</td>
        <td style="padding:8px">${doc.nombre_doc}</td></tr>
    <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Vencimiento</td>
        <td style="padding:8px;color:#c0392b;font-weight:bold">${fechaStr} (${diasRestantes} días)</td></tr>
  </table>
  <p style="margin-top:16px;color:#666">
    Por favor gestione la renovación con anticipación.<br>
    Sistema OrbitM7 — Milla 7 S.A.S.
  </p>
</div>`;

    if (!transporter) {
        console.log(`[HV-ALERTAS] Sin SMTP — alerta consola: ${doc.nombre_entidad} / ${doc.nombre_doc} vence en ${diasRestantes}d`);
        return;
    }

    await transporter.sendMail({
        from: `"OrbitM7 Alertas" <${process.env.SMTP_USER}>`,
        to: destinos.join(','),
        subject: asunto,
        html: cuerpo,
    });
}

async function procesarAlertas() {
    console.log('[HV-ALERTAS] Verificando vencimientos...');
    try {
        const documentos = await obtenerDocumentosProximosAVencer();
        let enviadas = 0;

        for (const doc of documentos) {
            const diasRestantes = doc.dias_restantes;

            // ¿Este día activa alguna alerta según configuración?
            const activar = doc.dias_alerta_config.some(d => d === diasRestantes);
            if (!activar) continue;

            const yaEnviada = await yaSeEnvioAlertaHoy(doc.id, diasRestantes);
            if (yaEnviada) continue;

            try {
                await enviarEmailAlerta(doc, diasRestantes);
                await registrarAlertaEnviada(doc.id, diasRestantes, 'email');
                enviadas++;
            } catch (e: any) {
                console.error(`[HV-ALERTAS] Error enviando alerta doc ${doc.id}:`, e.message);
            }
        }

        // Registrar documentos VENCIDOS
        const { rows: vencidos } = await pool.query(`
            SELECT d.id, s.nombre_entidad, d.nombre_doc
            FROM hv_documentos d
            JOIN hv_solicitudes s ON s.id=d.solicitud_id
            WHERE d.fecha_vencimiento < CURRENT_DATE AND d.estado='aprobado'
        `);
        for (const v of vencidos) {
            await pool.query(
                `UPDATE hv_documentos SET estado='vencido' WHERE id=$1`, [v.id]
            ).catch(() => {});
        }

        console.log(`[HV-ALERTAS] ✓ ${enviadas} alertas enviadas | ${vencidos.length} documentos marcados como vencidos`);
    } catch (e: any) {
        console.error('[HV-ALERTAS] Error en procesamiento:', e.message);
    }
}

export function startAlertasCron() {
    if (!ALERTAS_ENABLED) {
        console.log('[HV-ALERTAS] Alertas email deshabilitadas (HV_ALERTAS_EMAIL_ENABLED=false)');
        return;
    }

    // Verificar vencimientos todos los días a las 7:00 AM
    cron.schedule('0 7 * * *', procesarAlertas, { timezone: 'America/Bogota' });

    // Marcar vencidos también cada hora (sin emails)
    cron.schedule('0 * * * *', async () => {
        try {
            const { rowCount } = await pool.query(`
                UPDATE hv_documentos SET estado='vencido'
                WHERE fecha_vencimiento < CURRENT_DATE AND estado='aprobado'
            `);
            if ((rowCount ?? 0) > 0) {
                console.log(`[HV-ALERTAS] ${rowCount} documentos marcados como vencidos`);
            }
        } catch { /* ignorar */ }
    });

    console.log('[HV-ALERTAS] Cron iniciado — alertas a las 7:00 AM COT, verificación cada hora');
}
