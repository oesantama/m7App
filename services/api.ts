
// VITE_API_URL debe configurarse en DigitalOcean App Platform
// Fix: Cast import.meta to any to access Vite's env property, avoiding TypeScript compilation errors in environments where ImportMeta is not fully extended.
const API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');

export const api = {
  get: async (endpoint: string) => {
    const response = await fetch(`${API_BASE}${endpoint}`);
    if (!response.ok) throw new Error(`M7-API Error: ${response.status}`);
    return response.json();
  },
  post: async (endpoint: string, data: any) => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`M7-API Error: ${response.status}`);
    return response.json();
  }
};
