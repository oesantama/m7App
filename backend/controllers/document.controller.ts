
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getDocuments = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.query;
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
      (SELECT COUNT(*) FROM document_l_payments p WHERE p.document_id = d.id) as "paymentsCount",
      (SELECT json_agg(item_with_payment) FROM (
        SELECT i.*, 
               p.metodo_pago as "paymentMethod", 
               p.vmetodo as "paymentValue", 
               p.client_ref as "paymentRef",
               c.count_1 as "count1",
               c.count_2 as "count2",
               c.inventory_observation as "inventoryNote"
        FROM document_items i
        LEFT JOIN document_l_payments p ON i.document_id = p.document_id AND TRIM(UPPER(i.invoice)) = TRIM(UPPER(p.invoice))
        LEFT JOIN document_consolidated_items c ON i.document_id = c.document_id AND TRIM(UPPER(i.article_id)) = TRIM(UPPER(c.article_id))
        WHERE i.document_id = d.id
      ) item_with_payment) as items,
      (SELECT json_agg(item_mapped) FROM (
        SELECT article_id as "articleId", expected_qty as "expectedQty", count_1 as "count1", count_2 as "count2", 
               picked_qty as "pickedQty", dispatched_qty as "dispatchedQty", inventory_observation as "inventoryObservation"
        FROM document_consolidated_items WHERE document_id = d.id
      ) item_mapped) as "consolidatedItems"
      FROM documents_l d
      WHERE d.status != 'ELIMINADO'
    `;

    const queryParams: any[] = [];
    if (clientId) {
      query += ` AND d.client_id = $1`;
      queryParams.push(clientId);
    }

    query += ` ORDER BY d.created_at DESC`;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-GET-DOC-ERR]', err.message);
    res.status(500).json({ error: "Falla al obtener documentos", details: err.message });
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
    if (currentStatus === 'Inventariado' && !isPartial) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: "Documento ya finalizado" });
    }

    const docL = checkStatus.rows[0];
    const newStatus = isPartial ? 'Pendiente' : 'Inventariado';
    const inventoryDate = isPartial ? null : new Date();

    // 1. Actualizar Metadatos del Documento
    await client.query(`
      UPDATE documents_l 
      SET status = $1, inventory_date = COALESCE($2, inventory_date), inventory_user = $3, inventory_observation = $4, inventory_notes = $4
      WHERE id = $5
    `, [newStatus, inventoryDate, user, notes || '', docId]);

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

        // Auto-crear artículo si no existe (mismo comportamiento anterior)
        const artCheck = await client.query('SELECT 1 FROM articles WHERE UPPER(TRIM(id)) = $1', [artId]);
        if (artCheck.rows.length === 0) {
          await client.query(`
            INSERT INTO articles (id, name, client_id, uom_std, factor_std, status_id)
            VALUES ($1, $2, $3, 'und', 1, 'EST-01')
          `, [artId, `ARTÍCULO AUTO-CREADO: ${artId}`, clientId]);
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
    // Obtener expected_qty acumulado para este SKU en el documento (Casting explícito para evitar error 500 de pg)
    for (const sku in skuAggregates) {
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
      `, [docId, sku, Number(skuAggregates[sku].count1 || 0), Number(skuAggregates[sku].count2 || 0), user, skuAggregates[sku].observation || notes || '', expectedQty]);

      if (!isPartial) {
        await client.query(`
          INSERT INTO inventario_clientes (client_id, article_id, batch, quantity, last_user, last_updated)
          VALUES ($1::text, $2::text, $3::text, $4::numeric, $5::text, CURRENT_TIMESTAMP)
          ON CONFLICT (client_id, article_id, batch) DO UPDATE SET
          quantity = EXCLUDED.quantity,
          last_user = EXCLUDED.last_user,
          last_updated = CURRENT_TIMESTAMP
        `, [clientId, sku, skuAggregates[sku].batch, Number(skuAggregates[sku].count2 || 0), user]);
      }
    }

    // OBTENER CLIENTE DEL DOCUMENTO PARA EL INVENTARIO
    // const docInfo = await client.query('SELECT client_id FROM documents_l WHERE id = $1', [docId]);
    // const clientId = docInfo.rows[0].client_id;

    // 3. Actualizar DETALLE (Solo notas, batch y conteos - item_status NO se toca por solicitud del usuario)
    for (const item of items) {
      await client.query(`
        UPDATE document_items 
        SET notes = $1, batch = $2, count_1 = $3, count_2 = $4
        WHERE document_id = $5 AND article_id = $6
      `, [
        item.inventoryNote || '',
        item.batch || 'S/L',
        item.count1 || 0,
        item.count2 || item.countedQty || 0,
        docId,
        (item.articleId || '').trim().toUpperCase()
      ]);
    }

    await client.query('COMMIT');

    // 4. ENVÍO DE NOTIFICACIÓN INTELIGENTE (Solo si no es parcial / Cierre Final)
    if (!isPartial) {
      try {
        // A. Consultar ID de Tipo de Notificación desde 'inventario ajover'
        const configRes = await pool.query(`
          SELECT tipo_notificacion_id, notification_email 
          FROM master_records 
          WHERE name ILIKE 'inventario ajover' AND category = 'masterNotificaciones' 
          LIMIT 1
        `);

        const config = configRes.rows[0];
        const tipoId = config?.tipo_notificacion_id || 'TGN-EMAIL';
        const targetEmail = driverEmail || config?.notification_email;

        // B. Generar y Enviar Correo (Notificación Inteligente Ajover)
        const itemsWithDiscrepancies = items.filter((it: any) => {
          const counted = Number(it.count2 || it.countedQty || 0);
          const expected = Number(it.expectedQty || 0);
          const hasNote = it.inventoryNote && it.inventoryNote.trim() !== '';
          return counted !== expected || hasNote;
        });

        const hasDiscrepancies = itemsWithDiscrepancies.length > 0;
        const subject = hasDiscrepancies
          ? `⚠️ NOVEDADES EN RECIBO: ${docL.external_doc_id || docL.externalDocId} [${docL.vehicle_plate || docL.vehicleData || 'S/V'}]`
          : `✅ RECIBO CONFORME: ${docL.external_doc_id || docL.externalDocId} [${docL.vehicle_plate || docL.vehicleData || 'S/V'}]`;

        const tableRows = (hasDiscrepancies ? itemsWithDiscrepancies : items).map((it: any) => {
          const counted = Number(it.count2 || it.countedQty || 0);
          const expected = Number(it.expectedQty || 0);
          const diff = counted - expected;
          const diffColor = diff < 0 ? '#ef4444' : (diff > 0 ? '#f59e0b' : '#10b981');
          const diffPrefix = diff > 0 ? '+' : '';

          return `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px; font-size: 11px; color: #0f172a; font-weight: bold;">
                  ${it.articleId}
                  <div style="font-size: 9px; color: #94a3b8; font-weight: normal;">${it.unCode || '-'}</div>
                </td>
                <td style="padding: 12px; font-size: 10px; color: #64748b;">${it.clientRef || 'S/R'}</td>
                <td style="padding: 12px; font-size: 12px; color: #64748b; text-align: center;">${expected}</td>
                <td style="padding: 12px; font-size: 12px; color: #0f172a; font-weight: 900; text-align: center; background: #f8fafc;">${counted}</td>
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
                    <div class="info-label">Fecha Inicio</div>
                    <div class="info-value">${new Date(docL.created_at || new Date()).toLocaleString('es-CO')}</div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Fecha Cierre</div>
                    <div class="info-value">${new Date().toLocaleString('es-CO')}</div>
                  </div>
               </div>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Ref Cliente</th>
                    <th style="text-align: center;">Cant (Orig)</th>
                    <th style="text-align: center;">Cant (Inv)</th>
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

        if (targetEmail) {
          const { sendEmail } = await import('../services/notification.service.js');
          console.log(`[M7-NOTIF] Iniciando envío de correo a: ${targetEmail}`);
          await sendEmail(targetEmail, subject, html);

          // C. Registrar log
          const notifLogId = `NOT-${Date.now()}`;
          const notifTypeToSave = tipoId || 'TGN-EMAIL';

          await pool.query(`
                INSERT INTO master_records (id, category, name, description, notification_email, tipo_notificacion_id, status_id)
                VALUES ($1, 'masterNotificaciones', 'LOG_INVENTARIO', $2, $3, $4, 'EST-01')
            `, [notifLogId, `RECIBO ${docL.external_doc_id || docL.externalDocId} - ${hasDiscrepancies ? 'CON NOVEDADES' : 'OK'}`, targetEmail, notifTypeToSave]);

        }
      } catch (notifErr: any) {
        console.error('[M7-NOTIF-ERROR]', notifErr.message);
      }
    }

    res.json({ success: true, status: newStatus });
  } catch (err: any) {
    if (client) await client.query('ROLLBACK');
    console.error('-------------------------------------------');
    console.error('[M7-SYNC-FATAL-ERROR] Detalles del error:');
    console.error('Mensaje:', err.message);
    console.error('Stack:', err.stack);
    console.error('Data recibida:', { docId, user, isPartial, itemsCount: items?.length });
    console.error('-------------------------------------------');
    res.status(500).json({ error: "Error de sincronización", details: err.message, stack: err.stack });
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
        doc.status || 'Pendiente',
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
               INSERT INTO articles (id, name, client_id, uom_std, factor_std, status_id)
               VALUES ($1, $2, $3, 'und', 1, 'EST-01')
             `, [artId, `AUTO-CREATED ${artId}`, doc.clientId]);
            console.log(`[M7-AUTO] Artículo creado automáticamente: ${artId}`);
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

          if (existingItem.rowCount && existingItem.rowCount > 0) {
            // Acumular cantidad si ya existe
            await client.query(`
              UPDATE document_items SET
                expected_qty = expected_qty + $1,
                unit = $2, volume = $3, unit_volume = $4,
                city = $5, address = $6, observation = $7,
                batch = $8, peso = $9, un_code = $10, client_ref = $11
              WHERE document_id = $12 AND article_id = $13 AND invoice = $14
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
              doc.id, artId, invoice
            ]);
          } else {
            await client.query(`
              INSERT INTO document_items (document_id, article_id, expected_qty, received_qty, order_number, unit, invoice, volume, unit_volume, city, address, observation, batch, peso, un_code, client_ref)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
              item.clientRef || null
            ]);
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
              count_1 = EXCLUDED.count_1,
              count_2 = EXCLUDED.count_2,
              picked_qty = EXCLUDED.picked_qty,
              dispatched_qty = EXCLUDED.dispatched_qty,
              inventory_observation = EXCLUDED.inventory_observation
           `, [
            doc.id,
            articleId,
            item.expectedQty || 0,
            item.count1 || 0,
            item.count2 || 0,
            item.pickedQty || 0,
            item.dispatchedQty || 0,
            item.inventoryObservation || item.observation || ''
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
            `, [doc.id, articleId, item.expectedQty || 0, item.observation || '']);
        }
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, count: documents.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-DOC-BULK] Error:', err.message);
    res.status(500).json({ error: "Error en carga masiva", details: err.message });
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
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Error al actualizar estado" });
  }
};

