import { Request, Response } from 'express';
import pool from '../config/database.js';

// Inicializador de tablas de encuestas y sondeos
export const initSondeosTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sondeos_encuestas (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descripcion TEXT,
                tipo_acceso VARCHAR(20) DEFAULT 'AMBOS',
                estado VARCHAR(20) DEFAULT 'ACTIVO',
                requiere_identificacion VARCHAR(20) DEFAULT 'OPCIONAL',
                fecha_vencimiento DATE NULL,
                created_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS sondeos_preguntas (
                id SERIAL PRIMARY KEY,
                encuesta_id INT REFERENCES sondeos_encuestas(id) ON DELETE CASCADE,
                orden INT DEFAULT 1,
                pregunta TEXT NOT NULL,
                tipo VARCHAR(30) NOT NULL,
                obligatoria BOOLEAN DEFAULT true,
                opciones JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS sondeos_respuestas (
                id SERIAL PRIMARY KEY,
                encuesta_id INT REFERENCES sondeos_encuestas(id) ON DELETE CASCADE,
                nombre_encuestado VARCHAR(255) NULL,
                documento_encuestado VARCHAR(100) NULL,
                user_id VARCHAR(50) NULL,
                ip_address VARCHAR(45) NULL,
                respuestas JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
    } catch (err: any) {
        console.error('[SONDEOS-INIT-ERR]', err.message);
    }
};

// Ejecutar init al importar controlador
initSondeosTables();

// Listar todas las encuestas (vista Admin)
export const getEncuestas = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT e.*, 
                   COUNT(r.id)::int AS total_respuestas,
                   COUNT(p.id)::int AS total_preguntas
            FROM sondeos_encuestas e
            LEFT JOIN sondeos_respuestas r ON e.id = r.encuesta_id
            LEFT JOIN sondeos_preguntas p ON e.id = p.encuesta_id
            GROUP BY e.id
            ORDER BY e.created_at DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[SONDEOS-GET-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Obtener detalle de una encuesta con sus preguntas
export const getEncuestaById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const encRes = await pool.query(`SELECT * FROM sondeos_encuestas WHERE id = $1`, [id]);
        if (encRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Encuesta no encontrada' });
        }
        const pregRes = await pool.query(
            `SELECT * FROM sondeos_preguntas WHERE encuesta_id = $1 ORDER BY orden ASC, id ASC`,
            [id]
        );
        res.json({
            success: true,
            data: {
                ...encRes.rows[0],
                preguntas: pregRes.rows
            }
        });
    } catch (err: any) {
        console.error('[SONDEOS-GETBYID-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Crear o actualizar encuesta con sus preguntas
export const saveEncuesta = async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        titulo,
        descripcion,
        tipo_acceso,
        estado,
        requiere_identificacion,
        fecha_vencimiento,
        preguntas
    } = req.body;

    const userId = (req as any).user?.id || 'USR-ADMIN';

    if (!titulo || !titulo.trim()) {
        return res.status(400).json({ success: false, error: 'El título es obligatorio' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let encuestaId = id ? parseInt(id, 10) : null;

        if (encuestaId) {
            await client.query(
                `UPDATE sondeos_encuestas 
                 SET titulo = $1, descripcion = $2, tipo_acceso = $3, estado = $4,
                     requiere_identificacion = $5, fecha_vencimiento = $6, updated_at = NOW()
                 WHERE id = $7`,
                [
                    titulo.trim(),
                    descripcion || '',
                    tipo_acceso || 'AMBOS',
                    estado || 'ACTIVO',
                    requiere_identificacion || 'OPCIONAL',
                    fecha_vencimiento || null,
                    encuestaId
                ]
            );
            // Eliminar preguntas anteriores para reinsertar ordenadamente
            await client.query(`DELETE FROM sondeos_preguntas WHERE encuesta_id = $1`, [encuestaId]);
        } else {
            const insRes = await client.query(
                `INSERT INTO sondeos_encuestas 
                 (titulo, descripcion, tipo_acceso, estado, requiere_identificacion, fecha_vencimiento, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [
                    titulo.trim(),
                    descripcion || '',
                    tipo_acceso || 'AMBOS',
                    estado || 'ACTIVO',
                    requiere_identificacion || 'OPCIONAL',
                    fecha_vencimiento || null,
                    userId
                ]
            );
            encuestaId = insRes.rows[0].id;
        }

        // Insertar preguntas
        if (Array.isArray(preguntas) && preguntas.length > 0) {
            for (let idx = 0; idx < preguntas.length; idx++) {
                const p = preguntas[idx];
                const opcionesArray = Array.isArray(p.opciones) 
                    ? p.opciones.filter((o: any) => String(o || '').trim() !== '') 
                    : [];

                await client.query(
                    `INSERT INTO sondeos_preguntas (encuesta_id, orden, pregunta, tipo, obligatoria, opciones)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        encuestaId,
                        idx + 1,
                        String(p.pregunta || '').trim(),
                        p.tipo || 'SELECCION_UNICA',
                        p.obligatoria !== false,
                        JSON.stringify(opcionesArray)
                    ]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, id: encuestaId, message: 'Encuesta guardada con éxito' });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[SONDEOS-SAVE-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

// Eliminar encuesta
export const deleteEncuesta = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM sondeos_encuestas WHERE id = $1`, [id]);
        res.json({ success: true, message: 'Encuesta eliminada correctamente' });
    } catch (err: any) {
        console.error('[SONDEOS-DELETE-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Feed de encuestas para usuarios dentro de la App
export const getEncuestasApp = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id || null;
        const query = `
            SELECT e.*, 
                   COUNT(p.id)::int AS total_preguntas,
                   EXISTS(
                       SELECT 1 FROM sondeos_respuestas r 
                       WHERE r.encuesta_id = e.id AND r.user_id = $1
                   ) AS ya_respondida
            FROM sondeos_encuestas e
            LEFT JOIN sondeos_preguntas p ON e.id = p.encuesta_id
            WHERE e.estado = 'ACTIVO' 
              AND (e.tipo_acceso IN ('APP', 'AMBOS'))
              AND (e.fecha_vencimiento IS NULL OR e.fecha_vencimiento >= CURRENT_DATE)
            GROUP BY e.id
            ORDER BY e.created_at DESC
        `;
        const result = await pool.query(query, [userId]);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[SONDEOS-APP-GET-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Vista pública de encuesta para responder (sin auth)
export const getEncuestaPublica = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const encRes = await pool.query(
            `SELECT id, titulo, descripcion, tipo_acceso, estado, requiere_identificacion, fecha_vencimiento 
             FROM sondeos_encuestas WHERE id = $1`,
            [id]
        );
        if (encRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'La encuesta solicitada no existe.' });
        }
        const encuesta = encRes.rows[0];
        if (encuesta.estado !== 'ACTIVO') {
            return res.status(403).json({ success: false, error: 'Esta encuesta ya no se encuentra activa.' });
        }
        if (encuesta.fecha_vencimiento && new Date(encuesta.fecha_vencimiento) < new Date()) {
            return res.status(403).json({ success: false, error: 'La encuesta ha finalizado su periodo de vigencia.' });
        }

        const pregRes = await pool.query(
            `SELECT id, orden, pregunta, tipo, obligatoria, opciones 
             FROM sondeos_preguntas WHERE encuesta_id = $1 ORDER BY orden ASC, id ASC`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...encuesta,
                preguntas: pregRes.rows
            }
        });
    } catch (err: any) {
        console.error('[SONDEOS-PUBLIC-GET-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Enviar respuesta a la encuesta (Pública o Interna)
export const submitRespuesta = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { nombre_encuestado, documento_encuestado, respuestas } = req.body;
    const userId = (req as any).user?.id || null;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;

    if (!respuestas || typeof respuestas !== 'object') {
        return res.status(400).json({ success: false, error: 'Respuestas inválidas' });
    }

    try {
        const encRes = await pool.query(`SELECT * FROM sondeos_encuestas WHERE id = $1`, [id]);
        if (encRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Encuesta no encontrada' });
        }
        const encuesta = encRes.rows[0];

        if (encuesta.estado !== 'ACTIVO') {
            return res.status(403).json({ success: false, error: 'La encuesta se encuentra inactiva' });
        }

        if (encuesta.requiere_identificacion === 'OBLIGATORIO') {
            if (!nombre_encuestado?.trim() || !documento_encuestado?.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'Esta encuesta requiere ingresar Nombre Completo y Documento de Identidad.'
                });
            }
        }

        await pool.query(
            `INSERT INTO sondeos_respuestas 
             (encuesta_id, nombre_encuestado, documento_encuestado, user_id, ip_address, respuestas)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                id,
                nombre_encuestado?.trim() || null,
                documento_encuestado?.trim() || null,
                userId,
                Array.isArray(clientIp) ? clientIp[0] : String(clientIp || ''),
                JSON.stringify(respuestas)
            ]
        );

        res.json({ success: true, message: '¡Muchas gracias! Tus respuestas han sido registradas correctamente.' });
    } catch (err: any) {
        console.error('[SONDEOS-SUBMIT-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Ver Resultados y estadísticas agregadas por encuesta
export const getResultadosEncuesta = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const encRes = await pool.query(`SELECT * FROM sondeos_encuestas WHERE id = $1`, [id]);
        if (encRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Encuesta no encontrada' });
        }
        const encuesta = encRes.rows[0];

        const pregRes = await pool.query(
            `SELECT * FROM sondeos_preguntas WHERE encuesta_id = $1 ORDER BY orden ASC, id ASC`,
            [id]
        );
        const preguntas = pregRes.rows;

        const respRes = await pool.query(
            `SELECT id, nombre_encuestado, documento_encuestado, user_id, respuestas, created_at
             FROM sondeos_respuestas WHERE encuesta_id = $1 ORDER BY created_at DESC`,
            [id]
        );
        const respuestasList = respRes.rows;

        // Calcular agregación de estadísticas por pregunta
        const estadisticas = preguntas.map((p: any) => {
            const pId = String(p.id);
            const conteoOpciones: Record<string, number> = {};
            const respuestasLibres: string[] = [];

            if (p.tipo === 'SELECCION_UNICA' || p.tipo === 'SELECCION_MULTIPLE') {
                const ops: string[] = Array.isArray(p.opciones) ? p.opciones : [];
                ops.forEach(op => { conteoOpciones[op] = 0; });
            }

            respuestasList.forEach((r: any) => {
                const val = r.respuestas ? r.respuestas[pId] : null;
                if (val !== null && val !== undefined) {
                    if (p.tipo === 'SELECCION_UNICA') {
                        const strVal = String(val).trim();
                        conteoOpciones[strVal] = (conteoOpciones[strVal] || 0) + 1;
                    } else if (p.tipo === 'SELECCION_MULTIPLE') {
                        const arrVals = Array.isArray(val) ? val : [val];
                        arrVals.forEach(v => {
                            const strV = String(v).trim();
                            conteoOpciones[strV] = (conteoOpciones[strV] || 0) + 1;
                        });
                    } else if (p.tipo === 'RESPUESTA_LIBRE') {
                        if (String(val).trim() !== '') {
                            respuestasLibres.push(String(val).trim());
                        }
                    }
                }
            });

            return {
                preguntaId: p.id,
                pregunta: p.pregunta,
                tipo: p.tipo,
                conteoOpciones,
                respuestasLibres
            };
        });

        res.json({
            success: true,
            data: {
                encuesta,
                totalRespuestas: respuestasList.length,
                preguntas,
                estadisticas,
                respuestasDetalladas: respuestasList
            }
        });
    } catch (err: any) {
        console.error('[SONDEOS-RESULTADOS-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
