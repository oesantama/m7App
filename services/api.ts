/// <reference types="vite/client" />

const API_URL = import.meta.env.VITE_API_URL || '/api';

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

  // Maestros - CACHE BUSTING FORZADO
  getUsers: () => fetch(`${API_URL}/users?_t=${Date.now()}`).then(r => r.json()),
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

  getGenericMasters: () => fetch(`${API_URL}/masters?_t=${Date.now()}`).then(r => r.json()),

  deleteUser: (id: string, deletedBy?: string) => fetch(`${API_URL}/users/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),
  deleteMaster: (category: string, id: string, deletedBy?: string) => fetch(`${API_URL}/masters/${category}/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),

  getClients: () => fetch(`${API_URL}/clients?_t=${Date.now()}`).then(r => r.json()),
  getRoles: () => fetch(`${API_URL}/roles?_t=${Date.now()}`).then(r => r.json()),
  saveRole: (data: any) => fetch(`${API_URL}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  getModules: () => fetch(`${API_URL}/modules?_t=${Date.now()}`).then(r => r.json()),
  deleteModule: (id: string, deletedBy?: string) => fetch(`${API_URL}/modules/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),
  getPages: () => fetch(`${API_URL}/pages?_t=${Date.now()}`).then(r => r.json()),
  deletePage: (id: string, deletedBy?: string) => fetch(`${API_URL}/pages/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),

  getPermissions: () => fetch(`${API_URL}/permissions?_t=${Date.now()}`).then(r => r.json()),
  savePermission: (data: any) => fetch(`${API_URL}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  getUserPermissions: (userId: string) => fetch(`${API_URL}/user-permissions/${userId}?_t=${Date.now()}`).then(r => r.json()),
  saveUserPermission: (data: any) => fetch(`${API_URL}/user-permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteUserPermission: (id: string, deletedBy?: string) => fetch(`${API_URL}/user-permissions/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),
  deleteRolePermission: (id: string, deletedBy?: string) => fetch(`${API_URL}/permissions/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),
  deleteClient: (id: string, deletedBy?: string) => fetch(`${API_URL}/clients/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),
  getArticles: () => fetch(`${API_URL}/articles`).then(r => r.json()),
  saveArticle: (data: any) => fetch(`${API_URL}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteArticle: (id: string, deletedBy?: string) => fetch(`${API_URL}/articles/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),
  deleteRole: (id: string, deletedBy?: string) => fetch(`${API_URL}/roles/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),

  getVehicles: () => fetch(`${API_URL}/vehicles`).then(r => r.json()),
  saveVehicle: (data: any) => fetch(`${API_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteVehicle: (id: string, deletedBy?: string) => fetch(`${API_URL}/vehicles/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),

  getDrivers: () => fetch(`${API_URL}/drivers`).then(r => r.json()),
  saveDriver: (data: any) => fetch(`${API_URL}/drivers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteDriver: (id: string, deletedBy?: string) => fetch(`${API_URL}/drivers/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }).then(r => r.json()),

  getDocuments: (clientId?: string) => fetch(`${API_URL}/documents${clientId ? `?clientId=${clientId}` : ''}`).then(r => r.json()),
  bulkCreateDocuments: (data: any) => fetch(`${API_URL}/documents/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteDocument: (id: string, user: string) => fetch(`${API_URL}/documents/${id}?user=${encodeURIComponent(user)}`, { method: 'DELETE' }).then(r => r.json()),
  updateDocumentStatus: (id: string, status: string, user: string) => fetch(`${API_URL}/documents/status/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, user })
  }).then(r => r.json()),
  getRoutes: () => fetch(`${API_URL}/routes`).then(r => r.json()),
  saveRoute: (data: any) => fetch(`${API_URL}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  logRouteMovement: (data: any) => fetch(`${API_URL}/routes/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  getRoutingPatterns: () => fetch(`${API_URL}/routes/patterns`).then(r => r.json()),

  // GPS Tracking (Nueva API dedicada)
  updateVehicleLocation: (data: any) => fetch(`${API_URL}/locations/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  getLatestVehicleLocations: () => fetch(`${API_URL}/locations/latest`).then(r => r.json()),
  getVehicleLocationHistory: (vehicleId: string, limit = 50) => fetch(`${API_URL}/locations/history/${vehicleId}?limit=${limit}`).then(r => r.json()),

  // Gestión de Asignaciones (Vínculos Operativos)
  getAssignments: () => fetch(`${API_URL}/assignments`).then(r => r.json()),

  saveAssignment: (data: any) => fetch(`${API_URL}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  endAssignment: (id: string, endedBy?: string) => fetch(`${API_URL}/assignments/${id}/end`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endedBy })
  }).then(r => r.json()),

  syncInventory: (data: any) => fetch(`${API_URL}/documents/sync-inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  getInvoices: (clientId?: string) => fetch(`${API_URL}/documents/invoices${clientId ? `?clientId=${clientId}` : ''}`).then(r => r.json()),

  resendInventoryNotification: (docId: string, targetEmail: string) => fetch(`${API_URL}/documents/resend-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, targetEmail })
  }).then(r => r.json()),

  getWhatsAppStatus: (userId: string) => fetch(`${API_URL}/whatsapp/status?userId=${userId}`).then(r => r.json()),
  connectWhatsApp: (userId: string) => fetch(`${API_URL}/whatsapp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }).then(r => r.json()),

  disconnectWhatsApp: (userId: string) => fetch(`${API_URL}/whatsapp/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }).then(r => r.json()),

  getWhatsAppHistory: (userId: string) => fetch(`${API_URL}/whatsapp/history?userId=${userId}`).then(r => r.json()),

  sendWhatsAppNotification: (data: {
    phones: string[],
    message: string,
    userId: string,
    media?: string, // base64
    fileName?: string
  }) => fetch(`${API_URL}/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  getWhatsAppChats: (userId: string) => fetch(`${API_URL}/whatsapp/chats?userId=${userId}`).then(r => r.json()),
  getWhatsAppMessages: (userId: string, jid: string) => fetch(`${API_URL}/whatsapp/messages?userId=${userId}&remoteJid=${jid}`).then(r => r.json()),
  syncWhatsAppContacts: (userId: string) => fetch(`${API_URL}/whatsapp/sync-contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }).then(r => r.json()),

  getQuickReplies: (userId: string) => fetch(`${API_URL}/whatsapp/quick-replies?userId=${userId}`).then(r => r.json()),
  saveQuickReply: (data: { userId: string, title: string, content: string }) => fetch(`${API_URL}/whatsapp/quick-replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteQuickReply: (id: string) => fetch(`${API_URL}/whatsapp/quick-replies/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Autenticación de Dos Factores (2FA)
  setup2FA: (userId: string) => fetch(`${API_URL}/2fa/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }).then(r => r.json()),

  activate2FA: (data: { userId: string, secret: string, token: string }) => fetch(`${API_URL}/2fa/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  verify2FA: (data: { userId: string, token: string }) => fetch(`${API_URL}/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  deactivate2FA: (userId: string) => fetch(`${API_URL}/2fa/deactivate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }).then(r => r.json()),

  aiChat: (prompt: string, context?: any) => fetch(`${API_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context })
  }).then(r => r.json()),

  getAllUserPermissions: () => fetch(`${API_URL}/user-permissions`).then(r => r.json()),

  // Firma Digital
  createSignature: async (data: { documentNumber: string; digitalSignature: string; password: string; policyAccepted: boolean }) => {
    const res = await fetch(`${API_URL}/signatures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  getSignature: (documentNumber: string) => fetch(`${API_URL}/signatures/${documentNumber}`).then(r => r.json()),

  approveSignature: (data: { documentNumber: string, approverId: string, approverPasswordSecret: string }) => fetch(`${API_URL}/signatures/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  savePage: (data: any) => fetch(`${API_URL}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
};
