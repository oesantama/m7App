/// <reference types="vite/client" />

const isDev = import.meta.env.DEV;
const API_URL = import.meta.env.VITE_API_URL || (isDev ? 'http://localhost:8080/api' : '/api');

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
  getHealth: () => fetchJson(API_URL.replace('/api', '/health')),
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
  getInvoicePendingSignatures(invoiceId: string) {
    return fetchJson(`${API_URL}/dispatch/invoice-pending-signatures/${encodeURIComponent(invoiceId)}`);
  },
  confirmDelivery(data: {
    invoiceId: string; dispatchId?: string; driverId: string; vehicleId?: string;
    deliveryType: 'FULL' | 'PARTIAL' | 'RETURN' | 'REPICE';
    deliveredItems: any[]; notes?: string; returnReason?: string; password?: string;
    repiceDestination?: 'BODEGA' | 'SAME_PLATE';
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

  // --- CONCILIACIÓN FACTURAS (PLAN R) ---
  getConciliationPending: (params?: { clientId?: string; plate?: string; from?: string; to?: string; docId?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null) as [string, string][])).toString() : '';
    return fetchJson(`${API_URL}/conciliation/pending${qs}`);
  },
  getConciliationPendingNormal: (params?: { clientId?: string; from?: string; to?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null) as [string, string][])).toString() : '';
    return fetchJson(`${API_URL}/conciliation/pending-normal${qs}`);
  },
  getConciliationHistory: (params: { from?: string; to?: string; doc_id?: string; invoice?: string; plate?: string }) => {
    const qs = '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v) as [string, string][])).toString();
    return fetchJson(`${API_URL}/conciliation/history${qs}`);
  },
  getPlateMovementHistory: (plate: string) =>
    fetchJson(`${API_URL}/conciliation/plate-history?plate=${encodeURIComponent(plate)}`),
  getConciliationByDocument: (documentId: string) =>
    fetchJson(`${API_URL}/conciliation/${encodeURIComponent(documentId)}`),
  saveConciliation: (data: {
    documentId: string; invoiceNumber: string;
    banco?: string; valor?: number; comprobante?: string; fechaPago?: string;
    formaPago?: string; numeroCheque?: string; esDevolucion?: boolean;
    conciliadoPor?: string; vehiclePlate?: string; conductorId?: string; conductorName?: string;
    estadoEntrega?: string; valorFactura?: number; usuarioNombre?: string;
    sobrecosto?: number; itemsReturned?: any[];
    targetRouteId?: string;
  }) => fetchJson(`${API_URL}/conciliation/save`, { method: 'POST', body: JSON.stringify(data) }),
  closeConciliationCycle: (data: { documentId: string; userId: string }) =>
    fetchJson(`${API_URL}/conciliation/close-cycle`, { method: 'POST', body: JSON.stringify(data) }),
  generateConciliationReport: (documentId: string, targetEmail: string | string[]) =>
    fetchJson(`${API_URL}/conciliation/report`, { method: 'POST', body: JSON.stringify({ documentId, targetEmail }) }),
  importMasterSuite: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetchJson(`${API_URL}/conciliation/import-mastersuite`, { method: 'POST', body: form });
  },
  getInvoiceStatusHistory: (documentId: string) =>
    fetchJson(`${API_URL}/conciliation/${encodeURIComponent(documentId)}/history`),
  updatePaymentMethod: (data: {
    documentId: string;
    invoice: string;
    newMethod: string;
    userId: string;
    userName?: string;
    observations: string;
  }) => fetchJson(`${API_URL}/conciliation/update-payment-method`, { method: 'POST', body: JSON.stringify(data) }),
  updateRemesaTDM: (documentId: string, remesaTDM: string | null) =>
    fetchJson(`${API_URL}/conciliation/update-remesa-tdm`, {
      method: 'POST',
      body: JSON.stringify({ documentId, remesaTDM }),
    }),
  reverseConciliation: (data: {
    documentId: string;
    invoiceNumber: string;
    userId: string;
    userName?: string;
    observations: string;
  }) => fetchJson(`${API_URL}/conciliation/reverse`, { method: 'POST', body: JSON.stringify(data) }),
  updateInvoiceValue: (data: { documentId: string; invoiceNumber: string; value: number }) =>
    fetchJson(`${API_URL}/conciliation/invoice-value`, { method: 'PATCH', body: JSON.stringify(data) }),
  adjustPayment: (data: { documentId: string; invoiceNumber: string; newValor?: number; newComprobante?: string; userId: string }) =>
    fetchJson(`${API_URL}/conciliation/adjust-payment`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Devoluciones Bodega ────────────────────────────────────────────────────
  getPendingRouteReturns: (clientId?: string) =>
    fetchJson(`${API_URL}/dispatch/returns-pending${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
  confirmRouteReturn: (id: number | string, data: { status: 'PROCESSED' | 'CANCELLED'; handledBy?: string; notes?: string }) =>
    fetchJson(`${API_URL}/dispatch/returns/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getPendingBodegaReturns: (clientId?: string) =>
    fetchJson(`${API_URL}/dispatch/pending-bodega-returns${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
  confirmBodegaReturn: (data: { invoiceNumber: string; documentId: string; receivedBy: string; observation?: string }) =>
    fetchJson(`${API_URL}/dispatch/bodega-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getRouteActivePlates: (clientId?: string) =>
    fetchJson(`${API_URL}/dispatch/route-active-plates${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
  getRoutePlateInvoices: (plate: string, clientId?: string) =>
    fetchJson(`${API_URL}/dispatch/route-plate-invoices/${encodeURIComponent(plate)}${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
  registerRouteReturn: (data: { invoiceId: string; vehiclePlate: string; returnType: 'COMPLETA' | 'PARCIAL'; returnReason?: string; notes?: string; items?: any[]; createdBy?: string }) =>
    fetchJson(`${API_URL}/dispatch/register-route-return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getApprovalPendingReturns: (clientId?: string) =>
    fetchJson(`${API_URL}/dispatch/approval-pending${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
  createApprovalBatch: (data: { clientId: string; returnIds: number[]; notes?: string; createdBy?: string }) =>
    fetchJson(`${API_URL}/dispatch/approval-batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getApprovalBatches: (clientId?: string) =>
    fetchJson(`${API_URL}/dispatch/approval-batches${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`),
  getApprovalBatchByCode: (batchCode: string) =>
    fetchJson(`${API_URL}/dispatch/approval-batch/${encodeURIComponent(batchCode)}`),

  // ── Consulta de Inventario / Kardex ───────────────────────────────────────
  getInventoryStock: (params?: { clientId?: string; articleId?: string; location?: string; dateFrom?: string; dateTo?: string }) => {
    const qs = new URLSearchParams();
    if (params?.clientId)   qs.set('clientId',   params.clientId);
    if (params?.articleId)  qs.set('articleId',  params.articleId);
    if (params?.location)   qs.set('location',   params.location);
    if (params?.dateFrom)   qs.set('dateFrom',   params.dateFrom);
    if (params?.dateTo)     qs.set('dateTo',     params.dateTo);
    return fetchJson(`${API_URL}/inventory/stock?${qs}`);
  },
  getInventoryMovements: (params?: {
    clientId?: string; articleId?: string; movementType?: string;
    vehiclePlate?: string; invoice?: string;
    dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.clientId)     qs.set('clientId',     params.clientId);
    if (params?.articleId)    qs.set('articleId',    params.articleId);
    if (params?.movementType) qs.set('movementType', params.movementType);
    if (params?.vehiclePlate) qs.set('vehiclePlate', params.vehiclePlate);
    if (params?.invoice)      qs.set('invoice',      params.invoice);
    if (params?.dateFrom)     qs.set('dateFrom',     params.dateFrom);
    if (params?.dateTo)       qs.set('dateTo',       params.dateTo);
    if (params?.page)         qs.set('page',         String(params.page));
    if (params?.limit)        qs.set('limit',        String(params.limit));
    return fetchJson(`${API_URL}/inventory/movements?${qs}`);
  },
  getArticleDashboardSummary: (articleId: string) => fetchJson(`${API_URL}/inventory/dashboard-summary?articleId=${encodeURIComponent(articleId)}`),
  // ── Salida a Proveedor ────────────────────────────────────────────────────
  getSupplierReturns: (params?: { clientId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.clientId) qs.set('clientId', params.clientId);
    if (params?.status)   qs.set('status',   params.status);
    return fetchJson(`${API_URL}/inventory/supplier-returns?${qs}`);
  },
  createSupplierReturn: (data: {
    clientId: string; reference?: string; returnReason?: string;
    notes?: string; createdBy?: string;
    items: { article_id: string; article_name: string; batch?: string; quantity: number; unit?: string; notes?: string }[];
  }) => fetchJson(`${API_URL}/inventory/supplier-returns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  confirmSupplierReturn: (id: number | string, confirmedBy: string) =>
    fetchJson(`${API_URL}/inventory/supplier-returns/${id}/confirm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmedBy }),
    }),

  getConciliationPlanillaUrl: (routeId: string | number) => {
    return `${API_URL}/conciliation/planilla?routeId=${routeId}`;
  },
  searchConciliationRoutes: (clientId: string, date: string) =>
    fetchJson(`${API_URL}/conciliation/search-routes?clientId=${encodeURIComponent(clientId)}&date=${date}`),

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

  // Gestión Humana — Misceláneos (CRUD genérico por tabla)
  getGhMiscelaneos: (tabla: string) => fetchJson(`${API_URL}/gh-miscelaneos/${tabla}`),
  saveGhMiscelaneo: (tabla: string, data: any) => fetchJson(`${API_URL}/gh-miscelaneos/${tabla}`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteGhMiscelaneo: (tabla: string, id: number) => fetchJson(`${API_URL}/gh-miscelaneos/${tabla}/${id}`, { method: 'DELETE' }),

  // Configuración — Ciudades
  getDepartamentos: () => fetchJson(`${API_URL}/cfg-ciudades/departamentos`),
  saveDepartamento: (data: any) => fetchJson(`${API_URL}/cfg-ciudades/departamentos`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteDepartamento: (id: number) => fetchJson(`${API_URL}/cfg-ciudades/departamentos/${id}`, { method: 'DELETE' }),
  bulkSaveDepartamentos: (data: { items: any[], usuarioControl: string }) => fetchJson(`${API_URL}/cfg-ciudades/departamentos/bulk`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getCiudades: (departamentoId?: number) => fetchJson(`${API_URL}/cfg-ciudades/ciudades${departamentoId ? `?departamentoId=${departamentoId}` : ''}`),
  saveCiudad: (data: any) => fetchJson(`${API_URL}/cfg-ciudades/ciudades`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  bulkSaveCiudades: (data: { items: any[], usuarioControl: string }) => fetchJson(`${API_URL}/cfg-ciudades/ciudades/bulk`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteCiudad: (id: number) => fetchJson(`${API_URL}/cfg-ciudades/ciudades/${id}`, { method: 'DELETE' }),

  // Proveedores Cliente
  getProvClientes: () => fetchJson(`${API_URL}/prov-clientes`),
  saveProvCliente: (data: any) => fetchJson(`${API_URL}/prov-clientes`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteProvCliente: (documento: string) => fetchJson(`${API_URL}/prov-clientes/${encodeURIComponent(documento)}`, { method: 'DELETE' }),
  bulkSaveProvClientes: (data: { items: any[], usuarioControl: string }) => fetchJson(`${API_URL}/prov-clientes/bulk`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Gestión Humana — Personal
  getPersonal: () => fetchJson(`${API_URL}/gh-personal`),
  savePersonal: (data: any) => fetchJson(`${API_URL}/gh-personal`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deletePersonal: (id: number | string) => fetchJson(`${API_URL}/gh-personal/${id}`, { method: 'DELETE' }),
  getPersonalEncuestas: () => fetchJson(`${API_URL}/gh-personal/encuestas`),
  activatePersonalEncuesta: (data: { cedula: string, usuarioControl: string }) => fetchJson(`${API_URL}/gh-personal/encuestas/activate`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deactivateEncuesta: (id: number | string) => fetchJson(`${API_URL}/gh-personal/encuestas/deactivate/${id}`, { method: 'PUT' }),

  // --- ENCUESTAS PÚBLICAS ---
  validateSurveyAccess: (params: { cedula?: string, id?: string | number }) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== undefined && v !== ''));
    const qs = new URLSearchParams(clean as any).toString();
    return fetchJson(`${API_URL}/gh-personal/public/survey/validate?${qs}`);
  },
  savePublicSurvey: (data: { cedula: string, data: any, familia: any[] }) => fetchJson(`${API_URL}/gh-personal/public/survey/save`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getEncuestasResultados: (params?: { from?: string, to?: string, search?: string, areaId?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null) as [string, string][])).toString() : '';
    return fetchJson(`${API_URL}/gh-personal/resultados${qs}`);
  },
  getEncuestaDetail: (id: number | string) => fetchJson(`${API_URL}/gh-personal/resultados/${id}`),
  exportEncuestasExcel: async (params?: { from?: string, to?: string, search?: string, areaId?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null) as [string, string][])).toString() : '';
    const token = localStorage.getItem('token') || 
                 localStorage.getItem('m7_token') || 
                 localStorage.getItem('m7_auth_token') || 
                 localStorage.getItem('m7_client_token');
    
    const response = await fetch(`${API_URL}/gh-personal/resultados/excel${qs}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Error al exportar Excel');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Encuestas_Sociodemograficas.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  downloadSurveyPDF: async (id: number | string) => {
    const token = localStorage.getItem('token') || 
                 localStorage.getItem('m7_token') || 
                 localStorage.getItem('m7_auth_token') || 
                 localStorage.getItem('m7_client_token');
    
    const response = await fetch(`${API_URL}/gh-personal/pdf/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Error al descargar PDF');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Encuesta_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  // LMS Gamificado
  getCapacitaciones: () => fetchJson(`${API_URL}/gh-personal/capacitaciones`),
  saveCapacitacion: (data: any) => fetchJson(`${API_URL}/gh-personal/capacitaciones`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getAsignacionesCapacitacion: (capId: number | string) => fetchJson(`${API_URL}/gh-personal/capacitaciones/asignaciones/${capId}`),
  asignarCapacitacion: (data: any) => fetchJson(`${API_URL}/gh-personal/capacitaciones/asignar`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getPublicCapacitacion: (id: string, cedula: string) => fetchJson(`${API_URL}/gh-personal/capacitaciones/publica?id=${id}&cedula=${cedula}`),
  submitCapacitacionResult: (data: any) => fetchJson(`${API_URL}/gh-personal/capacitaciones/submit`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Gestión Humana — Registro de Visitas
  getVisitas: (params?: { from?: string, to?: string, search?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null) as [string, string][])).toString() : '';
    return fetchJson(`${API_URL}/gh-visitas${qs}`);
  },
  saveVisita: (data: any) => fetchJson(`${API_URL}/gh-visitas`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  marcarSalidaVisita: (id: number | string, hora?: string) => fetchJson(`${API_URL}/gh-visitas/${id}/salida`, {
    method: 'PATCH',
    body: JSON.stringify({ hora: hora || null }),
  }),

  // Gestión Humana — Master Inventario
  getGhTiposElementos: () => fetchJson(`${API_URL}/gh-master-inventario/tipos`),
  saveGhTipoElemento: (data: any, id?: number | string) => {
    const url = id ? `${API_URL}/gh-master-inventario/tipos/${id}` : `${API_URL}/gh-master-inventario/tipos`;
    return fetchJson(url, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
  },
  deleteGhTipoElemento: (id: number | string) => fetchJson(`${API_URL}/gh-master-inventario/tipos/${id}`, { method: 'DELETE' }),

  getGhElementos: () => fetchJson(`${API_URL}/gh-master-inventario/elementos`),
  saveGhElemento: (data: any, id?: number | string) => {
    const url = id ? `${API_URL}/gh-master-inventario/elementos/${id}` : `${API_URL}/gh-master-inventario/elementos`;
    return fetchJson(url, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
  },
  deleteGhElemento: (id: number | string) => fetchJson(`${API_URL}/gh-master-inventario/elementos/${id}`, { method: 'DELETE' }),

  // Gestión Humana — Entradas y Salidas de Inventario
  getGhDropdownElementos: () => fetchJson(`${API_URL}/gh-entradas-salidas/dropdown-elementos`),
  getGhOrdenesCompra: (params?: { id?: string | number, fecha_inicio?: string, fecha_fin?: string, proveedor?: string }) => {
    let url = `${API_URL}/gh-entradas-salidas/ordenes`;
    if (params) {
      const search = new URLSearchParams(params as any).toString();
      if (search) url += `?${search}`;
    }
    return fetchJson(url);
  },
  saveGhOrdenCompra: (data: any) => fetchJson(`${API_URL}/gh-entradas-salidas/ordenes`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getGhEntradasBodega: (params?: { id?: string | number, fecha_inicio?: string, fecha_fin?: string, proveedor?: string }) => {
    let url = `${API_URL}/gh-entradas-salidas/entradas`;
    if (params) {
      const search = new URLSearchParams(params as any).toString();
      if (search) url += `?${search}`;
    }
    return fetchJson(url);
  },
  saveGhEntradaBodega: (data: any) => fetchJson(`${API_URL}/gh-entradas-salidas/entradas`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getGhSalidasProveedor: (params?: { id?: string | number, fecha_inicio?: string, fecha_fin?: string, proveedor?: string }) => {
    let url = `${API_URL}/gh-entradas-salidas/salidas`;
    if (params) {
      const search = new URLSearchParams(params as any).toString();
      if (search) url += `?${search}`;
    }
    return fetchJson(url);
  },
  saveGhSalidaProveedor: (data: any) => fetchJson(`${API_URL}/gh-entradas-salidas/salidas`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getGhAvailableSerials: (elementoId: number | string) => fetchJson(`${API_URL}/gh-entradas-salidas/serials/${elementoId}`),

  // Personal Assignments & Returns
  getGhAsignaciones: (params?: { id?: string | number, fecha_inicio?: string, fecha_fin?: string, personal_id?: string | number }) => {
    let url = `${API_URL}/gh-entradas-salidas/asignaciones`;
    if (params) {
      const search = new URLSearchParams(params as any).toString();
      if (search) url += `?${search}`;
    }
    return fetchJson(url);
  },
  saveGhAsignacion: (data: any) => fetchJson(`${API_URL}/gh-entradas-salidas/asignaciones`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getGhDevoluciones: (params?: { id?: string | number, fecha_inicio?: string, fecha_fin?: string, personal_id?: string | number }) => {
    let url = `${API_URL}/gh-entradas-salidas/devoluciones`;
    if (params) {
      const search = new URLSearchParams(params as any).toString();
      if (search) url += `?${search}`;
    }
    return fetchJson(url);
  },
  saveGhDevolucion: (data: any) => fetchJson(`${API_URL}/gh-entradas-salidas/devoluciones`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getGhPersonalInventario: (personalId: number | string) => fetchJson(`${API_URL}/gh-entradas-salidas/personal-inventario/${personalId}`),
  getGhPersonalSerials: (personalId: number | string, elementoId: number | string) => fetchJson(`${API_URL}/gh-entradas-salidas/personal-serials/${personalId}/${elementoId}`),
  getGhInventarioBodega: (params?: { elemento_id?: string | number }) => {
    const qs = params?.elemento_id ? `?elemento_id=${params.elemento_id}` : '';
    return fetchJson(`${API_URL}/gh-entradas-salidas/inventario-bodega${qs}`);
  },
  getGhInventarioPersonal: (params?: { personal_id?: string | number; elemento_id?: string | number }) => {
    const parts: string[] = [];
    if (params?.personal_id) parts.push(`personal_id=${params.personal_id}`);
    if (params?.elemento_id) parts.push(`elemento_id=${params.elemento_id}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return fetchJson(`${API_URL}/gh-entradas-salidas/inventario-personal${qs}`);
  },
  firmarAsignacion: (id: number | string, data: { clave_firma: string; firmado_por?: string }) =>
    fetchJson(`${API_URL}/gh-entradas-salidas/asignaciones/${id}/firmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  firmarDevolucion: (id: number | string, data: { clave_firma: string; firmado_por?: string }) =>
    fetchJson(`${API_URL}/gh-entradas-salidas/devoluciones/${id}/firmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  downloadAsignacionPDF: async (id: number | string) => {
    const token = localStorage.getItem('token') || 
                 localStorage.getItem('m7_token') || 
                 localStorage.getItem('m7_auth_token') || 
                 localStorage.getItem('m7_client_token');
    
    const response = await fetch(`${API_URL}/gh-entradas-salidas/asignaciones/${id}/acta`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Error al descargar acta de asignación');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Acta_Asignacion_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  downloadDevolucionPDF: async (id: number | string) => {
    const token = localStorage.getItem('token') || 
                 localStorage.getItem('m7_token') || 
                 localStorage.getItem('m7_auth_token') || 
                 localStorage.getItem('m7_client_token');
    
    const response = await fetch(`${API_URL}/gh-entradas-salidas/devoluciones/${id}/acta`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Error al descargar acta de devolución');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Acta_Devolucion_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

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

  getDocuments: (clientId?: string, statuses?: string[]) => {
    const params = new URLSearchParams();
    if (clientId) params.set('clientId', clientId);
    if (statuses?.length) params.set('statuses', statuses.join(','));
    const qs = params.toString();
    return fetchJson(`${API_URL}/documents${qs ? `?${qs}` : ''}`);
  },
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
  processDocumentLPayment: (data: any) => fetchJson(`${API_URL}/documents/payments-l`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getConciliationLogs: (docId: string, articleId: string) => fetchJson(`${API_URL}/documents/conciliations/${encodeURIComponent(docId)}/${encodeURIComponent(articleId)}`),
  getRoutes: () => fetchJson(`${API_URL}/routes`),
  saveRoute: (data: any) => fetchJson(`${API_URL}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getDailyKPIs: () => fetchJson(`${API_URL}/routes/kpis`),
  logRouteMovement: (data: any) => fetchJson(`${API_URL}/routes/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getRoutingPatterns: () => fetchJson(`${API_URL}/routes/patterns`),
  getDeliveryPatterns: () => fetchJson(`${API_URL}/routes/delivery-patterns`),
  learnFromCompletedRoute: (data: { vehicleId: string; stops: Array<{ city: string; neighborhood: string; address?: string; clientId?: string }> }) =>
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
  getRoadMatrix: (points: { lat: number; lng: number }[]) =>
    fetchJson(`${API_URL}/routes/road-matrix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points })
    }),
  reassignRouteVehicle: (data: { routeId: string; newVehicleId: string; observations?: string }) =>
    fetchJson(`${API_URL}/routes/reassign-vehicle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getRouteInvoices: (routeId: string) =>
    fetchJson(`${API_URL}/routes/${encodeURIComponent(routeId)}/invoices`),
  unassignRouteInvoice: (data: { routeId: string; invoiceId: string; observations?: string; userId?: string }) =>
    fetchJson(`${API_URL}/routes/unassign-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  assignRouteInvoice: (data: { routeId: string; invoiceId: string; userId?: string; isRepice?: boolean }) =>
    fetchJson(`${API_URL}/routes/assign-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  searchRepiceInvoice: (invoiceNumber: string) =>
    fetchJson(`${API_URL}/routes/search-repice?invoiceNumber=${encodeURIComponent(invoiceNumber)}`),

  repiceRouteInvoice: (data: { routeId: string; invoiceId: string; observations?: string; userId?: string; newVehicleId?: string }) =>
    fetchJson(`${API_URL}/routes/repice-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  failAndReassignInvoice: (data: { routeId: string; invoiceId: string; reason?: string; userId?: string }) =>
    fetchJson(`${API_URL}/routes/fail-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  learnFromFailure: (data: { vehicleId: string; stops: Array<{ city: string; neighborhood?: string; address?: string }>; penalty?: number }) =>
    fetchJson(`${API_URL}/routes/learn-failure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  resolveCustomerCoords: (data: { invoices: { invoiceId: string; customerName: string; city: string }[]; clientId?: string }) =>
    fetchJson(`${API_URL}/routes/resolve-coords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // Horarios de entrega por día de semana
  getDeliverySchedules: (clientId: string, dayOfWeek?: number) => {
    const qs = new URLSearchParams({ clientId });
    if (dayOfWeek !== undefined) qs.set('dayOfWeek', String(dayOfWeek));
    return fetchJson(`${API_URL}/delivery-schedules?${qs.toString()}`);
  },
  upsertDeliverySchedule: (data: { clientId: string; customerName: string; city?: string; dayOfWeek: number; closeTime: string; label?: string }) =>
    fetchJson(`${API_URL}/delivery-schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteDeliverySchedule: (id: number) =>
    fetchJson(`${API_URL}/delivery-schedules/${id}`, { method: 'DELETE' }),

  getMastersuiteReport: (params?: { document?: string; plate?: string }) => {
    const qs = new URLSearchParams();
    if (params?.document) qs.set('document', params.document);
    if (params?.plate) qs.set('plate', params.plate);
    return fetchJson(`${API_URL}/documents/mastersuite-report?${qs.toString()}`);
  },

  // ── Auditoría Factura Bodega 36 ──────────────────────────────────────────
  uploadAuditoriaB36: (data: any) => {
    if (data instanceof FormData) {
      return fetchJson(`${API_URL}/ajover-b36/upload`, { method: 'POST', body: data });
    }
    return fetchJson(`${API_URL}/ajover-b36/upload`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data) 
    });
  },

  getAuditoriaB36Encabezados: (params?: { clientId?: string; from?: string; to?: string; placa?: string; os?: string }) => {
    const qs = new URLSearchParams();
    if (params?.clientId) qs.set('clientId', params.clientId);
    if (params?.from)     qs.set('from',     params.from);
    if (params?.to)       qs.set('to',       params.to);
    if (params?.placa)    qs.set('placa',    params.placa);
    if (params?.os)       qs.set('os',       params.os);
    return fetchJson(`${API_URL}/ajover-b36/encabezados?${qs.toString()}`);
  },

  getAuditoriaB36Detalle: (encId: number) =>
    fetchJson(`${API_URL}/ajover-b36/detalle/${encId}`),

  getAuditoriaB36Sobrecostos: (encId: number) =>
    fetchJson(`${API_URL}/ajover-b36/sobrecostos/${encId}`),

  updateAuditoriaB36Planilla: (id: number, data: { valor_flete: number; sobrecostos: any[]; placa?: string; conductor?: string; change_notes?: string }) =>
    fetchJson(`${API_URL}/ajover-b36/planilla/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteAuditoriaB36: (id: number) =>
    fetchJson(`${API_URL}/ajover-b36/encabezado/${id}`, { method: 'DELETE' }),

  addAuditoriaB36Detalle: (data: { id_enca: number; factura: string; volumen?: number; peso?: number; cubicaje?: number; notas?: string; client_id?: string }) =>
    fetchJson(`${API_URL}/ajover-b36/detalle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteAuditoriaB36Detalle: (id: number, reason?: string) => {
    const qs = new URLSearchParams();
    if (reason) qs.set('reason', reason);
    return fetchJson(`${API_URL}/ajover-b36/detalle/${id}?${qs.toString()}`, { method: 'DELETE' });
  },

  getAuditoriaB36Logs: (encId: number) =>
    fetchJson(`${API_URL}/ajover-b36/logs/${encId}`),

  getAuditoriaB36Conciliacion: (params?: { clientId?: string; from?: string; to?: string; placa?: string; factura?: string }) => {
    const qs = new URLSearchParams();
    if (params?.clientId) qs.set('clientId', params.clientId);
    if (params?.from)     qs.set('from', params.from);
    if (params?.to)       qs.set('to', params.to);
    if (params?.placa)    qs.set('placa', params.placa);
    if (params?.factura)  qs.set('factura', params.factura);
    return fetchJson(`${API_URL}/ajover-b36/conciliacion?${qs.toString()}`);
  },

  saveAuditoriaB36Conciliacion: (data: { id_detalle: number; id_enca: number; factura: string; placa?: string; estado: string; observacion?: string; client_id?: string }) =>
    fetchJson(`${API_URL}/ajover-b36/conciliacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  asignarPlacaB36: (encId: number, data: { placa: string; conductor?: string }) =>
    fetchJson(`${API_URL}/ajover-b36/asignar-placa/${encId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),



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

  getInvoiceTraceability: (invoiceNumber: string) =>
    fetchJson(`${API_URL}/documents/invoice-traceability?invoiceNumber=${encodeURIComponent(invoiceNumber)}`),

  resendInventoryNotification: (docId: string, targetEmail: string) => fetchJson(`${API_URL}/documents/resend-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, targetEmail })
  }),
  correctDocumentItems: (data: { items: any[]; dryRun: boolean; changedBy: string }) =>
    fetchJson(`${API_URL}/documents/correct-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),

  updateItemInvoice: (data: { itemId: number | string; newInvoice: string }) =>
    fetchJson(`${API_URL}/documents/items/invoice`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  updateConsolidatedCount2: (data: { docId: string; articleId: string; newCount2: number; observation: string }) =>
    fetchJson(`${API_URL}/documents/consolidated-count2`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  getManagementReports: (params: {
    page?: number;
    limit?: number;
    ocNumber?: string;
    manifestNumber?: string;
    plate?: string;
    clientName?: string;
    fromDate?: string;
    toDate?: string;
    sortBy?: string;
    sortDirection?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.append('page', String(params.page));
    if (params.limit) qs.append('limit', String(params.limit));
    if (params.ocNumber) qs.append('ocNumber', params.ocNumber);
    if (params.manifestNumber) qs.append('manifestNumber', params.manifestNumber);
    if (params.plate) qs.append('plate', params.plate);
    if (params.clientName) qs.append('clientName', params.clientName);
    if (params.fromDate) qs.append('fromDate', params.fromDate);
    if (params.toDate) qs.append('toDate', params.toDate);
    if (params.sortBy) qs.append('sortBy', params.sortBy);
    if (params.sortDirection) qs.append('sortDirection', params.sortDirection);
    return fetchJson(`${API_URL}/management-reports?${qs.toString()}`);
  },

  uploadManagementReports: (records: any[]) =>
    fetchJson(`${API_URL}/management-reports/upload`, {
      method: 'POST',
      body: JSON.stringify({ records })
    }),

  uploadReceiptDates: (records: any[]) =>
    fetchJson(`${API_URL}/management-reports/upload-receipt-dates`, {
      method: 'POST',
      body: JSON.stringify({ records })
    }),

  uploadEgressDates: (records: any[]) =>
    fetchJson(`${API_URL}/management-reports/upload-egress-dates`, {
      method: 'POST',
      body: JSON.stringify({ records })
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

  saveRouteGroupPayments: (data: { documentId: string, plate: string, payments: any[], userId: string }) => fetchJson(`${API_URL}/conciliation/group-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  checkReferenceExists: (reference: string) => fetchJson(`${API_URL}/conciliation/check-reference/${encodeURIComponent(reference)}`),


  saveSobrecostos: (data: { documentId: string, plate: string, items: any[], userId: string }) => fetchJson(`${API_URL}/conciliation/sobrecostos`, {
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
  getFormatosTransportes: () => fetchJson(`${API_URL}/admin-center/formatos`),
  updateFormatoTransporte: (oldId: string, data: { newId: string, nombre: string, orden: number }) => fetchJson(`${API_URL}/admin-center/formatos/${encodeURIComponent(oldId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
};
