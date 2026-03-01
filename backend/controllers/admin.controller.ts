import { Request, Response } from 'express';
import pool from '../config/database.js';

// Middleware-like check (can be used inside controllers too for double safety)
// Middleware de validación robusta para Administrador
const isUserAdmin = (user: any) => {
  if (!user) return false;
  return user.email === 'admin@millasiete.com' || user.roleId === 'ROL-01' || user.role_id === 'ROL-01';
};

export const getTables = async (req: any, res: Response) => {
  try {
    const user = req.user; 
    // Security Check
    if (!isUserAdmin(user)) {
      return res.status(403).json({ error: "Acceso denegado. Solo admin." });
    }

    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    res.json(result.rows.map(r => r.table_name));
  } catch (err: any) {
    console.error('[ADMIN-GET-TABLES]', err.message);
    res.status(500).json({ error: "Error al obtener tablas" });
  }
};

export const getTableData = async (req: any, res: Response) => {
  const { tableName, page = 1, limit = 50, search = '', sortBy, sortOrder = 'ASC' } = req.body;
  const user = req.user;
  try {
    if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
    if (!tableName) return res.status(400).json({ error: "Nombre de tabla requerido" });

    // Partial cleanup
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Nombre de tabla inválido" });
    }

    const offset = (page - 1) * limit;
    let query = `SELECT * FROM ${tableName}`;
    let countQuery = `SELECT COUNT(*) as total FROM ${tableName}`;
    const params: any[] = [];

    // Simple textual search across all text columns? 
    // For now, let's keep it simple: if search is present, try to find it in ID or Name if they exist, 
    // or just return all if no columns match.
    // BETTER: Get columns first to know where to search.
    
    // Quick approach: Just LIMIT/OFFSET for now. 
    // To support generic search we need to know column types. 
    // Let's implement basic LIMIT/OFFSET first, and if search is provided, try to CAST all to text? 
    // Too risky for performance.
    // Alternative: Filter by ID if search looks like ID.
    
    if (search) {
       // Only safer way without schema introspection is strict equality on ID or partial match if we knew columns.
       // Let's rely on the Frontend "SQL Mode" for complex queries and keep this for basic listing.
       // OR, implemented basic TEXT column search if possible. 
       // For this iteration, let's stick to Pagination and let the user use SQL Mode for filtering.
    }

    // Add Sorting
    if (sortBy) {
        if (/^[a-zA-Z0-9_]+$/.test(sortBy)) {
             const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
             query += ` ORDER BY ${sortBy} ${order}`;
        }
    }

    // Add Pagination
    // Handle "Show All" by passing -1 or very large limit? 
    // If limit is very large, just use it. If frontend sends 1000000 it works.
    query += ` LIMIT $1 OFFSET $2`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query(countQuery);
    
    res.json({
        data: result.rows,
        total: parseInt(countResult.rows[0].total),
        page,
        limit
    });
  } catch (err: any) {
    console.error('[ADMIN-GET-DATA]', err.message);
    res.status(500).json({ error: "Error al obtener datos" });
  }
};

export const executeSql = async (req: any, res: Response) => {
    const { query } = req.body;
    const user = req.user;
    try {
        if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
        if (!query) return res.status(400).json({ error: "Query requerido" });

        // DANGEROUS: Raw SQL execution.
        const result = await pool.query(query);
        
        // Determine type of result
        if (Array.isArray(result)) {
             // Multi-statement? usually pg returns array if multiple queries.
             res.json(result.map(r => ({ rows: r.rows, rowCount: r.rowCount })));
        } else {
             res.json({ rows: result.rows, rowCount: result.rowCount, command: result.command });
        }
    } catch (err: any) {
        console.error('[ADMIN-SQL]', err.message);
        res.status(400).json({ error: err.message });
    }
}

