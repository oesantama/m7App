/// <reference types="vite/client" />

const isDev = import.meta.env.DEV;
export const API_URL = import.meta.env.VITE_API_URL || (isDev ? 'http://localhost:8080/api' : '/api');

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

      if (res.status === 431) {
        console.warn('[ORBIT-AUTH] 431 — token demasiado grande. Forzando re-login.');
        localStorage.removeItem('token');
        localStorage.removeItem('m7_user_session');
        window.dispatchEvent(new CustomEvent('orbit-auth-failed', {
          detail: { message: 'Sesión inválida. Por favor inicie sesión nuevamente.' }
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

// Fetch sin token — para rutas públicas (cap/public, etc.)
export const fetchPublic = async (url: string, options?: any) => {
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
    cache: 'no-cache' as RequestCache,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'object' ? (data.error || data.message || `Error ${res.status}`) : String(data);
    const err: any = new Error(msg);
    if (typeof data === 'object' && data.codigo) err.codigo = data.codigo;
    throw err;
  }
  return data;
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
  getUnifiedHistory(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return fetchJson(`${API_URL}/dispatch/unified-history${qs ? '?' + qs : ''}`);
  },
  getHistoryFiltersData() {
    return fetchJson(`${API_URL}/dispatch/history-filters-data?_t=${Date.now()}`);
  },
  getManagementClients() {
    return fetchJson(`${API_URL}/management-reports/clients?_t=${Date.now()}`);
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
    const qs = '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
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
  addMissingInvoice: (data: { 
    documentId: string; invoiceNumber: string; valor: number; metodoPago: string; targetRouteId?: string; userId: string;
    customerName?: string; city?: string; address?: string; unCode?: string; clientRef?: string;
    items?: { articleId: string; expectedQty: number; peso?: number; volume?: number; orderNumber?: string }[];
  }) =>
    fetchJson(`${API_URL}/conciliation/add-missing-invoice`, { method: 'POST', body: JSON.stringify(data) }),

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
  registerRouteReturn: (data: { invoiceId: string; vehiclePlate?: string; vehicleId?: string; driverId?: string; returnType: 'COMPLETA' | 'PARCIAL'; returnReason?: string; notes?: string; items?: any[]; createdBy?: string; vendedor?: string; numeroPlanilla?: string; fechaPlaca?: string }) =>
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
  sendApprovalBatchEmail: (id: number, email_proveedor: string, nombre_proveedor: string) =>
    fetchJson(`${API_URL}/dispatch/approval-batches/${id}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_proveedor, nombre_proveedor }),
    }),
  confirmReturnByFacturacion: (id: number, confirmedBy: string) =>
    fetchJson(`${API_URL}/dispatch/delivery-returns/${id}/confirm-facturacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmedBy }),
    }),
  confirmDocReceived: (id: string, confirmedBy: string) =>
    fetchJson(`${API_URL}/dispatch/approval-batches/${id}/confirm-doc-received`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmedBy }),
    }),
  getReturnsForInvoice: (invoiceId: string) =>
    fetchJson(`${API_URL}/dispatch/returns-for-invoice/${encodeURIComponent(invoiceId)}`),
  getReturnsTracking: (clientId?: string) => {
    const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
    return fetchJson(`${API_URL}/dispatch/delivery-returns/tracking${qs}`);
  },
  getConciliacionPending: (clientId?: string) => {
    const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
    return fetchJson(`${API_URL}/dispatch/delivery-returns/conciliacion-pending${qs}`);
  },
  importFromConciliacion: (invoices: any[], importedBy: string) =>
    fetchJson(`${API_URL}/dispatch/delivery-returns/import-from-conciliacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices, importedBy }),
    }),
  advanceReturnState: (id: number, newStatus: string, confirmedBy: string) =>
    fetchJson(`${API_URL}/dispatch/delivery-returns/${id}/advance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStatus, confirmedBy }),
    }),
  markExcelDownloaded: (id: number) =>
    fetchJson(`${API_URL}/dispatch/delivery-returns/${id}/mark-excel`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    }),
  getInvoiceReturnData: (invoiceNumber: string) =>
    fetchJson(`${API_URL}/dispatch/invoice-return-data/${encodeURIComponent(invoiceNumber)}`),
  getBodegaReturnsHistory: (params?: { clientId?: string; dateFrom?: string; dateTo?: string }) => {
    const qs = new URLSearchParams();
    if (params?.clientId) qs.set('clientId', params.clientId);
    if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params?.dateTo)   qs.set('dateTo',   params.dateTo);
    return fetchJson(`${API_URL}/dispatch/bodega-returns-history${qs.toString() ? '?' + qs : ''}`);
  },
  confirmReturnConciliation: (id: number | string, data: { confirmedBy: string; observaciones?: string }) =>
    fetchJson(`${API_URL}/dispatch/returns/${id}/confirm-conciliation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getReturnReasons: () =>
    fetchJson(`${API_URL}/dispatch/return-reasons`),
  createReturnReason: (name: string) =>
    fetchJson(`${API_URL}/dispatch/return-reasons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

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
  confirmSupplierReceived: (id: number | string, receivedBy: string) =>
    fetchJson(`${API_URL}/inventory/supplier-returns/${id}/received`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receivedBy }),
    }),

  getConciliationPlanillaUrl: (routeId: string | number) => {
    return `${API_URL}/conciliation/planilla?routeId=${routeId}`;
  },
  searchConciliationRoutes: (clientId: string, date: string) =>
    fetchJson(`${API_URL}/conciliation/search-routes?clientId=${encodeURIComponent(clientId)}&date=${date}`),

  // --- PLANILLAS OPERATIVAS (Logística) ---
  getPlanillasRecords: (params?: {
    placa?: string; plu?: string; pedido?: string; articulo?: string; cliente?: string;
    search?: string; fechaDesde?: string; fechaHasta?: string; onlyCurrentMonth?: string;
  }) => {
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetchJson(`${API_URL}/planillas-operativas${qs}`);
  },
  savePlanillasRecords: (records: any[]) => fetchJson(`${API_URL}/planillas-operativas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records)
  }),
  deletePlanillaRecord: async (id: string) => {
    const res = await fetchJson(`${API_URL}/planillas-operativas/${id}`, { method: 'DELETE' });
    return res.json();
  },
  updatePlanillaRecord: (id: string, data: { pedido: string }) =>
    fetchJson(`${API_URL}/planillas-operativas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  clearPlanillasRecords: () => fetchJson(`${API_URL}/planillas-operativas`, { method: 'DELETE' }),
  analyzePlanillaPdf: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetchJson(`${API_URL}/planillas-operativas/analyze-pdf`, {
      method: 'POST',
      body: fd,
      // No Content-Type header so the browser sets multipart/form-data correctly
    });
  },
  checkPlanillasFiles: (files: string[]) => fetchJson(`${API_URL}/planillas-operativas/check-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files })
  }),
  checkPlanillasHistory: (pedidos: string[]) => fetchJson(`${API_URL}/planillas-operativas/check-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedidos })
  }),
  getPlanillasRedespachos: () => fetchJson(`${API_URL}/planillas-operativas/redespachos`),

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

  // GH Inventario Físico
  getInventariosFisicos: () => fetchJson(`${API_URL}/gh-inventario-fisico`),
  getInventarioFisicoById: (id: number | string) => fetchJson(`${API_URL}/gh-inventario-fisico/${id}`),
  createInventarioFisico: (data: { titulo: string; assigned_to: string; created_by: string; observaciones?: string; elementos_ids?: number[] }) =>
    fetchJson(`${API_URL}/gh-inventario-fisico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  saveConteos: (id: number | string, conteos: { elemento_id: number; cantidad_fisica: number }[]) =>
    fetchJson(`${API_URL}/gh-inventario-fisico/${id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conteos }),
    }),
  saveJustificaciones: (id: number | string, justificaciones: { item_id: number; justificacion: string }[]) =>
    fetchJson(`${API_URL}/gh-inventario-fisico/${id}/justificar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ justificaciones }),
    }),
  generarCodigoInventario: (id: number | string, generado_por: string) =>
    fetchJson(`${API_URL}/gh-inventario-fisico/${id}/generar-codigo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generado_por }),
    }),
  cerrarInventarioFisico: (id: number | string, codigo: string, usado_por: string) =>
    fetchJson(`${API_URL}/gh-inventario-fisico/${id}/cerrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, usado_por }),
    }),
  anularInventarioFisico: (id: number | string, motivo: string) =>
    fetchJson(`${API_URL}/gh-inventario-fisico/${id}/anular`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    }),

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
    method: data.id ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  }),
  getNotificacionesWhatsapp: () => fetchJson(`${API_URL}/notificaciones-whatsapp?_t=${Date.now()}`),
  saveNotificacionWhatsapp: (data: any) => fetchJson(`${API_URL}/notificaciones-whatsapp`, {
    method: data.id ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  }),
  deleteNotificacionConfig: (id: string, deletedBy?: string) => fetchJson(`${API_URL}/notificaciones-config/${id}?deletedBy=${encodeURIComponent(deletedBy || '')}`, { method: 'DELETE' }),

  // Alertas WhatsApp
  getAlertasWhatsapp: (): Promise<{ success: boolean; data: any[] }> =>
    fetchJson(`${API_URL}/alertas-whatsapp?_t=${Date.now()}`),
  saveAlertaWhatsapp: (data: any): Promise<{ success: boolean; message?: string; error?: string }> =>
    fetchJson(`${API_URL}/alertas-whatsapp`, {
      method: data.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteAlertaWhatsapp: (id: string): Promise<{ success: boolean }> =>
    fetchJson(`${API_URL}/alertas-whatsapp/${id}`, { method: 'DELETE' }),
  sendTestAlertaWhatsapp: (id: string): Promise<{ success: boolean; message?: string; error?: string }> =>
    fetchJson(`${API_URL}/alertas-whatsapp/${id}/test`, { method: 'POST' }),

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

  getDocuments: (clientId?: string, statuses?: string[], docL?: string, plate?: string) => {
    const params = new URLSearchParams();
    if (clientId) params.set('clientId', clientId);
    if (statuses?.length) params.set('statuses', statuses.join(','));
    if (docL) params.set('docL', docL);
    if (plate) params.set('plate', plate);
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
  updateDocumentStatus: (id: string, status: string, user: string, planType?: string) => fetchJson(`${API_URL}/documents/status/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, user, planType })
  }),
  processDocumentLPayment: (data: any) => fetchJson(`${API_URL}/documents/payments-l`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getConciliationLogs: (docId: string, articleId: string) => fetchJson(`${API_URL}/documents/conciliations/${encodeURIComponent(docId)}/${encodeURIComponent(articleId)}`),
  getRoutes: (params?: { date?: string; clientId?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString() : '';
    return fetchJson(`${API_URL}/routes${qs}`);
  },
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
    clientNames?: string;
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
    if (params.clientNames) qs.append('clientNames', params.clientNames);
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
    sortOrder?: string,
    conditions?: any[]
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
  saveAdminRecord: (tableName: string, data: any, isUpdate: boolean = false) => fetchJson(`${API_URL}/admin/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, data, isUpdate })
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
  runAdminCron: (cronName: string) => fetchJson(`${API_URL}/admin/cron/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cronName })
  }),
  getCronLogs: () => fetchJson(`${API_URL}/admin/cron/logs`),
  getAdminPendingDriveCount: () => fetchJson(`${API_URL}/admin/cron/pending-drive`),

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
  saveNovedadToDrive: (data: { docId: string; clientName: string; driveDate?: string }) =>
    fetchJson(`${API_URL}/inventory-news/save-to-drive`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
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
  processGrupoInterPDF: async (file: File, planilla: string, onProgress: (data: any) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    if (planilla) formData.append('planilla', planilla);
    
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
  getTarifasLineaBlanca: () => fetchJson(`${API_URL}/tarifas-linea-blanca`),
  saveTarifaLineaBlanca: (data: any) => fetchJson(`${API_URL}/tarifas-linea-blanca`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteTarifaLineaBlanca: (id: string) => fetchJson(`${API_URL}/tarifas-linea-blanca/${id}`, { method: 'DELETE' }),
  bulkSaveTarifasLineaBlanca: (data: any) => fetchJson(`${API_URL}/tarifas-linea-blanca/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  updateFormatoTransporte: (oldId: string, data: { newId: string, nombre: string, orden: number }) => fetchJson(`${API_URL}/admin-center/formatos/${encodeURIComponent(oldId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  saveConciliacionLB: async (data: any) => fetchJson(`${API_URL}/conciliacion-linea-blanca`, { method: 'POST', body: JSON.stringify(data) }),
  getHistorialConciliacionesLB: async () => fetchJson(`${API_URL}/conciliacion-linea-blanca`),
  searchConciliacionLB: async (params: any) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== '')) as any).toString();
    return fetchJson(`${API_URL}/conciliacion-linea-blanca/search?${qs}`);
  },
  getDetallesConciliacionLB: async (id: string | number) => fetchJson(`${API_URL}/conciliacion-linea-blanca/${id}`),

  // --- INFORMES FLOTA ---
  getFlotaReport: (params: { from: string; to: string }) =>
    fetchJson(`${API_URL}/flota/report?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`),

  // --- TDM MANIFIESTOS (carga por Excel) ---
  uploadTdmManifiestos: (data: { clientId: string; rows: any[]; uploadedBy?: string }) =>
    fetchJson(`${API_URL}/flota/tdm/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getTdmManifiestos: (params?: { from?: string; to?: string; clientId?: string; view?: 'detail' | 'summary' }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null) as [string, string][])).toString() : '';
    return fetchJson(`${API_URL}/flota/tdm/manifiestos${qs}`);
  },
  deleteTdmManifiesto: (id: number) =>
    fetchJson(`${API_URL}/flota/tdm/manifiestos/${id}`, { method: 'DELETE' }),

  lookupCities: (cities: string[]): Promise<{ mapping: Record<string, string> }> =>
    fetchJson(`${API_URL}/geo/lookup-cities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cities }),
    }),

  // ─── MÓDULO CAPACITACIONES (cap_*) ──────────────────────────────────────────
  capGetCapacitaciones: (cedula?: string, cedulaSelf?: string) => {
    const p = new URLSearchParams();
    if (cedula) p.set('cedula', cedula);
    if (cedulaSelf) p.set('cedula_self', cedulaSelf);
    const qs = p.toString();
    return fetchJson(`${API_URL}/cap/capacitaciones${qs ? `?${qs}` : ''}`);
  },
  capGetCapacitacion: (id: number) => fetchJson(`${API_URL}/cap/capacitaciones/${id}`),
  capSaveCapacitacion: (data: any) => fetchJson(`${API_URL}/cap/capacitaciones`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  capUpdateCapacitacion: (id: number, data: any) => fetchJson(`${API_URL}/cap/capacitaciones/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  capDeleteCapacitacion: (id: number) => fetchJson(`${API_URL}/cap/capacitaciones/${id}`, { method: 'DELETE' }),

  capUploadRecurso: (formData: FormData) => fetchJson(`${API_URL}/cap/recursos`, { method: 'POST', body: formData }),
  capDeleteRecurso: (id: number) => fetchJson(`${API_URL}/cap/recursos/${id}`, { method: 'DELETE' }),

  capGetAsignaciones: (capacitacion_id?: number) => {
    const qs = capacitacion_id ? `?capacitacion_id=${capacitacion_id}` : '';
    return fetchJson(`${API_URL}/cap/asignaciones${qs}`);
  },
  capAsignar: (data: any) => fetchJson(`${API_URL}/cap/asignaciones`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  capActualizarFechas: (id: number, fecha_inicio: string, fecha_fin: string) =>
    fetchJson(`${API_URL}/cap/asignaciones/${id}/fechas`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha_inicio, fecha_fin }),
    }),

  capGetDashboard: (capacitacion_id?: number, cedula?: string) => {
    const p = new URLSearchParams();
    if (capacitacion_id) p.set('capacitacion_id', String(capacitacion_id));
    if (cedula)          p.set('cedula', cedula);
    const qs = p.toString() ? `?${p.toString()}` : '';
    return fetchJson(`${API_URL}/cap/dashboard${qs}`);
  },

  capGetCertificado: (numero: string) => fetchJson(`${API_URL}/cap/certificados/${encodeURIComponent(numero)}`),
  capGetCertificadosByAsignacion: (asignacion_id: number) =>
    fetchJson(`${API_URL}/cap/certificados/asignacion/${asignacion_id}`),

  capGetCargos: () => fetchJson(`${API_URL}/cap/cargos`),
  capGetPreview: (id: number) => fetchJson(`${API_URL}/cap/capacitaciones/${id}/preview`),
  capGetEspecialistaMe: () => fetchJson(`${API_URL}/cap/especialistas/me`),
  capGetEspecialistas: () => fetchJson(`${API_URL}/cap/especialistas`),
  capSaveEspecialista: (data: any) => fetchJson(`${API_URL}/cap/especialistas${data.id ? `/${data.id}` : ''}`, {
    method: data.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  capDeleteEspecialista: (id: number) => fetchJson(`${API_URL}/cap/especialistas/${id}`, { method: 'DELETE' }),
  capResetAsignacion: (id: number, usuario_control: string) =>
    fetchJson(`${API_URL}/cap/asignaciones/${id}/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario_control }),
    }),
  capAmpliarIntentos: (id: number, cantidad: number, usuario_control: string) =>
    fetchJson(`${API_URL}/cap/asignaciones/${id}/intentos`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad, usuario_control }),
    }),
  capGetIntentosByAsignacion: (asignacion_id: number) =>
    fetchJson(`${API_URL}/cap/asignaciones/${asignacion_id}/intentos`),

  // Públicas (sin auth)
  capGetPublicCapacitacion: (id: number, cedula: string) =>
    fetchPublic(`${API_URL}/cap/public/capacitacion?id=${id}&cedula=${encodeURIComponent(cedula)}`),
  capIniciarIntento: (data: { asignacion_id: number; cedula: string }) =>
    fetchPublic(`${API_URL}/cap/public/intento/start`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  capSubmitIntento: (data: any) => fetchPublic(`${API_URL}/cap/public/intento/submit`, {
    method: 'POST', body: JSON.stringify(data),
  }),

  // ── NOTICIAS Y AVISOS ──────────────────────────────────────────────────────
  noticiasGetAll: () => fetchJson(`${API_URL}/noticias`),
  noticiasSave: (data: any) => fetchJson(`${API_URL}/noticias${data.id ? `/${data.id}` : ''}`, {
    method: data.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  noticiasDelete: (id: number) => fetchJson(`${API_URL}/noticias/${id}`, { method: 'DELETE' }),
  noticiasDeleteArchivo: (id: number) => fetchJson(`${API_URL}/noticias/${id}/archivo`, { method: 'DELETE' }),
  noticiasUpload: (file: File, titulo?: string) => {
    const fd = new FormData();
    fd.append('archivo', file);
    if (titulo) fd.append('titulo', titulo);
    return fetchJson(`${API_URL}/noticias/upload`, { method: 'POST', body: fd });
  },
  noticiasGetFeed: () => fetchJson(`${API_URL}/noticias/feed`),
  noticiasGetPublicFeed: () => fetchPublic(`${API_URL}/noticias/public/feed`),
  noticiasStreamUrl: (id: number) => `${API_URL}/noticias/${id}/stream`,
  noticiasPublicStreamUrl: (id: number) => `${API_URL}/noticias/public/${id}/stream`,
  noticiasGetPublicById: (id: number) => fetchJson(`${API_URL}/noticias/public/${id}`),

  // ── DOGAMA ────────────────────────────────────────────────────────────────
  dogamaGetConfeccionistas: () => fetchJson(`${API_URL}/dogama/confeccionistas`),
  dogamaCreateConfeccionista: (data: any) => fetchJson(`${API_URL}/dogama/confeccionistas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  dogamaBulkConfeccionistas: (rows: any[], usuariocreacion: string) =>
    fetchJson(`${API_URL}/dogama/confeccionistas/bulk`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, usuariocreacion }),
    }),
  dogamaUpdateConfeccionista: (id: number, data: any) =>
    fetchJson(`${API_URL}/dogama/confeccionistas/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),
  dogamaDeleteConfeccionista: (id: number) =>
    fetchJson(`${API_URL}/dogama/confeccionistas/${id}`, { method: 'DELETE' }),
  dogamaResolveCiudadBulk: (ciudad_text: string, ciudad_id: number) =>
    fetchJson(`${API_URL}/dogama/confeccionistas/resolve-ciudad`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ciudad_text, ciudad_id }) }),

  // Catálogos genéricos
  dogamaGetCatalog: (table: string) => fetchJson(`${API_URL}/dogama/catalog/${table}`),
  dogamaCreateCatalogItem: (table: string, data: any) =>
    fetchJson(`${API_URL}/dogama/catalog/${table}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  dogamaBulkCatalog: (table: string, rows: any[], usuariocreacion: string) =>
    fetchJson(`${API_URL}/dogama/catalog/${table}/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, usuariocreacion }) }),
  dogamaUpdateCatalogItem: (table: string, id: number, data: any) =>
    fetchJson(`${API_URL}/dogama/catalog/${table}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  dogamaDeleteCatalogItem: (table: string, id: number) =>
    fetchJson(`${API_URL}/dogama/catalog/${table}/${id}`, { method: 'DELETE' }),

  // Email OAuth
  dogamaGetEmailConfig: () => fetchJson(`${API_URL}/dogama/email-config`),
  dogamaEmailInitUrl: (provider: 'gmail' | 'outlook') => `${API_URL}/dogama/email-config/${provider}/init`,
  dogamaDeleteEmailConfig: (provider: string) => fetchJson(`${API_URL}/dogama/email-config/${provider}`, { method: 'DELETE' }),
  dogamaTestEmail: (provider: string) => fetchJson(`${API_URL}/dogama/email-config/${provider}/test`, { method: 'POST' }),

  dogamaGetFleetAssignments: () => fetchJson(`${API_URL}/dogama/fleet-assignments`),

  // Despachos
  dogamaGetDespachos: (assignable?: boolean) => fetchJson(`${API_URL}/dogama/despachos${assignable ? '?assignable=true' : ''}`),
  dogamaBulkDespachos: (rows: any[], usuariocreacion: string) =>
    fetchJson(`${API_URL}/dogama/despachos/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, usuariocreacion }) }),
  dogamaUpdateDespachoEstado: (id: number, estado_id: string) =>
    fetchJson(`${API_URL}/dogama/despachos/${id}/estado`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_id }) }),
  dogamaDeleteDespacho: (id: number) => fetchJson(`${API_URL}/dogama/despachos/${id}`, { method: 'DELETE' }),

  // Citas / Recogidas
  dogamaGetCitas: (assignable?: boolean) => fetchJson(`${API_URL}/dogama/citas${assignable ? '?assignable=true' : ''}`),
  dogamaBulkCitas: (rows: any[], usuariocreacion: string) =>
    fetchJson(`${API_URL}/dogama/citas/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, usuariocreacion }) }),
  dogamaUpdateCitaEstado: (id: number, estado_id: string) =>
    fetchJson(`${API_URL}/dogama/citas/${id}/estado`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_id }) }),
  dogamaPatchCita: (id: number, data: Record<string, any>) =>
    fetchJson(`${API_URL}/dogama/citas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  dogamaDeleteCita: (id: number) => fetchJson(`${API_URL}/dogama/citas/${id}`, { method: 'DELETE' }),

  // ── Planillas Historial ─────────────────────────────────────────────────────
  dogamaGetPlanillasHistorial: (filters?: { placa?: string; fecha?: string; confeccionista?: string }) => {
    const p = new URLSearchParams();
    if (filters?.placa)         p.set('placa', filters.placa);
    if (filters?.fecha)         p.set('fecha', filters.fecha);
    if (filters?.confeccionista) p.set('confeccionista', filters.confeccionista);
    const qs = p.toString();
    return fetchJson(`${API_URL}/dogama/planillas${qs ? '?' + qs : ''}`);
  },
  dogamaCreatePlanillaHistorial: (body: {
    vehicle_id: string;
    fecha?: string;
    remesa?: string | null;
    manifiesto?: string | null;
    valor_cxc?: number | null;
    valor_cxp?: number | null;
    intermediacion?: number | null;
    items: Array<{ tipo: 'despacho' | 'cita'; id: number }>;
    usuario_creacion?: string;
  }) =>
    fetchJson(`${API_URL}/dogama/planillas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  dogamaPatchPlanillaHistorial: (id: number, data: {
    estado_id: string;
    motivo_cancelacion?: string | null;
    tipo_cancelacion?: 'reasignar' | 'definitivo' | null;
    user_id?: string | null;
    user_nombre?: string | null;
  }) =>
    fetchJson(`${API_URL}/dogama/planillas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaPatchEncPlanilla: (id: number, data: {
    remesa?: string | null; manifiesto?: string | null;
    valor_cxc?: number | null; valor_cxp?: number | null;
    intermediacion?: number | null; estado_id?: string;
  }) =>
    fetchJson(`${API_URL}/dogama/enc-planillas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaAddConfeccionistaToRoute: (data: {
    enc_id?: number; vehicle_id?: string; conductor_id?: string | null;
    client_id?: string | null; fecha?: string; confeccionista_id: number;
    tipo?: string; usuario_creacion?: string; user_nombre?: string;
  }) =>
    fetchJson(`${API_URL}/dogama/planillas/confeccionista`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaChangeRouteVehicle: (data: {
    old_vehicle_id: string; conductor_id?: string | null;
    client_id?: string | null; fecha?: string;
    new_vehicle_id: string; user_id?: string; user_nombre?: string;
  }) =>
    fetchJson(`${API_URL}/dogama/planillas/change-vehicle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaGetRouteAuditLog: (enc_id: number) =>
    fetchJson(`${API_URL}/dogama/planillas/audit-log?enc_id=${enc_id}`),

  dogamaCreateMaterialEmpaque: (body: {
    vehicle_id: string;
    fecha?: string | null;
    confeccionista_id?: number | null;
    remesa?: string | null;
    manifiesto?: string | null;
    valor_cxc?: number | null;
    valor_cxp?: number | null;
    intermediacion?: number | null;
    cajas?: number | null;
    tulas?: number | null;
    canastas?: number | null;
    costales?: number | null;
    usuario_creacion?: string;
  }) =>
    fetchJson(`${API_URL}/dogama/planillas/material-empaque`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  // ── Fletes e Intermediación ───────────────────────────────────────────────
  dogamaGetFletes: () => fetchJson(`${API_URL}/dogama/fletes`),
  dogamaCreateFlete: (data: {
    flete_minimo?: number | null;
    valor_intermediacion_minimo?: number | null;
    flete_maximo?: number | null;
    intermediacion_final?: number | null;
    estado_id?: string;
    usuario_creacion?: string;
  }) =>
    fetchJson(`${API_URL}/dogama/fletes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  dogamaUpdateFlete: (id: number, data: {
    flete_minimo?: number | null;
    valor_intermediacion_minimo?: number | null;
    flete_maximo?: number | null;
    intermediacion_final?: number | null;
    estado_id?: string;
    usuario_actualizacion?: string;
  }) =>
    fetchJson(`${API_URL}/dogama/fletes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaGetNotifCorreos: (filters?: { estado?: string; fecha_desde?: string; fecha_hasta?: string; enc_id?: number }) => {
    const params = new URLSearchParams();
    if (filters?.estado)      params.set('estado', filters.estado);
    if (filters?.fecha_desde) params.set('fecha_desde', filters.fecha_desde);
    if (filters?.fecha_hasta) params.set('fecha_hasta', filters.fecha_hasta);
    if (filters?.enc_id != null) params.set('enc_id', String(filters.enc_id));
    const qs = params.toString();
    return fetchJson(`${API_URL}/dogama/notif-correos${qs ? '?' + qs : ''}`);
  },

  dogamaCreateNotifCorreos: (enc_id: number, created_by?: string) =>
    fetchJson(`${API_URL}/dogama/notif-correos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enc_id, created_by }),
    }),

  dogamaUpdateNotifCorreo: (id: number, estado: 'pendiente' | 'enviado' | 'cancelado') =>
    fetchJson(`${API_URL}/dogama/notif-correos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    }),

  dogamaSendNotifCorreo: (id: number) =>
    fetchJson(`${API_URL}/dogama/notif-correos/${id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),

  dogamaGetEmailTemplate: () =>
    fetchJson(`${API_URL}/dogama/email-template`),

  dogamaSaveEmailTemplate: (subject: string, body: string, updated_by?: string) =>
    fetchJson(`${API_URL}/dogama/email-template`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, updated_by }),
    }),

  // ── Auxiliares de mesa ──────────────────────────────────────────────────────
  dogamaGetAuxiliaresMesa: () =>
    fetchJson(`${API_URL}/dogama/auxiliares-mesa`),

  dogamaCreateAuxiliarMesa: (data: { nombre: string; estado_id?: string; usuario_creacion?: string }) =>
    fetchJson(`${API_URL}/dogama/auxiliares-mesa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaUpdateAuxiliarMesa: (id: number, data: { nombre?: string; estado_id?: string }) =>
    fetchJson(`${API_URL}/dogama/auxiliares-mesa/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaDeleteAuxiliarMesa: (id: number) =>
    fetchJson(`${API_URL}/dogama/auxiliares-mesa/${id}`, { method: 'DELETE' }),

  // ── Cargue de planilla ──────────────────────────────────────────────────────
  dogamaPatchPlanillaCargue: (id: number, data: {
    unidades_carge?: number | null;
    llegada_vh?: string | null;
    aux_mesa_id?: number | null;
    cantidad_cargada?: number | null;
    hora_inicio_carge?: string | null;
    hora_final_carge?: string | null;
    observaciones?: string | null;
    usuario_cargue_id?: number | null;
  }) =>
    fetchJson(`${API_URL}/dogama/planillas/${id}/cargue`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // ── Auxiliares externos ─────────────────────────────────────────────────────
  dogamaGetAuxiliaresExternos: (planilla_id: number) =>
    fetchJson(`${API_URL}/dogama/auxiliares-externos?planilla_id=${planilla_id}`),

  dogamaCreateAuxiliarExterno: (data: { nombre: string; planilla_historial_id: number; usuario_creacion?: number }) =>
    fetchJson(`${API_URL}/dogama/auxiliares-externos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaDeleteAuxiliarExterno: (id: number) =>
    fetchJson(`${API_URL}/dogama/auxiliares-externos/${id}`, { method: 'DELETE' }),

};
