import { Request, Response } from 'express';
import pool from '../config/database.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { LOGO_MILLA_SIETE } from './gh-personal.controller.js';

// ─── DRIVE HELPERS ────────────────────────────────────────────────────────────

const DRIVE_BASE = 'CAPACITACIONES MILLA 7';
const RCLONE_REMOTE = 'gdrive_cumplidos';

function sanitizeFolderName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().toUpperCase();
}

async function rcloneMkdir(remotePath: string): Promise<void> {
  return new Promise((resolve) => {
    exec(`rclone mkdir "${RCLONE_REMOTE}:${remotePath}"`, (err) => {
      if (err) console.error('[CAP-DRIVE] mkdir error:', err.message);
      resolve();
    });
  });
}

async function rcloneCopyto(localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`rclone copyto "${localPath}" "${RCLONE_REMOTE}:${remotePath}"`, (err, _stdout, stderr) => {
      if (err) { console.error('[CAP-DRIVE] copyto error:', stderr); reject(err); }
      else resolve();
    });
  });
}

async function rcloneLink(remotePath: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const link = await new Promise<string>((resolve) => {
      exec(`rclone link "${RCLONE_REMOTE}:${remotePath}"`, (err, stdout) => {
        resolve(stdout ? stdout.trim() : '');
      });
    });
    if (link) return link;
    await new Promise(r => setTimeout(r, 1500));
  }
  return '';
}

async function rcloneDelete(remotePath: string): Promise<void> {
  await new Promise<void>((resolve) => {
    exec(`rclone deletefile "${RCLONE_REMOTE}:${remotePath}"`, () => resolve());
  });
}

// ─── RECURSO STREAM PROXY ─────────────────────────────────────────────────────

export const streamRecurso = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const r = await pool.query('SELECT * FROM cap_recursos WHERE id = $1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Recurso no encontrado' });
    const recurso = r.rows[0];

    if (recurso.tipo === 'LINK' || !recurso.drive_path) {
      return res.redirect(recurso.url_externa || '#');
    }

    const ext = path.extname(recurso.drive_path).toLowerCase();
    const ctMap: Record<string, string> = {
      '.pdf':  'application/pdf',
      '.mp4':  'video/mp4',
      '.webm': 'video/webm',
      '.mov':  'video/quicktime',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png':  'image/png',
      '.gif':  'image/gif',
      '.webp': 'image/webp',
    };
    const ct = ctMap[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Frame-Options');

    const proc = spawn('rclone', ['cat', `${RCLONE_REMOTE}:${recurso.drive_path}`]);
    proc.stdout.pipe(res);
    proc.stderr.on('data', (d) => console.error('[CAP-STREAM]', d.toString()));
    proc.on('error', (err) => { console.error('[CAP-STREAM] spawn error:', err); res.status(500).end(); });
    req.on('close', () => proc.kill());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al servir recurso' });
  }
};

// ─── ESPECIALISTAS CRUD ───────────────────────────────────────────────────────

// Devuelve si el usuario autenticado está registrado como especialista activo
export const getEspecialistaMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    if (!userId) return res.json({ isEspecialista: false, categorias: [] });
    const r = await pool.query(
      `SELECT categorias FROM cap_especialistas WHERE user_id = $1 AND activo = true LIMIT 1`,
      [userId]
    );
    if (r.rows.length === 0) return res.json({ isEspecialista: false, categorias: [] });
    res.json({ isEspecialista: true, categorias: r.rows[0].categorias || [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const getEspecialistas = async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(`
      SELECT e.*, u.name AS user_name, u.email AS user_email,
             u.document_number AS user_document, u.role_id AS user_role_id
      FROM cap_especialistas e
      LEFT JOIN users u ON u.id = e.user_id
      ORDER BY u.name ASC
    `);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const saveEspecialista = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, categorias, activo, usuario_control } = req.body;
    if (id) {
      const r = await pool.query(
        `UPDATE cap_especialistas SET user_id=$1, categorias=$2, activo=$3, usuario_control=$4, fecha_control=NOW()
         WHERE id=$5 RETURNING *`,
        [user_id, categorias || [], activo !== false, usuario_control || null, id]
      );
      return res.json(r.rows[0]);
    }
    const r = await pool.query(
      `INSERT INTO cap_especialistas (user_id, categorias, activo, usuario_control)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [user_id, categorias || [], activo !== false, usuario_control || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Este usuario ya está registrado como especialista' });
    res.status(500).json({ error: e.message });
  }
};

export const deleteEspecialista = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM cap_especialistas WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

// ─── CAPACITACIONES CRUD ─────────────────────────────────────────────────────

export const getCapacitaciones = async (req: Request, res: Response) => {
  try {
    const tokenUser = (req as any).user;
    const CAPACITACIONES_PAGE = 'PAG-32';

    let isEspecialistaDb = false;
    const userId = tokenUser?.id || tokenUser?.userId;
    if (userId) {
      const espCheck = await pool.query(
        `SELECT 1 FROM cap_especialistas WHERE user_id = $1 AND activo = true LIMIT 1`,
        [userId]
      );
      if (espCheck.rows.length > 0) {
        isEspecialistaDb = true;
      }
    }

    const hasViewPerm = tokenUser?.roleId === 'ROL-01' || tokenUser?.role_id === 'ROL-01' ||
      tokenUser?.email?.toLowerCase() === 'directorti@millasiete.com' ||
      isEspecialistaDb ||
      tokenUser?.permissions?.some((p: any) =>
        (p.module === 'CAPACITACIONES' || p.module === CAPACITACIONES_PAGE) && p.actions.includes('view')
      );

    // Sin permiso CAPACITACIONES:view → sólo puede ver sus propias asignaciones
    let { cedula, cedula_self } = req.query as { cedula?: string; cedula_self?: string };
    if (!hasViewPerm) {
      const ownDoc = tokenUser?.document_number || '';
      if (!ownDoc) return res.json([]); // sin documento, sin acceso
      cedula = ownDoc;
      cedula_self = ownDoc;
    }

    const selfCedula = cedula_self || cedula; // para las subqueries de "mi asignación"
    let whereClause = '';
    const params: any[] = [];
    if (cedula) {
      const estadoFilter = hasViewPerm ? '' : `c.estado = 'ACTIVO' AND `;
      whereClause = `WHERE ${estadoFilter}EXISTS (SELECT 1 FROM cap_asignaciones a WHERE a.capacitacion_id = c.id AND a.cedula = $1 AND a.fecha_inicio <= CURRENT_DATE AND a.fecha_fin >= CURRENT_DATE)`;
      params.push(cedula);
    }
    // Si hay selfCedula, agregamos como param extra para las subqueries
    const selfParamIdx = selfCedula ? (params.length + 1) : null;
    if (selfCedula && !cedula) params.push(selfCedula);
    else if (selfCedula && cedula && selfCedula !== cedula) params.push(selfCedula);
    // Si cedula y cedula_self son iguales, $1 sirve para ambas
    const selfParam = selfCedula ? `$${selfCedula === cedula ? 1 : selfParamIdx}` : null;

    const result = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM cap_preguntas WHERE capacitacion_id = c.id) AS total_preguntas,
        (SELECT COUNT(*) FROM cap_recursos WHERE capacitacion_id = c.id) AS total_recursos,
        (SELECT COUNT(*) FROM cap_asignaciones WHERE capacitacion_id = c.id) AS total_asignados,
        (SELECT COUNT(DISTINCT cedula) FROM cap_intentos WHERE capacitacion_id = c.id) AS total_con_intentos
        ${selfParam ? `,
        (SELECT a.estado FROM cap_asignaciones a
         WHERE a.capacitacion_id = c.id AND a.cedula = ${selfParam}
           AND a.fecha_inicio <= CURRENT_DATE AND a.fecha_fin >= CURRENT_DATE
         ORDER BY a.id DESC LIMIT 1) AS mi_estado_asignacion,
        (SELECT COALESCE(a.max_intentos_override, c2.max_intentos) - a.intentos_realizados
         FROM cap_asignaciones a
         JOIN cap_capacitaciones c2 ON c2.id = a.capacitacion_id
         WHERE a.capacitacion_id = c.id AND a.cedula = ${selfParam}
           AND a.fecha_inicio <= CURRENT_DATE AND a.fecha_fin >= CURRENT_DATE
         ORDER BY a.id DESC LIMIT 1) AS mis_intentos_restantes` : ''}
      FROM cap_capacitaciones c
      ${whereClause}
      ORDER BY c.fecha_control DESC
    `, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[CAP] getCapacitaciones:', err.message);
    res.status(500).json({ error: 'Error al obtener capacitaciones' });
  }
};

export const getCapacitacionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const capRes = await pool.query('SELECT * FROM cap_capacitaciones WHERE id = $1', [id]);
    if (!capRes.rows.length) return res.status(404).json({ error: 'No encontrada' });

    const pregRes = await pool.query(
      'SELECT * FROM cap_preguntas WHERE capacitacion_id = $1 ORDER BY orden', [id]
    );
    const opcRes = await pool.query(`
      SELECT o.* FROM cap_opciones o
      INNER JOIN cap_preguntas p ON p.id = o.pregunta_id
      WHERE p.capacitacion_id = $1 ORDER BY o.pregunta_id, o.orden
    `, [id]);
    const recRes = await pool.query(
      'SELECT * FROM cap_recursos WHERE capacitacion_id = $1 ORDER BY orden', [id]
    );

    const preguntas = pregRes.rows.map(p => ({
      ...p,
      orden: (p.orden || 0) + 1, // 1-indexed for frontend
      opciones: opcRes.rows.filter(o => o.pregunta_id === p.id)
    }));

    res.json({ ...capRes.rows[0], preguntas, recursos: recRes.rows });
  } catch (err: any) {
    console.error('[CAP] getCapacitacionById:', err.message);
    res.status(500).json({ error: 'Error al obtener capacitación' });
  }
};

