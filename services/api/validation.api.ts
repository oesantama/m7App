import { API_URL, fetchJson } from './client';

export const validationApi = {
  validationGetSources: () =>
    fetchJson(`${API_URL}/validation/sources`),

  validationCreateSource: (data: any) =>
    fetchJson(`${API_URL}/validation/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  validationUpdateSource: (id: string, data: any) =>
    fetchJson(`${API_URL}/validation/sources/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  validationDeleteSource: (id: string) =>
    fetchJson(`${API_URL}/validation/sources/${id}`, { method: 'DELETE' }),

  validationGetRecords: (params?: { entity_type?: string; entity_id?: string; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString() : '';
    return fetchJson(`${API_URL}/validation/records${qs}`);
  },

  validationRun: (data: { entity_type: string; entity_id: string; entity_name: string; source_ids: string[]; doc_type?: string }) =>
    fetchJson(`${API_URL}/validation/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
