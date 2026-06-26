import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  MessageCircle, Plus, Trash2, Edit2, Send, RefreshCw,
  CheckCircle, XCircle, Clock, Phone, FileText, Calendar,
  ChevronDown, ChevronUp, AlertTriangle, Zap,
} from 'lucide-react';
import { api } from '../services/api';

interface AlertaWA {
  id: string;
  name: string;
  description: string;
  phone_numbers: string[];
  message_template: string;
  cron_expression: string;
  tipo_evento: string;
  adjunto_tipo: string;
  status_id: string;
  client_id: string | null;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
  updated_at: string;
}

const TIPOS_EVENTO = [
  { value: 'MANUAL',        label: 'Manual / Programado' },
  { value: 'DOC_VENCIDO',   label: 'Documentos por vencer' },
  { value: 'INVENTARIO',    label: 'Alerta de inventario' },
  { value: 'CIERRE_FACT',   label: 'Cierre de facturación' },
  { value: 'SOBRECOSTO',    label: 'Sobrecostos pendientes' },
  { value: 'RUTA',          label: 'Novedades de ruta' },
  { value: 'INFORME_FLOTA', label: 'Informe Flota (PDF automático)' },
];

const ADJUNTO_TIPOS = [
  { value: 'ninguno',       label: 'Sin adjunto' },
  { value: 'informe_flota', label: '📊 Informe Flota del día anterior (PDF)' },
];

const CRON_PRESETS = [
  { label: 'Lun–Vie 8:00 AM',   value: '0 8 * * 1-5' },
  { label: 'Lun–Vie 6:00 PM',   value: '0 18 * * 1-5' },
  { label: 'Diario 7:00 AM',    value: '0 7 * * *' },
  { label: 'Lunes 8:00 AM',     value: '0 8 * * 1' },
  { label: 'Cada hora (L-V)',   value: '0 8-18 * * 1-5' },
  { label: 'Personalizado',     value: '__custom__' },
];

const TEMPLATE_VARS = ['{{fecha}}', '{{hora}}', '{{alerta}}', '{{sistema}}'];

const EMPTY_FORM: Omit<AlertaWA, 'created_at' | 'updated_at' | 'last_run' | 'next_run'> = {
  id: '',
  name: '',
  description: '',
  phone_numbers: [],
  message_template: '📢 *OrbitM7 — {{alerta}}*\n\nFecha: {{fecha}}\nHora: {{hora}}\n\nEste es un mensaje automático del sistema.',
  cron_expression: '0 8 * * 1-5',
  tipo_evento: 'MANUAL',
  adjunto_tipo: 'ninguno',
  status_id: 'EST-01',
  client_id: null,
};

const TIPOS_CON_CLIENTE = ['CIERRE_FACT', 'SOBRECOSTO'];

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function cronLabel(expr: string) {
  const found = CRON_PRESETS.find(p => p.value === expr);
  return found && found.value !== '__custom__' ? found.label : expr;
}