export const saveCapacitacion = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id, titulo, descripcion, objetivo, categoria, nota_minima_aprobacion,
      max_intentos, tiempo_limite_minutos, tipo_proceso, tipo_acceso, estado, formato_opciones,
      preguntas = [], usuario_control } = req.body;

    const acceso = tipo_acceso || 'INTERNO';
    const formatoOpciones = formato_opciones || 'letras';
    let capId: number;

    if (id) {
      await client.query(`
        UPDATE cap_capacitaciones SET
          titulo=$1, descripcion=$2, objetivo=$3, categoria=$4,
          nota_minima_aprobacion=$5, max_intentos=$6, tiempo_limite_minutos=$7,
          tipo_proceso=$8, tipo_acceso=$9, estado=$10, formato_opciones=$11, usuario_control=$12, fecha_control=NOW()
        WHERE id=$13
      `, [titulo, descripcion, objetivo, categoria, nota_minima_aprobacion,
          max_intentos, tiempo_limite_minutos, tipo_proceso, acceso, estado, formatoOpciones, usuario_control, id]);
      capId = id;
    } else {
      const folderName = sanitizeFolderName(titulo);
      const drivePath = `${DRIVE_BASE}/${folderName}`;
      await rcloneMkdir(`${drivePath}/recursos`);
      await rcloneMkdir(`${drivePath}/certificados`);

      const ins = await client.query(`
        INSERT INTO cap_capacitaciones
          (titulo, descripcion, objetivo, categoria, nota_minima_aprobacion,
           max_intentos, tiempo_limite_minutos, tipo_proceso, tipo_acceso, estado,
           formato_opciones, drive_folder_path, usuario_control)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id
      `, [titulo, descripcion, objetivo, categoria, nota_minima_aprobacion,
          max_intentos, tiempo_limite_minutos, tipo_proceso, acceso, estado || 'BORRADOR',
          formatoOpciones, drivePath, usuario_control]);
      capId = ins.rows[0].id;
    }

    // Sync recursos LINK (url_externa): los que ya tienen id se actualizan, los nuevos se insertan, los borrados se eliminan
    const { recursos = [] } = req.body;
    const linkRecursos = recursos.filter((r: any) => r.tipo === 'LINK' || !r._file);
    const linkIds = linkRecursos.filter((r: any) => r.id).map((r: any) => r.id);
    // Eliminar recursos LINK que ya no están
    if (linkIds.length > 0) {
      await client.query(
        `DELETE FROM cap_recursos WHERE capacitacion_id = $1 AND tipo = 'LINK' AND id NOT IN (${linkIds.map((_: any, i: number) => `$${i + 2}`).join(',')})`,
        [capId, ...linkIds]
      );
    } else {
      await client.query(`DELETE FROM cap_recursos WHERE capacitacion_id = $1 AND tipo = 'LINK'`, [capId]);
    }
    // Upsert recursos LINK
    for (let i = 0; i < linkRecursos.length; i++) {
      const r = linkRecursos[i];
      if (!r.url_externa) continue; // sin URL no se guarda
      if (r.id) {
        await client.query(
          `UPDATE cap_recursos SET titulo=$1, descripcion=$2, url_externa=$3, orden=$4, usuario_control=$5 WHERE id=$6`,
          [r.titulo || '', r.descripcion || null, r.url_externa, i, usuario_control, r.id]
        );
      } else {
        await client.query(
          `INSERT INTO cap_recursos (capacitacion_id, tipo, titulo, descripcion, url_externa, orden, usuario_control) VALUES ($1,'LINK',$2,$3,$4,$5,$6)`,
          [capId, r.titulo || '', r.descripcion || null, r.url_externa, i, usuario_control]
        );
      }
    }

    // Sync preguntas: delete all then reinsert
    await client.query('DELETE FROM cap_preguntas WHERE capacitacion_id = $1', [capId]);

    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i];
      const pRes = await client.query(`
        INSERT INTO cap_preguntas
          (capacitacion_id, tipo, pregunta, imagen_url, imagen_drive_id, peso, orden,
           retroalimentacion_correcta, retroalimentacion_incorrecta, usuario_control)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
      `, [capId, p.tipo, p.pregunta, p.imagen_url || null, p.imagen_drive_id || null,
          p.peso || 1, (p.orden !== undefined ? p.orden - 1 : i), p.retroalimentacion_correcta || null,
          p.retroalimentacion_incorrecta || null, usuario_control]);

      const pregId = pRes.rows[0].id;
      const opciones = p.opciones || [];
      for (let j = 0; j < opciones.length; j++) {
        const o = opciones[j];
        await client.query(`
          INSERT INTO cap_opciones (pregunta_id, texto, imagen_url, imagen_drive_id, es_correcta, orden)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [pregId, o.texto || null, o.imagen_url || null, o.imagen_drive_id || null,
            o.es_correcta || false, j]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, id: capId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[CAP] saveCapacitacion:', err.message);
    res.status(500).json({ error: 'Error al guardar capacitación' });
  } finally {
    client.release();
  }
};

export const deleteCapacitacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM cap_capacitaciones WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[CAP] deleteCapacitacion:', err.message);
    res.status(500).json({ error: 'Error al eliminar' });
  }
};

// ─── UPLOAD RECURSO A DRIVE ───────────────────────────────────────────────────

export const uploadRecurso = async (req: Request, res: Response) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: 'No se recibió archivo' });

  try {
    const { capacitacion_id, titulo, descripcion, orden, usuario_control } = req.body;

    const capRes = await pool.query('SELECT drive_folder_path, titulo FROM cap_capacitaciones WHERE id = $1', [capacitacion_id]);
    if (!capRes.rows.length) return res.status(404).json({ error: 'Capacitación no encontrada' });

    const cap = capRes.rows[0];
    const folderPath = cap.drive_folder_path || `${DRIVE_BASE}/${sanitizeFolderName(cap.titulo)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const tmpPath = `/tmp/cap_recurso_${Date.now()}_${cleanName}`;

    fs.writeFileSync(tmpPath, file.buffer);
    const remotePath = `${folderPath}/recursos/${cleanName}`;
    await rcloneMkdir(`${folderPath}/recursos`);
    await rcloneCopyto(tmpPath, remotePath);
    const driveLink = await rcloneLink(remotePath);
    fs.unlinkSync(tmpPath);

    const tipo = ext === '.pdf' ? 'PDF'
      : ['.mp4', '.mov', '.avi', '.webm'].includes(ext) ? 'VIDEO'
      : ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? 'IMAGEN'
      : 'LINK';

    const ins = await pool.query(`
      INSERT INTO cap_recursos
        (capacitacion_id, tipo, titulo, descripcion, drive_link, drive_path,
         tamano_bytes, mime_type, orden, usuario_control)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
    `, [capacitacion_id, tipo, titulo || cleanName, descripcion || null,
        driveLink, remotePath, file.size, file.mimetype,
        orden || 0, usuario_control || null]);

    res.json({ success: true, id: ins.rows[0].id, driveLink });
  } catch (err: any) {
    console.error('[CAP] uploadRecurso:', err.message);
    res.status(500).json({ error: 'Error al subir recurso' });
  }
};

export const deleteRecurso = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const r = await pool.query('SELECT drive_path FROM cap_recursos WHERE id = $1', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Recurso no encontrado' });
    const drivePath = r.rows[0].drive_path;

    await pool.query('DELETE FROM cap_recursos WHERE id = $1', [id]);

    // Eliminar archivo de Drive si tiene ruta guardada
    if (drivePath) {
      rcloneDelete(drivePath).catch(() => {}); // fire-and-forget, no bloqueamos la respuesta
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al eliminar recurso' });
  }
};

// ─── ASIGNACIONES ─────────────────────────────────────────────────────────────

export const getAsignaciones = async (req: Request, res: Response) => {
  try {
    const { capacitacion_id } = req.query;
    const q = capacitacion_id
      ? 'SELECT * FROM cap_asignaciones WHERE capacitacion_id = $1 ORDER BY fecha_control DESC'
      : 'SELECT * FROM cap_asignaciones ORDER BY fecha_control DESC';
    const params = capacitacion_id ? [capacitacion_id] : [];
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al obtener asignaciones' });
  }
};

export const asignar = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { capacitacion_id, cedulas, cargo_id, fecha_inicio, fecha_fin,
      max_intentos_override, asignado_por } = req.body;

    let targetCedulas: { cedula: string; nombre: string }[] = [];

    if (cargo_id) {
      const pRes = await client.query(
        `SELECT p.cedula, p.nombre
         FROM gh_personal p
         JOIN gh_cargos c ON p.cargo = c.nombre
         WHERE c.id = $1 AND p.estado = 'ACTIVO'`, [cargo_id]
      );
      targetCedulas = pRes.rows;
    } else if (cedulas && Array.isArray(cedulas)) {
      for (const ced of cedulas) {
        const pRes = await client.query(
          `SELECT cedula, nombre FROM gh_personal WHERE cedula = $1`, [ced]
        );
        if (pRes.rows.length) {
          targetCedulas.push(pRes.rows[0]);
        } else {
          // Buscar en tabla de usuarios de la app por document_number
          const uRes = await client.query(
            `SELECT document_number AS cedula, name AS nombre FROM users WHERE document_number = $1 LIMIT 1`, [ced]
          );
          if (uRes.rows.length) targetCedulas.push(uRes.rows[0]);
          else targetCedulas.push({ cedula: ced, nombre: ced });
        }
      }
    }

    const capRes = await client.query(
      'SELECT tipo_proceso FROM cap_capacitaciones WHERE id = $1', [capacitacion_id]
    );
    const capTipoProceso = capRes.rows[0]?.tipo_proceso || 'AMBOS';
    let inserted = 0;

    for (const persona of targetCedulas) {
      // Detectar si ya tiene historial → REINDUCCION, si no → INDUCCION
      const historial = await client.query(
        `SELECT COUNT(*) AS cnt FROM cap_asignaciones
         WHERE capacitacion_id = $1 AND cedula = $2 AND estado = 'COMPLETADO'`,
        [capacitacion_id, persona.cedula]
      );
      const tipo_proceso = parseInt(historial.rows[0].cnt) > 0 ? 'REINDUCCION' : 'INDUCCION';

      // Si la capacitacion tiene tipo fijo, respetar ese
      const tipoProceso = capTipoProceso === 'AMBOS' ? tipo_proceso : capTipoProceso;

      await client.query(`
        INSERT INTO cap_asignaciones
          (capacitacion_id, cedula, nombre_colaborador, cargo_id, tipo_proceso,
           fecha_inicio, fecha_fin, max_intentos_override, asignado_por, usuario_control)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (capacitacion_id, cedula, tipo_proceso) DO UPDATE SET
          fecha_inicio = EXCLUDED.fecha_inicio,
          fecha_fin = EXCLUDED.fecha_fin,
          estado = 'PENDIENTE',
          max_intentos_override = EXCLUDED.max_intentos_override,
          asignado_por = EXCLUDED.asignado_por,
          fecha_control = NOW()
      `, [capacitacion_id, persona.cedula, persona.nombre, cargo_id || null, tipoProceso,
          fecha_inicio, fecha_fin, max_intentos_override || null, asignado_por, asignado_por]);
      inserted++;
    }

    await client.query('COMMIT');
    res.json({ success: true, asignados: inserted });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[CAP] asignar:', err.message);
    res.status(500).json({ error: 'Error al asignar capacitación' });
  } finally {
    client.release();
  }
};

