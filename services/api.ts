/// <reference types="vite/client" />

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

export const api = {
  // Autenticación
  login: async (email: string, pass: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    // No lanzar error en 401, retornar el JSON con success: false
    if (res.status === 401) {
      return res.json(); // { success: false, error: '...' }
    }
    if (!res.ok) throw new Error('Error de conexión con el servidor');
    return res.json();
  },

  // Maestros
  getUsers: () => fetch(`${API_URL}/users`).then(r => r.json()),
  saveUser: (data: any) => fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
  }).then(r => r.json()),
  
  saveMaster: (category: string, data: any) => fetch(`${API_URL}/masters/${category}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
  }).then(r => r.json()),
  
  getGenericMasters: () => fetch(`${API_URL}/masters`).then(r => r.json()),

  getClients: () => fetch(`${API_URL}/clients`).then(r => r.json()),
  getRoles: () => fetch(`${API_URL}/roles`).then(r => r.json()),
  getModules: () => fetch(`${API_URL}/modules`).then(r => r.json()),
  getPages: () => fetch(`${API_URL}/pages`).then(r => r.json()),
  getPermissions: () => fetch(`${API_URL}/permissions`).then(r => r.json()),
  getUserPermissions: (userId: string) => fetch(`${API_URL}/user-permissions/${userId}`).then(r => r.json()),
  getArticles: () => fetch(`${API_URL}/articles`).then(r => r.json()),
  saveArticle: (data: any) => fetch(`${API_URL}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  getVehicles: () => fetch(`${API_URL}/vehicles`).then(r => r.json()),
  saveVehicle: (data: any) => fetch(`${API_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  getDocuments: () => fetch(`${API_URL}/documents`).then(r => r.json()),
  syncInventory: (data: any) => fetch(`${API_URL}/documents/sync-inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  
  getWhatsAppStatus: () => fetch(`${API_URL}/whatsapp/status`).then(r => r.json()),
  connectWhatsApp: () => fetch(`${API_URL}/whatsapp/connect`, {
    method: 'POST'
  }).then(r => r.json()),
  
  aiChat: async (prompt: string, context: any) => {
    const res = await fetch(`${API_URL}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context })
    });
    return res.json();
  },

  disconnectWhatsApp: () => fetch(`${API_URL}/whatsapp/disconnect`, {
      method: 'POST'
  }).then(r => r.json()),

  getWhatsAppHistory: () => fetch(`${API_URL}/whatsapp/history`).then(r => r.json()),
  
  sendWhatsAppNotification: (data: { phones: string[], message: string }) => fetch(`${API_URL}/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json())
};
