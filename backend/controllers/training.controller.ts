import { Request, Response } from 'express';
import pool from '../config/database.js';

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
    res.status(500).json({ error: "Error al obtener sesiones" });
  }
};

export const saveSession = async (req: Request, res: Response) => {
  const s = req.body;
  try {
    const tracking_token = s.trackingToken || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Calcular expires_at si viene duration_minutes
    let expires_at = s.expiresAt;
    if (!expires_at && s.durationMinutes) {
        const date = new Date(s.scheduledAt || Date.now());
        date.setMinutes(date.getMinutes() + parseInt(s.durationMinutes) + 60); // 1h de gracia por defecto
        expires_at = date.toISOString();
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
        s.locationType, s.scheduledAt, s.durationMinutes, expires_at, 
        JSON.stringify(s.screenshots || []), tracking_token, s.createdBy
    ]);
    res.json({ success: true, tracking_token });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar sesión de capacitación" });
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
    // Validar expiración de nuevo por seguridad
    const sess = await pool.query('SELECT expires_at FROM training_sessions WHERE id = $1', [sessionId]);
    if (sess.rowCount > 0 && sess.rows[0].expires_at && new Date(sess.rows[0].expires_at) < new Date()) {
        return res.status(410).json({ error: "No es posible registrar asistencia. El tiempo ha expirado." });
    }

    await pool.query(`
      INSERT INTO training_attendance (session_id, full_name, document_number, job_title, signature_b64, registered_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [sessionId, fullName, documentNumber, jobTitle, signatureB64]);
    
    res.json({ success: true, message: "Asistencia registrada con éxito" });
  } catch (err: any) {
    res.status(500).json({ error: "Error al registrar asistencia" });
  }
};