// ─── DASHBOARD ANALYTICS ──────────────────────────────────────────────────────

export const getDashboard = async (req: Request, res: Response) => {
  try {
    const { capacitacion_id, cedula } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (capacitacion_id) { params.push(capacitacion_id); conditions.push(`a.capacitacion_id = $${params.length}`); }
    if (cedula)          { params.push(cedula);           conditions.push(`a.cedula = $${params.length}`); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado = 'COMPLETADO') AS completados,
        COUNT(*) FILTER (WHERE estado = 'PENDIENTE') AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'EN_CURSO') AS en_curso,
        COUNT(*) FILTER (WHERE estado = 'FALLIDO') AS fallidos,
        COUNT(*) FILTER (WHERE estado = 'VENCIDO') AS vencidos,
        COUNT(*) FILTER (WHERE estado = 'COMPLETADO' AND mejor_calificacion >= (
          SELECT nota_minima_aprobacion FROM cap_capacitaciones WHERE id = a.capacitacion_id
        )) AS aprobados,
        ROUND(AVG(mejor_calificacion) FILTER (WHERE mejor_calificacion IS NOT NULL), 1) AS promedio_calificacion,
        ROUND(AVG(intentos_realizados)::numeric, 1) AS promedio_intentos
      FROM cap_asignaciones a ${whereClause}
    `, params);

    const detalle = await pool.query(`
      SELECT
        a.*,
        c.titulo AS capacitacion_titulo,
        c.nota_minima_aprobacion,
        COALESCE(a.max_intentos_override, c.max_intentos) AS max_intentos_total,
        cert.numero_certificado,
        cert.drive_link AS certificado_link
      FROM cap_asignaciones a
      INNER JOIN cap_capacitaciones c ON c.id = a.capacitacion_id
      LEFT JOIN LATERAL (
        SELECT numero_certificado, drive_link
        FROM cap_certificados
        WHERE asignacion_id = a.id AND estado = 'VALIDO'
        ORDER BY fecha_emision DESC
        LIMIT 1
      ) cert ON true
      ${whereClause}
      ORDER BY a.fecha_control DESC
    `, params);

    res.json({ stats: stats.rows[0], detalle: detalle.rows });
  } catch (err: any) {
    console.error('[CAP] getDashboard:', err.message);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
};

// ─── API PÚBLICA (sin auth) ───────────────────────────────────────────────────

export const getPublicCapacitacion = async (req: Request, res: Response) => {
  try {
    const { id, cedula } = req.query as { id: string; cedula: string };
    if (!id || !cedula) return res.status(400).json({ error: 'Faltan parámetros' });

    // Actualizar estado VENCIDO automáticamente
    await pool.query(`
      UPDATE cap_asignaciones
      SET estado = 'VENCIDO'
      WHERE estado IN ('PENDIENTE','EN_CURSO') AND fecha_fin < CURRENT_DATE
    `);

    // Verificar tipo_acceso antes de continuar
    const capCheckRes = await pool.query(
      `SELECT tipo_acceso FROM cap_capacitaciones WHERE id = $1 AND estado = 'ACTIVO'`, [id]
    );
    if (!capCheckRes.rows.length) {
      return res.status(404).json({ error: 'Capacitación no encontrada o no está activa' });
    }
    const tipoAcceso = capCheckRes.rows[0].tipo_acceso || 'INTERNO';
    if (tipoAcceso === 'INTERNO') {
      return res.status(403).json({ error: 'Esta capacitación solo está disponible dentro de la aplicación', tipo_acceso: 'INTERNO' });
    }

    // Primero verificar si existe asignación para esta cédula (sin filtro de fechas)
    const asigExisteRes = await pool.query(
      `SELECT fecha_inicio, fecha_fin FROM cap_asignaciones
       WHERE capacitacion_id = $1 AND cedula = $2 LIMIT 1`, [id, cedula]
    );
    if (!asigExisteRes.rows.length) {
      return res.status(403).json({ error: 'No has sido asignado a esta capacitación. Contacta a Recursos Humanos.', codigo: 'NO_ASIGNADO' });
    }

    const asigRes = await pool.query(`
      SELECT a.*, c.titulo, c.descripcion, c.objetivo,
        c.nota_minima_aprobacion, c.tiempo_limite_minutos,
        COALESCE(a.max_intentos_override, c.max_intentos) AS max_intentos_total,
        c.estado AS cap_estado, c.drive_folder_path, c.formato_opciones
      FROM cap_asignaciones a
      INNER JOIN cap_capacitaciones c ON c.id = a.capacitacion_id
      WHERE a.capacitacion_id = $1 AND a.cedula = $2
        AND c.estado = 'ACTIVO'
        AND a.estado NOT IN ('VENCIDO')
        AND a.fecha_inicio <= CURRENT_DATE
        AND a.fecha_fin >= CURRENT_DATE
      ORDER BY a.id DESC LIMIT 1
    `, [id, cedula]);

    if (!asigRes.rows.length) {
      // La asignación existe pero las fechas no son válidas
      const asig = asigExisteRes.rows[0];
      const fmtCO = (d: Date) => d.toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
      const hoy = new Date();
      const inicio = new Date(asig.fecha_inicio);
      const fin = new Date(asig.fecha_fin);
      if (hoy < inicio) {
        return res.status(403).json({
          error: `Esta capacitación estará disponible a partir del ${fmtCO(inicio)}. Aún no está autorizada.`,
          codigo: 'FUERA_DE_RANGO_INICIO'
        });
      }
      if (hoy > fin) {
        return res.status(403).json({
          error: `El período para realizar esta capacitación venció el ${fmtCO(fin)}. Contacta a Recursos Humanos.`,
          codigo: 'FUERA_DE_RANGO_FIN'
        });
      }
      return res.status(403).json({ error: 'No tienes una capacitación activa asignada o tu cédula no está autorizada' });
    }

    const asignacion = asigRes.rows[0];

    // Verificar si ya agotó intentos
    if (asignacion.intentos_realizados >= asignacion.max_intentos_total
        && asignacion.estado !== 'COMPLETADO') {
      return res.status(403).json({ error: 'Has agotado los intentos disponibles', agotado: true });
    }

    const pregRes = await pool.query(
      'SELECT id, tipo, pregunta, imagen_url, orden, peso FROM cap_preguntas WHERE capacitacion_id = $1 ORDER BY orden',
      [id]
    );

    const opcRes = await pool.query(`
      SELECT o.id, o.pregunta_id, o.texto, o.imagen_url, o.orden
      FROM cap_opciones o
      INNER JOIN cap_preguntas p ON p.id = o.pregunta_id
      WHERE p.capacitacion_id = $1 ORDER BY o.pregunta_id, o.orden
    `, [id]);

    const recursosRes = await pool.query(
      'SELECT id, tipo, titulo, descripcion, drive_link, drive_path, url_externa, orden FROM cap_recursos WHERE capacitacion_id = $1 ORDER BY orden',
      [id]
    );

    const preguntas = pregRes.rows.map(p => ({
      ...p,
      opciones: opcRes.rows.filter(o => o.pregunta_id === p.id)
    }));

    // Obtener certificado si ya aprobó
    const certRes = await pool.query(
      `SELECT numero_certificado, fecha_emision, calificacion_obtenida
       FROM cap_certificados WHERE asignacion_id = $1
       ORDER BY fecha_emision DESC LIMIT 1`,
      [asignacion.id]
    );

    res.json({
      asignacion: {
        id: asignacion.id,
        capacitacion_id: asignacion.capacitacion_id,
        cedula: asignacion.cedula,
        titulo: asignacion.titulo,
        descripcion: asignacion.descripcion,
        objetivo: asignacion.objetivo,
        nota_minima_aprobacion: asignacion.nota_minima_aprobacion,
        tiempo_limite_minutos: asignacion.tiempo_limite_minutos,
        formato_opciones: asignacion.formato_opciones,
        max_intentos_total: asignacion.max_intentos_total,
        intentos_realizados: asignacion.intentos_realizados,
        estado: asignacion.estado,
        mejor_calificacion: asignacion.mejor_calificacion,
        tipo_proceso: asignacion.tipo_proceso,
      },
      preguntas,
      recursos: recursosRes.rows,
      certificado: certRes.rows[0] || null,
    });
  } catch (err: any) {
    console.error('[CAP-PUBLIC] getPublicCapacitacion:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const getCapacitacionPreview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const capRes = await pool.query(
      `SELECT id, titulo, descripcion, objetivo, nota_minima_aprobacion,
              tiempo_limite_minutos, max_intentos, tipo_proceso, tipo_acceso, formato_opciones
       FROM cap_capacitaciones WHERE id = $1`,
      [id]
    );
    if (!capRes.rows.length) return res.status(404).json({ error: 'Capacitación no encontrada' });

    const cap = capRes.rows[0];
    const pregRes = await pool.query(
      'SELECT id, tipo, pregunta, imagen_url, orden, peso FROM cap_preguntas WHERE capacitacion_id = $1 ORDER BY orden',
      [id]
    );
    const opcRes = await pool.query(
      `SELECT o.id, o.pregunta_id, o.texto, o.imagen_url, o.es_correcta, o.orden
       FROM cap_opciones o INNER JOIN cap_preguntas p ON p.id = o.pregunta_id
       WHERE p.capacitacion_id = $1 ORDER BY o.pregunta_id, o.orden`,
      [id]
    );
    const recursosRes = await pool.query(
      'SELECT id, tipo, titulo, descripcion, drive_link, drive_path, url_externa, orden FROM cap_recursos WHERE capacitacion_id = $1 ORDER BY orden',
      [id]
    );
    const preguntas = pregRes.rows.map(p => ({ ...p, opciones: opcRes.rows.filter(o => o.pregunta_id === p.id) }));
    res.json({ capacitacion: cap, preguntas, recursos: recursosRes.rows });
  } catch (err: any) {
    console.error('[CAP] getCapacitacionPreview:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const iniciarIntento = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { asignacion_id, cedula } = req.body;

    const asigRes = await client.query(`
      SELECT a.*, COALESCE(a.max_intentos_override, c.max_intentos) AS max_intentos_total
      FROM cap_asignaciones a
      INNER JOIN cap_capacitaciones c ON c.id = a.capacitacion_id
      WHERE a.id = $1 AND a.cedula = $2
    `, [asignacion_id, cedula]);

    if (!asigRes.rows.length) return res.status(404).json({ error: 'Asignación no encontrada' });
    const asig = asigRes.rows[0];

    if (asig.intentos_realizados >= asig.max_intentos_total) {
      return res.status(403).json({ error: 'Has agotado los intentos', agotado: true });
    }

    // Marcar intentos anteriores EN_CURSO como ABANDONADO
    await client.query(
      `UPDATE cap_intentos SET estado = 'ABANDONADO' WHERE asignacion_id = $1 AND estado = 'EN_CURSO'`,
      [asignacion_id]
    );

    const numeroIntento = asig.intentos_realizados + 1;
    const ins = await client.query(`
      INSERT INTO cap_intentos (asignacion_id, cedula, capacitacion_id, numero_intento, ip_address, device_info)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `, [asignacion_id, cedula, asig.capacitacion_id, numeroIntento,
        req.ip, req.headers['user-agent'] || null]);

    // Actualizar estado asignación
    await client.query(
      `UPDATE cap_asignaciones SET estado = 'EN_CURSO', intentos_realizados = $1, fecha_ultimo_intento = NOW()
       WHERE id = $2`,
      [numeroIntento, asignacion_id]
    );

    await client.query('COMMIT');
    res.json({ success: true, intento_id: ins.rows[0].id, numero_intento: numeroIntento });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[CAP-PUBLIC] iniciarIntento:', err.message);
    res.status(500).json({ error: 'Error al iniciar intento' });
  } finally {
    client.release();
  }
};

export const submitIntento = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { intento_id, asignacion_id, cedula, respuestas = [], tiempo_empleado_segundos } = req.body;

    const intentoRes = await client.query(
      'SELECT * FROM cap_intentos WHERE id = $1 AND cedula = $2', [intento_id, cedula]
    );
    if (!intentoRes.rows.length) return res.status(404).json({ error: 'Intento no encontrado' });

    const asigRes = await client.query(`
      SELECT a.*, c.nota_minima_aprobacion, c.titulo,
        COALESCE(a.max_intentos_override, c.max_intentos) AS max_intentos_total,
        c.drive_folder_path
      FROM cap_asignaciones a
      INNER JOIN cap_capacitaciones c ON c.id = a.capacitacion_id
      WHERE a.id = $1
    `, [asignacion_id]);
    const asig = asigRes.rows[0];

    // Calificar respuestas
    let totalPesos = 0;
    let puntosObtenidos = 0;

    for (const r of respuestas) {
      const pregRes = await client.query(
        'SELECT tipo, peso FROM cap_preguntas WHERE id = $1', [r.pregunta_id]
      );
      if (!pregRes.rows.length) continue;
      const preg = pregRes.rows[0];
      totalPesos += preg.peso;

      const opcionesCorrectas = await client.query(
        'SELECT id FROM cap_opciones WHERE pregunta_id = $1 AND es_correcta = TRUE', [r.pregunta_id]
      );
      const idsCorrectos = opcionesCorrectas.rows.map((o: any) => o.id).sort();
      const idsSeleccionados = (r.opciones_seleccionadas || []).map(Number).sort();

      const esCorrecta = JSON.stringify(idsCorrectos) === JSON.stringify(idsSeleccionados);
      const puntos = esCorrecta ? preg.peso : 0;
      puntosObtenidos += puntos;

      await client.query(`
        INSERT INTO cap_respuestas (intento_id, pregunta_id, opciones_seleccionadas, es_correcta, puntos_obtenidos)
        VALUES ($1,$2,$3,$4,$5)
      `, [intento_id, r.pregunta_id, r.opciones_seleccionadas || [], esCorrecta, puntos]);
    }

    const calificacion = totalPesos > 0 ? Math.round((puntosObtenidos / totalPesos) * 100) : 0;
    const aprobado = calificacion >= asig.nota_minima_aprobacion;

    // Actualizar intento
    await client.query(`
      UPDATE cap_intentos SET
        fecha_fin = NOW(), tiempo_empleado_segundos = $1,
        calificacion = $2, aprobado = $3, estado = 'COMPLETADO'
      WHERE id = $4
    `, [tiempo_empleado_segundos || null, calificacion, aprobado, intento_id]);

    // Actualizar asignación
    const nuevoEstado = aprobado ? 'COMPLETADO' : (
      asig.intentos_realizados >= asig.max_intentos_total ? 'FALLIDO' : 'EN_CURSO'
    );
    const mejorCalificacion = Math.max(calificacion, asig.mejor_calificacion || 0);

    await client.query(`
      UPDATE cap_asignaciones SET
        estado = $1, mejor_calificacion = $2,
        fecha_completado = CASE WHEN $3 THEN NOW() ELSE fecha_completado END
      WHERE id = $4
    `, [nuevoEstado, mejorCalificacion, aprobado, asignacion_id]);

    let certificado = null;

    // Generar certificado si aprobó — uno por cada intento aprobado
    if (aprobado) {
      const numRes = await client.query(`
        SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_certificado, '-', 3) AS INTEGER)), 0) + 1 AS next
        FROM cap_certificados WHERE numero_certificado LIKE 'CAP-${new Date().getFullYear()}-%'
      `);
      const num = String(numRes.rows[0].next).padStart(6, '0');
      const numeroCert = `CAP-${new Date().getFullYear()}-${num}`;

      const ins = await client.query(`
        INSERT INTO cap_certificados
          (asignacion_id, intento_id, cedula, capacitacion_id, numero_certificado,
           calificacion_obtenida, drive_file_id, drive_link, drive_path, usuario_control)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
      `, [asignacion_id, intento_id, cedula, asig.capacitacion_id, numeroCert,
          calificacion, '', '', '', cedula]);

      certificado = ins.rows[0];
    }

    await client.query('COMMIT');

    // Retroalimentación por pregunta
    const retroRes = await pool.query(`
      SELECT r.pregunta_id, r.es_correcta, r.puntos_obtenidos,
        p.retroalimentacion_correcta, p.retroalimentacion_incorrecta
      FROM cap_respuestas r
      INNER JOIN cap_preguntas p ON p.id = r.pregunta_id
      WHERE r.intento_id = $1
    `, [intento_id]);

    res.json({
      success: true,
      calificacion,
      aprobado,
      nota_minima: asig.nota_minima_aprobacion,
      estado: nuevoEstado,
      intentos_realizados: asig.intentos_realizados,
      max_intentos: asig.max_intentos_total,
      retroalimentacion: retroRes.rows,
      certificado,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[CAP-PUBLIC] submitIntento:', err.message);
    res.status(500).json({ error: 'Error al procesar respuestas' });
  } finally {
    client.release();
  }
};

// ─── GENERACIÓN CERTIFICADO PDF ───────────────────────────────────────────────

async function generarCertificadoPDF(data: {
  nombre: string;
  cedula: string;
  titulo: string;
  calificacion: number;
  numeroCert: string;
  driveFolderPath?: string | null;
}): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const W = 297;
  const H = 210;

  // Fondo blanco
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');

  // Barras superior e inferior
  doc.setFillColor(6, 78, 59); // emerald-900
  doc.rect(0, 0, W, 8, 'F');
  doc.rect(0, H - 8, W, 8, 'F');

  // Logo
  try {
    doc.addImage(LOGO_MILLA_SIETE, 'PNG', 20, 15, 35, 35);
  } catch {}

  // Título empresa
  doc.setTextColor(6, 78, 59); // emerald-900
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('MILLA 7 S.A.S', 60, 22);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFontSize(7);
  doc.text('SISTEMA INTEGRADO DE GESTIÓN', 60, 28);

  // Número certificado y fecha (derecha)
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(7);
  doc.text(`No. ${data.numeroCert}`, W - 20, 22, { align: 'right' });
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}`, W - 20, 28, { align: 'right' });

  // Separador
  doc.setDrawColor(6, 78, 59);
  doc.setLineWidth(0.5);
  doc.line(20, 55, W - 20, 55);

  // Texto central "CERTIFICADO DE CAPACITACIÓN"
  doc.setTextColor(15, 23, 42); // slate-950
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICADO DE CAPACITACIÓN', W / 2, 75, { align: 'center' });

  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Se certifica que:', W / 2, 90, { align: 'center' });

  // Nombre colaborador
  doc.setTextColor(6, 78, 59); // emerald-900
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(data.nombre.toUpperCase(), W / 2, 105, { align: 'center' });

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cédula: ${data.cedula}`, W / 2, 113, { align: 'center' });

  // Texto capacitación
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text('completó satisfactoriamente la capacitación:', W / 2, 123, { align: 'center' });

  doc.setTextColor(6, 78, 59); // emerald-900
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const tituloLines = doc.splitTextToSize(data.titulo.toUpperCase(), W - 60);
  doc.text(tituloLines, W / 2, 135, { align: 'center' });

  // Calificación
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Calificación obtenida: ${data.calificacion}/100`, W / 2, 155, { align: 'center' });

  // Separador inferior
  doc.setDrawColor(6, 78, 59);
  doc.setLineWidth(0.3);
  doc.line(20, 165, W - 20, 165);

  // Footer
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.text('Sistema OrbitM7 IQ — Gestión de Conocimiento Gamificado — Milla 7 S.A.S', W / 2, 172, { align: 'center' });
  doc.text(`Certificado válido — ${data.numeroCert}`, W / 2, 178, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
}

