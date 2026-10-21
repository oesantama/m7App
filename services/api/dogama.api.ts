import { API_URL, getStoredToken, fetchJson } from './client';

export const dogamaApi = {
  // ── Confeccionistas ────────────────────────────────────────────────────────
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
    if (filters?.placa) p.set('placa', filters.placa);
    if (filters?.fecha) p.set('fecha', filters.fecha);
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
    empresa?: string | null;
    precio_unitario?: number | null;
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
    empresa?: string | null;
    precio_unitario?: number | null;
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

  dogamaGetOrdenesServicio: (filters?: { numero_oc?: string; numero_om?: string }) => {
    const params = new URLSearchParams();
    if (filters?.numero_oc) params.set('numero_oc', filters.numero_oc);
    if (filters?.numero_om) params.set('numero_om', filters.numero_om);
    const qs = params.toString();
    return fetchJson(`${API_URL}/dogama/ordenes-servicio${qs ? '?' + qs : ''}`);
  },
  dogamaCreateOrdenServicio: (data: Record<string, any>) =>
    fetchJson(`${API_URL}/dogama/ordenes-servicio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  dogamaUpdateOrdenServicio: (id: number, data: Record<string, any>) =>
    fetchJson(`${API_URL}/dogama/ordenes-servicio/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  dogamaPatchOrdenServicioEstado: (id: number, estado_id: string, usuario_actualizacion?: string) =>
    fetchJson(`${API_URL}/dogama/ordenes-servicio/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado_id, usuario_actualizacion }),
    }),
  dogamaDeleteOrdenServicio: (id: number, motivo: string, usuario_actualizacion?: string) =>
    fetchJson(`${API_URL}/dogama/ordenes-servicio/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo, usuario_actualizacion }),
    }),

  dogamaGetOsRecogidas: (os_id: number) =>
    fetchJson(`${API_URL}/dogama/ordenes-servicio/${os_id}/recogidas`),
  dogamaCreateOsRecogida: (os_id: number, data: Record<string, any>) =>
    fetchJson(`${API_URL}/dogama/ordenes-servicio/${os_id}/recogidas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  dogamaDeleteOsRecogida: (os_id: number, id: number) =>
    fetchJson(`${API_URL}/dogama/ordenes-servicio/${os_id}/recogidas/${id}`, { method: 'DELETE' }),

  dogamaImportOrdenesServicio: async (file: File, tipo_os: 'ida' | 'recogida') => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tipo_os', tipo_os);
    const res = await fetch(`${API_URL}/dogama/ordenes-servicio/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },

  dogamaValidateOrdenesServicioXlsx: async (file: File, modo?: 'ida' | 'regreso') => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append('file', file);
    if (modo) formData.append('modo', modo);
    const res = await fetch(`${API_URL}/dogama/ordenes-servicio/validate-xlsx`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },

  dogamaImportOrdenesServicioXlsx: async (
    file: File,
    modo?: 'ida' | 'regreso',
    crearConfeccionistasFaltantes?: boolean,
    selectedIndices?: number[]
  ) => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append('file', file);
    if (modo) formData.append('modo', modo);
    if (crearConfeccionistasFaltantes) formData.append('crearConfeccionistasFaltantes', 'true');
    if (selectedIndices) formData.append('selectedIndices', JSON.stringify(selectedIndices));
    const res = await fetch(`${API_URL}/dogama/ordenes-servicio/import-xlsx`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },

  dogamaGetConciliacionJhonUribe: (filters?: { from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    const qs = params.toString();
    return fetchJson(`${API_URL}/dogama/conciliacion-jhon-uribe${qs ? '?' + qs : ''}`);
  },

  dogamaConciliarOrdenesServicio: (data: { ids?: number[]; codigo_sap?: string; nota?: string; usuario_actualizacion?: string }) =>
    fetchJson(`${API_URL}/dogama/conciliacion-jhon-uribe/conciliar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  dogamaDescargarPlantillaConciliacion: async () => {
    const token = getStoredToken();
    const res = await fetch(`${API_URL}/dogama/conciliacion-jhon-uribe/plantilla`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('No se pudo descargar la plantilla');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plantilla_conciliacion_jhon_uribe.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  },

  dogamaValidarConciliacionXlsx: async (file: File) => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_URL}/dogama/conciliacion-jhon-uribe/validar-xlsx`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },

  dogamaGetFacturasM7: () => fetchJson(`${API_URL}/dogama/conciliacion-jhon-uribe/facturas-m7`),

  dogamaRegistrarFacturaM7: (data: { ids: number[]; numero_factura_m7: string; fecha_factura_m7: string; usuario_actualizacion?: string }) =>
    fetchJson(`${API_URL}/dogama/conciliacion-jhon-uribe/factura-m7`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),

  dogamaDescargarPlantillaFacturaM7: async () => {
    const token = getStoredToken();
    const res = await fetch(`${API_URL}/dogama/conciliacion-jhon-uribe/factura-m7/plantilla`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('No se pudo descargar la plantilla');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plantilla_factura_m7.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  },

  dogamaImportarFacturaM7Xlsx: async (file: File, usuario_actualizacion?: string) => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append('file', file);
    if (usuario_actualizacion) formData.append('usuario_actualizacion', usuario_actualizacion);
    const res = await fetch(`${API_URL}/dogama/conciliacion-jhon-uribe/factura-m7/import`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },

  dogamaMarcarPagoFacturaM7: (data: { numero_factura_m7: string; fecha_pago_factura: string | null; usuario_actualizacion?: string }) =>
    fetchJson(`${API_URL}/dogama/conciliacion-jhon-uribe/factura-m7/pago`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),

  dogamaGetNotifCorreos: (filters?: { estado?: string; fecha_desde?: string; fecha_hasta?: string; enc_id?: number }) => {
    const params = new URLSearchParams();
    if (filters?.estado) params.set('estado', filters.estado);
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

  dogamaBulkSendNotifCorreos: (ids: number[]) =>
    fetchJson(`${API_URL}/dogama/notif-correos/bulk-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
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
