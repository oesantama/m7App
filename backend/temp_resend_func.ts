
export const resendInventoryNotification = async (req: Request, res: Response) => {
    const { docId, targetEmail } = req.body;

    if (!docId || !targetEmail) {
        return res.status(400).json({ success: false, error: "Faltan datos requeridos (docId, targetEmail)" });
    }

    const client = await pool.connect();
    try {
        // 1. Obtener Info del Documento
        const docRes = await client.query('SELECT * FROM documents_l WHERE id = $1', [docId]);
        if (docRes.rowCount === 0) {
            return res.status(404).json({ success: false, error: "Documento no encontrado" });
        }
        const docL = docRes.rows[0];

        // 2. Obtener Ítems Consolidados para el reporte
        const itemsRes = await client.query(`
      SELECT 
        dci.*, 
        a.name as article_name,
        dci.inventory_note as inventory_note
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

        // Usamos itemsWithDiscrepancies si hay, sino todos (igual que el original logic parece sugerir, 
        // pero el original mostraba 'tableRows' basado en if(hasDiscrepancies). 
        // Si queremos reporte completo siempre en reenvío, podemos cambiarlo.
        // Asumiremos lógica original: Si hay novedades, muestra solo novedades. Si no, muestra todo.
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
