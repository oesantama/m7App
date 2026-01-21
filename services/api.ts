
// Este archivo manejará la comunicación con tu Droplet o App de DigitalOcean
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://tu-api-m7.digitalocean.app' 
  : 'http://localhost:5000';

export const api = {
  get: async (endpoint: string) => {
    const response = await fetch(`${API_URL}${endpoint}`);
    return response.json();
  },
  post: async (endpoint: string, data: any) => {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }
};