// ─── DESCARGA CERTIFICADO PDF ON-DEMAND ──────────────────────────────────────

export const getCertificado = async (req: Request, res: Response) => {
  try {
    const { numero } = req.params;
    const certRes = await pool.query(`
      SELECT c.*, p.nombre AS nombre_colaborador, cap.titulo
      FROM cap_certificados c
      LEFT JOIN gh_personal p ON p.cedula = c.cedula
      LEFT JOIN cap_capacitaciones cap ON cap.id = c.capacitacion_id
      WHERE c.numero_certificado = $1
    `, [numero]);
    if (!certRes.rows.length) return res.status(404).json({ error: 'Certificado no encontrado' });
    const cert = certRes.rows[0];

    const pdfBuffer = await generarCertificadoPDF({
      nombre: cert.nombre_colaborador || cert.cedula,
      cedula: cert.cedula,
      titulo: cert.titulo,
      calificacion: cert.calificacion_obtenida,
      numeroCert: cert.numero_certificado,
    });

    const fileName = `CERT_${cert.cedula}_${cert.numero_certificado}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al generar certificado' });
  }
};

export const getCertificadosByAsignacion = async (req: Request, res: Response) => {
  try {
    const { asignacion_id } = req.params;
    const result = await pool.query(
      'SELECT * FROM cap_certificados WHERE asignacion_id = $1 ORDER BY fecha_emision DESC',
      [asignacion_id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al obtener certificados' });
  }
};

// ─── GESTIÓN DE ASIGNACIONES (reset / ampliar intentos / ver intentos) ────────

export const resetAsignacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { usuario_control } = req.body;
    // Resetea la asignación: vuelve a PENDIENTE, limpia intentos y restaura max_intentos al valor original de la capacitación
    await pool.query(`
      UPDATE cap_asignaciones SET
        estado = 'PENDIENTE',
        intentos_realizados = 0,
        mejor_calificacion = NULL,
        max_intentos_override = NULL,
        usuario_control = $2,
        fecha_control = NOW()
      WHERE id = $1
    `, [id, usuario_control || 'admin']);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[CAP] resetAsignacion:', err.message);
    res.status(500).json({ error: 'Error al resetear asignación' });
  }
};

export const ampliarIntentos = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cantidad = 1, usuario_control } = req.body;
    const cantidadNum = parseInt(cantidad, 10);
    if (isNaN(cantidadNum) || cantidadNum === 0) {
      return res.status(400).json({ error: 'Cantidad inválida' });
    }
    // Check current state to validate minimum
    const check = await pool.query(`
      SELECT intentos_realizados,
             COALESCE(max_intentos_override, c.max_intentos) AS max_actual
      FROM cap_asignaciones a
      JOIN cap_capacitaciones c ON c.id = a.capacitacion_id
      WHERE a.id = $1
    `, [id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Asignación no encontrada' });
    const { intentos_realizados, max_actual } = check.rows[0];
    const nuevo_max = max_actual + cantidadNum;
    if (nuevo_max < 1) {
      return res.status(400).json({ error: 'El máximo de intentos no puede ser menor a 1' });
    }
    if (nuevo_max < intentos_realizados) {
      return res.status(400).json({ error: `No se puede reducir por debajo de los intentos ya realizados (${intentos_realizados})` });
    }
    const result = await pool.query(`
      UPDATE cap_asignaciones SET
        max_intentos_override = $2,
        usuario_control = $3,
        fecha_control = NOW()
      WHERE id = $1
      RETURNING max_intentos_override AS nuevo_max
    `, [id, nuevo_max, usuario_control || 'admin']);
    res.json({ success: true, nuevo_max: result.rows[0]?.nuevo_max });
  } catch (err: any) {
    console.error('[CAP] ampliarIntentos:', err.message);
    res.status(500).json({ error: 'Error al ampliar intentos' });
  }
};

export const getIntentosByAsignacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT
        i.id,
        i.numero_intento,
        i.estado,
        i.fecha_inicio,
        i.fecha_fin,
        i.calificacion,
        i.aprobado,
        i.tiempo_empleado_segundos,
        cert.numero_certificado
      FROM cap_intentos i
      LEFT JOIN cap_certificados cert ON cert.intento_id = i.id
      WHERE i.asignacion_id = $1
      ORDER BY i.fecha_inicio DESC
    `, [id]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[CAP] getIntentosByAsignacion:', err.message);
    res.status(500).json({ error: 'Error al obtener intentos' });
  }
};

