
import { Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import pool from '../config/database.js';
import { sendEmail } from '../services/notification.service.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logMovement } from '../utils/kardex.js';

// ─── Caché en memoria para getInvoices ───────────────────────────────────────
// TTL de 45 segundos: reduce carga en Postgres en refrescos frecuentes
const invoicesCache = new Map<string, { data: any[]; ts: number }>();
const INVOICES_CACHE_TTL_MS = 45_000;

export function clearInvoicesCache() {
    invoicesCache.clear();
}

function getCacheKey(query: Record<string, any>): string {
  // Incluye solo los params que afectan el resultado
  return JSON.stringify({ clientId: query.clientId, history: query.history, routeId: query.routeId });
}
// ─────────────────────────────────────────────────────────────────────────────

export const getDocuments = async (req: Request, res: Response) => {
  try {
    let query = `
      SELECT d.*, 
      plan_type as "planType",
      inventory_notes as "inventoryNotes",
      external_doc_id as "externalDocId",
      vehicle_plate as "vehicleData",
      inventory_user as "inventoryUser",
      inventory_date as "inventoryDate",
      picking_date as "pickingDate",
      receiving_date as "receivingDate",
      picker_user as "pickerUser",
      deliverer_user as "delivererUser",
      receiver_user as "receiverUser",
      d.created_at as "createdAt",
      (SELECT COUNT(*) FROM document_l_payments p WHERE p.document_id = d.id) as "paymentsCount",
      (SELECT json_agg(item_with_payment) FROM (
        SELECT i.*,
               i.article_id      as "articleId",
               i.order_number    as "orderNumber",
               i.item_status     as "itemStatus",
               e_i.name          as "itemStatusName",
               i.expected_qty    as "expectedQty",
               i.received_qty    as "receivedQty",
               i.un_code         as "unCode",
               i.client_ref      as "clientRef",
               p.metodo_pago     as "paymentMethod",
               p.vmetodo         as "paymentValue",
               p.client_ref      as "paymentRef",
               c.count_1         as "count1",
               c.count_2         as "count2",
               c.inventory_observation as "inventoryNote",
               a.factor_inter    as "factorInter",
               a.factor_std      as "factorStd",
               u_i.name          as "uomInterName",
               u_s.name          as "uomStdName"
        FROM document_items i
        LEFT JOIN estados e_i ON e_i.id = i.item_status
        LEFT JOIN document_l_payments p ON i.document_id = p.document_id AND TRIM(UPPER(i.invoice)) = TRIM(UPPER(p.invoice))
        LEFT JOIN document_consolidated_items c ON i.document_id = c.document_id AND TRIM(UPPER(i.article_id)) = TRIM(UPPER(c.article_id))
        LEFT JOIN articles a ON TRIM(UPPER(a.id)) = TRIM(UPPER(i.article_id))
        LEFT JOIN unidades_medida u_i ON u_i.id = a.uom_inter_id
        LEFT JOIN unidades_medida u_s ON u_s.id = a.uom_std
        WHERE i.document_id = d.id
      ) item_with_payment) as items,
      (SELECT COUNT(*) FROM inventory_news n WHERE n.document_id = d.id AND n.created_at >= NOW() - INTERVAL '30 hours') as "newsCount",
      (SELECT json_agg(item_mapped) FROM (
        SELECT article_id as "articleId", expected_qty as "expectedQty", count_1 as "count1", count_2 as "count2", 
               picked_qty as "pickedQty", dispatched_qty as "dispatchedQty", inventory_observation as "inventoryObservation"
        FROM document_consolidated_items WHERE document_id = d.id
      ) item_mapped) as "consolidatedItems"
      FROM documents_l d
      WHERE d.status NOT IN ('EST-16', 'ELIMINADO')
    `;

    const queryParams: any[] = [];
    const { clientId, docL, statuses } = req.query;
    const user = (req as any).user;
    const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';

    if (clientId) {
      queryParams.push(clientId);
      query += ` AND d.client_id = $${queryParams.length}`;
    }

    if (statuses) {
      const statusList = String(statuses).split(',').map(s => s.trim()).filter(Boolean);
      if (statusList.length > 0) {
        queryParams.push(statusList);
        query += ` AND d.status = ANY($${queryParams.length}::text[])`;
      }
    }

    if (docL) {
        const docIds = String(docL).split(',').map(id => id.trim()).filter(Boolean);
        if (docIds.length > 0) {
            queryParams.push(docIds);
            query += ` AND d.external_doc_id = ANY($${queryParams.length})`;
        }
    }

    if (!isSuper) {
      const allowedIds = user?.client_ids || [];
      queryParams.push(allowedIds);
      query += ` AND d.client_id = ANY($${queryParams.length}::text[])`;
    }

    query += ` ORDER BY d.created_at DESC`;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-GET-DOC-ERR]', err.message);
    res.status(500).json({ error: "Falla al obtener documentos" });
  }
};

