import { Router, Request, Response } from 'express';
import pool from '../config/database.js';
import { requirePermission } from '../middleware/auth.middleware.js';


const router = Router();

// ─── ENDPOINT: BACKUP COMPLETO DE ALL TABLES ─────────────────────────────────
// GET /api/admin/backup  → descarga un .sql con los INSERT de todas las tablas
router.get('/backup', requirePermission('BACKUP', 'view'), async (req: Request, res: Response) => {

  const client = await pool.connect();
  try {
    // Tablas a exportar (en orden para respetar FK)
    const TABLES = [
      'estados', 'tipos_documento', 'marcas', 'tipos_vehiculo', 'unidades_medida',
      'tipos_notificacion', 'roles', 'modules', 'pages', 'clients', 'users',
      'master_records', 'articles', 'drivers', 'vehicles', 'assignments',
      'notificaciones', 'routes', 'documents_l', 'document_items',
      'user_permissions', 'role_permissions',
      'picking_assignments', 'dispatch_assignments', 'delivery_confirmations',
      'delivery_returns', 'delivery_return_items', 'route_invoices',
      'digital_signatures', 'vehicle_locations'
    ];

    let sql = `-- M7 LOGISTICS - BACKUP COMPLETO\n-- Generado: ${new Date().toISOString()}\n-- Entorno: LOCAL\n\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n\n`;

    for (const table of TABLES) {
      try {
        const { rows } = await client.query(`SELECT * FROM ${table} ORDER BY id LIMIT 5000`);
        if (rows.length === 0) continue;

        sql += `\n-- ============================================================\n`;
        sql += `-- TABLE: ${table} (${rows.length} registros)\n`;
        sql += `-- ============================================================\n`;
        sql += `TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;\n`;

        const columns = Object.keys(rows[0]);
        sql += `INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES\n`;

        const valueRows = rows.map(row => {
          const vals = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
            if (typeof val === 'number') return val.toString();
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return `'${val.toString().replace(/'/g, "''")}'`;
          });
          return `  (${vals.join(', ')})`;
        });

        sql += valueRows.join(',\n');
        sql += `\nON CONFLICT (id) DO UPDATE SET `;
        sql += columns.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
        sql += `;\n`;
      } catch (tableErr: any) {
        sql += `-- SKIP: ${table} (${tableErr.message})\n`;
      }
    }

    const filename = `m7_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql`;
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sql);

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

export default router;
