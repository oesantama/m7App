import { API_URL, fetchJson, fetchPublic } from './client';

export const noticiasApi = {
  noticiasGetAll: () => fetchJson(`${API_URL}/noticias`),
  noticiasSave: (data: any) => fetchJson(`${API_URL}/noticias${data.id ? `/${data.id}` : ''}`, {
    method: data.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  noticiasDelete: (id: number) => fetchJson(`${API_URL}/noticias/${id}`, { method: 'DELETE' }),
  noticiasDeleteArchivo: (id: number) => fetchJson(`${API_URL}/noticias/${id}/archivo`, { method: 'DELETE' }),
  noticiasUpload: (file: File, titulo?: string) => {
    const fd = new FormData();
    fd.append('archivo', file);
    if (titulo) fd.append('titulo', titulo);
    return fetchJson(`${API_URL}/noticias/upload`, { method: 'POST', body: fd });
  },
  noticiasGetFeed: () => fetchJson(`${API_URL}/noticias/feed`),
  noticiasGetPublicFeed: () => fetchPublic(`${API_URL}/noticias/public/feed`),
  noticiasStreamUrl: (id: number) => `${API_URL}/noticias/${id}/stream`,
  noticiasPublicStreamUrl: (id: number) => `${API_URL}/noticias/public/${id}/stream`,
  noticiasGetPublicById: (id: number) => fetchJson(`${API_URL}/noticias/public/${id}`),
};
