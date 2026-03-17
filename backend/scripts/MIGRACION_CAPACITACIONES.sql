-- SCRIPT DE MIGRACIÓN: MÓDULO DE CAPACITACIONES (MILLA 7)
-- Ejecutar en la base de datos de producción para habilitar Sesiones y Asistencias.

BEGIN;

CREATE TABLE IF NOT EXISTS training_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_courses (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES training_categories(id),
    title TEXT NOT NULL,
    description TEXT,
    cover_image TEXT,
    level NUMERIC DEFAULT 0,
    status_id TEXT DEFAULT 'EST-01',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_lessons (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES training_courses(id),
    title TEXT NOT NULL,
    content TEXT,
    video_url TEXT,
    resource_url TEXT,
    "order" NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_training_progress (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    lesson_id TEXT REFERENCES training_lessons(id),
    status TEXT,
    finished_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_sessions (
    id TEXT PRIMARY KEY, -- DEBE SER TEXT PARA SOPORTAR 'sess-...'
    topic TEXT NOT NULL,
    content TEXT,
    instructor TEXT,
    location_type TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    duration_minutes NUMERIC DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    screenshots JSONB DEFAULT '[]',
    tracking_token TEXT,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_attendance (
    id SERIAL PRIMARY KEY, -- SERIAL PARA AUTO-GENERAR ID
    session_id TEXT REFERENCES training_sessions(id) ON DELETE CASCADE,
    full_name TEXT,
    document_number TEXT,
    job_title TEXT,
    signature_b64 TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
