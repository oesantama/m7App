/// <reference types="vite/client" />

const isDev = import.meta.env.DEV;
const API_URL = isDev ? 'http://localhost:8080/api' : (import.meta.env.VITE_API_URL || '/api');

export const fetchJson = async (url: string, options?: any) => {
  const executeFetch = async (retryCount = 0): Promise<any> => {
    // Búsqueda exhaustiva del token en múltiples llaves
    const sessionStr = localStorage.getItem('m7_user_session');
    let token = localStorage.getItem('token') || 
                localStorage.getItem('m7_token') || 
                localStorage.getItem('m7_auth_token') || 
                localStorage.getItem('m7_client_token');
    
    if (!token && sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        token = session.token || session.accessToken || session.auth_token;
      } catch (e) {}
    }

    if (!token && import.meta.env.DEV) {
      console.error('[API-TOKEN-DIAGNOSTIC] ❌ Token no encontrado. Contenido de localStorage:');
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) console.log(`   - ${key}: ${localStorage.getItem(key)?.substring(0, 20)}...`);
      }
    }

    const customHeaders: any = { ...options?.headers };
    if (token) {
      if (import.meta.env.DEV) {
          console.log('%c [API-AUTH-DIAGNOSTIC] 🔑 TOKEN ENCONTRADO', 'background: #059669; color: white; padding: 4px; border-radius: 4px;');
          console.table({ token_preview: token.substring(0, 30) + '...', length: token.length });
      }
      localStorage.setItem('token', token);
      customHeaders['Authorization'] = `Bearer ${token.trim()}`;
    } else if (import.meta.env.DEV) {
      console.error('%c [API-AUTH-DIAGNOSTIC] ❌ NO HAY TOKEN DISPONIBLE EN LOCALSTORAGE', 'background: #dc2626; color: white; padding: 4px; border-radius: 4px;');
    }

    // DETECCIÓN CRÍTICA: Si el body es FormData, NO debemos poner application/json
    // El navegador necesita poner multipart/form-data con el boundary correcto
    const isFormData = options?.body instanceof FormData;

    const fetchOptions = {
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...customHeaders
      },
      cache: 'no-cache' as RequestCache
    };

    if (import.meta.env.DEV) {
        console.log(`[API-DEBUG] Petición: ${options?.method || 'GET'} ${url}`);
        console.log(`[API-DEBUG] Headers Finales:`, fetchOptions.headers);
    }

    try {
      const res = await fetch(url, fetchOptions);
      
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json().catch(() => ({})) : await res.text();

      if (res.status === 401) {
        console.warn('[ORBIT-AUTH] 401 detectado. Caducidad o token inválido.');
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('orbit-auth-failed', { 
          detail: { message: data?.error || 'Su sesión ha caducado por seguridad.' } 
        }));
      }

      if (!res.ok) {
        const msg = typeof data === 'object'
          ? (data.error || data.message || `Error HTTP: ${res.status}`)
          : (data || `Error HTTP: ${res.status}`);
        const detail = typeof data === 'object' && data.details ? ` — ${data.details}` : '';
        throw new Error(`${msg}${detail}`);
      }

      return data;
    } catch (err: any) {
      // Reintento en caso de error de red (TypeError)
      if (err instanceof TypeError && retryCount < 1) {
        return executeFetch(retryCount + 1);
      }
      throw err;
    }
  };

  return executeFetch();
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
  initDispatch(data: any) {
    return fetchJson(`${API_URL}/dispatch/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  signDispatchPending(data: any) {
    return fetchJson(`${API_URL}/dispatch/sign-pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  getPendingSignatures(userId: string) {
    return fetchJson(`${API_URL}/dispatch/pending-signatures/${userId}`);
  },
  confirmDelivery(data: {
    invoiceId: string; dispatchId?: string; driverId: string; vehicleId?: string;
    deliveryType: 'FULL' | 'PARTIAL' | 'RETURN';
    deliveredItems: any[]; notes?: string; returnReason?: string; password: string;
  }) {
    return fetchJson(`${API_URL}/dispatch/confirm-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  getDeliveryHistory(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return fetchJson(`${API_URL}/dispatch/delivery-history${qs ? '?' + qs : ''}`);
  },
  getReturnHistory(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return fetchJson(`${API_URL}/dispatch/return-history${qs ? '?' + qs : ''}`);
  },
  uploadVoucher(data: {
    invoiceId: string; dispatchId?: string; fileData: string; fileName: string;
    fileType: string; fileHash: string; paymentType?: string; amount?: number;
    bankName?: string; notes?: string; uploadedBy?: string;
  }) {
    return fetchJson(`${API_URL}/dispatch/voucher`, { method: 'POST', body: JSON.stringify(data) });
  },
  getVouchers(invoiceId: string) {
    return fetchJson(`${API_URL}/dispatch/vouchers/${encodeURIComponent(invoiceId)}`);
  },
  getVoucherFile(id: number) {
    return fetchJson(`${API_URL}/dispatch/voucher-file/${id}`);
  },
  getPendingReturns() {
    return fetchJson(`${API_URL}/dispatch/returns-pending`);
  },
  updateReturnStatus(id: number, data: { status: string; notes?: string }) {
    return fetchJson(`${API_URL}/dispatch/returns/${id}/status`, { method: 'PUT', body: JSON.stringify(data) });
  },

  // --- MESSAGES / WHATSAPP ---
  // Maestros - CACHE BUSTING FORZADO
  // Maestros - CACHE BUSTING FORZADO
  getUsers: () => fetchJson(`${API_URL}/users?_t=${Date.now()}`),
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
  createManualDocument: (data: { externalDocId: string, clientId: string, vehiclePlate: string, planType?: string, user: string }) => fetchJson(`${API_URL}/documents/manual`, {
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
  learnFromCompletedRoute: (data: { vehicleId: string; stops: Array<{ city: string; neighborhood: string }> }) =>
    fetchJson(`${API_URL}/routes/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),
  geocodeAddress: (data: { address: string; city: string }) =>
    fetchJson(`${API_URL}/routes/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),
  getRoadRoute: (waypoints: { lat: number; lng: number }[]) =>
    fetchJson(`${API_URL}/routes/road-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waypoints })
    }),

  getMastersuiteReport: (params?: { document?: string; plate?: string }) => {
    const qs = new URLSearchParams();
    if (params?.document) qs.set('document', params.document);
    if (params?.plate) qs.set('plate', params.plate);
    return fetchJson(`${API_URL}/documents/mastersuite-report?${qs.toString()}`);
  },

  // GPS Tracking (Nueva API dedicada)
  updateVehicleLocation: (data: any) => fetchJson(`${API_URL}/locations/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
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
  getInvoices: (clientId?: string, ids?: string, history?: boolean) => {
    let url = `${API_URL}/documents/invoices?`;
    if (clientId) url += `clientId=${clientId}&`;
    if (ids) url += `ids=${encodeURIComponent(ids)}&`;
    if (history) url += `history=${history}&`;
    return fetchJson(url);
  },

  resendInventoryNotification: (docId: string, targetEmail: string) => fetchJson(`${API_URL}/documents/resend-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, targetEmail })
  }),

  getWhatsAppStatus: (userId: string) => fetchJson(`${API_URL}/whatsapp/status?userId=${userId}`),
  connectWhatsApp: (userId: string) => fetchJson(`${API_URL}/whatsapp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }),

  disconnectWhatsApp: (userId: string) => fetchJson(`${API_URL}/whatsapp/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }),

  getWhatsAppHistory: (userId: string) => fetchJson(`${API_URL}/whatsapp/history?userId=${userId}`),

  sendWhatsAppNotification: (data: {
    phones: string[],
    message: string,
    userId: string,
    media?: string, // base64
    fileName?: string
  }) => fetchJson(`${API_URL}/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  getWhatsAppChats: (userId: string) => fetchJson(`${API_URL}/whatsapp/chats?userId=${userId}`),
  getWhatsAppMessages: (userId: string, jid: string) => fetchJson(`${API_URL}/whatsapp/messages?userId=${userId}&remoteJid=${jid}`),
  syncWhatsAppContacts: (userId: string) => fetchJson(`${API_URL}/whatsapp/sync-contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }),

  getQuickReplies: (userId: string) => fetchJson(`${API_URL}/whatsapp/quick-replies?userId=${userId}`),
  saveQuickReply: (data: { userId: string, title: string, content: string }) => fetchJson(`${API_URL}/whatsapp/quick-replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteQuickReply: (id: string) => fetchJson(`${API_URL}/whatsapp/quick-replies/${id}`, { method: 'DELETE' }),

  // Autenticación de Dos Factores (2FA)
  setup2FA: (userId: string) => fetchJson(`${API_URL}/2fa/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }),

  activate2FA: (data: { userId: string, secret: string, token: string }) => fetchJson(`${API_URL}/2fa/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  verify2FA: (data: { userId: string, token: string }) => fetchJson(`${API_URL}/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  deactivate2FA: (userId: string) => fetchJson(`${API_URL}/2fa/deactivate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  }),

  aiChat: (prompt: string, context?: any) => fetchJson(`${API_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context })
  }),

  getAllUserPermissions: () => fetchJson(`${API_URL}/user-permissions`),

  // Firma Digital
  getAllSignatures: () => fetchJson(`${API_URL}/signatures`),
  
  saveSignature: async (data: any) => {
    return await fetchJson(`${API_URL}/signatures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  getSignature: (userId: string) => fetchJson(`${API_URL}/signatures/${userId}`),

  approveSignature: (data: { userId: string, approverId: string, approverPassword: string }) => fetchJson(`${API_URL}/signatures/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  savePage: (data: any) => fetchJson(`${API_URL}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  // --- PICKING AUDIT ---
  initPicking(data: any) {
    return fetchJson(`${API_URL}/picking/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  finishPicking(data: any) {
    return fetchJson(`${API_URL}/picking/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  signPicking(data: any) {
    return fetchJson(`${API_URL}/picking/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  getPickingStatus(invoiceId: string) {
    return fetchJson(`${API_URL}/picking/status/${encodeURIComponent(invoiceId)}`).catch(() => null);
  },

  processDocumentLPayment: (data: { documentId: string, payments: any[], userId: string }) => fetchJson(`${API_URL}/documents/process-l-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

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

  // --- ADMINISTRACIÓN (Gestor DB) ---
  getAdminTables: () => fetchJson(`${API_URL}/admin/tables`, { method: 'POST' }),
  getAdminSchema: (tableName: string) => fetchJson(`${API_URL}/admin/schema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName })
  }),
  getAdminData: (params: { 
    tableName: string, 
    page?: number, 
    limit?: number, 
    search?: string, 
    sortBy?: string, 
    sortOrder?: string 
  }) => fetchJson(`${API_URL}/admin/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  }),
  executeAdminSql: (query: string) => fetchJson(`${API_URL}/admin/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  }),
  saveAdminRecord: (tableName: string, data: any) => fetchJson(`${API_URL}/admin/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, data })
  }),
  deleteAdminRecord: (tableName: string, id: any) => fetchJson(`${API_URL}/admin/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, id })
  }),
  bulkDeleteAdminRecords: (tableName: string, ids: any[]) => fetchJson(`${API_URL}/admin/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, ids })
  }),

  // --- DASHBOARD & INTELLIGENCE ---
  getDashboardStats: (period: string) => fetchJson(`${API_URL}/dashboard/stats?period=${period}`),
  getDemandPrediction: () => fetchJson(`${API_URL}/dashboard/prediction`),

  // Novedades de Inventario
  getNovedades: (docId: string) => fetchJson(`${API_URL}/inventory-news/${docId}`),
  saveNovedad: (data: {
    documentId: string,
    articleId: string,
    quantity: number,
    observation: string,
    photoUrls: string[],
    userName: string
  }) => fetchJson(`${API_URL}/inventory-news`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  sendNovedadesReport: (docId: string, targetEmails: string[]) => fetchJson(`${API_URL}/inventory-news/send-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, targetEmails })
  }),
  
  // --- GRUPO INTER ---
  getGrupoInterOrders: (params: { search?: string, status?: string, client?: string } = {}) => {
    const qs = new URLSearchParams(params as any).toString();
    return fetchJson(`${API_URL}/grupo-inter/orders${qs ? `?${qs}` : ''}`);
  },
  uploadGrupoInterExcel: (file: File, username: string, extra: { placa: string, fleteTotal: string, planilla?: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', username);
    formData.append('placa', extra.placa);
    formData.append('fleteTotal', extra.fleteTotal);
    if (extra.planilla) formData.append('planilla', extra.planilla);
    
    return fetchJson(`${API_URL}/grupo-inter/upload-excel`, {
      method: 'POST',
      body: formData,
      headers: {} 
    });
  },

  // Novedades y Reajustes
  getGrupoInterNovedades: (pedidoId: string) => fetchJson(`${API_URL}/grupo-inter/novedades/${pedidoId}`),
  addGrupoInterNovedad: (data: { pedido_id: number, tipo: string, observacion: string, usuario: string }) => fetchJson(`${API_URL}/grupo-inter/novedades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getGrupoInterReajustes: (pedidoId: string) => fetchJson(`${API_URL}/grupo-inter/reajustes/${pedidoId}`),
  addGrupoInterReajuste: (data: { pedido_id: number, numero_documento: string, valor: number, notas: string, usuario: string }) => fetchJson(`${API_URL}/grupo-inter/reajustes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  uploadGrupoInterManifestExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchJson(`${API_URL}/grupo-inter/upload-manifest-excel`, {
      method: 'POST',
      body: formData,
      headers: {}
    });
  },
  updateGrupoInterStatus: (id: string, data: { estado: string, observacion?: string, usuario: string }) => fetchJson(`${API_URL}/grupo-inter/status/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getGrupoInterDetails: (id: string) => fetchJson(`${API_URL}/grupo-inter/details/${id}?_t=${Date.now()}`),
  processGrupoInterPDF: async (file: File, onProgress: (data: any) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Adjuntamos el usuario actual para auditoría (update_by)
    const sessionStr = localStorage.getItem('m7_user_session');
    let username = 'System OCR';
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        username = session.name || session.user?.name || 'Admin';
      } catch (e) {}
    }
    formData.append('username', username);

    // Obtenemos el token manualmente para el fetch directo
    const token = localStorage.getItem('token') || 
                  localStorage.getItem('m7_token') || 
                  localStorage.getItem('m7_auth_token');

    const response = await fetch(`${API_URL}/grupo-inter/process-pdf`, {
      method: 'POST',
      body: formData,
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("No se pudo iniciar el stream de respuesta");

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Guardamos la última línea incompleta

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            onProgress(data);
          } catch (e) {
            console.warn("Error parseando línea de stream:", line);
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        onProgress(data);
      } catch (e) {
        console.warn("Error parseando buffer final de stream:", buffer);
      }
    }
  },
};
