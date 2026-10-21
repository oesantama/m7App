import { API_URL, getStoredToken, fetchJson } from './client';

export const bascApi = {
  bascGetSyncStatus: () => fetchJson(`${API_URL}/basc/sync/status`),
  bascUploadDocument: (files: File[], folder: string, notes: string = '', isBaseFile: boolean = false) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('folder', folder);
    if (notes) {
      formData.append('notes', notes);
    }
    formData.append('isBaseFile', String(isBaseFile));

    return fetchJson(`${API_URL}/basc/upload`, {
      method: 'POST',
      body: formData
    });
  },
  bascGetSyncHistory: () => fetchJson(`${API_URL}/basc/sync/history`),
  bascTriggerSync: () => fetchJson(`${API_URL}/basc/sync/trigger`, { method: 'POST' }),
  bascChat: (prompt: string, files?: File[], history?: any[]) => {
    if (files && files.length > 0) {
      const formData = new FormData();
      formData.append('prompt', prompt);
      if (history) formData.append('history', JSON.stringify(history));
      files.forEach(file => formData.append('files', file));
      return fetchJson(`${API_URL}/basc/chat`, {
        method: 'POST',
        body: formData
      });
    } else {
      return fetchJson(`${API_URL}/basc/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history })
      });
    }
  },
  bascDownloadReport: async () => {
    const token = getStoredToken();
    const response = await fetch(`${API_URL}/basc/reports/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Error al descargar reporte BASC');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BASC_Reporte_Cumplimiento.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
