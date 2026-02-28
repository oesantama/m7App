/// <reference types="vite/client" />

const API_URL = import.meta.env.VITE_API_URL || '/api';

const fetchJson = async (url: string, options?: RequestInit) => {
  const sessionStr = localStorage.getItem('m7_user_session');
  const sessionObj = sessionStr ? JSON.parse(sessionStr) : null;
  const token = sessionObj?.token || localStorage.getItem('token');
  
  const headers = new Headers(options?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
  }
  return res.json();
};

export const api = {
  // Autenticación
  login: async (email: string, pass: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    if (res.status === 401) return res.json();
    if (!res.ok) throw new Error('Error de conexión con el servidor');
    return res.json();
  },

  // --- DISPATCH AUDIT ---
  async initDispatch(data: any) {
    const res = await fetch(`${API_URL}/dispatch/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al iniciar despacho');
    }
    return res.json();
  },
  async signDispatchPending(data: any) {
    const res = await fetch(`${API_URL}/dispatch/sign-pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al firmar pendientes');
    }
    return res.json();
  },
  async getPendingSignatures(userId: string) {
    const res = await fetch(`${API_URL}/dispatch/pending-signatures/${userId}`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al obtener firmas pendientes');
    }
    return res.json();
  },
  async confirmDelivery(data: {
    invoiceId: string; dispatchId?: string; driverId: string; vehicleId?: string;
    deliveryType: 'FULL' | 'PARTIAL' | 'RETURN';
    deliveredItems: any[]; notes?: string; returnReason?: string; password: string;
  }) {
    const res = await fetch(`${API_URL}/dispatch/confirm-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al confirmar entrega');
    }
    return res.json();
  },
  async getDeliveryHistory(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/dispatch/delivery-history${qs ? '?' + qs : ''}`);
    if (!res.ok) throw new Error('Error al obtener historial de entregas');
    return res.json();
  },
  async getReturnHistory(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/dispatch/return-history${qs ? '?' + qs : ''}`);
    if (!res.ok) throw new Error('Error al obtener historial de devoluciones');
    return res.json();
  },


  // --- MESSAGES / WHATSAPP ---
  // Maestros - CACHE BUSTING FORZADO
  getUsers: () => fetchJson(`${API_URL}/users?_t=${Date.now()}`),
  getClients: () => fetchJson(`${API_URL}/clients`),
  getRoles: () => fetchJson(`${API_URL}/roles`),
  getModules: () => fetchJson(`${API_URL}/modules`),
  getPages: () => fetchJson(`${API_URL}/pages`),
  getPermissions: () => fetchJson(`${API_URL}/permissions`),
  getAllUserPermissions: () => fetchJson(`${API_URL}/user-permissions`),
  getGenericMasters: () => fetchJson(`${API_URL}/masters`),
  getArticles: () => fetchJson(`${API_URL}/articles`),
  getVehicles: () => fetchJson(`${API_URL}/vehicles`),
  getDrivers: () => fetchJson(`${API_URL}/drivers`),
  getDocuments: (clientId: string) => fetchJson(`${API_URL}/documents?clientId=${clientId}`),
  saveUser: (data: any) => fetchJson(`${API_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  saveMaster: async (category: string, data: any) => {
    return fetchJson(`${API_URL}/masters/${category}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  getGenericMasters: () => fetchJson(`${API_URL}/masters?_t=${Date.now()}`),

  deleteUser: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/users/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),
  deleteMaster: (category: string, id: string, deletedBy?: string) => fetchJson(`${API_URL}/masters/${category}/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  getClients: () => fetchJson(`${API_URL}/clients?_t=${Date.now()}`),
  saveClient: (data: any) => fetchJson(`${API_URL}/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteClient: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/clients/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),
  getRoles: () => fetchJson(`${API_URL}/roles?_t=${Date.now()}`),
  saveRole: (data: any) => fetchJson(`${API_URL}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  // Categorías (Nueva Tabla)
  getCategories: () => fetchJson(`${API_URL}/categories?_t=${Date.now()}`),
  saveCategory: (data: any) => fetchJson(`${API_URL}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteCategory: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/categories/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  // Estados
  getEstados: () => fetchJson(`${API_URL}/estados?_t=${Date.now()}`),
  saveEstado: (data: any) => fetchJson(`${API_URL}/estados`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteEstado: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/estados/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  // Marcas
  getMarcas: () => fetchJson(`${API_URL}/marcas?_t=${Date.now()}`),
  saveMarca: (data: any) => fetchJson(`${API_URL}/marcas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteMarca: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/marcas/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  // Tipos de Documento
  getTiposDocumento: () => fetchJson(`${API_URL}/tipos-documento?_t=${Date.now()}`),
  saveTipoDocumento: (data: any) => fetchJson(`${API_URL}/tipos-documento`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteTipoDocumento: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/tipos-documento/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  // Unidades de Medida
  getUnidadesMedida: () => fetchJson(`${API_URL}/unidades-medida?_t=${Date.now()}`),
  saveUnidadMedida: (data: any) => fetchJson(`${API_URL}/unidades-medida`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteUnidadMedida: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/unidades-medida/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  // Notificaciones Config
  getNotificacionesConfig: () => fetchJson(`${API_URL}/notificaciones-config?_t=${Date.now()}`),
  saveNotificacionConfig: (data: any) => fetchJson(`${API_URL}/notificaciones-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteNotificacionConfig: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/notificaciones-config/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  // Tipos de Vehículo
  getTiposVehiculo: () => fetchJson(`${API_URL}/tipos-vehiculo?_t=${Date.now()}`),
  saveTipoVehiculo: (data: any) => fetchJson(`${API_URL}/tipos-vehiculo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteTipoVehiculo: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/tipos-vehiculo/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  // Tipos de Notificación
  getTiposNotificacion: () => fetchJson(`${API_URL}/tipos-notificacion?_t=${Date.now()}`),
  saveTipoNotificacion: (data: any) => fetchJson(`${API_URL}/tipos-notificacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteTipoNotificacion: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/tipos-notificacion/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  getModules: () => fetchJson(`${API_URL}/modules?_t=${Date.now()}`),
  saveModule: (data: any) => fetchJson(`${API_URL}/modules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteModule: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/modules/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),
  getPages: () => fetchJson(`${API_URL}/pages?_t=${Date.now()}`),
  deletePage: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/pages/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  getPermissions: () => fetchJson(`${API_URL}/permissions?_t=${Date.now()}`),
  savePermission: (data: any) => fetchJson(`${API_URL}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  getUserPermissions: (userId: string) => fetchJson(`${API_URL}/user-permissions/${userId}?_t=${Date.now()}`),
  saveUserPermission: (data: any) => fetchJson(`${API_URL}/user-permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteUserPermission: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/user-permissions/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),
  deleteRolePermission: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/permissions/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),
  
  getArticles: () => fetchJson(`${API_URL}/articles`),
  saveArticle: (data: any) => fetchJson(`${API_URL}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteArticle: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/articles/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),
  deleteRole: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/roles/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  getVehicles: () => fetchJson(`${API_URL}/vehicles`),
  saveVehicle: (data: any) => fetchJson(`${API_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  bulkSaveVehicles: (vehicles: any[]) => fetchJson(`${API_URL}/vehicles/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicles })
  }),
  deleteVehicle: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/vehicles/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  getDrivers: () => fetchJson(`${API_URL}/drivers`),
  saveDriver: (data: any) => fetchJson(`${API_URL}/drivers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  bulkSaveDrivers: (drivers: any[]) => fetchJson(`${API_URL}/drivers/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drivers })
  }),
  deleteDriver: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/drivers/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  getDocuments: (clientId?: string) => fetchJson(`${API_URL}/documents${clientId ? `?clientId=${clientId}` : ''}`),
  bulkCreateDocuments: (data: any) => fetchJson(`${API_URL}/documents/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteDocument: (id: string, user: string) => fetchJson(`${API_URL}/documents/${id}?user=${encodeURIComponent(user)}`, { method: 'DELETE' }),
  updateDocumentStatus: (id: string, status: string, user: string) => fetchJson(`${API_URL}/documents/status/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, user })
  }),
  getRoutes: () => fetchJson(`${API_URL}/routes`),
  saveRoute: (data: any) => fetchJson(`${API_URL}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  logRouteMovement: (data: any) => fetchJson(`${API_URL}/routes/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getRoutingPatterns: () => fetchJson(`${API_URL}/routes/patterns`),

  // GPS Tracking (Nueva API dedicada)
  updateVehicleLocation: (data: any) => fetch(`${API_URL}/locations/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  getLatestVehicleLocations: () => fetchJson(`${API_URL}/locations/latest`),
  getVehicleLocationHistory: (vehicleId: string, limit = 50) => fetchJson(`${API_URL}/locations/history/${vehicleId}?limit=${limit}`),

  // Gestión de Asignaciones (Vínculos Operativos)
  getAssignments: () => fetchJson(`${API_URL}/assignments`),

  saveAssignment: (data: any) => fetchJson(`${API_URL}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  endAssignment: (id: string, endedBy?: string) => fetchJson(`${API_URL}/assignments/${id}/end`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endedBy })
  }),

  syncInventory: (data: any) => fetchJson(`${API_URL}/documents/sync-inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getInvoices: (clientId?: string, ids?: string) => {
    let url = `${API_URL}/documents/invoices?`;
    if (clientId) url += `clientId=${clientId}&`;
    if (ids) url += `ids=${encodeURIComponent(ids)}`;
    return fetchJson(url);
  },

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
  // Firma Digital
  getAllSignatures: () => fetch(`${API_URL}/signatures`).then(r => r.json()),
  
  saveSignature: async (data: any) => {
    const res = await fetch(`${API_URL}/signatures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  getSignature: (userId: string) => fetch(`${API_URL}/signatures/${userId}`).then(r => r.json()),

  approveSignature: (data: { userId: string, approverId: string, approverPassword: string }) => fetch(`${API_URL}/signatures/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  savePage: (data: any) => fetch(`${API_URL}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

  // --- PICKING AUDIT ---
  async initPicking(data: any) {
    const res = await fetch(`${API_URL}/picking/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al iniciar alistado');
    return res.json();
  },
  async finishPicking(data: any) {
    const res = await fetch(`${API_URL}/picking/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al finalizar alistado');
    return res.json();
  },
  async signPicking(data: any) {
    const res = await fetch(`${API_URL}/picking/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al firmar alistado');
    }
    return res.json();
  },
  async getPickingStatus(invoiceId: string) {
    const res = await fetch(`${API_URL}/picking/status/${encodeURIComponent(invoiceId)}`);
    if (!res.ok) return null;
    return res.json();
  },

  processDocumentLPayment: (data: { documentId: string, payments: any[], userId: string }) => fetch(`${API_URL}/documents/process-l-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),

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
};
