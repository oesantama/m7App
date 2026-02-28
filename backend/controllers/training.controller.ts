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
    const params = [];
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