export const getInvoices = async (req: Request, res: Response) => {
  try {
    const { clientId, ids, history, search, id, routeId } = req.query;
    const queryParams: any[] = [];
    
    const sqlIdGen = `CONCAT(TRIM(document_items.document_id), '_', TRIM(COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number, 'NA')))`;
    
    let query = `
      SELECT 
        ${sqlIdGen} as id,
        TRIM(COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number)) as "invoiceNumber",
        MAX(document_items.order_number) as "orderNumber",
        STRING_AGG(DISTINCT document_items.observation, '. ') as "notes",
        MAX(documents_l.external_doc_id) as "externalDocId",
        MAX(document_items.city) as city,
        MAX(document_items.neighborhood) as neighborhood,
        MAX(document_items.address) as address,
        MAX(document_items.address) as "customerName",
        SUM(document_items.expected_qty) as "totalItems",
        SUM(document_items.volume) as "volumeM3",
        document_items.document_id as "docLId",
        MAX(documents_l.client_id) as "clientId", 
        MAX(documents_l.codplan) as "codplan",
        MAX(documents_l.plan_type) as "planType",
        MAX(documents_l.vehicle_plate) as "plate",
        MAX(documents_l.status) as "status",
        MAX(da.id) as "dispatchId",
        MAX(da.status) as "dispatchStatus",
        MAX(pa.leader_id) as "pickerLeader",
        MAX(document_items.un_code) as "unCode",
        MAX(document_items.client_ref) as "clientRef",
        MAX(COALESCE(p.vmetodo::numeric, 0)) as "invoiceValue",
        MAX(p.metodo_pago) as "paymentMethod",
        JSON_AGG(JSON_BUILD_OBJECT(
          'sku', document_items.article_id,
          'qty', document_items.expected_qty,
          'receivedQty', document_items.received_qty,
          'articleName', COALESCE(articles.name, document_items.article_id),
          'unit', document_items.unit,
          'unCode', document_items.un_code,
          'clientRef', document_items.client_ref
        )) as "items",
        6.2518 as lat,
        -75.5636 as lng
      FROM document_items
      LEFT JOIN documents_l ON document_items.document_id = documents_l.id
      LEFT JOIN articles ON document_items.article_id = articles.id
      LEFT JOIN document_l_payments p ON (TRIM(UPPER(document_items.invoice)) = TRIM(UPPER(p.invoice)) AND document_items.invoice != '')
      LEFT JOIN dispatch_assignments da ON (
        da.invoice_id = TRIM(COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number))
        OR da.invoice_id = ${sqlIdGen}
      )
      LEFT JOIN picking_assignments pa ON (
        pa.invoice_id = TRIM(COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number))
        OR pa.invoice_id = ${sqlIdGen}
      )
      WHERE 1=1
    `;

    const user = (req as any).user;
    const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';

    if (clientId && clientId !== 'GLOBAL') {
      queryParams.push(clientId);
      query += ` AND documents_l.client_id = $${queryParams.length}`;
    }

    // [SECURITY FIX] Siempre filtrar por los clientes autorizados si no es Super Admin
    if (!isSuper) {
      const allowedIds = user?.client_ids || [];
      queryParams.push(allowedIds);
      query += ` AND documents_l.client_id = ANY($${queryParams.length}::text[])`;
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
         return `(
            REGEXP_REPLACE(COALESCE(document_items.invoice, ''), '\\s', '', 'g') = ${pIdx} 
            OR 
            REGEXP_REPLACE(COALESCE(document_items.order_number, ''), '\\s', '', 'g') = ${pIdx}
         )`;
      });
      if (orClauses.length > 0) query += ` AND (${orClauses.join(' OR ')})`;
    } else {
      query += ` AND (
        documents_l.status NOT IN ('Finalizado', 'Entregado', 'ELIMINADO') 
        OR documents_l.status IS NULL
      )`;
    }

    query += ` GROUP BY 
        ${sqlIdGen},
        document_items.document_id,
        TRIM(COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number))
      ORDER BY 2 ASC`;

    const result = await pool.query(query, queryParams);
    console.log(`[M7-SUCCESS] getInvoices: Enviando ${result.rows.length} facturas.`);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-CRITICAL-ERR] getInvoices:', err.message);
    res.status(500).json({ error: "Error al obtener facturas: " + err.message });
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

        // Insertar en la nueva tabla de pagos
        await client.query(`
          INSERT INTO document_l_payments (document_id, invoice, client_ref, un_code, metodo_pago, vmetodo, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (invoice) DO UPDATE SET
          metodo_pago = EXCLUDED.metodo_pago,
          vmetodo = EXCLUDED.vmetodo,
          processed_at = CURRENT_TIMESTAMP,
          user_id = EXCLUDED.user_id
        `, [
          documentId,
          pay.invoice,
          pay.clientRef,
          pay.unCode,
          pay.metodoPago,
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
    res.status(500).json({ error: "Error procesando pagos", details: err.message });
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
      SET status = 'ELIMINADO', 
          external_doc_id = external_doc_id || '_DEL_' || extract(epoch from now()),
          inventory_user = $1, 
          inventory_date = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [user, id]);

    // Opcional: También actualizar el item_status de los items para consistencia en ruteo
    await pool.query(`
      UPDATE document_items 
      SET item_status = 'ELIMINADO' 
      WHERE document_id = $1
    `, [id]);

    res.json({ success: true, message: "Documento eliminado correctamente" });
  } catch (err: any) {
    console.error('[M7-DELETE-DOC-ERR]', err.message);
    res.status(500).json({ error: "Falla al eliminar documento", details: err.message });
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
      ? `⚠️ REENVÍO NOVEDADES: ${docL.external_doc_id} [${docL.vehicle_plate || 'S/V'}]`
      : `✅ REENVÍO CONFORME: ${docL.external_doc_id} [${docL.vehicle_plate || 'S/V'}]`;

    const itemsToShow = hasDiscrepancies ? itemsWithDiscrepancies : items;

    const tableRows = itemsToShow.map((it: any) => {
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
            <td style="padding: 12px; font-size: 10px; color: #64748b;">${it.client_ref || 'S/R'}</td>
            <td style="padding: 12px; font-size: 12px; color: #64748b; text-align: center;">${expected}</td>
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
          <div class="logo">MILLA SIETE</div>
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
                <div class="info-label">Fecha Auditoría</div>
                <div class="info-value">${docL.inventory_date ? new Date(docL.inventory_date).toLocaleString('es-CO') : 'S/I'}</div>
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
                <th>Ref Cliente</th>
                <th style="text-align: center;">Cant (Orig)</th>
                <th style="text-align: center;">Cant (Inv)</th>
                <th style="text-align: center;">Dif</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <div style="margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 8px; color: #64748b; font-size: 10px; text-align: center;">
             Este es un reenvío manual del informe original. Los datos reflejan el estado del inventario al momento del cierre.
          </div>
        </div>

        <div class="footer">
          <p>Generado automáticamente por <strong>M7 Intelligence</strong> • ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
    `;

    // 4. Enviar Correo
    const { sendEmail } = await import('../services/notification.service.js');
    await sendEmail(targetEmail, subject, html);

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
