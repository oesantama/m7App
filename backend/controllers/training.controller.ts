import { Request, Response } from 'express';
import { exec } from 'child_process';
import pool from '../config/database.js';
import { generateAsistenciaPDF, uploadAsistenciaToDrive } from '../services/asistencia-pdf.service.js';

function checkRclone(): Promise<boolean> {
  return new Promise(resolve => exec('which rclone', err => resolve(!err)));
}

// --- CATEGORÍAS ---
export const getCategories = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM training_categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener categorías de capacitación" });
  }
};

// --- CURSOS ---
export const getCourses = async (req: Request, res: Response) => {
  const { category_id, level } = req.query;
  try {
    let query = 'SELECT * FROM training_courses WHERE status_id = \'EST-01\'';
    const params: any[] = [];
    if (category_id) {
      params.push(category_id);
      query += ` AND category_id = $${params.length}`;
    }
    if (level) {
      params.push(level);
      query += ` AND level = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener cursos" });
  }
};

export const getCourseWithLessons = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.query;
  try {
    const courseRes = await pool.query('SELECT * FROM training_courses WHERE id = $1', [id]);
    if (courseRes.rowCount === 0) return res.status(404).json({ error: "Curso no encontrado" });

    const lessonsRes = await pool.query(`
      SELECT l.*, p.status as progress_status, p.finished_at
      FROM training_lessons l
      LEFT JOIN user_training_progress p ON l.id = p.lesson_id AND p.user_id = $2
      WHERE l.course_id = $1
      ORDER BY l.order ASC
    `, [id, userId]);

    res.json({
      ...courseRes.rows[0],
      lessons: lessonsRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener detalles del curso" });
  }
};

// --- PROGRESO ---
export const updateProgress = async (req: Request, res: Response) => {
  const { user_id, lesson_id, status } = req.body;
  try {
    const finished_at = status === 'completed' ? 'CURRENT_TIMESTAMP' : 'NULL';
    await pool.query(`
      INSERT INTO user_training_progress (user_id, lesson_id, status, finished_at, updated_at)
      VALUES ($1, $2, $3, ${finished_at === 'NULL' ? 'NULL' : 'CURRENT_TIMESTAMP'}, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET
      status = $3, finished_at = ${finished_at === 'NULL' ? 'NULL' : 'CURRENT_TIMESTAMP'}, updated_at = CURRENT_TIMESTAMP
    `, [user_id, lesson_id, status]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Error al actualizar progreso" });
  }
};

// --- ADMIN: GUARDAR CURSO/LECCIÓN ---
export const saveCourse = async (req: Request, res: Response) => {
  const c = req.body;
  try {
    await pool.query(`
      INSERT INTO training_courses (id, category_id, title, description, cover_image, level, status_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      category_id = $2, title = $3, description = $4, cover_image = $5, level = $6, status_id = $7
    `, [c.id, c.categoryId, c.title, c.description, c.coverImage, c.level || 1, c.statusId || 'EST-01']);
    res.json({ success: true, message: 'Curso guardado correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar curso" });
  }
};

export const saveLesson = async (req: Request, res: Response) => {
  const l = req.body;
  try {
    await pool.query(`
      INSERT INTO training_lessons (id, course_id, title, content, video_url, resource_url, "order", created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      course_id = $2, title = $3, content = $4, video_url = $5, resource_url = $6, "order" = $7
    `, [l.id, l.courseId, l.title, l.content, l.videoUrl, l.resourceUrl, l.order]);
    res.json({ success: true, message: 'Lección guardada correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar lección" });
  }
};
// --- SESIONES DE CAPACITACIÓN ---
export const getSessions = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM training_sessions ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[TRAINING-CTRL] ERROR getSessions:', err.message);
    res.status(500).json({ error: "Error al obtener sesiones", detail: err.message });
  }
};

export const saveSession = async (req: Request, res: Response) => {
  const s = req.body;
  try {
    const tracking_token = s.trackingToken || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Calcular expires_at si viene duration_minutes
    let expires_at = s.expiresAt;
    if (!expires_at && s.durationMinutes) {
        try {
            const baseDate = s.scheduledAt ? new Date(s.scheduledAt) : new Date();
            if (!isNaN(baseDate.getTime())) {
                baseDate.setMinutes(baseDate.getMinutes() + (parseInt(s.durationMinutes) || 60) + 60);
                expires_at = baseDate.toISOString();
            }
        } catch (e) {
            console.warn("[TRAINING-CTRL] Error calculando expiración:", e);
        }
    }

    // Asegurar que expires_at sea null si es inválido para evitar crash en toISOString o DB
    if (expires_at && isNaN(new Date(expires_at).getTime())) {
        expires_at = null;
    }

    await pool.query(`
      INSERT INTO training_sessions (
        id, topic, content, instructor, location_type, scheduled_at, 
        duration_minutes, expires_at, screenshots, tracking_token, 
        created_by, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        topic = $2, content = $3, instructor = $4, location_type = $5, 
        scheduled_at = $6, duration_minutes = $7, expires_at = $8, 
        screenshots = $9, tracking_token = $10, updated_at = CURRENT_TIMESTAMP
    `, [
        s.id || `sess-${Date.now()}`, s.topic, s.content, s.instructor, 
        s.locationType, s.scheduledAt || null, parseInt(s.durationMinutes) || 0, expires_at, 
        JSON.stringify(s.screenshots || []), tracking_token, s.createdBy || (req as any).user?.id || 'SYSTEM'
    ]);
    res.json({ success: true, tracking_token });
  } catch (err: any) {
    console.error("[TRAINING-CTRL] ERROR CRÍTICO AL GUARDAR SESIÓN:", err);
    res.status(500).json({
        error: "Error al guardar sesión de capacitación",
        hint: "Verifique que las tablas existan y las fechas sean válidas"
    });
  }
};

export const extendSession = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newExpiresAt } = req.body;
  try {
    if (!newExpiresAt || isNaN(new Date(newExpiresAt).getTime())) {
      return res.status(400).json({ error: "Fecha de expiración inválida" });
    }
    const result = await pool.query(
      'UPDATE training_sessions SET expires_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, expires_at',
      [new Date(newExpiresAt).toISOString(), id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Sesión no encontrada" });
    res.json({ success: true, expires_at: result.rows[0].expires_at });
  } catch (err: any) {
    res.status(500).json({ error: "Error al actualizar expiración" });
  }
};

export const getSessionAttendance = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM training_attendance WHERE session_id = $1 ORDER BY registered_at DESC', [id]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener asistencias" });
  }
};

// --- API PÚBLICA ---
export const getPublicSession = async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, topic, content, instructor, expires_at, location_type, scheduled_at, duration_minutes FROM training_sessions WHERE tracking_token = $1', 
      [token]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Capacitación no encontrada" });
    
    const session = result.rows[0];
    const now = new Date();
    if (session.expires_at && new Date(session.expires_at) < now) {
        return res.status(410).json({ error: "El link de asistencia ha expirado", expired: true });
    }

    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener datos de la sesión" });
  }
};

export const registerPublicAttendance = async (req: Request, res: Response) => {
  const { sessionId, fullName, documentNumber, jobTitle, signatureB64 } = req.body;
  try {
    const sess = await pool.query('SELECT * FROM training_sessions WHERE id = $1', [sessionId]);
    if (sess.rowCount > 0 && sess.rows[0].expires_at && new Date(sess.rows[0].expires_at) < new Date()) {
        return res.status(410).json({ error: "No es posible registrar asistencia. El tiempo ha expirado." });
    }

    await pool.query(`
      INSERT INTO training_attendance (session_id, full_name, document_number, job_title, signature_b64, registered_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [sessionId, fullName, documentNumber, jobTitle, signatureB64]);

    res.json({ success: true, message: "Asistencia registrada con éxito" });

    // Auto-upload a Drive en background
    if (sess.rowCount > 0) {
      triggerSessionAsistenciaDrive(sessionId, sess.rows[0]).catch(e =>
        console.error('[TRAINING-ASIST-AUTO]', e.message)
      );
    }
  } catch (err: any) {
    res.status(500).json({ error: "Error al registrar asistencia" });
  }
};

async function triggerSessionAsistenciaDrive(sessionId: string, sess: any): Promise<void> {
  if (!(await checkRclone())) {
    console.log('[TRAINING-ASIST-AUTO] rclone no disponible, omitiendo Drive upload');
    return;
  }

  // Solo subir si hay firmas nuevas pendientes
  const pendingRes = await pool.query(
    'SELECT COUNT(*) FROM training_attendance WHERE session_id=$1 AND signature_b64 IS NOT NULL',
    [sessionId]
  );
  if (parseInt(pendingRes.rows[0].count) === 0) {
    console.log(`[TRAINING-ASIST] Sin firmas pendientes para sesión ${sessionId}, omitiendo upload`);
    return;
  }

  const attRes = await pool.query(
    'SELECT id, full_name AS nombre_completo, document_number AS cedula, job_title AS cargo, signature_b64 AS firma_b64, registered_at AS fecha_registro FROM training_attendance WHERE session_id=$1 ORDER BY registered_at ASC',
    [sessionId]
  );
  if (!attRes.rowCount) return;

  const pdf = await generateAsistenciaPDF(attRes.rows, {
    titulo: sess.topic,
    instructor: sess.instructor,
    tipo: sess.location_type,
    fecha_sesion: sess.scheduled_at
      ? new Date(sess.scheduled_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
      : undefined,
  });
  const { drive_path } = await uploadAsistenciaToDrive(pdf, sess.topic);

  await pool.query('UPDATE training_sessions SET asistencia_drive_path=$1 WHERE id=$2', [drive_path, sessionId]);
  await pool.query('UPDATE training_attendance SET signature_b64 = NULL WHERE session_id=$1', [sessionId]);
  console.log(`[TRAINING-ASIST] Drive actualizado para sesión ${sessionId} (${attRes.rowCount} registros)`);
}

// Descarga PDF de asistencia de una sesión — primero sincroniza pendientes, luego baja desde Drive
export const downloadSessionPDF = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const sessRes = await pool.query('SELECT * FROM training_sessions WHERE id = $1', [id]);
    if (!sessRes.rowCount) return res.status(404).json({ error: 'Sesión no encontrada' });
    const sess = sessRes.rows[0];

    // Sincronizar solo si hay firmas pendientes
    await triggerSessionAsistenciaDrive(String(id), sess).catch(e =>
      console.warn('[TRAINING-PDF] sync Drive falló:', e.message)
    );

    // Releer la ruta actualizada
    const updated = await pool.query('SELECT asistencia_drive_path FROM training_sessions WHERE id=$1', [id]);
    const drivePath: string | null = updated.rows[0]?.asistencia_drive_path || null;

    const safeName = sess.topic.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Asistencia_${safeName}.pdf"` });

    if (drivePath && await checkRclone()) {
      console.log(`[TRAINING-PDF] Sirviendo desde Drive: ${drivePath}`);
      const { spawn } = await import('child_process');
      const proc = spawn('rclone', ['cat', `gdrive_cumplidos:${drivePath}`]);
      proc.stdout.pipe(res);
      proc.stderr.on('data', (d) => console.error('[TRAINING-PDF-STREAM]', d.toString()));
      proc.on('error', () => res.status(500).end());
      return;
    }

    // Fallback: generar desde DB
    console.warn(`[TRAINING-PDF] Sin ruta Drive para sesión ${id}, generando desde DB`);
    const attRes = await pool.query(
      'SELECT full_name AS nombre_completo, document_number AS cedula, job_title AS cargo, signature_b64 AS firma_b64, registered_at AS fecha_registro FROM training_attendance WHERE session_id = $1 ORDER BY registered_at ASC',
      [id]
    );
    const pdf = await generateAsistenciaPDF(attRes.rows, {
      titulo: sess.topic,
      instructor: sess.instructor,
      tipo: sess.location_type,
      fecha_sesion: sess.scheduled_at ? new Date(sess.scheduled_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : undefined,
    });
    res.send(pdf);
  } catch (err: any) {
    console.error('[TRAINING-PDF]', err.message);
    res.status(500).json({ error: 'Error generando PDF' });
  }
};

// Sube PDF de asistencia a Drive
export const uploadSessionPDFToDrive = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const sessRes = await pool.query('SELECT * FROM training_sessions WHERE id = $1', [id]);
    if (!sessRes.rowCount) return res.status(404).json({ error: 'Sesión no encontrada' });
    const sess = sessRes.rows[0];

    const attRes = await pool.query(
      'SELECT full_name AS nombre_completo, document_number AS cedula, job_title AS cargo, signature_b64 AS firma_b64, registered_at AS fecha_registro FROM training_attendance WHERE session_id = $1 ORDER BY registered_at ASC',
      [id]
    );

    const pdf = await generateAsistenciaPDF(attRes.rows, {
      titulo: sess.topic,
      instructor: sess.instructor,
      tipo: sess.location_type,
      fecha_sesion: sess.scheduled_at ? new Date(sess.scheduled_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : undefined,
    });

    const { drive_path, drive_link } = await uploadAsistenciaToDrive(pdf, sess.topic);
    res.json({ success: true, drive_path, drive_link, total: attRes.rowCount });
  } catch (err: any) {
    console.error('[TRAINING-DRIVE]', err.message);
    res.status(500).json({ error: 'Error subiendo PDF a Drive' });
  }
};

// Migración masiva: genera y sube PDFs de todas las sesiones que tienen asistentes
export const migrateAllSessionsPDF = async (req: Request, res: Response) => {
  try {
    const sessRes = await pool.query(`
      SELECT DISTINCT s.id, s.topic, s.instructor, s.location_type, s.scheduled_at
      FROM training_sessions s
      JOIN training_attendance a ON a.session_id = s.id
    `);

    const results: { id: string; topic: string; link: string; total: number }[] = [];
    for (const sess of sessRes.rows) {
      try {
        const attRes = await pool.query(
          'SELECT full_name AS nombre_completo, document_number AS cedula, job_title AS cargo, signature_b64 AS firma_b64, registered_at AS fecha_registro FROM training_attendance WHERE session_id = $1 ORDER BY registered_at ASC',
          [sess.id]
        );
        const pdf = await generateAsistenciaPDF(attRes.rows, {
          titulo: sess.topic,
          instructor: sess.instructor,
          tipo: sess.location_type,
          fecha_sesion: sess.scheduled_at ? new Date(sess.scheduled_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : undefined,
        });
        const { drive_link } = await uploadAsistenciaToDrive(pdf, sess.topic);
        results.push({ id: sess.id, topic: sess.topic, link: drive_link, total: attRes.rowCount ?? 0 });
      } catch (e: any) {
        results.push({ id: sess.id, topic: sess.topic, link: '', total: 0 });
      }
    }
    res.json({ success: true, migrated: results.length, results });
  } catch (err: any) {
    console.error('[TRAINING-MIGRATE]', err.message);
    res.status(500).json({ error: 'Error en migración masiva' });
  }
};