export const saveRecord = async (req: any, res: Response) => {
  const { tableName, data } = req.body;
  const user = req.user;
  try {
    if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
    
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return res.status(400).json({ error: "Tabla inválida" });

    const keys = Object.keys(data);
    const values = Object.values(data);
    
    // Check if it's an UPDATE (has 'id') or INSERT
    // We assume 'id' column exists for updates. 
    // If not, we might need a more complex primary key detection, but for now 'id' is standard.
    
    if (data.id) {
       // UPDATE
       const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
       const idVal = data.id;
       // Remove ID from values to push it at end? No, cleaner to rebuild query params
       // ACTUALLY: The setClause includes id=$1 which is fine (id=id) or redundant but works.
       // BUT usually we don't update ID. Let's separate.
       
       const updateKeys = keys.filter(k => k !== 'id');
       const updateValues = updateKeys.map(k => data[k]);
       const setClauseStr = updateKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
       
       // Add ID as last param
       updateValues.push(idVal);
       
       await pool.query(`UPDATE ${tableName} SET ${setClauseStr} WHERE id = $${updateValues.length}`, updateValues);
       res.json({ success: true, action: 'UPDATE' });
       
    } else {
       // INSERT
       const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
       await pool.query(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`, values);
       res.json({ success: true, action: 'INSERT' });
    }

  } catch (err: any) {
    console.error('[ADMIN-SAVE]', err.message);
    res.status(500).json({ error: "Error al guardar registro", details: err.message });
  }
};

// ... (existing deleteRecord logic)
export const deleteRecord = async (req: any, res: Response) => {
  const { tableName, id } = req.body;
  const user = req.user;
  try {
    if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
    if (!tableName || !id) return res.status(400).json({ error: "Datos incompletos" });

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Nombre de tabla inválido" });
    }

    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
    res.json({ success: true, action: 'DELETE' });
  } catch (err: any) {
    console.error('[ADMIN-DELETE]', err.message);
    res.status(500).json({ error: "Error al eliminar registro", details: err.message });
  }
};

export const bulkDeleteRecords = async (req: any, res: Response) => {
  const { tableName, ids } = req.body;
  const user = req.user;
  try {
    if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
    if (!tableName || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Datos incompletos o inválidos" });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Nombre de tabla inválido" });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, action: 'BULK_DELETE', count: ids.length });
  } catch (err: any) {
    console.error('[ADMIN-BULK-DELETE]', err.message);
    res.status(500).json({ error: "Error al eliminar registros masivamente", details: err.message });
  }
};

export const getTableSchema = async (req: any, res: Response) => {
    const { tableName } = req.body;
    const user = req.user;
    try {
        if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
        if (!tableName) return res.status(400).json({ error: "Nombre de tabla requerido" });

        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
             return res.status(400).json({ error: "Nombre de tabla inválido" });
        }

        // Complex query to get columns, types, nullability, defaults, PKs, FKs, and comments
        const query = `
            SELECT 
                c.column_name, 
                c.data_type, 
                c.is_nullable,
                c.character_maximum_length,
                c.column_default,
                pg_catalog.col_description(format('%s.%s', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) as column_description,
                CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END as is_primary_key,
                case when fk.column_name is not null then 'YES' else 'NO' end as is_foreign_key,
                fk.foreign_table_name,
                fk.foreign_column_name
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT kcu.table_schema, kcu.table_name, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
            ) pk ON c.table_schema = pk.table_schema AND c.table_name = pk.table_name AND c.column_name = pk.column_name
            LEFT JOIN (
                SELECT 
                    kcu.table_schema, kcu.table_name, kcu.column_name, 
                    ccu.table_name AS foreign_table_name, 
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
            ) fk ON c.table_schema = fk.table_schema AND c.table_name = fk.table_name AND c.column_name = fk.column_name
            WHERE c.table_name = $1
            ORDER BY c.ordinal_position;
        `;
        
        const result = await pool.query(query, [tableName]);
        
        // Also get table comment
        const commentQuery = `
            SELECT obj_description(oid) 
            FROM pg_class 
            WHERE relname = $1;
        `;
        const commentResult = await pool.query(commentQuery, [tableName]);
        
        res.json({
            columns: result.rows,
            description: commentResult.rows[0]?.obj_description || 'Sin descripción'
        });

    } catch (err: any) {
        console.error('[ADMIN-SCHEMA]', err.message);
        res.status(500).json({ error: "Error al obtener esquema", details: err.message });
    }
};
