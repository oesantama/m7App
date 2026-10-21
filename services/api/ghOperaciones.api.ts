import { API_URL, getStoredToken, fetchJson } from './client';

const qs = (params: Record<string, any>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Hoja de Vida de Activos y Mensajería (Gestión Humana). */
export const ghOperacionesApi = {
  // ── Activos ──
  /** Tipos (Misceláneos GH), marcas y proveedores (Configuración Maestros) y estados de activo. */
  ghActivosCatalogos: () => fetchJson(`${API_URL}/gh-activos/catalogos`),
  ghActivosList: (params: Record<string, any>) => fetchJson(`${API_URL}/gh-activos${qs(params)}`),
  ghActivosDashboard: (params: Record<string, any> = {}) => fetchJson(`${API_URL}/gh-activos/dashboard${qs(params)}`),
  ghActivosGet: (id: number) => fetchJson(`${API_URL}/gh-activos/${id}`),
  ghActivosSave: (data: any) => data.id
    ? fetchJson(`${API_URL}/gh-activos/${data.id}`, { method: 'PUT', body: JSON.stringify(data) })
    : fetchJson(`${API_URL}/gh-activos`, { method: 'POST', body: JSON.stringify(data) }),
  ghActivosDelete: (id: number) => fetchJson(`${API_URL}/gh-activos/${id}`, { method: 'DELETE' }),
  ghActivosCreateEvento: (id: number, data: Record<string, any>, archivos: File[]) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, String(v)); });
    archivos.forEach(f => fd.append('archivos', f));
    return fetchJson(`${API_URL}/gh-activos/${id}/eventos`, { method: 'POST', body: fd });
  },
  ghActivosArchivoUrl: (archivoId: number) => `${API_URL}/gh-activos/archivos/${archivoId}`,

  // ── Mensajería (panel) ──
  ghMsjMensajeros: () => fetchJson(`${API_URL}/gh-mensajeria/mensajeros`),
  ghMsjDashboard: () => fetchJson(`${API_URL}/gh-mensajeria/dashboard`),
  ghMsjAlertas: () => fetchJson(`${API_URL}/gh-mensajeria/alertas`),
  ghMsjList: (params: Record<string, any>) => fetchJson(`${API_URL}/gh-mensajeria/envios${qs(params)}`),
  ghMsjGet: (id: number) => fetchJson(`${API_URL}/gh-mensajeria/envios/${id}`),
  ghMsjCreate: (data: any) => fetchJson(`${API_URL}/gh-mensajeria/envios`, { method: 'POST', body: JSON.stringify(data) }),
  ghMsjCambiarEstado: (id: number, data: { estado: string; motivo?: string; mensajero_id?: number }) =>
    fetchJson(`${API_URL}/gh-mensajeria/envios/${id}/estado`, { method: 'POST', body: JSON.stringify(data) }),
  ghMsjArchivoUrl: (archivoId: number) => `${API_URL}/gh-mensajeria/archivos/${archivoId}`,

  // ── Mensajería (mensajero) ──
  ghMsjMisEnvios: () => fetchJson(`${API_URL}/gh-mensajeria/mis-envios`),
  ghMsjMiEnvio: (id: number) => fetchJson(`${API_URL}/gh-mensajeria/mis-envios/${id}`),
};

/**
 * Descarga un archivo protegido (firma/foto) con el token y devuelve un object URL.
 * Las evidencias nunca se exponen con links públicos: siempre pasan por el backend.
 */
export async function fetchProtectedObjectUrl(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getStoredToken()}` }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

export type AccionMensajero = 'recoger' | 'entregar' | 'incidencia';

export class AccionRechazadaError extends Error {}

/**
 * Envía una acción del mensajero (multipart con firma/foto). Distingue entre fallo de red
 * (lanza TypeError → se encola para sincronizar después) y rechazo del servidor
 * (lanza AccionRechazadaError con el mensaje de validación → no se reintenta).
 */
export async function enviarAccionMensajero(
  envioId: number, accion: AccionMensajero, campos: Record<string, string>, firma?: Blob | null, foto?: Blob | null,
): Promise<{ success: boolean; duplicado?: boolean }> {
  const fd = new FormData();
  Object.entries(campos).forEach(([k, v]) => { if (v) fd.append(k, v); });
  if (firma) fd.append('firma', firma, 'firma.png');
  if (foto) fd.append('foto', foto, 'foto.jpg');
  const res = await fetch(`${API_URL}/gh-mensajeria/mis-envios/${envioId}/${accion}`, {
    method: 'POST', body: fd, headers: { Authorization: `Bearer ${getStoredToken()}` },
  });
  const data = await res.json().catch(() => ({}));
  // 5xx y 429 son transitorios: se tratan como fallo de red para reintentar luego
  if (res.status >= 500 || res.status === 429) throw new TypeError(data.error || `Error del servidor (${res.status})`);
  if (!res.ok || !data.success) throw new AccionRechazadaError(data.error || `Error ${res.status}`);
  return data;
}
