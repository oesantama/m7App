import { API_URL, fetchJson } from './client';

export const cyberApi = {
  getCyberMetrics: () => fetchJson(`${API_URL}/cybersecurity/metrics`),
  getCyberCampaigns: () => fetchJson(`${API_URL}/cybersecurity/phishing/campaigns`),
  createCyberCampaign: (data: any) => fetchJson(`${API_URL}/cybersecurity/phishing/campaigns`, { method: 'POST', body: JSON.stringify(data) }),
  updateCyberCampaign: (id: number, data: any) => fetchJson(`${API_URL}/cybersecurity/phishing/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCyberCampaign: (id: number) => fetchJson(`${API_URL}/cybersecurity/phishing/campaigns/${id}`, { method: 'DELETE' }),
  sendCyberCampaign: (id: number) => fetchJson(`${API_URL}/cybersecurity/phishing/campaigns/${id}/send`, { method: 'POST' }),
  getCyberCampaignStats: (id: number) => fetchJson(`${API_URL}/cybersecurity/phishing/campaigns/${id}/stats`),
};
