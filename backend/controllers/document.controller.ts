
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getDocuments = async (req: Request, res: Response) => {
  try {
    // REPARACIÓN INTEGRAL: Asegurar tablas y columnas críticas
    await pool.query('CREATE TABLE IF NOT EXISTS documents_l (id TEXT PRIMARY KEY, client_id TEXT, external_doc_id TEXT, status TEXT DEFAULT \'PENDIENTE\', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);');
    await pool.query('CREATE TABLE IF NOT EXISTS document_items (id SERIAL PRIMARY KEY, document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE, article_id TEXT, expected_qty NUMERIC DEFAULT 0);');

    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS plan_type TEXT;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS inventory_notes TEXT;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS inventory_user TEXT;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS inventory_date TIMESTAMP WITH TIME ZONE;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS vehicle_plate TEXT;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS picking_date TIMESTAMP WITH TIME ZONE;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS receiving_date TIMESTAMP WITH TIME ZONE;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS picker_user TEXT;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS deliverer_user TEXT;');
    await pool.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS receiver_user TEXT;');

    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC DEFAULT 0;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS invoice TEXT;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS city TEXT;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS address TEXT;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS volume NUMERIC DEFAULT 0;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS neighborhood TEXT DEFAULT \'\';');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS unit_volume TEXT;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS batch TEXT DEFAULT \'S/L\';');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS peso NUMERIC DEFAULT 0;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS un_code TEXT DEFAULT \'\';');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS client_ref TEXT DEFAULT \'\';');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS item_status TEXT DEFAULT \'Pendiente\';');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS count_1 NUMERIC DEFAULT 0;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS count_2 NUMERIC DEFAULT 0;');
    await pool.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS notes TEXT;');

    await pool.query(`
      DO $$ BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_doc_art_inv') THEN 
          ALTER TABLE document_items ADD CONSTRAINT unq_doc_art_inv UNIQUE (document_id, article_id, invoice, order_number); 
        END IF; 
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_consolidated_items (
        id SERIAL PRIMARY KEY,
        document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE,
        article_id TEXT,
        expected_qty NUMERIC DEFAULT 0,
        count_1 NUMERIC DEFAULT 0,
        count_2 NUMERIC DEFAULT 0,
        inventory_user TEXT,
        inventory_observation TEXT,
        picked_qty NUMERIC DEFAULT 0,
        dispatched_qty NUMERIC DEFAULT 0,
        UNIQUE(document_id, article_id)
      );
    `);

    // Crear tabla de inventario real por cliente si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventario_clientes (
        id SERIAL PRIMARY KEY,
        client_id TEXT NOT NULL,
        article_id TEXT NOT NULL,
        batch TEXT DEFAULT 'S/L',
        quantity NUMERIC DEFAULT 0,
        last_user TEXT,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(client_id, article_id, batch)
      );
    `);

    // Asegurar que exista el tipo de notificación EMAIL (Normalizado)
    await pool.query(`
      -- Corrección de Tipografía en Categorías
      UPDATE master_records SET category = 'masterTipoNotificacion' WHERE category = 'masterTIpoNotificacion';
      -- Corrección de Referencias en Páginas (parent_id apunta al módulo/categoría)
      UPDATE master_records SET parent_id = 'masterTipoNotificacion' WHERE parent_id = 'masterTIpoNotificacion';
      -- Corrección de Referencias en Módulos (si el ID del módulo tuviera el typo)
      UPDATE master_records SET id = 'masterTipoNotificacion' WHERE id = 'masterTIpoNotificacion';
    `);

    await pool.query(`
      INSERT INTO master_records (id, category, name, status_id)
      VALUES ('TGN-EMAIL', 'masterTipoNotificacion', 'EMAIL', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO master_records (id, category, name, status_id)
      VALUES ('TGN-WA', 'masterTipoNotificacion', 'WHATSAPP', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    // SANEAMIENTO: Limpiar duplicados en consolidados
    await pool.query(`
      DELETE FROM document_consolidated_items a USING (
        SELECT MIN(ctid) as ctid, document_id, article_id
        FROM document_consolidated_items 
        GROUP BY document_id, article_id HAVING COUNT(*) > 1
      ) b
      WHERE a.document_id = b.document_id 
      AND a.article_id = b.article_id 
      AND a.ctid <> b.ctid;
    `);

    // RESTRICCIÓN CRÍTICA
    await pool.query(`
      DO $$ BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_doc_art_consolidated') THEN 
          ALTER TABLE document_consolidated_items ADD CONSTRAINT unq_doc_art_consolidated UNIQUE (document_id, article_id); 
        END IF; 
      END $$;
    `);

    const { clientId } = req.query;
    let query = `
      SELECT d.*, 
      plan_type as "planType",
      inventory_notes as "inventoryNotes",
      external_doc_id as "externalDocId",
      vehicle_plate as "vehicleData",
      inventory_user as "inventoryUser",
      inventory_date as "inventoryDate",
      (SELECT json_agg(i.*) FROM document_items i WHERE i.document_id = d.id) as items,
      (SELECT json_agg(c.*) FROM document_consolidated_items c WHERE c.document_id = d.id) as "consolidatedItems"
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

    // AUTO-CORRECCIÓN: Asegurar columnas críticas
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS inventory_observation TEXT;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS inventory_notes TEXT;');
    await client.query('ALTER TABLE articles ADD COLUMN IF NOT EXISTS uom_std TEXT DEFAULT \'und\';');
    await client.query('ALTER TABLE articles ADD COLUMN IF NOT EXISTS factor_std NUMERIC DEFAULT 1;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS count_1 NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS count_2 NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS inventory_user TEXT;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS inventory_observation TEXT;');
    await client.query('ALTER TABLE master_records ADD COLUMN IF NOT EXISTS tipo_notificacion_id TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS count_1 NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS count_2 NUMERIC DEFAULT 0;');

    // RESTRICCIÓN CRÍTICA PARA UPSERT
    await client.query(`
      DELETE FROM document_consolidated_items a USING (
        SELECT MIN(ctid) as ctid, document_id, article_id
        FROM document_consolidated_items 
        GROUP BY document_id, article_id HAVING COUNT(*) > 1
      ) b
      WHERE a.document_id = b.document_id 
      AND a.article_id = b.article_id 
      AND a.ctid <> b.ctid;
    `);

    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_doc_art_consolidated') THEN 
          ALTER TABLE document_consolidated_items ADD CONSTRAINT unq_doc_art_consolidated UNIQUE (document_id, article_id); 
        END IF; 
      END $$;
    `);

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
            INSERT INTO articles (id, sku, name, client_id, uom_std, factor_std, status_id)
            VALUES ($1, $1, $2, $3, 'und', 1, 'EST-01')
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

    // 3. Actualizar DETALLE (Solo estado y notas)
    for (const item of items) {
      await client.query(`
        UPDATE document_items 
        SET item_status = $1, notes = $2, batch = $3, count_1 = $4, count_2 = $5
        WHERE document_id = $6 AND article_id = $7
      `, [
        newStatus,
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
          ? `⚠️ NOVEDADES EN RECIBO: ${docL.externalDocId} [${docL.vehicleData || 'S/V'}]`
          : `✅ RECIBO CONFORME: ${docL.externalDocId} [${docL.vehicleData || 'S/V'}]`;

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
              <div class="logo">MILLA SIETE</div>
              <div class="subtitle">Confirmación de Recibo Auditoría</div>
            </div>
            
            <div class="info-box">
               <div class="info-grid">
                  <div class="info-item">
                    <div class="info-label">Documento / Placa</div>
                    <div class="info-value">${docL.externalDocId} <span style="color:#94a3b8;">[${docL.vehicleData || 'S/V'}]</span></div>
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
          await pool.query(`
                INSERT INTO master_records (id, category, name, description, notification_email, tipo_notificacion_id, status_id)
                VALUES ($1, 'masterNotificaciones', 'LOG_INVENTARIO', $2, $3, $4, 'EST-01')
            `, [notifLogId, `RECIBO ${docL.externalDocId} - ${hasDiscrepancies ? 'CON NOVEDADES' : 'OK'}`, targetEmail, tipoId]);
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
    // AUTO-CORRECCIÓN Esquema en Bulk (REPARACIÓN EXHAUSTIVA)
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS plan_type TEXT;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS inventory_notes TEXT;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS picking_date TIMESTAMP WITH TIME ZONE;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS receiving_date TIMESTAMP WITH TIME ZONE;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS picker_user TEXT;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS deliverer_user TEXT;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS receiver_user TEXT;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS codplan TEXT;');
    await client.query('ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMP WITH TIME ZONE;');

    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS inventory_user TEXT;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS inventory_observation TEXT;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS expected_qty NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS count_1 NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS count_2 NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS picked_qty NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_consolidated_items ADD COLUMN IF NOT EXISTS dispatched_qty NUMERIC DEFAULT 0;');

    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS order_number TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS unit TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS invoice TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS volume NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS unit_volume TEXT DEFAULT \'0\';');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS city TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS address TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS observation TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS batch TEXT DEFAULT \'S/L\';');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS peso NUMERIC DEFAULT 0;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS un_code TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS client_ref TEXT;');
    await client.query('ALTER TABLE document_items ADD COLUMN IF NOT EXISTS item_status TEXT DEFAULT \'Pendiente\';');

    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_doc_art_inv') THEN 
          ALTER TABLE document_items ADD CONSTRAINT unq_doc_art_inv UNIQUE (document_id, article_id, invoice, order_number); 
        END IF; 
      END $$;
    `);

    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_doc_art_consolidated') THEN 
          ALTER TABLE document_consolidated_items ADD CONSTRAINT unq_doc_art_consolidated UNIQUE (document_id, article_id); 
        END IF; 
      END $$;
    `);

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
        for (const item of doc.items) {
          await client.query(`
            INSERT INTO document_items (document_id, article_id, expected_qty, received_qty, order_number, unit, invoice, volume, unit_volume, city, address, observation, batch, peso, un_code, client_ref)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT ON CONSTRAINT unq_doc_art_inv DO UPDATE SET
            expected_qty = document_items.expected_qty + EXCLUDED.expected_qty,
            unit = EXCLUDED.unit,
            volume = EXCLUDED.volume,
            unit_volume = EXCLUDED.unit_volume,
            city = EXCLUDED.city,
            address = EXCLUDED.address,
            observation = EXCLUDED.observation,
            batch = EXCLUDED.batch,
            peso = EXCLUDED.peso,
            un_code = EXCLUDED.un_code,
            client_ref = EXCLUDED.client_ref
          `, [
            doc.id,
            item.articleId?.trim().toUpperCase(),
            item.expectedQty || 0,
            item.receivedQty || 0,
            item.orderNumber || 'S/I',
            item.unit || 'und',
            item.invoice || 'S/I',
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

      // Insertar Consolidado (Auditoría)
      if (doc.consolidatedItems && doc.consolidatedItems.length > 0) {
        for (const item of doc.consolidatedItems) {
          await client.query(`
              INSERT INTO document_consolidated_items (document_id, article_id, expected_qty, count_1, count_2, picked_qty, dispatched_qty, inventory_observation)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (document_id, article_id) DO UPDATE SET
              expected_qty = EXCLUDED.expected_qty,
              count_1 = EXCLUDED.count_1,
              count_2 = EXCLUDED.count_2
           `, [
            doc.id,
            item.articleId?.trim().toUpperCase(),
            item.expectedQty,
            item.count1 || 0,
            item.count2 || 0,
            item.pickedQty || 0,
            item.dispatchedQty || 0,
            item.inventoryObservation || item.observation || ''
          ]);
        }
      } else if (doc.items && doc.items.length > 0) {
        // Fallback: Si no viene consolidado explícito, crearlo desde items (para plan normal que igual necesita auditoría)
        for (const item of doc.items) {
          // Chequear si ya existe para no duplicar en re-cargas parciales sin conflicto definido
          // Mejor DELETE previo o Upsert?
          // Dado que consolidado no tiene unique constraint complejo, asumimos carga limpia o verificar
          // Por simplicidad en este paso, insertamos directo, pero idealmente upsert por doc_id + art_id
          // Agregamos chequeo simple
          await client.query(`
               INSERT INTO document_consolidated_items (document_id, article_id, expected_qty, inventory_observation)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (document_id, article_id) DO UPDATE SET
               expected_qty = EXCLUDED.expected_qty
            `, [doc.id, item.articleId, item.expectedQty, item.observation || '']);
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
    // Obtener facturas únicas (agrupadas por invoice, city, address) que estén pendientes
    // Se asume que item_status 'Pendiente' indica que no ha sido ruteada
    const { clientId, ids } = req.query;
    let query = `
      SELECT 
        CONCAT(document_items.document_id, '_', COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number)) as id,
        COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number) as "invoiceNumber",
        MAX(document_items.order_number) as "orderNumber",
        STRING_AGG(DISTINCT document_items.observation, '. ') as "notes",
        documents_l.external_doc_id as "externalDocId",
        document_items.city,
        document_items.neighborhood,
        document_items.address,
        document_items.address as "customerName", -- Proxy if not available
        SUM(document_items.expected_qty) as "totalItems",
        SUM(document_items.volume) as "volumeM3",
        SUM(document_items.peso) as "invoiceValue",
        document_items.document_id as "docLId",
        documents_l.client_id as "clientId", -- Importante para filtrado por cliente
        documents_l.codplan as "codplan",
        documents_l.plan_type as "planType",
        MAX(document_items.item_status) as "status",
        CASE 
          WHEN document_items.city ILIKE '%MEDELLIN%' OR document_items.city ILIKE '%MEDELLÍN%' OR document_items.city ILIKE '%ANTIOQUIA%' THEN 6.2442
          WHEN document_items.city ILIKE '%CALI%' OR document_items.city ILIKE '%VALLE%' THEN 3.4516
          WHEN document_items.city ILIKE '%BARRANQUILLA%' OR document_items.city ILIKE '%ATLANTICO%' OR document_items.city ILIKE '%ATLÁNTICO%' THEN 10.9685
          WHEN document_items.city ILIKE '%CARTAGENA%' OR document_items.city ILIKE '%BOLIVAR%' THEN 10.3910
          WHEN document_items.city ILIKE '%BUCARAMANGA%' OR document_items.city ILIKE '%SANTANDER%' THEN 7.1193
          WHEN document_items.city ILIKE '%PEREIRA%' OR document_items.city ILIKE '%RISARALDA%' THEN 4.8133
          WHEN document_items.city ILIKE '%MANIZALES%' OR document_items.city ILIKE '%CALDAS%' THEN 5.0703
          WHEN document_items.city ILIKE '%ARMENIA%' OR document_items.city ILIKE '%QUINDIO%' THEN 4.5339
          ELSE 4.6097 -- Default Bogotá
        END + (random() * 0.01 - 0.005) as lat,
        CASE 
          WHEN document_items.city ILIKE '%MEDELLIN%' OR document_items.city ILIKE '%MEDELLÍN%' OR document_items.city ILIKE '%ANTIOQUIA%' THEN -75.5812
          WHEN document_items.city ILIKE '%CALI%' OR document_items.city ILIKE '%VALLE%' THEN -76.5320
          WHEN document_items.city ILIKE '%BARRANQUILLA%' OR document_items.city ILIKE '%ATLANTICO%' OR document_items.city ILIKE '%ATLÁNTICO%' THEN -74.7713
          WHEN document_items.city ILIKE '%CARTAGENA%' OR document_items.city ILIKE '%BOLIVAR%' THEN -75.4794
          WHEN document_items.city ILIKE '%BUCARAMANGA%' OR document_items.city ILIKE '%SANTANDER%' THEN -73.1227
          WHEN document_items.city ILIKE '%PEREIRA%' OR document_items.city ILIKE '%RISARALDA%' THEN -75.6961
          WHEN document_items.city ILIKE '%MANIZALES%' OR document_items.city ILIKE '%CALDAS%' THEN -75.5138
          WHEN document_items.city ILIKE '%ARMENIA%' OR document_items.city ILIKE '%QUINDIO%' THEN -75.6811
          ELSE -74.0817 -- Default Bogotá
        END + (random() * 0.01 - 0.005) as lng
      FROM document_items
      LEFT JOIN documents_l ON document_items.document_id = documents_l.id
      WHERE 1=1
    `;

    const queryParams: any[] = [];

    // Si vienen IDs específicos (para ver detalle de ruta), filtramos por ellos e ignoramos el estado
    if (ids) {
      const idList = (ids as string).split(',').map(id => id.trim());
      // Asumiendo que el ID del frontend es user-friendly, pero en realidad es composite.
      // La mejor forma es filtrar por invoice OR order_number OR document_id
      // Pero el frontend manda 'ids' que son claves compuestas o UUIDs?
      // El frontend usa `invoice_ids` que son IDs de facturas (strings).
      // En el SELECT `id` es `CONCAT(...)`. Esto es complejo de igualar.
      // Vamos a asumir que los IDs que manda el frontend son los `id` generados por este mismo endpoint.
      // FIX: El `route.invoice_ids` guarda los IDs generados aqui??
      // Si, en RoutePlanner se seleccionan invoices obtenidos de aqui.
      // Entonces el ID es `docId_invoiceNum`.

      // Truco: Desarmar el ID o usar LIKE?
      // Mejor: Filtrar donde el CONCAT generado sea IN (lista)
      // Postgres permite filtrar por el resultado del select si usamos subquery o HAVING, pero aqui es WHERE.
      // Repetimos la logica del ID:
      query += ` AND CONCAT(document_items.document_id, '_', COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number)) = ANY($1::text[])`;
      queryParams.push(idList);
    } else {
      // Comportamiento normal (Solo pendientes)
      query += ` AND (
        (document_items.item_status IS NULL OR TRIM(UPPER(document_items.item_status)) NOT IN ('ELIMINADO', 'CANCELADO', 'ENTREGADO', 'FINALIZADO', 'ASIGNADO', 'EN RUTA', 'EN_RUTA'))
        AND (documents_l.status IS NULL OR UPPER(documents_l.status) IN ('PENDIENTE', 'AUDITADO', 'EN PROCESO'))
      )`;
    }

    query += ` AND (
        (document_items.invoice IS NOT NULL AND document_items.invoice != '')
        OR 
        (document_items.order_number IS NOT NULL AND document_items.order_number != '')
        OR
        (document_items.document_id IS NOT NULL)
      )
    `;

    /* 
      COMENTADO POR SOLICITUD DE USUARIO: 
      Los planes se cargan sin depender del cliente, el filtro bloquea la visibilidad.
    if (!ids && clientId && clientId !== 'undefined' && clientId !== 'null' && clientId !== 'all' && clientId !== '') {
       // ... existing client filter logic if needed ...
    }
    */

    query += ` GROUP BY 
        COALESCE(NULLIF(document_items.invoice, ''), document_items.order_number), 
        document_items.city, 
        document_items.neighborhood,
        document_items.address, 
        document_items.document_id, 
        documents_l.client_id, 
        documents_l.external_doc_id,
        documents_l.codplan,
        documents_l.plan_type
      ORDER BY "invoiceNumber" ASC`;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-INVOICES] Error:', err.message);
    res.status(500).json({ error: "Error al obtener facturas" });
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