export const syncInventory = async (req: Request, res: Response) => {
  const { docId, items, user, notes, isPartial, driverEmail } = req.body; // driverEmail opcional para notif
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Bloqueo FOR UPDATE - Seleccionamos todo para tener los metadatos dinámicos
    const checkStatus = await client.query('SELECT * FROM documents_l WHERE id = $1 FOR UPDATE', [docId]);

    if (checkStatus.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Documento no encontrado" });
    }

    const currentStatus = checkStatus.rows[0].status;
    if ((currentStatus === 'INVENTARIADO' || currentStatus === 'EST-08') && !isPartial) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: "Documento ya finalizado" });
    }

    const docL = checkStatus.rows[0];
    const newStatus = isPartial ? 'EST-04' : 'EST-08'; // EST-04=EN CONTEO (parcial), EST-08=INVENTARIADO (final)
    const inventoryDate = isPartial ? null : new Date();

    // 1. Actualizar Metadatos del Documento
    await client.query(`
      UPDATE documents_l
      SET status = $1,
          inventory_date = COALESCE($2::timestamptz, inventory_date),
          inventory_user = $3,
          inventory_observation = $4,
          inventory_notes = $4
      WHERE id = $5
    `, [newStatus, inventoryDate || null, user, notes || '', docId]);

    // inventory_start: se llena solo la primera vez — query separada para evitar conflictos de tipo
    await client.query(`
      UPDATE documents_l
      SET inventory_start = NOW()::text
      WHERE id = $1 AND (inventory_start IS NULL OR inventory_start = '')
    `, [docId]);

    // 2. Obtener cliente y AGREGAR CONTEOS por SKU
    const clientId = docL.client_id;
    const skuAggregates: Record<string, { count1: number, count2: number, batch: string, observation: string }> = {};

    for (const item of items) {
      const artId = (item.articleId || item.article_id || '').trim().toUpperCase();
      if (!artId) continue;

      if (!skuAggregates[artId]) {
        skuAggregates[artId] = {
          count1: 0,
          count2: 0,
          batch: item.batch || 'S/L',
          observation: item.inventoryNote || item.inventory_observation || ''
        };

        // Auto-crear artículo si no existe
        const artCheck = await client.query('SELECT 1 FROM articles WHERE UPPER(TRIM(id)) = $1', [artId]);
        if (artCheck.rows.length === 0) {
          await client.query(`
            INSERT INTO articles (id, name, client_id, uom_std, factor_std, status_id, auto_created)
            VALUES ($1, $2, $3, 'und', 1, 'EST-01', TRUE)
          `, [artId, `AUTO: ${artId}`, clientId]);
          console.log(`[M7-AUTO-ART] Articulo auto-creado en syncInventory: ${artId} (cliente: ${clientId})`);
        }
      }
      skuAggregates[artId].count1 += Number(item.count1 || item.count_1 || 0);
      skuAggregates[artId].count2 += Number(item.count2 || item.count_2 || item.countedQty || 0);

      // Si el item trae una nota específica, la priorizamos para el consolidado
      if (item.inventoryNote || item.inventory_observation) {
        skuAggregates[artId].observation = item.inventoryNote || item.inventory_observation;
      }
    }
    // 3. Actualizar CONSOLIDADO (Donde se ven los conteos en Auditoría)
    const deltas: Record<string, number> = {};
    for (const sku in skuAggregates) {
      // M7-FIX: Obtener el valor previo ANTES de actualizar para calcular el delta correcto de inventario
      const oldRes = await client.query(
        'SELECT count_2 FROM document_consolidated_items WHERE document_id = $1::text AND article_id = $2::text',
        [String(docId), String(sku)]
      );
      const oldCount2 = Number(oldRes.rows[0]?.count_2 || 0);
      const newCount2 = Number(skuAggregates[sku].count2 || 0);
      deltas[sku] = newCount2 - oldCount2;

      const expQtyRes = await client.query('SELECT SUM(expected_qty) as total FROM document_items WHERE document_id = $1::text AND article_id = $2::text', [docId, sku]);
      const expectedQty = Number(expQtyRes.rows[0]?.total || 0);

      await client.query(`
        INSERT INTO document_consolidated_items (document_id, article_id, count_1, count_2, inventory_user, inventory_observation, expected_qty)
        VALUES ($1::text, $2::text, $3::numeric, $4::numeric, $5::text, $6::text, $7::numeric)
        ON CONFLICT (document_id, article_id) DO UPDATE SET
        count_1 = EXCLUDED.count_1,
        count_2 = EXCLUDED.count_2,
        expected_qty = EXCLUDED.expected_qty,
        inventory_user = EXCLUDED.inventory_user,
        inventory_observation = EXCLUDED.inventory_observation
      `, [String(docId), String(sku), Number(skuAggregates[sku].count1 || 0), newCount2, user, skuAggregates[sku].observation || notes || '', expectedQty]);
    }

    console.log(`[M7-SYNC] Consolidado actualizado para ${Object.keys(skuAggregates).length} SKUs.`);

    // 3. Actualizar INVENTARIO CLIENTES (Solo en Finalización)
    if (!isPartial) {
      console.log('[M7-SYNC] Iniciando actualización de inventario_clientes...');
      for (const sku in skuAggregates) {
        try {
          const delta = deltas[sku] || 0;
          if (delta === 0) continue; // No hubo cambio neto para este SKU en esta sync

          await client.query(`
            INSERT INTO inventario_clientes (client_id, article_id, batch, quantity, last_user, last_updated)
            VALUES ($1::text, $2::text, $3::text, $4::numeric::text, $5::text, CURRENT_TIMESTAMP)
            ON CONFLICT (client_id, article_id, batch) DO UPDATE SET
            quantity = GREATEST(0, COALESCE(inventario_clientes.quantity::numeric, 0) + $4::numeric)::text,
            last_user = EXCLUDED.last_user,
            last_updated = CURRENT_TIMESTAMP
          `, [clientId, sku, skuAggregates[sku].batch || 'S/L', delta, user]);
          console.log(`[M7-SYNC-INV] SKU ${sku} actualizado. Delta: ${delta}`);
          // Kardex: INGRESO a bodega (fire-and-forget, fuera de la transacción principal)
          logMovement({
            clientId,
            articleId:     sku,
            batch:         skuAggregates[sku].batch || 'S/L',
            movementType:  'INGRESO',
            quantity:      delta,
            locationFrom:  'PROVEEDOR',
            locationTo:    'BODEGA',
            referenceType: 'DOCUMENTO',
            referenceId:   String(docId),
            userId:        user,
            notes:         notes || undefined,
          });
        } catch (invErr: any) {
          console.error(`[M7-SYNC-INV-ERR] Falló SKU ${sku}:`, invErr.message);
          throw new Error(`Error actualizando stock para ${sku}: ${invErr.message}`);
        }
      }
    }

    // OBTENER CLIENTE DEL DOCUMENTO PARA EL INVENTARIO
    // const docInfo = await client.query('SELECT client_id FROM documents_l WHERE id = $1', [docId]);
    // const clientId = docInfo.rows[0].client_id;

    // 3. Actualizar DETALLE (Solo notas, batch y conteos - item_status NO se toca por solicitud del usuario)
    for (const item of items) {
      const artId = (item.articleId || item.article_id || '').trim().toUpperCase();
      if (!artId) continue;
      const inv = (item.invoice || 'S/I');

      // [M7-PATCH] Estrategia SELECT -> UPDATE/INSERT para evitar error de constraint único
      // Ahora incluimos el invoice para ser más específicos y evitar colisiones
      const checkItem = await client.query(
        'SELECT id FROM document_items WHERE document_id = $1 AND article_id = $2 AND (invoice = $3 OR invoice = \'S/I\') LIMIT 1',
        [docId, artId, inv]
      );

      if (checkItem.rowCount && checkItem.rowCount > 0) {
        await client.query(`
          UPDATE document_items SET
            notes = $1, batch = $2, count_1 = $3, count_2 = $4
          WHERE id = $5
        `, [
          item.inventoryNote || item.notes || '',
          item.batch || 'S/L',
          Number(item.count1 || 0),
          Number(item.count2 || item.countedQty || 0),
          checkItem.rows[0].id
        ]);
      } else {
        await client.query(`
          INSERT INTO document_items (document_id, article_id, notes, batch, count_1, count_2, expected_qty, invoice)
          VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
        `, [
          docId, artId,
          item.inventoryNote || item.notes || '',
          item.batch || 'S/L',
          Number(item.count1 || 0),
          Number(item.count2 || item.countedQty || 0),
          inv
        ]);
      }
    }

    await client.query('COMMIT');

    // 4. ENVÍO DE NOTIFICACIÓN INTELIGENTE (Solo si no es parcial / Cierre Final)
    if (!isPartial) {
      try {
        // A. Consultar TODOS los correos activos para el tipo 'INVENTARIO AJOVER'
        const configRes = await pool.query(`
          SELECT mr.notification_email, mr.tipo_notificacion_id
          FROM master_records mr
          JOIN tipos_notificacion tn ON mr.tipo_notificacion_id = tn.id
          WHERE tn.name ILIKE 'INVENTARIO AJOVER' 
          AND mr.status_id = 'EST-01'
          AND mr.category = 'masterNotificaciones'
        `);

        const configs = configRes.rows;
        const targetEmails: string[] = configs.map(c => c.notification_email).filter(e => e);
        if (driverEmail && !targetEmails.includes(driverEmail)) targetEmails.push(driverEmail);

        const tipoId = configs[0]?.tipo_notificacion_id || 'TGN-EMAIL';

        // B. Generar y Enviar Correo (Notificación Inteligente Ajover)
        const itemsWithDiscrepancies = items.filter((it: any) => {
          const counted = Number(it.count2 || it.countedQty || 0);
          const expected = Number(it.expectedQty || 0);
          const hasNote = it.inventoryNote && it.inventoryNote.trim() !== '';
          return counted !== expected || hasNote;
        });

        const hasDiscrepancies = itemsWithDiscrepancies.length > 0;
        const subject = hasDiscrepancies
          ? `⚠️ NOVEDADES EN RECIBIDO INVENTARIO AJOVER: ${docL.external_doc_id || docL.externalDocId} [${docL.vehicle_plate || docL.vehicleData || 'S/V'}]`
          : `✅ RECIBIDO INVENTARIO AJOVER: ${docL.external_doc_id || docL.externalDocId} [${docL.vehicle_plate || docL.vehicleData || 'S/V'}]`;

        // MOSTRAR SOLO NOVEDADES POR SOLICITUD DEL USUARIO
        const tableRows = itemsWithDiscrepancies.map((it: any) => {
          const count1 = Number(it.count1 || 0);
          const count2 = Number(it.count2 || it.countedQty || 0);
          const expected = Number(it.expectedQty || 0);
          const diff = count2 - expected;
          const diffColor = diff < 0 ? '#ef4444' : (diff > 0 ? '#f59e0b' : '#10b981');
          const diffPrefix = diff > 0 ? '+' : '';

          return `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px; font-size: 11px; color: #0f172a; font-weight: bold;">
                  ${it.articleId}
                  <div style="font-size: 9px; color: #94a3b8; font-weight: normal;">${it.unCode || '-'}</div>
                </td>
                <td style="padding: 12px; font-size: 12px; color: #64748b; text-align: center;">${expected}</td>
                <td style="padding: 12px; font-size: 12px; color: #64748b; text-align: center;">${count1}</td>
                <td style="padding: 12px; font-size: 12px; color: #0f172a; font-weight: 900; text-align: center; background: #f8fafc;">${count2}</td>
                <td style="padding: 12px; font-size: 11px; color: ${diffColor}; font-weight: bold; text-align: center;">${diff === 0 ? 'OK' : diffPrefix + diff}</td>
                <td style="padding: 12px; font-size: 10px; color: #94a3b8; font-style: italic;">${it.inventoryNote || ''}</td>
              </tr>
            `;
        }).join('');

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
            .container { max-width: 650px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
            .header { background-color: #0f172a; color: #ffffff; padding: 30px; text-align: center; }
            .logo { font-size: 24px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; }
            .subtitle { font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; }
            .info-box { background-color: #f1f5f9; padding: 20px; font-size: 13px; color: #334155; border-bottom: 1px solid #e2e8f0; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .info-item { margin-bottom: 4px; }
            .info-label { font-weight: bold; color: #64748b; text-transform: uppercase; font-size: 10px; }
            .info-value { font-weight: 600; color: #0f172a; }
            .table-container { padding: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { text-align: left; padding: 12px; background-color: #f8fafc; color: #64748b; font-weight: bold; text-transform: uppercase; font-size: 10px; border-bottom: 2px solid #e2e8f0; }
            .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
            .batch { font-family: monospace; background: #e2e8f0; padding: 2px 4px; rounded: 4px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">ORBITM7</div>
              <div class="subtitle">Confirmación de Recibo Auditoría</div>
            </div>
            
            <div class="info-box">
               <div class="info-grid">
                  <div class="info-item">
                    <div class="info-label">Documento / Placa</div>
                    <div class="info-value">${docL.external_doc_id || docL.externalDocId} <span style="color:#94a3b8;">[${docL.vehicle_plate || docL.vehicleData || 'S/V'}]</span></div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Responsable</div>
                    <div class="info-value">${user || 'Sistema'}</div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Inicio Conteo</div>
                    <div class="info-value">${docL.inventory_start ? new Date(docL.inventory_start).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Cierre Conteo</div>
                    <div class="info-value">${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Tipo de Plan</div>
                    <div class="info-value">${docL.plan_type || docL.planType || 'PLAN NORMAL'}</div>
                  </div>
               </div>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th style="text-align: center;">Cant (Orig)</th>
                    <th style="text-align: center;">Conteo 1</th>
                    <th style="text-align: center;">Conteo 2</th>
                    <th style="text-align: center;">Dif</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
              ${notes ? `<div style="margin-top: 20px; padding: 15px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; color: #92400e; font-size: 12px;"><strong>Nota General:</strong> ${notes}</div>` : ''}
            </div>

            <div class="footer">
              <p>Generado automáticamente por <strong>M7 Intelligence</strong> • ${new Date().getFullYear()}</p>
            </div>
          </div>
        `;

        if (targetEmails.length > 0) {
          const { sendEmail } = await import('../services/notification.service.js');

          // Crear un adjunto Excel con la totalidad de los items contabilizados
          let attachments: any[] = [];
          try {
            const XLSX_MODULE = await import('xlsx');
            const XLSX = XLSX_MODULE.default || XLSX_MODULE;

            const excelData = items.map((it: any) => ({
              'SKU': it.articleId?.trim() || it.article_id?.trim() || '',
              'Tipo de Plan': docL.plan_type || docL.planType || 'PLAN NORMAL',
              'Cant (Orig)': Number(it.expectedQty || it.expected_qty || 0),
              'Conteo 1': Number(it.count1 || it.count_1 || 0),
              'Conteo 2 (Final)': Number(it.count2 || it.countedQty || it.count_2 || 0),
              'Diferencia': Number(it.count2 || it.countedQty || it.count_2 || 0) - Number(it.expectedQty || it.expected_qty || 0),
              'Nota': it.inventoryNote || it.inventory_observation || it.notes || ''
            }));

            const worksheet = XLSX.utils.json_to_sheet(excelData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");

            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            attachments.push({
              filename: `Inventario_${docL.external_doc_id || docL.externalDocId || 'Reporte'}.xlsx`,
              content: excelBuffer
            });
          } catch (xlsErr) {
            console.error('[M7-NOTIF] Falló la creación del Excel Adjunto:', xlsErr);
          }

          console.log(`[M7-NOTIF] Iniciando envío de correos a: ${targetEmails.join(', ')}`);

          for (const targetEmail of targetEmails) {
            try {
              await sendEmail(targetEmail, subject, html, attachments);
            } catch (innerErr: any) {
              console.error(`[M7-NOTIF-ERR] Falló envío a ${targetEmail}:`, innerErr.message);
            }
          }

          // C. Registrar log de uno de los envíos (Referencial)
          const notifLogId = `NOT-${Date.now()}`;
          const notifTypeToSave = tipoId || 'TGN-EMAIL';

          await pool.query(`
                INSERT INTO master_records (id, category, name, description, notification_email, tipo_notificacion_id, status_id)
                VALUES ($1, 'masterNotificaciones', 'LOG_INVENTARIO', $2, $3, $4, 'EST-01')
            `, [notifLogId, `RECIBO ${docL.external_doc_id || docL.externalDocId} - ${hasDiscrepancies ? 'CON NOVEDADES' : 'OK'}`, targetEmails[0], notifTypeToSave]);
        }
      } catch (notifErr: any) {
        console.error('[M7-NOTIF-ERROR]', notifErr.message);
      }
    }

    // Respuesta inmediata tras el COMMIT (las notificaciones son asíncronas en espíritu, no deben fallar la respuesta principal)
    return res.json({ success: true, status: newStatus });
  } catch (err: any) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('[M7-ROLLBACK-ERR]', rbErr);
      }
    }
    console.error('-------------------------------------------');
    console.error('[M7-SYNC-FATAL-ERROR] Detalle:');
    console.error('Mensaje:', err.message);
    console.error('Stack:', err.stack);
    console.error('-------------------------------------------');
    res.status(500).json({
      success: false,
      error: "Error de sincronización crítico.",
      detail: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    if (client) client.release();
  }
};

export const bulkCreateDocuments = async (req: Request, res: Response) => {
  const { documents } = req.body;
  const client = await pool.connect();

  const sanitizeDate = (dateVal: any) => {
    if (!dateVal) return null;
    const str = String(dateVal).trim().toUpperCase();
    if (str === 'S/I' || str === 'SIN INFORMACIÓN' || str === '') return null;
    return dateVal;
  };

  try {
    await client.query('BEGIN');
    for (const doc of documents) {
      // [M7-VALIDATION] Evitar duplicados por Placa + Documento + Cliente
      const plate = doc.vehicleData || doc.vehicle_plate || doc.plate || 'S/A';
      const extId = doc.externalDocId || doc.external_doc_id;

      if (plate !== 'S/A') {
        const duplicateCheck = await client.query(`
            SELECT id, plan_type FROM documents_l 
            WHERE client_id = $1 
            AND external_doc_id = $2 
            AND vehicle_plate = $3
            AND status NOT IN ('EST-16', 'ELIMINADO')
            LIMIT 1
          `, [doc.clientId, extId, plate]);

        if (duplicateCheck.rowCount && duplicateCheck.rowCount > 0) {
          const existingPlanType = String(duplicateCheck.rows[0].plan_type || '').toUpperCase();
          // [M7-PATCH] Si es manual, permitimos actualizar (hacer UPSERT) en lugar de dar error 409
          if (!existingPlanType.includes('MANUAL')) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              error: "Documento duplicado",
              details: `Ya existe un inventario activo (${existingPlanType}) para la placa ${plate} con el documento ${extId}.`
            });
          }
        }
      }

      const deliveryDate = sanitizeDate(doc.deliveryDate);
      const pickingDate = sanitizeDate(doc.pickingDate);
      const receivingDate = sanitizeDate(doc.receivingDate);

      await client.query(`
        INSERT INTO documents_l (id, client_id, external_doc_id, vehicle_plate, codplan, plan_type, delivery_date, status, created_at, picking_date, receiving_date, picker_user, deliverer_user, receiver_user)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
        external_doc_id = EXCLUDED.external_doc_id,
        vehicle_plate = EXCLUDED.vehicle_plate, 
        codplan = EXCLUDED.codplan, 
        plan_type = EXCLUDED.plan_type,
        status = EXCLUDED.status,
        delivery_date = EXCLUDED.delivery_date,
        picking_date = EXCLUDED.picking_date,
        receiving_date = EXCLUDED.receiving_date,
        picker_user = EXCLUDED.picker_user,
        deliverer_user = EXCLUDED.deliverer_user,
        receiver_user = EXCLUDED.receiver_user
      `, [
        doc.id,
        doc.clientId,
        doc.externalDocId || doc.external_doc_id,
        doc.vehicleData || doc.vehicle_plate || doc.plate || 'S/A',
        doc.codplan || doc.un_orig || 'S/I',
        doc.planType || doc.plan_type || 'N/A',
        deliveryDate,
        (doc.status ? (doc.status.startsWith('EST-') ? doc.status : 'EST-03') : 'EST-03'),
        doc.createdAt || new Date().toISOString(),
        pickingDate,
        receivingDate,
        doc.pickerUser || null,
        doc.delivererUser || null,
        doc.receiverUser || null
      ]);

      // Insertar Ítems Recepción (Detalle)
      if (doc.items && doc.items.length > 0) {
        // [AUTO-FIX] Asegurar que los artículos existan para evitar Foreign Key Error
        const uniqueArtIds = [...new Set(doc.items.map((i: any) => i.articleId?.trim().toUpperCase()).filter((id: any) => id))];
        for (const artId of uniqueArtIds) {
          const artCheck = await client.query('SELECT 1 FROM articles WHERE id = $1', [artId]);
          if (artCheck.rowCount === 0) {
            await client.query(`
               INSERT INTO articles (id, name, client_id, uom_std, factor_std, status_id, auto_created)
               VALUES ($1, $2, $3, 'und', 1, 'EST-01', TRUE)
             `, [artId, `AUTO: ${artId}`, doc.clientId]);
            console.log(`[M7-AUTO-ART] Articulo auto-creado en bulkCreate: ${artId} (cliente: ${doc.clientId})`);
          }
        }

        for (const item of doc.items) {
          const artId = item.articleId?.trim().toUpperCase();
          const invoice = item.invoice || 'S/I';
          if (!artId) continue;

          // [M7-FIX] Estrategia SELECT → UPDATE/INSERT para evitar dependencia
          // del constraint unq_doc_art_inv que puede no existir en la BD
          const existingItem = await client.query(
            `SELECT id FROM document_items WHERE document_id = $1 AND article_id = $2 AND invoice = $3 LIMIT 1`,
            [doc.id, artId, invoice]
          );

          const itemNeighborhood = (item as any).neighborhood || null;
          const itemCustomerName = (item as any).customerName || null;
          const itemLat = (item as any).lat ?? null;
          const itemLng = (item as any).lng ?? null;

          if (existingItem.rowCount && existingItem.rowCount > 0) {
            // Acumular cantidad si ya existe
            await client.query(`
              UPDATE document_items SET
                expected_qty = expected_qty::numeric + $1::numeric,
                unit = $2, volume = $3, unit_volume = $4,
                city = $5, address = $6, observation = $7,
                batch = $8, peso = $9, un_code = $10, client_ref = $11,
                customer_name = $12, neighborhood = COALESCE($13, neighborhood),
                item_status = COALESCE(item_status, 'EST-03')
              WHERE document_id = $14 AND article_id = $15 AND invoice = $16
            `, [
              item.expectedQty || 0,
              item.unit || 'und',
              item.volume || 0,
              item.unitVolume || '0',
              item.city || 'S/D',
              item.address || 'S/D',
              item.observation || item.driverNote || '',
              item.batch || 'S/L',
              item.peso || 0,
              item.unCode || null,
              item.clientRef || null,
              itemCustomerName,
              itemNeighborhood,
              doc.id, artId, invoice
            ]);
          } else {
            await client.query(`
              INSERT INTO document_items (document_id, article_id, expected_qty, received_qty, order_number, unit, invoice, volume, unit_volume, city, address, observation, batch, peso, un_code, client_ref, customer_name, neighborhood, item_status)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'EST-03')
            `, [
              doc.id,
              artId,
              item.expectedQty || 0,
              item.receivedQty || 0,
              item.orderNumber || 'S/I',
              item.unit || 'und',
              invoice,
              item.volume || 0,
              item.unitVolume || '0',
              item.city || 'S/D',
              item.address || 'S/D',
              item.observation || item.driverNote || '',
              item.batch || 'S/L',
              item.peso || 0,
              item.unCode || null,
              item.clientRef || null,
              itemCustomerName,
              itemNeighborhood
            ]);
          }

          // Plan R: guardar coordenadas directas en geocoding_cache
          if (itemLat !== null && itemLng !== null && item.address) {
            const addrKey = (item.address + '|' + (item.city || '')).toLowerCase().trim();
            await client.query(`
              INSERT INTO geocoding_cache (address_key, address, city, lat, lng)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (address_key) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng
            `, [addrKey, item.address, item.city || '', itemLat, itemLng]);
          }
        }
      }

      // Insertar Consolidado (Auditoría)
      if (doc.consolidatedItems && doc.consolidatedItems.length > 0) {
        for (const item of doc.consolidatedItems) {
          const articleId = item.articleId?.trim().toUpperCase();
          if (!articleId) continue;

          await client.query(`
              INSERT INTO document_consolidated_items (document_id, article_id, expected_qty, count_1, count_2, picked_qty, dispatched_qty, inventory_observation)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (document_id, article_id) DO UPDATE SET
              expected_qty = EXCLUDED.expected_qty,
              count_1 = COALESCE(NULLIF(EXCLUDED.count_1, 0), document_consolidated_items.count_1),
              count_2 = COALESCE(NULLIF(EXCLUDED.count_2, 0), document_consolidated_items.count_2),
              picked_qty = COALESCE(NULLIF(EXCLUDED.picked_qty, 0), document_consolidated_items.picked_qty),
              dispatched_qty = COALESCE(NULLIF(EXCLUDED.dispatched_qty, 0), document_consolidated_items.dispatched_qty),
              inventory_observation = COALESCE(NULLIF(EXCLUDED.inventory_observation, ''), document_consolidated_items.inventory_observation)
           `, [
            doc.id,
            articleId,
            item.expectedQty || 0,
            item.count1 || 0,
            item.count2 || 0,
            item.pickedQty || 0,
            item.dispatchedQty || 0,
            '' // M7-FIX: Las notas de auditoría deben empezar vacías
          ]);
        }
      } else if (doc.items && doc.items.length > 0) {
        // Fallback: Si no viene consolidado explícito, crearlo desde items
        for (const item of doc.items) {
          const articleId = item.articleId?.trim().toUpperCase();
          if (!articleId) continue;

          await client.query(`
               INSERT INTO document_consolidated_items (document_id, article_id, expected_qty, inventory_observation)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (document_id, article_id) DO UPDATE SET
               expected_qty = EXCLUDED.expected_qty
            `, [doc.id, articleId, item.expectedQty || 0, '']);
        }
      }
    }
    await client.query('COMMIT');
    console.log(`[M7-SYNC-SUCCESS] Carga masiva completada.`);
    res.json({ success: true, count: documents.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-DOC-BULK] Error:', err.message);
    res.status(500).json({ error: "Error en carga masiva" });
  } finally {
    client.release();
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, user } = req.body;
  try {
    await pool.query(`
      UPDATE documents_l SET status = $1 WHERE id = $2
    `, [status, id]);
    invoicesCache.clear(); // Invalidar caché al cambiar estado de documentos
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Error al actualizar estado" });
  }
};

export const getInvoices = async (req: Request, res: Response) => {
  try {
    const { clientId, ids, history, search, id, routeId } = req.query;

    // Caché solo para consultas generales (sin ids/search/id específicos)
    const canCache = !ids && !search && !id;
    if (canCache) {
      const cKey = getCacheKey(req.query as any);
      const cached = invoicesCache.get(cKey);
      if (cached && Date.now() - cached.ts < INVOICES_CACHE_TTL_MS) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
      }
    }
    const queryParams: any[] = [];

    const invoiceKeyExpr = `TRIM(COALESCE(NULLIF(invoice, ''), order_number))`;

    let query = `
      WITH base_data AS (
        SELECT 
          TRIM(COALESCE(NULLIF(di.invoice, ''), di.order_number)) as inv_key,
          di.*,
          dl.client_id,
          dl.external_doc_id,
          dl.plan_type,
          dl.codplan,
          dl.vehicle_plate,
          dl.status as doc_status,
          dl.created_by as doc_created_by
        FROM document_items di
        LEFT JOIN documents_l dl ON di.document_id = dl.id
      )
      SELECT 
        inv_key as id,
        inv_key as "invoiceNumber",
        MAX(base_data.order_number) as "orderNumber",
        STRING_AGG(DISTINCT base_data.observation, '. ') as "notes",
        MAX(base_data.external_doc_id) as "externalDocId",
        MAX(base_data.city) as city,
        MAX(base_data.neighborhood) as neighborhood,
        MAX(base_data.address) as address,
        MAX(base_data.customer_name) as "customerName",
        SUM(base_data.expected_qty) as "totalItems",
        SUM(base_data.volume) as "volumeM3",
        MAX(base_data.document_id) as "docLId",
        MAX(base_data.client_id) as "clientId", 
        MAX(base_data.codplan) as "codplan",
        MAX(base_data.plan_type) as "planType",
        MAX(base_data.vehicle_plate) as "plate",
        MAX(base_data.doc_status) as "status",
        MAX(base_data.item_status) as "itemStatus",
        MAX(est_item.name) as "itemStatusName",
        MAX(da.id) as "dispatchId",
        MAX(da.status) as "dispatchStatus",
        MAX(pa.leader_id) as "pickerLeader",
        MAX(base_data.un_code) as "unCode",
        MAX(base_data.client_ref) as "clientRef",
        MAX(COALESCE(p.vmetodo::numeric, 0)) as "invoiceValue",
        MAX(p.metodo_pago) as "paymentMethod",
        MAX(u.name) as "userName",
        (
          SELECT JSON_AGG(grouped_items)
          FROM (
            SELECT 
              items_sub.article_id as sku,
              SUM(items_sub.expected_qty) as qty,
              SUM(items_sub.received_qty) as "receivedQty",
              MAX(COALESCE(art_sub.name, items_sub.article_id)) as "articleName",
              MAX(items_sub.unit) as unit,
              MAX(items_sub.un_code) as "unCode",
              MAX(items_sub.client_ref) as "clientRef"
            FROM document_items items_sub
            LEFT JOIN articles art_sub ON items_sub.article_id = art_sub.id
            WHERE TRIM(COALESCE(NULLIF(items_sub.invoice, ''), items_sub.order_number)) 
              = base_data.inv_key
            GROUP BY 1
          ) grouped_items
        ) as "items",
        MIN(COALESCE(gc.lat, 6.2518)) as lat,
        MIN(COALESCE(gc.lng, -75.5636)) as lng
      FROM base_data
      LEFT JOIN geocoding_cache gc ON gc.address_key = LOWER(CONCAT(TRIM(base_data.address), '|', TRIM(base_data.city)))
      LEFT JOIN document_l_payments p ON (TRIM(UPPER(base_data.inv_key)) = TRIM(UPPER(p.invoice)) AND p.invoice != '')
      LEFT JOIN dispatch_assignments da ON (da.invoice_id = base_data.inv_key)
      LEFT JOIN picking_assignments pa ON (pa.invoice_id = base_data.inv_key)
      LEFT JOIN estados est_item ON est_item.id = base_data.item_status
      LEFT JOIN users u ON u.id = base_data.doc_created_by
      WHERE 1=1
    `;

    const user = (req as any).user;
    const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';

    if (clientId && clientId !== 'GLOBAL') {
      queryParams.push(clientId);
      query += ` AND base_data.client_id = $${queryParams.length}`;
    }

    // [SECURITY FIX] Siempre filtrar por los clientes autorizados si no es Super Admin
    if (!isSuper) {
      const allowedIds = user?.client_ids || [];
      queryParams.push(allowedIds);
      query += ` AND base_data.client_id = ANY($${queryParams.length}::text[])`;
    }

    if (ids) {
      const idList = String(ids).split(',').map(item => item.trim());
      const orClauses = idList.map((compId) => {
        const lastUnderscore = compId.lastIndexOf('_');
        let searchTerm = compId;
        if (lastUnderscore > 0) searchTerm = compId.substring(lastUnderscore + 1);
        searchTerm = searchTerm.replace(/\s/g, '');
        queryParams.push(searchTerm);
        const pIdx = `$${queryParams.length}`;

        if (lastUnderscore > 0) {
          const docIdExtracted = compId.substring(0, lastUnderscore);
          queryParams.push(docIdExtracted);
          const pIdxDoc = `$${queryParams.length}`;
          return `(
               (TRIM(COALESCE(base_data.invoice, '')) = ${pIdx} OR TRIM(COALESCE(base_data.order_number, '')) = ${pIdx})
               AND base_data.document_id = ${pIdxDoc}
            )`;
        }

        return `(
            TRIM(COALESCE(base_data.invoice, '')) = ${pIdx} 
            OR 
            TRIM(COALESCE(base_data.order_number, '')) = ${pIdx}
         )`;
      });
      if (orClauses.length > 0) query += ` AND (${orClauses.join(' OR ')})`;
    } else if (history !== 'true') {
      // Planificador: solo facturas pendientes o en repique a bodega
      query += ` AND (base_data.item_status IN ('EST-01', 'EST-03', 'EST-08', 'EST-15') OR base_data.item_status IS NULL)
        AND base_data.doc_status NOT IN ('EST-16','EST-12','EST-07','EST-17')`;
    }

    query += ` GROUP BY base_data.inv_key
      ORDER BY base_data.inv_key ASC`;

    const result = await pool.query(query, queryParams);

    console.log(`[M7-SUCCESS] getInvoices: Enviando ${result.rows.length} facturas.`);

    // Guardar en caché si aplica
    if (canCache) {
      const cKey = getCacheKey(req.query as any);
      invoicesCache.set(cKey, { data: result.rows, ts: Date.now() });
      res.setHeader('X-Cache', 'MISS');
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-CRITICAL-ERR] getInvoices:', err.message);
    res.status(500).json({ error: "Error al obtener facturas: " + err.message });
  }
};

// ─── GET /documents/invoice-traceability ─────────────────────────────────────
// Trazabilidad completa de una factura: ingreso, ruta, entrega, conciliación.
export const getInvoiceTraceability = async (req: Request, res: Response) => {
  try {
    const { invoiceNumber } = req.query;
    if (!invoiceNumber) return res.status(400).json({ success: false, error: 'invoiceNumber es requerido' });

    const inv = String(invoiceNumber).trim();

    // 1. Datos base de la factura
    const invoiceRes = await pool.query(`
      SELECT
        TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) AS invoice_number,
        di.order_number,
        di.customer_name,
        di.address,
        di.city,
        di.document_id,
        di.item_status,
        est_item.name  AS item_status_name,
        dl.external_doc_id,
        dl.plan_type,
        dl.client_id,
        dl.created_at  AS received_at,
        u_recv.name    AS received_by_name,
        dl.inventory_date,
        dl.inventory_user,
        dl.status      AS doc_status,
        est_doc.name   AS doc_status_name,
        dl.vehicle_plate,
        dl.codplan,
        dl.delivery_date,
        SUM(di.expected_qty) AS total_qty,
        SUM(di.received_qty) AS received_qty
      FROM document_items di
      LEFT JOIN documents_l   dl       ON dl.id = di.document_id
      LEFT JOIN estados        est_item ON est_item.id = di.item_status
      LEFT JOIN estados        est_doc  ON est_doc.id  = dl.status
      LEFT JOIN users          u_recv   ON u_recv.id   = dl.created_by
      WHERE TRIM(UPPER(di.invoice))      = TRIM(UPPER($1))
         OR TRIM(UPPER(di.order_number)) = TRIM(UPPER($1))
      GROUP BY
        di.invoice, di.order_number, di.customer_name, di.address, di.city,
        di.document_id, di.item_status, est_item.name,
        dl.external_doc_id, dl.plan_type, dl.client_id, dl.created_at,
        u_recv.name, dl.inventory_date, dl.inventory_user,
        dl.status, est_doc.name, dl.vehicle_plate, dl.codplan, dl.delivery_date
      ORDER BY dl.created_at DESC
      LIMIT 1
    `, [inv]);

    if (!invoiceRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Factura no encontrada' });
    }

    const invoiceData = invoiceRes.rows[0];

    // 2. Ítems de la factura
    const itemsRes = await pool.query(`
      SELECT
        di.article_id,
        COALESCE(art.name, di.article_id) AS article_name,
        di.expected_qty,
        di.received_qty,
        di.item_status,
        est.name      AS item_status_name,
        di.observation AS novedad,
        di.unit
      FROM document_items di
      LEFT JOIN articles art ON art.id = di.article_id
      LEFT JOIN estados  est ON est.id = di.item_status
      WHERE di.document_id = $1
        AND (TRIM(UPPER(di.invoice)) = TRIM(UPPER($2)) OR TRIM(UPPER(di.order_number)) = TRIM(UPPER($2)))
      ORDER BY di.article_id
    `, [invoiceData.document_id, inv]);

    // 3. Asignación a ruta
    // Usa invoice_number resuelto (para que búsqueda por pedido también encuentre la ruta)
    const resolvedInv = invoiceData.invoice_number || inv;
    const routeRes = await pool.query(`
      SELECT
        r.id::text                            AS route_id,
        ri.invoice_id                         AS ri_invoice_id,
        r.created_at                          AS assigned_at,
        v.plate,
        d.name                                AS driver_name,
        d.document_number                     AS driver_document,
        d.phone                               AS driver_phone,
        est.name                              AS route_status_name,
        r.status_id
      FROM route_invoices ri
      JOIN  routes   r   ON r.id::text = ri.route_id::text
      LEFT JOIN vehicles v   ON v.id::text = r.vehicle_id::text
      LEFT JOIN drivers  d   ON d.id::text = r.driver_id::text
      LEFT JOIN estados  est ON est.id = r.status_id
      WHERE TRIM(UPPER(ri.invoice_id)) = TRIM(UPPER($1))
         OR ri.invoice_id = CONCAT($2::text, '_', $1::text)
         OR TRIM(UPPER(ri.invoice_id)) = TRIM(UPPER($3))
         OR ri.invoice_id = CONCAT($2::text, '_', $3::text)
      ORDER BY r.created_at DESC
      LIMIT 1
    `, [inv, invoiceData.document_id, resolvedInv]);

    // 4. Despacho (dispatch_assignments)
    const dispatchRes = await pool.query(`
      SELECT
        da.id::text                           AS dispatch_id,
        da.created_at                         AS dispatched_at,
        da.status                             AS dispatch_status,
        v.plate,
        d.name                                AS driver_name
      FROM dispatch_assignments da
      LEFT JOIN assignments a ON da.driver_id::text = a.driver_id::text AND a.is_active = true
      LEFT JOIN vehicles    v ON v.id::text = a.vehicle_id::text
      LEFT JOIN drivers     d ON d.id::text = da.driver_id::text
      WHERE TRIM(UPPER(da.invoice_id)) = TRIM(UPPER($1))
         OR da.invoice_id = CONCAT($2::text, '_', $1::text)
      ORDER BY da.created_at DESC
      LIMIT 1
    `, [inv, invoiceData.document_id]);

    // 5. Conciliación
    // Usamos ic.* para evitar errores si la tabla en producción no tiene
    // todas las columnas (schema drift). El frontend usa optional chaining.
    const concRes = await pool.query(`
      SELECT
        ic.*,
        u.name AS conciliado_por_nombre
      FROM invoice_conciliations ic
      LEFT JOIN users u ON u.id = ic.conciliado_por
      WHERE TRIM(UPPER(ic.invoice_number)) = TRIM(UPPER($1))
      ORDER BY ic.created_at DESC
      LIMIT 1
    `, [inv]);

    // 6. Pago registrado (document_l_payments)
    // SELECT * para evitar errores por schema drift (banco/referencia no existen en prod)
    const paymentRes = await pool.query(`
      SELECT *
      FROM document_l_payments
      WHERE TRIM(UPPER(invoice)) = TRIM(UPPER($1))
      LIMIT 1
    `, [inv]);

    // 7. Historial de modificaciones de ruta para esta factura
    // Busca por: columna invoice_id, details JSON (formato viejo), y cambios de placa en rutas que tuvieron la factura
    const logsRes = await pool.query(`
      WITH
      -- Todos los route_ids que tuvieron esta factura (columna + details JSON + route_invoices actual)
      all_invoice_routes AS (
        -- Columna invoice_id directa
        SELECT DISTINCT route_id::text AS route_id
        FROM route_modifications_log
        WHERE invoice_id = $1
           OR invoice_id = CONCAT($2::text, '_', $1::text)
        UNION
        -- invoice_id guardado en details JSON (formato viejo de LogisticsDispatch)
        SELECT DISTINCT route_id::text
        FROM route_modifications_log
        WHERE details IS NOT NULL
          AND details::text ~ $3
          AND (
            (details::jsonb)->>'invoice_id' = $1
            OR (details::jsonb)->>'invoice_id' = CONCAT($2::text, '_', $1::text)
          )
        UNION
        -- Rutas actuales en route_invoices
        SELECT DISTINCT route_id::text
        FROM route_invoices
        WHERE invoice_id = $1
           OR invoice_id = CONCAT($2::text, '_', $1::text)
      ),
      -- Rutas VIEJAS de REASSIGN_PLATE cuya nueva ruta tuvo esta factura
      reassign_source_routes AS (
        SELECT DISTINCT rml.route_id::text AS route_id
        FROM route_modifications_log rml
        WHERE rml.action IN ('REASSIGN_PLATE', 'REASSIGN_VEHICLE')
          AND rml.details IS NOT NULL
          AND rml.details::text ~ 'new_route_id'
          AND (rml.details::jsonb)->>'new_route_id' IN (SELECT route_id FROM all_invoice_routes)
      )
      SELECT
        rml.id,
        rml.route_id::text,
        rml.action,
        rml.previous_plate,
        rml.new_plate,
        rml.details::text AS details,
        rml.timestamp     AS created_at,
        u.name            AS user_name
      FROM route_modifications_log rml
      LEFT JOIN users u ON u.id::text = rml.user_id::text
      WHERE
        -- Por columna invoice_id
        rml.invoice_id = $1
        OR rml.invoice_id = CONCAT($2::text, '_', $1::text)
        -- Por invoice_id dentro del JSON details (formato viejo)
        OR (
          rml.details IS NOT NULL
          AND rml.details::text ~ $3
          AND (
            (rml.details::jsonb)->>'invoice_id' = $1
            OR (rml.details::jsonb)->>'invoice_id' = CONCAT($2::text, '_', $1::text)
          )
        )
        -- Cambios de placa en rutas que tuvieron esta factura
        OR (
          rml.action IN ('REASSIGN_PLATE', 'REASSIGN_VEHICLE')
          AND rml.route_id::text IN (
            SELECT route_id FROM all_invoice_routes
            UNION SELECT route_id FROM reassign_source_routes
          )
        )
      ORDER BY rml.timestamp DESC
    `, [inv, invoiceData.document_id, '"invoice_id"']);

    res.json({
      success: true,
      data: {
        invoice:      invoiceData,
        items:        itemsRes.rows,
        route:        routeRes.rows[0]    || null,
        dispatch:     dispatchRes.rows[0] || null,
        conciliation: concRes.rows[0]     || null,
        payment:      paymentRes.rows[0]  || null,
        modifications: logsRes.rows,
      }
    });
  } catch (err: any) {
    console.error('[TRACEABILITY] getInvoiceTraceability error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const processDocumentLPayment = async (req: Request, res: Response) => {
  const { documentId, payments, userId } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results = {
      processed: 0,
      errors: [] as any[]
    };

    for (const pay of payments) {
      try {
        // Validar si la factura existe en document_items para este documento
        // Nota: El usuario confirmó columnas (B: Factura, L: CLIENT_REF, A: UN_CODE)
        const checkItem = await client.query(`
          SELECT 1 FROM document_items 
          WHERE document_id = $1 AND invoice = $2
          LIMIT 1
        `, [documentId, pay.invoice]);

        if (checkItem.rowCount === 0) {
          results.errors.push({
            invoice: pay.invoice,
            reason: 'Factura no encontrada en este Documento L',
            data: pay
          });
          continue;
        }

        let finalUnCode = pay.unCode;
        let finalMetodo = pay.metodoPago;
        if (String(pay.unCode).trim().toUpperCase() === 'AJV20' && String(pay.metodoPago).trim().toUpperCase() === 'EF') {
          finalMetodo = '030D';
        }

        // Insertar en la nueva tabla de pagos
        await client.query(`
          INSERT INTO document_l_payments (document_id, invoice, client_ref, un_code, metodo_pago, vmetodo, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (invoice) DO UPDATE SET
          un_code = EXCLUDED.un_code,
          metodo_pago = EXCLUDED.metodo_pago,
          vmetodo = EXCLUDED.vmetodo,
          processed_at = CURRENT_TIMESTAMP,
          user_id = EXCLUDED.user_id
        `, [
          documentId,
          pay.invoice,
          pay.clientRef,
          finalUnCode,
          finalMetodo,
          pay.vmetodo,
          userId
        ]);

        results.processed++;
      } catch (rowErr: any) {
        results.errors.push({
          invoice: pay.invoice,
          reason: rowErr.message,
          data: pay
        });
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, ...results });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-PAY-PROCESS-ERR]', err.message);
    res.status(500).json({ error: "Error procesando pagos" });
  } finally {
    client.release();
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user } = req.query; // Quien elimina

  try {
    await pool.query(`
      UPDATE documents_l 
      SET status = 'EST-16',
          external_doc_id = external_doc_id || '_DEL_' || extract(epoch from now()),
          inventory_user = $1, 
          inventory_date = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [user, id]);

    // Opcional: También actualizar el item_status de los items para consistencia en ruteo
    await pool.query(`
      UPDATE document_items 
      SET item_status = 'EST-16'
      WHERE document_id = $1
    `, [id]);

    res.json({ success: true, message: "Documento eliminado correctamente" });
  } catch (err: any) {
    console.error('[M7-DELETE-DOC-ERR]', err.message);
    res.status(500).json({ error: "Falla al eliminar documento" });
  }
};

export const resendInventoryNotification = async (req: Request, res: Response) => {
  const { docId, targetEmail } = req.body;

  if (!docId || !targetEmail) {
    return res.status(400).json({ success: false, error: "Faltan datos requeridos (docId, targetEmail)" });
  }

  // Usar el pool directamente para obtener un cliente del pool si es necesario, 
  // pero pool.query también funciona. Para transacciones o multiples queries secuenciales garantizadas, pool.connect() es mejor.
  // El código original usaba pool.connect().
  const client = await pool.connect();
  try {
    // 1. Obtener Info del Documento
    const docRes = await client.query('SELECT * FROM documents_l WHERE id = $1', [docId]);
    if (docRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: "Documento no encontrado" });
    }
    const docL = docRes.rows[0];

    // 2. Obtener Ítems Consolidados para el reporte
    // CORRECCIÓN: Usar inventory_observation en lugar de inventory_note si esa es la columna en DB
    const itemsRes = await client.query(`
      SELECT 
        dci.*, 
        a.name as article_name,
        dci.inventory_observation as inventory_note
      FROM document_consolidated_items dci
      LEFT JOIN articles a ON dci.article_id = a.id
      WHERE dci.document_id = $1
    `, [docId]);

    const items = itemsRes.rows;

    // 3. Generar HTML (Lógica Replicada de syncInventory para consistencia)
    const itemsWithDiscrepancies = items.filter((it: any) => {
      const counted = Number(it.count_2 || it.count_1 || 0); // Prioridad Count 2 (Confirmado)
      const expected = Number(it.expected_qty || 0);
      const hasNote = it.inventory_note && it.inventory_note.trim() !== '';
      return counted !== expected || hasNote;
    });

    const hasDiscrepancies = itemsWithDiscrepancies.length > 0;
    const subject = hasDiscrepancies
      ? `⚠️ REENVÍO NOVEDADES INVENTARIO AJOVER: ${docL.external_doc_id} [${docL.vehicle_plate || 'S/V'}]`
      : `✅ REENVÍO INVENTARIO AJOVER: ${docL.external_doc_id} [${docL.vehicle_plate || 'S/V'}]`;

    // MOSTRAR SOLO NOVEDADES POR SOLICITUD DEL USUARIO
    const tableRows = itemsWithDiscrepancies.map((it: any) => {
      const count1 = Number(it.count_1 || 0);
      const counted = Number(it.count_2 || it.count_1 || 0);
      const expected = Number(it.expected_qty || 0);
      const diff = counted - expected;
      const diffColor = diff < 0 ? '#ef4444' : (diff > 0 ? '#f59e0b' : '#10b981');
      const diffPrefix = diff > 0 ? '+' : '';

      return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px; font-size: 11px; color: #0f172a; font-weight: bold;">
              ${it.article_id}
              <div style="font-size: 9px; color: #94a3b8; font-weight: normal;">${it.article_name || '-'}</div>
            </td>
            <td style="padding: 12px; font-size: 12px; color: #64748b; text-align: center;">${expected}</td>
            <td style="padding: 12px; font-size: 12px; color: #64748b; text-align: center;">${count1}</td>
            <td style="padding: 12px; font-size: 12px; color: #0f172a; font-weight: 900; text-align: center; background: #f8fafc;">${counted}</td>
            <td style="padding: 12px; font-size: 11px; color: ${diffColor}; font-weight: bold; text-align: center;">${diff === 0 ? 'OK' : diffPrefix + diff}</td>
            <td style="padding: 12px; font-size: 10px; color: #94a3b8; font-style: italic;">${it.inventory_note || ''}</td>
          </tr>
        `;
    }).join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
        .container { max-width: 650px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
        .header { background-color: #0f172a; color: #ffffff; padding: 30px; text-align: center; }
        .logo { font-size: 24px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; }
        .subtitle { font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; }
        .info-box { background-color: #f1f5f9; padding: 20px; font-size: 13px; color: #334155; border-bottom: 1px solid #e2e8f0; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .info-item { margin-bottom: 4px; }
        .info-label { font-weight: bold; color: #64748b; text-transform: uppercase; font-size: 10px; }
        .info-value { font-weight: 600; color: #0f172a; }
        .table-container { padding: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; padding: 12px; background-color: #f8fafc; color: #64748b; font-weight: bold; text-transform: uppercase; font-size: 10px; border-bottom: 2px solid #e2e8f0; }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">ORBITM7</div>
          <div class="subtitle">Reenvío Informe Auditoría (Manual)</div>
        </div>
        
        <div class="info-box">
           <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Documento / Placa</div>
                <div class="info-value">${docL.external_doc_id} <span style="color:#94a3b8;">[${docL.vehicle_plate || 'S/V'}]</span></div>
              </div>
              <div class="info-item">
                <div class="info-label">Auditor Original</div>
                <div class="info-value">${docL.inventory_user || 'S/I'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Inicio Conteo</div>
                <div class="info-value">${docL.inventory_start ? new Date(docL.inventory_start).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'S/I'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Cierre Conteo</div>
                <div class="info-value">${docL.inventory_date ? new Date(docL.inventory_date).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'S/I'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Reenviado A</div>
                <div class="info-value">${targetEmail}</div>
              </div>
           </div>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th style="text-align: center;">Cant (Orig)</th>
                <th style="text-align: center;">Cant (conteo Inv 1)</th>
                <th style="text-align: center;">Cant (Conteo Inv 2)</th>
                <th style="text-align: center;">Dif</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          ${(docL.inventory_notes || docL.inventory_observation) ? `<div style="margin-top: 20px; padding: 15px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; color: #92400e; font-size: 12px;"><strong>Nota General:</strong> ${docL.inventory_notes || docL.inventory_observation}</div>` : ''}
          <div style="margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 8px; color: #64748b; font-size: 10px; text-align: center;">
             Este es un reenvío manual del informe original por el sistema <strong>ORBITM7</strong>. Los datos reflejan el estado del inventario al momento del cierre oficial.
          </div>
        </div>

        <div class="footer">
          <p>Generado automáticamente por <strong>M7 Intelligence</strong> • ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
    `;

    // 4. Generar Adjunto Excel y Enviar Correo
    const { sendEmail } = await import('../services/notification.service.js');
    let attachments: any[] = [];

    try {
      const XLSX = await import('xlsx');
      const excelData = items.map((it: any) => ({
        'SKU': it.article_id?.trim() || '',
        'Nombre': it.article_name || '',
        'Cant (Orig)': Number(it.expected_qty || 0),
        'Conteo 1': Number(it.count_1 || 0),
        'Conteo 2 (Final)': Number(it.count_2 || it.count_1 || 0),
        'Diferencia': Number(it.count_2 || it.count_1 || 0) - Number(it.expected_qty || 0),
        'Nota': it.inventory_note || it.inventory_observation || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");

      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      attachments.push({
        filename: `Inventario_Reenvio_${docL.external_doc_id || 'Reporte'}.xlsx`,
        content: excelBuffer
      });
    } catch (xlsErr) {
      console.error('[M7-RESEND] Falló la creación del Excel Adjunto:', xlsErr);
    }

    await sendEmail(targetEmail, subject, html, attachments);

    // 5. Registrar Log
    const notifLogId = `NOT-RESEND-${Date.now()}`;
    await client.query(`
      INSERT INTO master_records (id, category, name, description, notification_email, tipo_notificacion_id, status_id)
      VALUES ($1, 'masterNotificaciones', 'LOG_REENVIO', $2, $3, 'TGN-EMAIL', 'EST-01')
    `, [notifLogId, `REENVÍO RECIBO ${docL.external_doc_id}`, targetEmail]);

    res.json({ success: true, message: "Correo reenviado correctamente" });

  } catch (err: any) {
    console.error('[M7-RESEND-ERR]', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

export const createManualDocument = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { externalDocId, clientId, vehiclePlate, planType, user } = req.body;

    if (!externalDocId || !clientId || !vehiclePlate) {
      return res.status(400).json({ success: false, error: "Datos incompletos" });
    }

    // 1. Verificar si ya existe un documento L con ese ID para ese cliente
    const existing = await client.query(
      'SELECT id, status FROM documents_l WHERE UPPER(external_doc_id) = UPPER($1) AND client_id = $2',
      [externalDocId, clientId]
    );

    if (existing.rows.length > 0) {
      // Si existe y no está eliminado, lo devolvemos
      if (existing.rows[0].status !== 'EST-16' && existing.rows[0].status !== 'ELIMINADO') {
        const docId = existing.rows[0].id;
        const fullDoc = await client.query('SELECT *, external_doc_id as "externalDocId", vehicle_plate as "vehicleData", plan_type as "planType" FROM documents_l WHERE id = $1', [docId]);
        return res.json({ success: true, document: fullDoc.rows[0], message: "Documento ya existía, continuando..." });
      }
    }

    // 2. Crear el documento base
    const docId = `L-MAN-${Date.now()}`;
    const result = await client.query(`
      INSERT INTO documents_l (id, external_doc_id, client_id, vehicle_plate, status, plan_type, created_by, created_at)
      VALUES ($1, $2, $3, $4, 'EST-03', $5, $6, NOW())
      RETURNING *, external_doc_id as "externalDocId", vehicle_plate as "vehicleData", plan_type as "planType"
    `, [docId, externalDocId, clientId, vehiclePlate, planType || 'MANUAL', user]);

    res.json({ success: true, document: result.rows[0] });

  } catch (err: any) {
    console.error('[M7-CREATE-MANUAL-ERR]', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// ═══════════════════════════════════════════════════════════
// LOG DE EXISTENCIAS — Consulta de inventario_clientes
// ═══════════════════════════════════════════════════════════
export const getInventoryLog = async (req: Request, res: Response) => {
  try {
    const { clientId, articleId, search } = req.query;
    const user = (req as any).user;
    const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';

    const params: any[] = [];
    let whereClause = 'WHERE 1=1';

    // Filtrar por cliente autorizado si no es super admin
    if (!isSuper) {
      const allowedIds = user?.client_ids || [];
      params.push(allowedIds);
      whereClause += ` AND ic.client_id = ANY($${params.length}::text[])`;
    }

    if (clientId) {
      params.push(clientId);
      whereClause += ` AND ic.client_id = $${params.length}`;
    }

    if (articleId) {
      params.push(articleId);
      whereClause += ` AND ic.article_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (ic.article_id ILIKE $${params.length} OR a.name ILIKE $${params.length} OR c.name ILIKE $${params.length} OR ic.batch ILIKE $${params.length})`;
    }

    const query = `
      SELECT
        ic.client_id    AS "clientId",
        c.name          AS "clientName",
        ic.article_id   AS "articleId",
        a.name          AS "articleName",
        ic.batch,
        ic.quantity,
        ic.last_user    AS "lastUser",
        ic.last_updated AS "lastUpdated"
      FROM inventario_clientes ic
      LEFT JOIN clients c  ON ic.client_id  = c.id
      LEFT JOIN articles a ON ic.article_id = a.id
      ${whereClause}
      ORDER BY ic.last_updated DESC
      LIMIT 1000
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-INV-LOG-ERR]', err.message);
    res.status(500).json({ error: 'Error al obtener log de existencias' });
  }
};

export const getMastersuiteReport = async (req: Request, res: Response) => {
  try {
    const { document = '', plate = '' } = req.query as { document?: string; plate?: string };

    // Al menos uno de los filtros debe estar presente para evitar descargar toda la BD
    if (!String(document).trim() && !String(plate).trim()) {
      return res.status(400).json({ error: 'Debe ingresar al menos un filtro (documento o placa)' });
    }

    const docParam = String(document).trim();
    const plateParam = String(plate).trim();

    const result = await pool.query(`
      WITH base AS (
        SELECT
          di.id                                                                                   AS item_id,
          COALESCE(NULLIF(TRIM(di.invoice),''), NULLIF(TRIM(di.order_number),''), di.un_code)    AS inv_key,
          -- ID compuesto igual al que generan el frontend y los controladores de rutas/despacho
          CONCAT(
            TRIM(di.document_id::text), '_',
            TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number, 'NA'))
          )                                                                                       AS compound_id,
          dl.vehicle_plate                                                                        AS truck_origin,
          dl.external_doc_id                                                                      AS load_id
        FROM document_items di
        JOIN documents_l dl ON di.document_id = dl.id
        WHERE
          -- Filtro 1: Documento L / Factura (Multi-búsqueda)
          ($1::text = ''
            OR EXISTS (
              SELECT 1 FROM unnest(string_to_array($1, ',')) AS s
              WHERE (dl.external_doc_id ILIKE '%' || TRIM(s) || '%'
                 OR di.invoice         ILIKE '%' || TRIM(s) || '%'
                 OR di.order_number    ILIKE '%' || TRIM(s) || '%')
                 AND TRIM(s) <> ''
            ))
          AND
          -- Filtro 2: Placa (Global: Origen o Destino)
          ($2::text = ''
            OR EXISTS (
              SELECT 1 FROM unnest(string_to_array($2, ',')) AS p
              WHERE (
                dl.vehicle_plate ILIKE '%' || TRIM(p) || '%'
                OR EXISTS (
                  SELECT 1 FROM route_invoices ri 
                  JOIN routes r ON r.id::text = ri.route_id::text
                  LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
                  WHERE (TRIM(ri.invoice_id) = TRIM(di.invoice) OR TRIM(ri.invoice_id) = CONCAT(di.document_id, '_', TRIM(di.invoice)))
                    AND (v.plate ILIKE '%' || TRIM(p) || '%' OR r.vehicle_id ILIKE '%' || TRIM(p) || '%')
                )
                OR EXISTS (
                  SELECT 1 FROM dispatch_assignments da
                  JOIN assignments asgn ON asgn.driver_id::text = da.driver_id::text
                  JOIN vehicles v2 ON v2.id::text = asgn.vehicle_id::text
                  WHERE (da.invoice_id = di.invoice OR da.invoice_id = CONCAT(di.document_id, '_', TRIM(di.invoice)))
                    AND (v2.plate ILIKE '%' || TRIM(p) || '%')
                )
              )
              AND TRIM(p) <> ''
            )
          )
      ),
      -- Búsqueda de placa destino: route_invoices → routes → vehicles
      -- invoice_id puede ser el ID compuesto (doc_id + '_' + factura) o la factura corta
      route_truck AS (
        SELECT DISTINCT ON (ri.invoice_id)
          ri.invoice_id,
          COALESCE(v.plate, r.vehicle_id)    AS truck_plate,
          COALESCE(drv.document_number, '')  AS driver_doc
        FROM route_invoices ri
        JOIN  routes r   ON r.id::text = ri.route_id::text
        LEFT JOIN vehicles v
          ON v.id::text = r.vehicle_id::text
          OR v.plate    = r.vehicle_id
        LEFT JOIN drivers drv
          ON drv.id::text = r.driver_id::text
        ORDER BY ri.invoice_id, ri.created_at DESC
      ),
      -- Búsqueda de placa/conductor por despacho: dispatch_assignments → assignments → vehicles
      dispatch_truck AS (
        SELECT DISTINCT ON (da.invoice_id)
          da.invoice_id,
          COALESCE(v2.plate, '')            AS truck_plate,
          COALESCE(drv2.document_number, '') AS driver_doc
        FROM dispatch_assignments da
        LEFT JOIN assignments asgn
          ON asgn.driver_id::text = da.driver_id::text
        LEFT JOIN vehicles v2   ON v2.id::text  = asgn.vehicle_id::text
        LEFT JOIN drivers  drv2 ON drv2.id::text = da.driver_id::text
        ORDER BY da.invoice_id, da.created_at DESC
      )
      SELECT DISTINCT
        b.inv_key      AS "DOCUMENT_ID",
        b.truck_origin AS "TRUCK_ID_ORIGIN",
        b.load_id      AS "LOAD_ID",
        -- Prioridad de fuente Atómica: Si hay Ruta (rt), se toma todo de rt.
        -- Si no hay, se intenta con Despacho (dt). Nunca mezclar columnas de fuentes distintas.
        CASE 
          WHEN NULLIF(rt.truck_plate, '') IS NOT NULL THEN rt.truck_plate
          WHEN NULLIF(dt.truck_plate, '') IS NOT NULL THEN dt.truck_plate
          ELSE ''
        END AS "TRUCK_ID_DESTIN",
        
        CASE 
          WHEN NULLIF(rt.truck_plate, '') IS NOT NULL THEN 
            COALESCE(NULLIF(rt.driver_doc, ''), NULLIF(curr.driver_doc, ''), '')
          WHEN NULLIF(dt.truck_plate, '') IS NOT NULL THEN 
            COALESCE(NULLIF(dt.driver_doc,''), '')
          ELSE ''
        END AS "DRIVER_ID_DESTIN"

      FROM base b
      LEFT JOIN route_truck rt ON (
        TRIM(rt.invoice_id) = TRIM(b.compound_id)
        OR TRIM(rt.invoice_id) = TRIM(b.inv_key)
      )
      LEFT JOIN dispatch_truck dt ON (
        TRIM(dt.invoice_id) = TRIM(b.compound_id)
        OR TRIM(dt.invoice_id) = TRIM(b.inv_key)
      )
      LEFT JOIN (
        SELECT DISTINCT ON (v.plate) v.plate, d.document_number AS driver_doc
        FROM assignments a
        JOIN vehicles v ON a.vehicle_id::text = v.id::text
        JOIN drivers d ON a.driver_id::text = d.id::text
        WHERE a.is_active = true
        ORDER BY v.plate, a.created_at DESC
      ) curr ON curr.plate = rt.truck_plate OR curr.plate = dt.truck_plate
      ORDER BY b.load_id, b.inv_key
      LIMIT 10000
    `, [docParam, plateParam]);


    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-MASTERSUITE-ERR]', err.message);
    res.status(500).json({ error: 'Error al generar informe Mastersuite' });
  }
};

// ─── Editar count_2 de un item consolidado (solo si hay diferencia) ───────────
export const updateConsolidatedCount2 = async (req: any, res: Response) => {
  const { docId, articleId, newCount2, observation } = req.body;
  if (!docId || !articleId || newCount2 === undefined || newCount2 === null) {
    return res.status(400).json({ error: 'Faltan parámetros: docId, articleId, newCount2' });
  }
  if (!observation || !String(observation).trim()) {
    return res.status(400).json({ error: 'La observación es obligatoria al modificar el conteo' });
  }
  const user = req.user?.name || req.user?.email || 'Sistema';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Leer estado actual del consolidado
    const current = await client.query(
      'SELECT count_2, document_id, inventory_observation FROM document_consolidated_items WHERE document_id = $1::text AND article_id = $2::text',
      [String(docId), String(articleId)]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item consolidado no encontrado' });
    }
    const oldCount2 = Number(current.rows[0].count_2 || 0);
    const oldObservation = current.rows[0].inventory_observation || '';
    const delta = Number(newCount2) - oldCount2;

    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const appendText = `${String(observation).trim()} (${user} - ${formattedDate})`;
    const finalObservation = oldObservation ? `${oldObservation} | ${appendText}` : appendText;

    // Actualizar consolidado con observación concatenada
    await client.query(
      `UPDATE document_consolidated_items
       SET count_2 = $1::numeric, inventory_observation = $2::text, inventory_user = $3::text
       WHERE document_id = $4::text AND article_id = $5::text`,
      [Number(newCount2), finalObservation, user, String(docId), String(articleId)]
    );

    // Garantizar que la tabla exista (Creación "Lazy") antes de insertar
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_conciliation_logs (
          id SERIAL PRIMARY KEY,
          document_id VARCHAR(255) NOT NULL,
          article_id VARCHAR(255) NOT NULL,
          old_count_2 NUMERIC,
          new_count_2 NUMERIC,
          observation TEXT,
          changed_by VARCHAR(255),
          changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insertar el log limpio estructurado en la nueva tabla
    await client.query(
      `INSERT INTO inventory_conciliation_logs (document_id, article_id, old_count_2, new_count_2, observation, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [String(docId), String(articleId), oldCount2, Number(newCount2), String(observation).trim(), user]
    );

    // Ajustar inventario_clientes con delta (suma o resta)
    if (delta !== 0) {
      const docInfo = await client.query(
        'SELECT client_id FROM documents_l WHERE id = $1', [docId]
      );
      if (docInfo.rows.length > 0) {
        const clientId = docInfo.rows[0].client_id;
        const batchRes = await client.query(
          'SELECT batch FROM document_items WHERE document_id = $1::text AND article_id = $2::text LIMIT 1',
          [String(docId), String(articleId)]
        );
        const batch = batchRes.rows[0]?.batch || 'S/L';
        await client.query(
          `UPDATE inventario_clientes
           SET quantity = GREATEST(0, quantity::numeric + $1::numeric), last_user = $2, last_updated = CURRENT_TIMESTAMP
           WHERE client_id = $3::text AND article_id = $4::text AND batch = $5::text`,
          [delta, user, clientId, String(articleId), batch]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, oldCount2, newCount2: Number(newCount2), delta });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-UPD-COUNT2-ERR]', err.message);
    res.status(500).json({ error: 'Error al actualizar conteo: ' + err.message });
  } finally {
    client.release();
  }
};

// ─── Parse PDF: extrae remisiones/facturas via Gemini Vision AI ──────────────
const PDF_FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

export const parsePdfRemisiones = async (req: any, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún PDF' });

    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const apiKey = rawKeys.split(',').map((k: string) => k.trim()).find((k: string) => k.length > 0);
    if (!apiKey) return res.status(500).json({ error: 'No hay API key de Gemini configurada' });

    const pdfBase64 = req.file.buffer.toString('base64');
    const prompt = `Eres un motor OCR de logística. Analiza este PDF y extrae TODOS los códigos de remisión/factura.
Los códigos tienen el patrón: 2-5 letras mayúsculas seguidas de 5 o más dígitos (ejemplos: AFE7604474, TRF12345, REM98765).
Responde ÚNICAMENTE con un JSON estricto sin formato markdown:
{"remisiones": ["AFE7604474", "TRF12345"]}
Si no encuentras ninguno, responde: {"remisiones": []}`;

    const primaryModel = process.env.AI_MODEL || 'gemini-1.5-flash';
    const modelsToTry = [primaryModel, ...PDF_FALLBACK_MODELS.filter(m => m !== primaryModel)];

    let lastError: any;
    for (const modelName of modelsToTry) {
      try {
        console.log(`[M7-PARSE-PDF] Intentando con modelo: ${modelName}`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
          { text: prompt },
          { inlineData: { data: pdfBase64, mimeType: 'application/pdf' } },
        ]);

        const textResponse = result.response.text().trim();
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Gemini no devolvió JSON válido: ' + textResponse.substring(0, 200));

        const parsed = JSON.parse(jsonMatch[0]);
        const remisiones: string[] = [...new Set(
          (parsed.remisiones || []).map((r: string) => r.toUpperCase().trim()).filter(Boolean)
        )] as string[];

        console.log(`[M7-PARSE-PDF] Modelo ${modelName} — ${remisiones.length} remisiones encontradas:`, remisiones);
        return res.json({ success: true, remisiones });
      } catch (err: any) {
        const errStr = (err.toString() + (err.message || '')).toLowerCase();
        const isRetryable = errStr.includes('503') || errStr.includes('unavailable') || errStr.includes('overloaded') || errStr.includes('429');
        lastError = err;
        console.warn(`[M7-PARSE-PDF] Modelo ${modelName} falló (${isRetryable ? 'reintentable' : 'fatal'}):`, err.message);
        if (!isRetryable) break; // error no recuperable, no seguir intentando
      }
    }

    console.error('[M7-PARSE-PDF-ERR] Todos los modelos fallaron:', lastError?.message);
    res.status(500).json({ error: 'Servicio de IA temporalmente no disponible. Intente de nuevo en unos segundos.' });
  } catch (err: any) {
    console.error('[M7-PARSE-PDF-ERR]', err.message);
res.status(500).json({ error: 'Error al procesar el PDF: ' + err.message });
  }
};

export const getConciliationHistory = async (req: any, res: Response) => {
  const { docId, articleId } = req.params;
  try {
    const result = await pool.query(
      `SELECT old_count_2, new_count_2, observation, changed_by, changed_at
       FROM inventory_conciliation_logs
       WHERE document_id = $1 AND article_id = $2
       ORDER BY changed_at DESC`,
      [docId, articleId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    if (err.code === '42P01') {
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ error: err.message });
  }
};

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const uploadCumplido = async (req: Request, res: Response) => {
    const { clientId, clientName, uploadDate } = req.body;
    const files = req.files as Express.Multer.File[];
    const userId = (req as any).user?.id;

    if (!files || files.length === 0 || !clientId || !clientName) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (archivos, cliente)' });
    }

    const results: any[] = [];
    const ref = uploadDate ? new Date(`${uploadDate}T12:00:00`) : new Date();
    const year = ref.getFullYear();
    const month = MESES[ref.getMonth()].toUpperCase();
    const day = `DIA ${ref.getDate()}`;
    const cleanClientName = clientName.replace(/[^a-zA-Z0-9 ()-]/g, '').trim();
    const drivePath = `CUMPLIDOS MILLA 7/${year}/${cleanClientName}/${month}/${day}`;

    try {
        const clientRes = await pool.query('SELECT name, client_type FROM clients WHERE id = $1', [clientId]);
        const isNational = clientRes.rows[0]?.client_type === 'NACIONAL';
        const fullClientName = clientRes.rows[0]?.name || clientName;

        for (const file of files) {
            const timestamp = Date.now();
            const safeOriginalName = file.originalname.replace(/\s+/g, '_');
            const tmpPath = path.join('/tmp', `cumplido_${timestamp}_${safeOriginalName}`);
            const compressedPath = `${tmpPath}_compressed.pdf`;
            const fileName = `${timestamp}_${safeOriginalName}`;

            fs.writeFileSync(tmpPath, file.buffer);

            await new Promise<void>((resolve) => {
                const compressCmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${compressedPath}" "${tmpPath}"`;
                exec(compressCmd, (err) => {
                    if (err) console.error(`[CUMPLIDOS] Error comprimiendo ${file.originalname}:`, err);
                    resolve();
                });
            });

            const finalFile = fs.existsSync(compressedPath) ? compressedPath : tmpPath;

            await new Promise<void>((resolve, reject) => {
                const uploadCmd = `rclone copyto "${finalFile}" "gdrive_cumplidos:${drivePath}/${fileName}"`;
                exec(uploadCmd, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`[CUMPLIDOS] Error rclone subiendo ${file.originalname}:`, stderr);
                        reject(err);
                    } else resolve();
                });
            });

            const driveLink = await new Promise<string>((resolve) => {
                const linkCmd = `rclone link "gdrive_cumplidos:${drivePath}/${fileName}"`;
                exec(linkCmd, (err, stdout) => resolve(stdout ? stdout.trim() : ''));
            });

            await pool.query(
                `INSERT INTO document_drive_logs (user_id, client_id, file_name, drive_path, drive_link, category, folder_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [userId, clientId, fileName, drivePath, driveLink, 'CUMPLIDOS', uploadDate || null]
            );

            results.push({ fileName, link: driveLink });

            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
        }

        if (isNational) {
            const [notifRes, userRes] = await Promise.all([
                pool.query(
                    `SELECT notification_email FROM notificaciones
                     WHERE tipo_notificacion_id = 'TGN-02' AND status_id = 'EST-01'`
                ),
                pool.query('SELECT name FROM users WHERE id = $1', [userId]),
            ]);

            const emailList = notifRes.rows.map((r: any) => r.notification_email).filter(Boolean);
            if (emailList.length > 0) {
                const uploaderName = userRes.rows[0]?.name || userId;
                const colombiaTime = new Date().toLocaleString('es-CO', {
                    timeZone: 'America/Bogota',
                    dateStyle: 'full',
                    timeStyle: 'short',
                });

                const subject = `[M7 CUMPLIDOS] ${fullClientName} — ${results.length} soporte(s) cargado(s)`;
                const html = `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
                        <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px;border-radius:12px 12px 0 0;">
                            <h2 style="color:white;margin:0;font-size:20px;">&#128196; Carga Masiva de Cumplidos</h2>
                            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Orbit M7 &middot; Gestión Documental</p>
                        </div>
                        <div style="background:#f8fafc;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                            <p>Se han cargado <b>${results.length}</b> archivos para el cliente <b>${fullClientName}</b>.</p>
                            <p><b>Usuario:</b> ${uploaderName}<br><b>Fecha:</b> ${colombiaTime}</p>
                            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
                            <div style="text-align:center;">
                                <a href="https://orbitm7.m7apps.com/cumplidos" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">Ver Trazabilidad en Orbit &rarr;</a>
                            </div>
                        </div>
                    </div>
                `;
                await sendEmail(emailList, subject, html).catch(() => {});
            }
        }

        res.json({
            message: `${results.length} cumplido(s) subido(s) exitosamente`,
            results
        });

    } catch (err) {
        console.error('[CUMPLIDOS] Global error:', err);
        res.status(500).json({ error: 'Error interno al procesar la carga múltiple' });
    }
};

export const getDocumentStats = async (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo, clientId, userId, search, folderDate } = req.query;
        const params: any[] = [];
        const conditions: string[] = [];

        if (!dateFrom && !dateTo && !search && !clientId) {
            conditions.push("d.upload_date >= NOW() - INTERVAL '48 hours'");
        }

        if (dateFrom) {
            params.push(dateFrom);
            conditions.push(`d.upload_date::date >= $${params.length}::date`);
        }
        if (dateTo) {
            params.push(dateTo);
            conditions.push(`d.upload_date::date <= $${params.length}::date`);
        }
        if (clientId) {
            params.push(clientId);
            conditions.push(`d.client_id = $${params.length}`);
        }
        if (userId) {
            params.push(userId);
            conditions.push(`d.user_id = $${params.length}`);
        }
        if (folderDate) {
            params.push(folderDate);
            conditions.push(`d.folder_date = $${params.length}::date`);
        }
        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(d.file_name ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
            `SELECT 
                d.id, 
                d.file_name as "fileName", 
                d.drive_path as "drivePath", 
                d.drive_link as "driveLink", 
                d.upload_date as "uploadDate", 
                d.folder_date as "folderDate",
                c.name as "clientName",
                c.client_type as "clientType",
                u.name as "userName",
                d.user_id as "userId"
             FROM document_drive_logs d
             LEFT JOIN clients c ON d.client_id = c.id
             LEFT JOIN users u ON d.user_id = u.id
             ${where}
             ORDER BY d.upload_date DESC
             LIMIT 500`,
            params
        );
        res.json(result.rows);
    } catch (err: any) {
        if (err.code === '42P01') return res.json([]); // tabla no existe aún
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};
