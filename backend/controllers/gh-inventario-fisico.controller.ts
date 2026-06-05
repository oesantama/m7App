import { Request, Response } from 'express';
import pool from '../config/database.js';
import crypto from 'crypto';

// ─── GET /inventarios-fisicos ─────────────────────────────────────────────────
export const getInventariosFisicos = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT
                i.*,
                (SELECT COUNT(*) FROM gh_inventarios_fisicos_items it WHERE it.inventario_id = i.id) AS total_items,
                (SELECT COUNT(*) FROM gh_inventarios_fisicos_items it WHERE it.inventario_id = i.id AND it.tipo_diferencia != 'OK' AND it.tipo_diferencia != 'PENDIENTE') AS items_con_diferencia,
                (SELECT COUNT(*) FROM gh_inventarios_fisicos_items it WHERE it.inventario_id = i.id AND it.tipo_diferencia != 'OK' AND it.tipo_diferencia != 'PENDIENTE' AND it.estado_justificacion = 'JUSTIFICADO') AS items_justificados
            FROM gh_inventarios_fisicos i
            ORDER BY i.fecha_apertura DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error getInventariosFisicos:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── GET /inventarios-fisicos/:id ─────────────────────────────────────────────
export const getInventarioFisicoById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const sesion = await pool.query(
            'SELECT * FROM gh_inventarios_fisicos WHERE id = $1',
            [id]
        );
        if (sesion.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
        }
        const items = await pool.query(
            `SELECT it.*, e.nombre as elemento_nombre_actual
             FROM gh_inventarios_fisicos_items it
             JOIN gh_elementos e ON e.id = it.elemento_id
             WHERE it.inventario_id = $1
             ORDER BY it.elemento_nombre ASC`,
            [id]
        );
        res.json({ success: true, data: { sesion: sesion.rows[0], items: items.rows } });
    } catch (error: any) {
        console.error('Error getInventarioFisicoById:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── POST /inventarios-fisicos ────────────────────────────────────────────────
// Crea una nueva sesión y hace snapshot del stock actual
export const createInventarioFisico = async (req: Request, res: Response) => {
    const { titulo, assigned_to, observaciones, elementos_ids, created_by } = req.body;
    if (!titulo || !assigned_to || !created_by) {
        return res.status(400).json({ success: false, error: 'titulo, assigned_to y created_by son obligatorios' });
    }

    // Validar que no haya una sesión abierta activa
    const activa = await pool.query(
        `SELECT id FROM gh_inventarios_fisicos WHERE estado IN ('ABIERTO','EN_CONTEO','PENDIENTE_AUTORIZACION')`
    );
    if (activa.rows.length > 0) {
        return res.status(409).json({
            success: false,
            error: `Ya existe una sesión activa (ID: ${activa.rows[0].id}). Ciérrela antes de crear otra.`
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const sesionResult = await client.query(
            `INSERT INTO gh_inventarios_fisicos (titulo, assigned_to, observaciones, created_by, estado, usuario_control, fecha_control)
             VALUES ($1, $2, $3, $4, 'ABIERTO', $4, NOW())
             RETURNING *`,
            [titulo, assigned_to, observaciones || null, created_by]
        );
        const sesionId = sesionResult.rows[0].id;

        // Obtener elementos a incluir con su stock actual como snapshot
        let elementosQuery = `
            SELECT e.id, e.nombre, COALESCE(i.stock, 0) as stock
            FROM gh_elementos e
            LEFT JOIN gh_inventario_elemento i ON i.elemento_id = e.id
            WHERE e.estado_id = 'EST-01'
        `;
        const params: any[] = [];
        if (Array.isArray(elementos_ids) && elementos_ids.length > 0) {
            elementosQuery += ` AND e.id = ANY($1)`;
            params.push(elementos_ids);
        }
        elementosQuery += ' ORDER BY e.nombre ASC';

        const elementos = await client.query(elementosQuery, params);

        // Insertar items con snapshot del stock
        for (const el of elementos.rows) {
            await client.query(
                `INSERT INTO gh_inventarios_fisicos_items
                 (inventario_id, elemento_id, elemento_nombre, cantidad_sistema, estado_justificacion)
                 VALUES ($1, $2, $3, $4, 'PENDIENTE')`,
                [sesionId, el.id, el.nombre, el.stock]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, data: sesionResult.rows[0], total_elementos: elementos.rows.length });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error createInventarioFisico:', error);
        res.status(500).json({ success: false, error: 'Error al crear sesión de inventario' });
    } finally {
        client.release();
    }
};

// ─── PUT /inventarios-fisicos/:id/items ──────────────────────────────────────
// Guarda conteos físicos (guardado progresivo)
export const saveConteos = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { conteos } = req.body; // [{ elemento_id, cantidad_fisica }]

    if (!Array.isArray(conteos)) {
        return res.status(400).json({ success: false, error: 'conteos debe ser un array' });
    }

    const sesion = await pool.query(
        `SELECT estado FROM gh_inventarios_fisicos WHERE id = $1`, [id]
    );
    if (sesion.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    if (!['ABIERTO', 'EN_CONTEO'].includes(sesion.rows[0].estado)) {
        return res.status(400).json({ success: false, error: 'La sesión no está en estado de conteo' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Marcar sesión como EN_CONTEO al primer guardado
        await client.query(
            `UPDATE gh_inventarios_fisicos SET estado = 'EN_CONTEO', fecha_control = NOW() WHERE id = $1 AND estado = 'ABIERTO'`,
            [id]
        );

        for (const c of conteos) {
            await client.query(
                `UPDATE gh_inventarios_fisicos_items
                 SET cantidad_fisica = $1, contado_at = NOW()
                 WHERE inventario_id = $2 AND elemento_id = $3`,
                [c.cantidad_fisica, id, c.elemento_id]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Conteos guardados' });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error saveConteos:', error);
        res.status(500).json({ success: false, error: 'Error al guardar conteos' });
    } finally {
        client.release();
    }
};

// ─── PUT /inventarios-fisicos/:id/justificar ─────────────────────────────────
// Guarda justificaciones para items con diferencia
export const saveJustificaciones = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { justificaciones } = req.body; // [{ item_id, justificacion }]

    if (!Array.isArray(justificaciones)) {
        return res.status(400).json({ success: false, error: 'justificaciones debe ser un array' });
    }

    const sesion = await pool.query(
        `SELECT estado FROM gh_inventarios_fisicos WHERE id = $1`, [id]
    );
    if (sesion.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    if (!['EN_CONTEO', 'PENDIENTE_AUTORIZACION'].includes(sesion.rows[0].estado)) {
        return res.status(400).json({ success: false, error: 'Estado inválido para justificar' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const j of justificaciones) {
            await client.query(
                `UPDATE gh_inventarios_fisicos_items
                 SET justificacion = $1,
                     estado_justificacion = 'JUSTIFICADO',
                     cantidad_final = $4
                 WHERE id = $2 AND inventario_id = $3`,
                [j.justificacion, j.item_id, id, j.cantidad_final ?? null]
            );
        }

        // Verificar si todos los items con diferencia están justificados
        const pendientes = await client.query(
            `SELECT COUNT(*) FROM gh_inventarios_fisicos_items
             WHERE inventario_id = $1
               AND tipo_diferencia NOT IN ('OK','PENDIENTE')
               AND estado_justificacion = 'PENDIENTE'`,
            [id]
        );

        let nuevoEstado = sesion.rows[0].estado;
        if (parseInt(pendientes.rows[0].count) === 0) {
            nuevoEstado = 'PENDIENTE_AUTORIZACION';
            await client.query(
                `UPDATE gh_inventarios_fisicos SET estado = 'PENDIENTE_AUTORIZACION', fecha_control = NOW() WHERE id = $1`,
                [id]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, nuevo_estado: nuevoEstado });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error saveJustificaciones:', error);
        res.status(500).json({ success: false, error: 'Error al guardar justificaciones' });
    } finally {
        client.release();
    }
};

// ─── POST /inventarios-fisicos/:id/generar-codigo ────────────────────────────
// Genera código de autorización (solo supervisor distinto al auditor)
export const generarCodigo = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { generado_por } = req.body;

    if (!generado_por) {
        return res.status(400).json({ success: false, error: 'generado_por es obligatorio' });
    }

    const sesion = await pool.query(
        `SELECT estado, assigned_to FROM gh_inventarios_fisicos WHERE id = $1`, [id]
    );
    if (sesion.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    const { estado, assigned_to } = sesion.rows[0];
    if (estado !== 'PENDIENTE_AUTORIZACION') {
        return res.status(400).json({ success: false, error: 'La sesión debe estar en PENDIENTE_AUTORIZACION' });
    }
    if (generado_por === assigned_to) {
        return res.status(403).json({
            success: false,
            error: 'El supervisor que autoriza no puede ser el mismo auditor que realizó el conteo (segregación de funciones)'
        });
    }

    // Verificar que todos los ítems con diferencia estén justificados
    const pendientes = await pool.query(
        `SELECT COUNT(*) FROM gh_inventarios_fisicos_items
         WHERE inventario_id = $1 AND tipo_diferencia NOT IN ('OK','PENDIENTE') AND estado_justificacion = 'PENDIENTE'`,
        [id]
    );
    if (parseInt(pendientes.rows[0].count) > 0) {
        return res.status(400).json({ success: false, error: 'Hay diferencias sin justificar' });
    }

    // Expirar códigos anteriores vigentes
    await pool.query(
        `UPDATE gh_inventarios_fisicos_auth SET estado = 'EXPIRADO' WHERE inventario_id = $1 AND estado = 'VIGENTE'`,
        [id]
    );

    // Generar código de 6 dígitos
    const codigo = crypto.randomInt(100000, 999999).toString();
    const expiraAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    const authResult = await pool.query(
        `INSERT INTO gh_inventarios_fisicos_auth (inventario_id, codigo, generado_por, expira_at, estado)
         VALUES ($1, $2, $3, $4, 'VIGENTE')
         RETURNING id, codigo, generado_por, generado_at, expira_at`,
        [id, codigo, generado_por, expiraAt]
    );

    res.json({ success: true, data: authResult.rows[0] });
};

// ─── POST /inventarios-fisicos/:id/cerrar ─────────────────────────────────────
// Ingresa código, valida, ejecuta ajustes y cierra la sesión
export const cerrarInventario = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { codigo, usado_por } = req.body;

    if (!codigo || !usado_por) {
        return res.status(400).json({ success: false, error: 'codigo y usado_por son obligatorios' });
    }

    const sesion = await pool.query(
        `SELECT * FROM gh_inventarios_fisicos WHERE id = $1`, [id]
    );
    if (sesion.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    if (sesion.rows[0].estado !== 'PENDIENTE_AUTORIZACION') {
        return res.status(400).json({ success: false, error: 'La sesión no está en estado PENDIENTE_AUTORIZACION' });
    }

    // Validar código
    await pool.query(
        `UPDATE gh_inventarios_fisicos_auth SET estado = 'EXPIRADO'
         WHERE inventario_id = $1 AND estado = 'VIGENTE' AND expira_at < NOW()`,
        [id]
    );

    const authResult = await pool.query(
        `SELECT * FROM gh_inventarios_fisicos_auth
         WHERE inventario_id = $1 AND codigo = $2 AND estado = 'VIGENTE'`,
        [id, codigo]
    );
    if (authResult.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Código inválido o expirado. Solicite uno nuevo al supervisor.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Marcar código como usado
        await client.query(
            `UPDATE gh_inventarios_fisicos_auth SET estado = 'USADO', usado_at = NOW(), usado_por = $1 WHERE id = $2`,
            [usado_por, authResult.rows[0].id]
        );

        // Obtener ítems con diferencia para ajustar (incluye cantidad_final si fue modificada)
        const items = await client.query(
            `SELECT * FROM gh_inventarios_fisicos_items WHERE inventario_id = $1 AND diferencia != 0`,
            [id]
        );

        let ajustesEjecutados = 0;
        for (const item of items.rows) {
            // Usar cantidad_final si fue definida en conciliación, sino cantidad_fisica
            const cantidadEfectiva = item.cantidad_final !== null && item.cantidad_final !== undefined
                ? item.cantidad_final
                : item.cantidad_fisica;
            const diff = cantidadEfectiva - item.cantidad_sistema;
            if (diff === 0) continue;
            // Actualizar stock en bodega al valor efectivo final
            await client.query(
                `INSERT INTO gh_inventario_elemento (elemento_id, stock, fecha_actualizacion)
                 VALUES ($1, GREATEST(0, COALESCE((SELECT stock FROM gh_inventario_elemento WHERE elemento_id = $1), 0) + $2), NOW())
                 ON CONFLICT (elemento_id) DO UPDATE
                   SET stock = GREATEST(0, gh_inventario_elemento.stock + $2),
                       fecha_actualizacion = NOW()`,
                [item.elemento_id, diff]
            );
            ajustesEjecutados++;
        }

        // Cerrar sesión
        await client.query(
            `UPDATE gh_inventarios_fisicos
             SET estado = 'CERRADO', fecha_cierre = NOW(), fecha_control = NOW(), usuario_control = $2
             WHERE id = $1`,
            [id, usado_por]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Inventario cerrado y ajustes aplicados', ajustes: ajustesEjecutados });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error cerrarInventario:', error);
        res.status(500).json({ success: false, error: 'Error al cerrar inventario' });
    } finally {
        client.release();
    }
};

// ─── PATCH /inventarios-fisicos/:id/anular ────────────────────────────────────
export const anularInventario = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo } = req.body;
    try {
        const sesion = await pool.query(
            `SELECT estado FROM gh_inventarios_fisicos WHERE id = $1`, [id]
        );
        if (sesion.rows.length === 0) return res.status(404).json({ success: false, error: 'No encontrado' });
        if (sesion.rows[0].estado === 'CERRADO') {
            return res.status(400).json({ success: false, error: 'No se puede anular una sesión cerrada' });
        }
        await pool.query(
            `UPDATE gh_inventarios_fisicos SET estado = 'ANULADO', observaciones = COALESCE(observaciones,'') || ' | ANULADO: ' || $2, fecha_control = NOW() WHERE id = $1`,
            [id, motivo || 'Sin motivo']
        );
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error anularInventario:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