// ─── CARGOS (para asignación masiva) ─────────────────────────────────────────

export const actualizarFechasAsignacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fecha_inicio, fecha_fin } = req.body;
    if (!fecha_inicio || !fecha_fin) return res.status(400).json({ error: 'Fechas requeridas' });
    if (new Date(fecha_fin) < new Date(fecha_inicio)) return res.status(400).json({ error: 'La fecha fin no puede ser anterior a la fecha inicio' });
    await pool.query(
      `UPDATE cap_asignaciones SET fecha_inicio = $1, fecha_fin = $2 WHERE id = $3`,
      [fecha_inicio, fecha_fin, id]
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al actualizar fechas' });
  }
};

export const getCargos = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre FROM gh_cargos WHERE estado = 'ACTIVO' ORDER BY nombre`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al obtener cargos' });
  }
};

// ─── DESCARGA DE EVALUACIÓN PDF (FORMATO F-GA-016) ───────────────────────────
export const descargarEvaluacionPDF = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const r = await pool.query(`
      SELECT i.*, a.nombre_colaborador, a.cedula, c.titulo, p.cargo, p.operacion
      FROM cap_intentos i
      JOIN cap_asignaciones a ON a.id = i.asignacion_id
      JOIN cap_capacitaciones c ON c.id = i.capacitacion_id
      LEFT JOIN gh_personal p ON p.cedula = a.cedula
      WHERE i.id = $1
    `, [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Intento no encontrado' });
    const intento = r.rows[0];

    const pregRes = await pool.query('SELECT * FROM cap_preguntas WHERE capacitacion_id = $1 ORDER BY orden', [intento.capacitacion_id]);
    const opcRes = await pool.query('SELECT * FROM cap_opciones WHERE pregunta_id IN (SELECT id FROM cap_preguntas WHERE capacitacion_id = $1) ORDER BY orden', [intento.capacitacion_id]);
    const respRes = await pool.query('SELECT * FROM cap_respuestas WHERE intento_id = $1', [id]);

    const preguntas = pregRes.rows.map(p => ({
      ...p,
      opciones: opcRes.rows.filter(o => o.pregunta_id === p.id),
      respuesta: respRes.rows.find(res => res.pregunta_id === p.id)
    }));

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, H = 297;
    const margin = 15;
    
    // Marco exterior
    doc.setLineWidth(0.3);
    doc.rect(margin, margin, W - (margin*2), H - (margin*2));
    
    // Header Table (Row 1)
    doc.rect(margin, margin, 40, 25); // Logo cell
    try { doc.addImage(LOGO_MILLA_SIETE, 'PNG', margin + 2, margin + 3, 36, 19); } catch {}
    
    doc.rect(margin + 40, margin, W - (margin*2) - 80, 25); // Middle title cell
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SISTEMA INTEGRADO DE GESTIÓN BASC - PESV - AMBIENTAL - SG-SST', margin + 40 + (W-30-80)/2, margin + 7, { align: 'center' });
    doc.setFontSize(10);
    doc.text('EVALUACIÓN INDUCCIÓN - REINDUCCIÓN', margin + 40 + (W-30-80)/2, margin + 17, { align: 'center' });
    
    doc.rect(W - margin - 40, margin, 40, 25); // Right cell
    doc.setFontSize(8);
    doc.text('CÓDIGO: F-GA-026\nVERSIÓN: 01\nFECHA 17/01/2025', W - margin - 38, margin + 7);
    
    // Info Table
    let y = margin + 25;
    doc.rect(margin, y, 100, 7);
    doc.rect(margin + 100, y, W - (margin*2) - 100, 7);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Nombre Completo: `, margin + 2, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(intento.nombre_colaborador || intento.cedula, margin + 32, y + 5);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Fecha Evaluación: `, margin + 102, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(intento.fecha_inicio ? new Date(intento.fecha_inicio).toLocaleDateString('es-CO') : '', margin + 132, y + 5);
    
    y += 7;
    doc.rect(margin, y, 100, 7);
    doc.rect(margin + 100, y, W - (margin*2) - 100, 7);
    doc.setFont('helvetica', 'bold');
    doc.text(`Cargo: `, margin + 2, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(intento.cargo || '', margin + 15, y + 5);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Operación: `, margin + 102, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(intento.operacion || '', margin + 122, y + 5);
    
    y += 15;
    
    // Preguntas
    doc.setFontSize(10);
    for (let idx = 0; idx < preguntas.length; idx++) {
       const p = preguntas[idx];
       doc.setFont('helvetica', 'bold');
       const num = idx + 1;
       const qLines = doc.splitTextToSize(`${num}. ${p.pregunta}`, W - (margin*2) - 4);
       
       if (y + (qLines.length * 5) > H - margin - 10) { 
         doc.addPage(); doc.rect(margin, margin, W - (margin*2), H - (margin*2)); y = margin + 10; 
       }
       doc.text(qLines, margin + 2, y);
       y += qLines.length * 5;
       
       doc.setFont('helvetica', 'normal');
       const pResp = p.respuesta;
       
       // Parse opciones_seleccionadas safely
       let rawSelected = pResp?.opciones_seleccionadas;
       let userSelected: string[] = [];
       if (typeof rawSelected === 'string') {
         userSelected = rawSelected.replace(/[{}[\]"]/g, '').split(',').map(x => x.trim()).filter(Boolean);
       } else if (Array.isArray(rawSelected)) {
         userSelected = rawSelected.map(String);
       }
       
       p.opciones.forEach((o: any, oidx: number) => {
         const prefix = p.tipo === 'asociacion' ? '' : `${String.fromCharCode(97 + oidx)}) `; // a), b), c)
         const isSelected = userSelected.includes(String(o.id));
         
         let optionText = p.tipo === 'asociacion' 
            ? `• ${o.texto}   -->   ${o.imagen_url || ''}` 
            : `${prefix}${o.texto}`;
         
         const txt = doc.splitTextToSize(optionText, W - (margin*2) - 10);
         if (y + (txt.length * 5) > H - margin - 10) { 
           doc.addPage(); doc.rect(margin, margin, W - (margin*2), H - (margin*2)); y = margin + 10; 
         }
         
         if (isSelected) {
           doc.setFillColor(255, 255, 0); // Amarillo
           const textWidth = doc.getTextWidth(txt[0]);
           doc.rect(margin + 2, y - 3.5, textWidth + 2, (txt.length * 5) - 1, 'F');
         }
         doc.text(txt, margin + 4, y);
         y += txt.length * 5;
       });
       y += 4;
    }
    
    if (y + 35 > H - margin - 10) { 
      doc.addPage(); doc.rect(margin, margin, W - (margin*2), H - (margin*2)); y = margin + 10; 
    }
    
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.text('Aprobado', margin + 2, y);
    doc.rect(margin + 25, y - 4, 5, 5);
    if (intento.aprobado) {
      doc.setFont('helvetica', 'bold');
      doc.text('X', margin + 26, y);
      doc.setFont('helvetica', 'normal');
    }
    
    y += 8;
    doc.text('No Aprobado', margin + 2, y);
    doc.rect(margin + 25, y - 4, 5, 5);
    if (!intento.aprobado) {
      doc.setFont('helvetica', 'bold');
      doc.text('X', margin + 26, y);
      doc.setFont('helvetica', 'normal');
    }
    
    y += 20;
    doc.text('Firma del Evaluador: _________________________________', margin + 2, y);
    
    const buffer = Buffer.from(doc.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Evaluacion_${intento.cedula}.pdf`);
    res.send(buffer);
  } catch (err: any) {
    console.error('[CAP] descargarEvaluacionPDF:', err.message);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
};
// Trigger CI
