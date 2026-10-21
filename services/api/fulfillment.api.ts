import { API_URL, getStoredToken, fetchJson } from './client';

export const fulfillmentApi = {
  getFulfillmentClientes: () => fetchJson(`${API_URL}/fulfillment/clientes`),
  createFulfillmentCliente: (data: { codigo: string; nombre: string; pais?: string; moneda: 'USD' | 'COP'; notas_tarifas?: string; sede?: 'CAF' | 'M7' }) =>
    fetchJson(`${API_URL}/fulfillment/clientes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateFulfillmentCliente: (id: number, data: Record<string, any>) =>
    fetchJson(`${API_URL}/fulfillment/clientes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  getFulfillmentTransportistas: () => fetchJson(`${API_URL}/fulfillment/transportistas`),
  createFulfillmentTransportista: (nombre: string) =>
    fetchJson(`${API_URL}/fulfillment/transportistas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }) }),
  updateFulfillmentTransportista: (id: number, data: { nombre?: string; estado_id?: string }) =>
    fetchJson(`${API_URL}/fulfillment/transportistas/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  getFulfillmentProductos: () => fetchJson(`${API_URL}/fulfillment/productos`),
  createFulfillmentProducto: (nombre: string) =>
    fetchJson(`${API_URL}/fulfillment/productos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }) }),
  updateFulfillmentProducto: (id: number, data: { nombre?: string; estado_id?: string }) =>
    fetchJson(`${API_URL}/fulfillment/productos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  getFulfillmentRegistros: (filters?: { cliente_id?: number | string; anio?: number | string; mes?: string; latest?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.cliente_id) params.set('cliente_id', String(filters.cliente_id));
    if (filters?.anio) params.set('anio', String(filters.anio));
    if (filters?.mes) params.set('mes', filters.mes);
    if (filters?.latest) params.set('latest', 'true');
    const qs = params.toString();
    return fetchJson(`${API_URL}/fulfillment/registros${qs ? '?' + qs : ''}`);
  },
  getFulfillmentRegistroDetalle: (id: number) => fetchJson(`${API_URL}/fulfillment/registros/${id}`),
  deleteFulfillmentRegistro: (id: number) => fetchJson(`${API_URL}/fulfillment/registros/${id}`, { method: 'DELETE' }),
  createFulfillmentRegistro: (data: { cliente_id: number; anio: number | string; mes: string; subtipo?: string }) =>
    fetchJson(`${API_URL}/fulfillment/registros`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateFulfillmentRegistro: (id: number, data: { anio: number | string; mes: string; subtipo?: string }) =>
    fetchJson(`${API_URL}/fulfillment/registros/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  getFulfillmentResumenGerencial: (filters?: { cliente_id?: number | string; anio?: number | string; mes?: string; latest?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.cliente_id) params.set('cliente_id', String(filters.cliente_id));
    if (filters?.anio) params.set('anio', String(filters.anio));
    if (filters?.mes) params.set('mes', filters.mes);
    if (filters?.latest) params.set('latest', 'true');
    const qs = params.toString();
    return fetchJson(`${API_URL}/fulfillment/resumen-gerencial${qs ? '?' + qs : ''}`);
  },

  downloadFulfillmentPlantilla: async () => {
    const token = getStoredToken();
    const res = await fetch(`${API_URL}/fulfillment/plantilla`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('No se pudo descargar la plantilla');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_fullfilment.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  downloadConciliacionPlantillaExcel: async () => {
    const token = getStoredToken();
    const res = await fetch(`${API_URL}/fulfillment/conciliacion/plantilla`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('No se pudo descargar la plantilla de conciliación');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_conciliacion_fulfillment.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  importFulfillmentXlsx: async (file: File, cliente_id: number) => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('cliente_id', String(cliente_id));
    const res = await fetch(`${API_URL}/fulfillment/importar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },

  createFulfillmentDetalleManual: (data: {
    cliente_id: number; anio: number | string; mes: string; subtipo?: string;
    fecha?: string; producto: string; descripcion?: string; orden?: string;
    cantidad?: number | string; tarifa?: number | string; monto: number | string;
    costo_transportista?: number | string; transportista?: string; seguimiento?: string;
    comprado_en?: string; destinatario?: string; nota?: string;
    monto_final?: number | string; factura_transportista?: string; fecha_factura_transportista?: string;
  }) =>
    fetchJson(`${API_URL}/fulfillment/detalle-manual`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),

  updateFulfillmentDetalleManual: (id: number, data: {
    fecha?: string; producto: string; descripcion?: string; orden?: string;
    cantidad?: number | string; tarifa?: number | string; monto: number | string;
    costo_transportista?: number | string; transportista?: string; seguimiento?: string;
    comprado_en?: string; destinatario?: string; nota?: string;
    monto_final?: number | string; factura_transportista?: string; fecha_factura_transportista?: string;
  }) =>
    fetchJson(`${API_URL}/fulfillment/detalle/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),

  deleteFulfillmentDetalleManual: (id: number) => fetchJson(`${API_URL}/fulfillment/detalle/${id}`, { method: 'DELETE' }),

  getFulfillmentConciliacionRegistros: (filters?: {
    factura_transportista?: string;
    fecha_factura_transportista?: string;
    referencia_factura?: string;
    transportista_id?: number | string;
    estado_id?: string;
    cliente_id?: number | string;
    anio?: number | string;
    mes?: string;
    busqueda?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.factura_transportista) params.set('factura_transportista', filters.factura_transportista);
    if (filters?.fecha_factura_transportista) params.set('fecha_factura_transportista', filters.fecha_factura_transportista);
    if (filters?.referencia_factura) params.set('referencia_factura', filters.referencia_factura);
    if (filters?.transportista_id) params.set('transportista_id', String(filters.transportista_id));
    if (filters?.estado_id) params.set('estado_id', filters.estado_id);
    if (filters?.cliente_id) params.set('cliente_id', String(filters.cliente_id));
    if (filters?.anio) params.set('anio', String(filters.anio));
    if (filters?.mes) params.set('mes', filters.mes);
    if (filters?.busqueda) params.set('busqueda', filters.busqueda);
    const qs = params.toString();
    return fetchJson(`${API_URL}/fulfillment/conciliacion/registros${qs ? '?' + qs : ''}`);
  },

  searchFulfillmentRegistroDetalleGlobal: (busqueda: string, cliente_id?: number | string) => {
    const params = new URLSearchParams();
    if (busqueda) params.set('busqueda', busqueda);
    if (cliente_id) params.set('cliente_id', String(cliente_id));
    return fetchJson(`${API_URL}/fulfillment/detalle/buscar?${params.toString()}`);
  },

  analizarFulfillmentConciliacionFile: async (file: File, formato: string = 'FEDEX_USA') => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('formato', formato);
    const res = await fetch(`${API_URL}/fulfillment/conciliacion/analizar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || res.statusText);
    }
    return res.json();
  },

  confirmarFulfillmentConciliacion: (items: Array<{
    detalle_id: number;
    factura_transportista?: string;
    fecha_factura_transportista?: string;
    monto_final?: number;
  }>) =>
    fetchJson(`${API_URL}/fulfillment/conciliacion/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),
};
