import { API_URL, fetchJson, fetchPublic } from './client';

export const trainingApi = {
  // --- CAPACITACIONES (Centro de Capacitaciones) ---
  getTrainingCategories: () => fetchJson(`${API_URL}/training/categories?_t=${Date.now()}`),
  getTrainingCourses: (categoryId?: string, level?: number) => {
    let url = `${API_URL}/training/courses?_t=${Date.now()}`;
    if (categoryId) url += `&category_id=${categoryId}`;
    if (level) url += `&level=${level}`;
    return fetchJson(url);
  },
  getCourseWithLessons: (courseId: string, userId: string) => fetchJson(`${API_URL}/training/courses/${courseId}?userId=${userId}&_t=${Date.now()}`),
  updateTrainingProgress: (data: { user_id: string, lesson_id: string, status: string }) => fetchJson(`${API_URL}/training/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  saveTrainingCourse: (data: any) => fetchJson(`${API_URL}/training/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  saveTrainingLesson: (data: any) => fetchJson(`${API_URL}/training/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  // --- SONDEOS Y ENCUESTAS ---
  getSondeos: () => fetchJson(`${API_URL}/sondeos`),
  getSondeoById: (id: string | number) => fetchJson(`${API_URL}/sondeos/${id}`),
  saveSondeo: (data: any, id?: string | number) => fetchJson(id ? `${API_URL}/sondeos/${id}` : `${API_URL}/sondeos`, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteSondeo: (id: string | number) => fetchJson(`${API_URL}/sondeos/${id}`, { method: 'DELETE' }),
  getSondeosAppFeed: () => fetchJson(`${API_URL}/sondeos/feed`),
  getSondeoPublico: (id: string | number) => fetchPublic(`${API_URL}/sondeos/public/${id}`),
  submitSondeoRespuesta: (id: string | number, data: { nombre_encuestado?: string; documento_encuestado?: string; respuestas: any }) =>
    fetchPublic(`${API_URL}/sondeos/public/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getSondeoResultados: (id: string | number) => fetchJson(`${API_URL}/sondeos/${id}/resultados`),
};