export default function AlertasWhatsapp() {
  const [alertas, setAlertas]       = useState<AlertaWA[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [phoneInput, setPhoneInput] = useState('');
  const [saving, setSaving]         = useState(false);
  const [testingId, setTestingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cronMode, setCronMode]     = useState<'preset' | 'custom'>('preset');
  const [clients, setClients]       = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alertasRes, clientsRes] = await Promise.all([
        api.getAlertasWhatsapp(),
        api.getClients().catch(() => []),
      ]);
      setAlertas(alertasRes.success ? alertasRes.data : []);
      if (Array.isArray(clientsRes)) {
        setClients(clientsRes.map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch {
      toast.error('Error al cargar alertas WhatsApp');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ ...EMPTY_FORM, id: `WA-${Date.now()}` });
    setCronMode('preset');
    setPhoneInput('');
    setShowForm(true);
  }

  function openEdit(a: AlertaWA) {
    setForm({
      id: a.id, name: a.name, description: a.description,
      phone_numbers: [...(a.phone_numbers || [])],
      message_template: a.message_template,
      cron_expression: a.cron_expression,
      tipo_evento: a.tipo_evento,
      adjunto_tipo: a.adjunto_tipo || 'ninguno',
      status_id: a.status_id,
      client_id: a.client_id || null,
    });
    const preset = CRON_PRESETS.find(p => p.value === a.cron_expression && p.value !== '__custom__');
    setCronMode(preset ? 'preset' : 'custom');
    setPhoneInput('');
    setShowForm(true);
  }

  const selectedClientIds = form.client_id
    ? form.client_id.split(',').map((id: string) => id.trim()).filter(Boolean)
    : [];

  function handleAddClient(clientId: string) {
    if (!clientId) return;
    if (selectedClientIds.includes(clientId)) return;
    const newIds = [...selectedClientIds, clientId];
    setForm(f => ({ ...f, client_id: newIds.join(',') }));
  }

  function handleRemoveClient(clientId: string) {
    const newIds = selectedClientIds.filter((id: string) => id !== clientId);
    setForm(f => ({ ...f, client_id: newIds.length > 0 ? newIds.join(',') : null }));
  }

  function addPhone() {
    const clean = phoneInput.replace(/\D/g, '');
    if (clean.length < 10) { toast.error('Número inválido — mínimo 10 dígitos'); return; }
    if (form.phone_numbers.includes(clean)) { toast.error('Número ya agregado'); return; }
    setForm(f => ({ ...f, phone_numbers: [...f.phone_numbers, clean] }));
    setPhoneInput('');
  }

  function removePhone(p: string) {
    setForm(f => ({ ...f, phone_numbers: f.phone_numbers.filter(x => x !== p) }));
  }

  function insertVar(v: string) {
    setForm(f => ({ ...f, message_template: f.message_template + v }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    if (form.phone_numbers.length === 0) { toast.error('Agregue al menos un número destinatario'); return; }
    if (!form.message_template.trim()) { toast.error('El mensaje es requerido'); return; }
    setSaving(true);
    try {
      const res = await api.saveAlertaWhatsapp({
        ...form,
        phoneNumbers: form.phone_numbers,
        messageTemplate: form.message_template,
        cronExpression: form.cron_expression,
        tipoEvento: form.tipo_evento,
        adjuntoTipo: form.adjunto_tipo,
        statusId: form.status_id,
        clientId: form.client_id || null,
        updatedBy: 'System',
        createdBy: 'System',
      });
      if (res.success) {
        toast.success('Alerta guardada y cron actualizado');
        setShowForm(false);
        load();
      } else {
        toast.error(res.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const res = await api.sendTestAlertaWhatsapp(id);
      if (res.success) toast.success(res.message || 'Prueba enviada');
      else toast.error(res.error || 'Error al enviar prueba');
    } catch {
      toast.error('Error de conexión con Evolution API');
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await api.deleteAlertaWhatsapp(id);
      if (res.success) { toast.success('Alerta eliminada'); load(); }
      else toast.error('Error al eliminar');
    } catch {
      toast.error('Error de conexión');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-green-500 text-white rounded-xl shadow-sm">
            <MessageCircle size={20} />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider text-slate-800">Alertas WhatsApp</h1>
            <p className="text-[10px] text-slate-400 font-medium">Notificaciones automáticas programadas vía Evolution API</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-black uppercase rounded-xl shadow-sm transition-all">
            <Plus size={14} /> Nueva Alerta
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-xs font-black uppercase text-slate-700">
              {form.id && alertas.find(a => a.id === form.id) ? 'Editar Alerta' : 'Nueva Alerta'}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xs font-black">✕ CERRAR</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nombre */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500">Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Alerta documentos por vencer"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>

            {/* Tipo evento */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500">Tipo de Evento</label>
              <select value={form.tipo_evento} onChange={e => setForm(f => ({ ...f, tipo_evento: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400">
                {TIPOS_EVENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Selector de cliente — solo para CIERRE_FACT y SOBRECOSTO */}
            {TIPOS_CON_CLIENTE.includes(form.tipo_evento) && (
              <div className="space-y-2 col-span-1 md:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-500">
                  Bodegas / Clientes
                </label>
                <div className="flex gap-2">
                  <select
                    value=""
                    onChange={e => {
                      handleAddClient(e.target.value);
                      e.target.value = ""; // Reset select
                    }}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="">— Seleccionar cliente para agregar —</option>
                    {clients
                      .filter(c => !selectedClientIds.includes(c.id))
                      .map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                      ))
                    }
                  </select>
                  {selectedClientIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, client_id: null }))}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-black transition-all">
                      Limpiar todos
                    </button>
                  )}
                </div>

                {/* Selected clients badges */}
                {selectedClientIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg">
                    {selectedClientIds.map(id => {
                      const clientObj = clients.find(c => c.id === id);
                      return (
                        <span key={id} className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded-full text-[10px] font-bold">
                          <span>{clientObj ? clientObj.name : id} ({id})</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveClient(id)}
                            className="text-blue-400 hover:text-red-500 font-bold ml-1">
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 italic bg-slate-50/50 border border-dashed border-slate-200 rounded-lg p-2.5 text-center">
                    — Sin filtro de cliente (Se incluirán todos los clientes/bodegas en el informe) —
                  </div>
                )}
                
                <p className="text-[9px] text-slate-400 mt-1">
                  {form.tipo_evento === 'CIERRE_FACT'
                    ? '📋 El PDF incluirá solo los documentos L pendientes de las bodegas seleccionadas. Si no se selecciona ninguna, se incluirán todos.'
                    : '💰 El PDF mostrará solo los sobrecostos pendientes de las bodegas seleccionadas. Si no se selecciona ninguna, se incluirán todos.'}
                </p>
              </div>
            )}

            {/* Tipo adjunto */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500">
                <FileText size={10} className="inline mr-1" />Adjunto automático
              </label>
              {TIPOS_CON_CLIENTE.includes(form.tipo_evento) ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[10px] text-blue-700 font-medium">
                  📎 Se generará automáticamente un PDF con el informe de{' '}
                  {form.tipo_evento === 'CIERRE_FACT' ? 'cierre de facturación' : 'sobrecostos pendientes'}.
                </div>
              ) : (
                <>
                  <select value={form.adjunto_tipo} onChange={e => setForm(f => ({ ...f, adjunto_tipo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400">
                    {ADJUNTO_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {form.adjunto_tipo === 'informe_flota' && (
                    <p className="text-[9px] text-emerald-600 font-medium mt-1">
                      ✅ El sistema generará y enviará el PDF con el Informe Flota del día anterior al ejecutar esta alerta.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Descripción */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500">Descripción</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descripción opcional"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>

            {/* Teléfonos */}
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500">
                <Phone size={10} className="inline mr-1" />Destinatarios *
              </label>
              <div className="flex gap-2">
                <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPhone())}
                  placeholder="57XXXXXXXXXX — Enter para agregar"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
                <button onClick={addPhone}
                  className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-black transition-all">
                  + Agregar
                </button>
              </div>
              {form.phone_numbers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.phone_numbers.map(p => (
                    <span key={p} className="flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded-full text-[10px] font-bold">
                      <Phone size={9} /> {p}
                      <button onClick={() => removePhone(p)} className="text-green-400 hover:text-red-500 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Cron */}
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500">
                <Calendar size={10} className="inline mr-1" />Programación (Cron)
              </label>
              <div className="flex gap-2">
                <select
                  value={cronMode === 'custom' ? '__custom__' : form.cron_expression}
                  onChange={e => {
                    if (e.target.value === '__custom__') { setCronMode('custom'); }
                    else { setCronMode('preset'); setForm(f => ({ ...f, cron_expression: e.target.value })); }
                  }}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400">
                  {CRON_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                {cronMode === 'custom' && (
                  <input value={form.cron_expression}
                    onChange={e => setForm(f => ({ ...f, cron_expression: e.target.value }))}
                    placeholder="0 8 * * 1-5"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-400" />
                )}
              </div>
              <p className="text-[9px] text-slate-400">
                Zona horaria: America/Bogota.
                Formato: minuto hora día-mes mes día-semana (0=Dom, 1=Lun, …, 5=Vie)
              </p>
            </div>

            {/* Mensaje */}
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-500">
                  <FileText size={10} className="inline mr-1" />Plantilla del Mensaje *
                </label>
                <div className="flex gap-1">
                  {TEMPLATE_VARS.map(v => (
                    <button key={v} onClick={() => insertVar(v)}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-green-100 text-slate-500 hover:text-green-600 rounded text-[9px] font-mono transition-all">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={form.message_template}
                onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                rows={5}
                placeholder="Escriba el mensaje. Use las variables de la derecha."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Preview</p>
                <pre className="text-[10px] text-slate-600 whitespace-pre-wrap font-sans">
                  {form.message_template
                    .replace(/\{\{fecha\}\}/gi, new Date().toLocaleDateString('es-CO'))
                    .replace(/\{\{hora\}\}/gi,  new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }))
                    .replace(/\{\{alerta\}\}/gi, form.name || 'Nombre alerta')
                    .replace(/\{\{sistema\}\}/gi, 'OrbitM7')}
                </pre>
              </div>
            </div>

            {/* Estado */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500">Estado</label>
              <div className="flex gap-2">
                {[{ v: 'EST-01', l: 'Activo' }, { v: 'EST-02', l: 'Inactivo' }].map(opt => (
                  <button key={opt.v}
                    onClick={() => setForm(f => ({ ...f, status_id: opt.v }))}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all
                      ${form.status_id === opt.v
                        ? opt.v === 'EST-01' ? 'bg-green-500 text-white border-green-500' : 'bg-red-400 text-white border-red-400'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-black uppercase text-slate-500 hover:text-slate-700 transition-all">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-black uppercase rounded-xl shadow-sm transition-all">
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              {saving ? 'Guardando...' : 'Guardar Alerta'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-green-500 mr-2" />
          <span className="text-xs text-slate-400 font-bold">Cargando alertas...</span>
        </div>
      ) : alertas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-slate-200 rounded-2xl">
          <MessageCircle size={32} className="text-slate-200 mb-3" />
          <p className="text-xs font-black text-slate-400 uppercase">Sin alertas configuradas</p>
          <p className="text-[10px] text-slate-300 mt-1">Cree su primera alerta WhatsApp con el botón de arriba</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alertas.map(a => {
            const active = a.status_id === 'EST-01';
            const expanded = expandedId === a.id;
            return (
              <div key={a.id} className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all
                ${active ? 'border-slate-200' : 'border-slate-100 opacity-70'}`}>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl flex-shrink-0 ${active ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                      <MessageCircle size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-800 truncate">{a.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase
                          ${active ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                          {active ? 'Activa' : 'Inactiva'}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-500 rounded-full text-[9px] font-black uppercase">
                          {TIPOS_EVENTO.find(t => t.value === a.tipo_evento)?.label || a.tipo_evento}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Phone size={9} /> {a.phone_numbers?.length || 0} destinatario(s)
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                          <Clock size={9} /> {cronLabel(a.cron_expression)}
                        </span>
                        {a.last_run && (
                          <span className="text-[10px] text-slate-400">
                            Último: {fmtDate(a.last_run)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => handleTest(a.id)} disabled={testingId === a.id}
                      title="Enviar prueba ahora"
                      className="p-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg transition-all disabled:opacity-50">
                      {testingId === a.id
                        ? <RefreshCw size={13} className="animate-spin" />
                        : <Send size={13} />}
                    </button>
                    <button onClick={() => openEdit(a)} title="Editar"
                      className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-all">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(a.id)} disabled={deletingId === a.id}
                      title="Eliminar"
                      className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-all disabled:opacity-50">
                      {deletingId === a.id
                        ? <RefreshCw size={13} className="animate-spin" />
                        : <Trash2 size={13} />}
                    </button>
                    <button onClick={() => setExpandedId(expanded ? null : a.id)}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg transition-all">
                      {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-3">
                    {a.description && (
                      <p className="text-[11px] text-slate-500">{a.description}</p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[10px]">
                      <div>
                        <p className="font-black text-slate-400 uppercase mb-1">Destinatarios</p>
                        <div className="flex flex-wrap gap-1">
                          {(a.phone_numbers || []).map(p => (
                            <span key={p} className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-mono">{p}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="font-black text-slate-400 uppercase mb-1">Clientes / Bodegas</p>
                        <div className="flex flex-wrap gap-1">
                          {TIPOS_CON_CLIENTE.includes(a.tipo_evento) ? (
                            a.client_id ? (
                              a.client_id.split(',').map((id: string) => {
                                const c = clients.find(cl => cl.id === id.trim());
                                return (
                                  <span key={id} className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                    {c ? c.name : id}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-slate-500 italic">Todos</span>
                            )
                          ) : (
                            <span className="text-slate-400">— N/A —</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="font-black text-slate-400 uppercase mb-1">Cron</p>
                        <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-600">{a.cron_expression}</code>
                      </div>
                      <div>
                        <p className="font-black text-slate-400 uppercase mb-1">Último envío</p>
                        <p className="text-slate-600">{fmtDate(a.last_run)}</p>
                      </div>
                      <div>
                        <p className="font-black text-slate-400 uppercase mb-1">Creado</p>
                        <p className="text-slate-600">{fmtDate(a.created_at)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Plantilla del mensaje</p>
                      <pre className="text-[10px] bg-white border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap font-sans text-slate-600">
                        {a.message_template}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info box Evolution */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-[10px] text-amber-700 space-y-1">
          <p className="font-black uppercase">Requisito: WhatsApp conectado</p>
          <p>Para que los envíos funcionen, el <strong>Administrador Núcleo</strong> debe tener su WhatsApp vinculado en <strong>Conexión WhatsApp</strong> del menú. Los mensajes se enviarán desde esa línea.</p>
          <p className="flex items-center gap-1"><Zap size={10} /> Rate limit interno: 1 mensaje cada 3 segundos para evitar bloqueos de WhatsApp.</p>
        </div>
      </div>
    </div>
  );
}
