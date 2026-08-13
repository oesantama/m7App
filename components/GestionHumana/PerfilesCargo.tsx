import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { Icons } from '../../constants';
import { User } from '../../types';

interface Perfil {
  id: number;
  hoja_excel: string;
  cargo_id: number | null;
  cargo_nombre: string | null;
  version: number;
  creado_at: string;
  firmados: string;
  pendientes: string;
}

interface Pendiente {
  id: number;
  estado: 'pendiente' | 'firmado';
  firmado_at: string | null;
  perfil_id: number;
  hoja_excel: string;
  cargo_nombre: string;
  version: number;
}

interface TrackingRow {
  id: number;
  estado: string;
  cedula: string;
  nombre: string;
  hoja_excel: string;
  cargo_nombre: string;
  firmado_at: string | null;
  drive_link?: string;
}

const PerfilesCargo: React.FC<{ user: User }> = ({ user }) => {
  const [tab, setTab] = useState<'mis-documentos' | 'administracion'>('mis-documentos');

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <Icons.FileText className="text-emerald-600 w-7 h-7" />
            Perfiles y Funciones del Cargo
          </h1>
          <p className="text-slate-500 font-bold mt-1 text-xs md:text-sm">
            FO-SG-008 — Lectura, asignación y firma digital del manual institucional de funciones
          </p>
        </div>
      </div>

      <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-2">
        <button
          onClick={() => setTab('mis-documentos')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            tab === 'mis-documentos' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Icons.User className="w-4 h-4" />
          Mis documentos
        </button>
        <button
          onClick={() => setTab('administracion')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            tab === 'administracion' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Icons.Settings className="w-4 h-4" />
          Administración (Gestión Humana)
        </button>
      </div>

      {tab === 'mis-documentos' ? <MisDocumentos user={user} /> : <Administracion user={user} />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Panel "Mis documentos" — para cualquier colaborador autenticado
// ─────────────────────────────────────────────────────────────────────────
const MisDocumentos: React.FC<{ user: User }> = ({ user }) => {
  const [documentos, setDocumentos] = useState<Pendiente[]>([]);
  const [loading, setLoading] = useState(false);
  const [firmando, setFirmando] = useState<Pendiente | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.ghPerfilesCargo.misPendientes();
      setDocumentos(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar tus documentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Buscando tus perfiles de cargo asignados...</p>
      </div>
    );
  }

  if (documentos.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center space-y-4">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
          <Icons.FileText className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">No tienes documentos pendientes de firma</h3>
          <p className="text-slate-500 text-xs font-semibold max-w-md mx-auto mt-1">
            Esta sección muestra los perfiles y funciones vinculados a tu cargo en Gestión Humana. Cuando se te asigne un perfil, aparecerá aquí para tu lectura y firma.
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 max-w-lg mx-auto text-left text-xs text-slate-600 space-y-1">
          <p className="font-bold text-slate-800 uppercase text-[10px] tracking-wider">👤 Tu información de sesión:</p>
          <p>• <b>Nombre:</b> {user?.name || 'No disponible'}</p>
          <p>• <b>Cédula / Documento:</b> {user?.document_number || 'No especificada en perfil'}</p>
          <p>• <b>Email:</b> {user?.email || 'No disponible'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documentos.map(p => (
          <div key={p.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                  p.estado === 'firmado'
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    : 'bg-amber-50 text-amber-600 border border-amber-100'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${p.estado === 'firmado' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {p.estado === 'firmado' ? 'Firmado' : 'Pendiente de firma'}
                </span>
                <span className="text-[10px] font-black text-slate-400 uppercase">Versión {p.version}</span>
              </div>
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{p.cargo_nombre || p.hoja_excel}</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                {p.firmado_at ? `Firmado el ${new Date(p.firmado_at).toLocaleString('es-CO')}` : 'Manual de funciones institucional listo para lectura y firma.'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              {p.estado === 'firmado' ? (
                <a
                  href={api.ghPerfilesCargo.verPdfFirmado(p.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-11 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
                >
                  <Icons.FileText className="w-4 h-4 text-emerald-400" />
                  Ver mi PDF Firmado
                </a>
              ) : (
                <button
                  onClick={() => setFirmando(p)}
                  className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Icons.Edit className="w-4 h-4" />
                  Leer y firmar ahora
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {firmando && (
        <FirmaModal
          titulo={firmando.cargo_nombre || firmando.hoja_excel}
          pdfUrl={api.ghPerfilesCargo.verPdf(firmando.perfil_id)}
          onCancel={() => setFirmando(null)}
          onFirmar={async (firmaB64) => {
            await api.ghPerfilesCargo.firmar(firmando.id, firmaB64);
            toast.success('Documento firmado correctamente');
            setFirmando(null);
            load();
          }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Modal de lectura + firma (reutilizable)
// ─────────────────────────────────────────────────────────────────────────
export const FirmaModal: React.FC<{
  titulo: string;
  pdfUrl: string;
  onCancel: () => void;
  onFirmar: (firmaB64: string) => Promise<void>;
}> = ({ titulo, pdfUrl, onCancel, onFirmar }) => {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [leido, setLeido] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirmar = async () => {
    if (!leido) return toast.error('Debes confirmar que leíste el documento');
    if (sigCanvas.current?.isEmpty()) return toast.error('Dibuja tu firma antes de continuar');
    setSaving(true);
    try {
      const firmaB64 = sigCanvas.current!.getCanvas().toDataURL('image/png');
      await onFirmar(firmaB64);
    } catch (err: any) {
      toast.error(err.message || 'Error al firmar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">Lectura y Aceptación</p>
            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{titulo}</h3>
          </div>
          <button onClick={onCancel} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-100 transition-colors text-slate-500 shadow-sm">
            <Icons.X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-4 bg-slate-100">
          <iframe src={pdfUrl} className="w-full h-[52vh] rounded-2xl border border-slate-200 bg-white shadow-inner" title="Perfil de cargo" />
        </div>
        <div className="p-6 pt-3 border-t border-slate-100 space-y-4 bg-white">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase cursor-pointer select-none">
            <input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)} className="w-4 h-4 rounded accent-emerald-600 cursor-pointer" />
            He leído y entiendo las funciones y responsabilidades descritas en este manual de cargo
          </label>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dibuja tu firma digital</label>
              <button onClick={() => sigCanvas.current?.clear()} className="text-[10px] font-bold uppercase text-slate-400 hover:text-rose-600 transition-colors">
                Limpiar firma
              </button>
            </div>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 h-28 overflow-hidden shadow-inner">
              <SignatureCanvas ref={sigCanvas} penColor="navy" canvasProps={{ className: 'w-full h-full' }} backgroundColor="rgba(255,255,255,1)" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onCancel} className="h-11 px-6 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
              Cancelar
            </button>
            <button onClick={handleConfirmar} disabled={saving}
              className="h-11 px-6 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-60 flex items-center gap-2">
              {saving && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {saving ? 'Procesando firma...' : 'Confirmar firma'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Panel de administración — Gestión Humana
// ─────────────────────────────────────────────────────────────────────────
const Administracion: React.FC<{ user: User }> = ({ user }) => {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [cargos, setCargos] = useState<{ id: number; nombre: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tracking, setTracking] = useState<TrackingRow[]>([]);
  const [linkGenerado, setLinkGenerado] = useState<{ perfil: string; nombre: string; link: string } | null>(null);

  // Filtros de búsqueda
  const [searchPerfil, setSearchPerfil] = useState('');
  const [filterVinculado, setFilterVinculado] = useState<'all' | 'vinculados' | 'sin_vincular'>('all');
  const [searchTracking, setSearchTracking] = useState('');
  const [filterTrackingEstado, setFilterTrackingEstado] = useState<'all' | 'firmado' | 'pendiente'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [perfilesRes, cargosRes, trackingRes] = await Promise.all([
        api.ghPerfilesCargo.list(),
        api.getGhMiscelaneos('cargos'),
        api.ghPerfilesCargo.tracking(),
      ]);
      setPerfiles(perfilesRes.data || []);
      setCargos(Array.isArray(cargosRes) ? cargosRes : []);
      setTracking(trackingRes.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar información');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.ghPerfilesCargo.uploadExcel(file);
      const { creados, actualizados, sin_cambios } = res.data;
      toast.success(`${creados.length} creados, ${actualizados.length} nuevas versiones, ${sin_cambios.length} sin cambios`);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar el Excel');
    } finally {
      setUploading(false);
    }
  };

  const handleMapear = async (perfilId: number, cargoId: number) => {
    if (!cargoId) return;
    try {
      const res = await api.ghPerfilesCargo.mapear(perfilId, cargoId);
      toast.success(`Vinculado con éxito — ${res.data.pendientes_generados} pendiente(s) generado(s) para ${res.data.personal_coincidente} persona(s)`);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al vincular');
    }
  };

  const handleGenerarLink = async (row: TrackingRow) => {
    try {
      const res = await api.ghPerfilesCargo.generarToken(row.id);
      setLinkGenerado({ perfil: row.cargo_nombre || row.hoja_excel, nombre: row.nombre, link: res.data.link });
      await navigator.clipboard.writeText(res.data.link);
      toast.success('Link copiado al portapapeles (válido 7 días, un solo uso)');
    } catch (err: any) {
      toast.error(err.message || 'Error al generar el link');
    }
  };

  // Filtrado de perfiles cargados
  const filteredPerfiles = useMemo(() => {
    return perfiles.filter(p => {
      const matchSearch = p.hoja_excel.toLowerCase().includes(searchPerfil.toLowerCase()) ||
        (p.cargo_nombre && p.cargo_nombre.toLowerCase().includes(searchPerfil.toLowerCase()));
      
      if (!matchSearch) return false;
      if (filterVinculado === 'vinculados') return !!p.cargo_id;
      if (filterVinculado === 'sin_vincular') return !p.cargo_id;
      return true;
    });
  }, [perfiles, searchPerfil, filterVinculado]);

  // Filtrado de tracking de firmas
  const filteredTracking = useMemo(() => {
    return tracking.filter(r => {
      const q = searchTracking.toLowerCase();
      const matchSearch = r.nombre.toLowerCase().includes(q) ||
        r.cedula.toLowerCase().includes(q) ||
        (r.cargo_nombre && r.cargo_nombre.toLowerCase().includes(q)) ||
        (r.hoja_excel && r.hoja_excel.toLowerCase().includes(q));
      
      if (!matchSearch) return false;
      if (filterTrackingEstado === 'firmado') return r.estado === 'firmado';
      if (filterTrackingEstado === 'pendiente') return r.estado === 'pendiente';
      return true;
    });
  }, [tracking, searchTracking, filterTrackingEstado]);

  const totalFirmados = tracking.filter(t => t.estado === 'firmado').length;
  const totalPendientes = tracking.filter(t => t.estado === 'pendiente').length;

  return (
    <div className="space-y-6">
      {/* Resumen Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perfiles en Sistema</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{perfiles.length}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vinculados a Cargo</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {perfiles.filter(p => !!p.cargo_id).length} <span className="text-xs text-slate-400 font-bold">/ {perfiles.length}</span>
          </p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Firmados</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{totalFirmados}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Pendientes</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{totalPendientes}</p>
        </div>
      </div>

      {/* Carga de Excel */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-1">Cargar Excel maestro institucional (FO-SG-008)</h2>
            <p className="text-xs text-slate-500 font-semibold max-w-2xl">
              Cada pestaña del libro Excel se procesa como un perfil independiente. Si vuelves a cargar el archivo, el sistema solo actualiza la versión de las pestañas que hayan cambiado.
            </p>
          </div>
          <label className="inline-flex items-center justify-center gap-2 h-11 px-6 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all cursor-pointer shadow-md active:scale-95 shrink-0">
            <Icons.Upload className="w-4 h-4" />
            {uploading ? 'Procesando archivo...' : 'Seleccionar archivo .xlsx'}
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={uploading}
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          </label>
        </div>
      </div>

      {/* Tabla 1: Perfiles Cargados */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight text-slate-900">Perfiles Cargados — Vincular con Catálogo de Cargos</h2>
            <p className="text-xs text-slate-400 font-semibold">Selecciona a qué cargo oficial corresponde cada pestaña para generar las solicitudes de firma.</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar pestaña o cargo..."
                value={searchPerfil}
                onChange={e => setSearchPerfil(e.target.value)}
                className="h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition-all w-60"
              />
              <Icons.Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>

            <select
              value={filterVinculado}
              onChange={e => setFilterVinculado(e.target.value as any)}
              className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 transition-all cursor-pointer"
            >
              <option value="all">Todos ({perfiles.length})</option>
              <option value="vinculados">Vinculados ({perfiles.filter(p => !!p.cargo_id).length})</option>
              <option value="sin_vincular">Sin vincular ({perfiles.filter(p => !p.cargo_id).length})</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="text-left px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Pestaña del Excel</th>
                <th className="text-left px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Vinculado a Cargo Oficial</th>
                <th className="text-left px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Versión</th>
                <th className="text-left px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Firmados / Pendientes</th>
                <th className="text-right px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">PDF Base</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="py-16 text-center">
                  <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Cargando...</p>
                </td></tr>
              )}
              {!loading && filteredPerfiles.length === 0 && (
                <tr><td colSpan={5} className="py-16 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  {perfiles.length === 0 ? 'Sin perfiles cargados — sube un archivo Excel arriba' : 'No se encontraron perfiles con los filtros aplicados'}
                </td></tr>
              )}
              {filteredPerfiles.map((p, i) => (
                <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-6 py-4 text-xs font-black text-slate-800 uppercase">{p.hoja_excel}</td>
                  <td className="px-6 py-4">
                    <select
                      value={p.cargo_id || ''}
                      onChange={e => handleMapear(p.id, Number(e.target.value))}
                      className={`h-10 px-3 border rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all max-w-xs ${
                        p.cargo_id
                          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800 focus:border-emerald-500'
                          : 'bg-amber-50/50 border-amber-200 text-amber-800 focus:border-amber-500'
                      }`}
                    >
                      <option value="">⚠️ Sin vincular…</option>
                      {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-xs font-black text-slate-400">v{p.version}</td>
                  <td className="px-6 py-4 text-xs text-slate-600 font-semibold">
                    <span className="text-emerald-600 font-black">{p.firmados} firmados</span> · <span className="text-amber-600 font-black">{p.pendientes} pendientes</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <a
                      href={api.ghPerfilesCargo.verPdf(p.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all"
                    >
                      <Icons.FileText className="w-3.5 h-3.5" />
                      Ver
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla 2: Seguimiento de Firmas */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight text-slate-900">Seguimiento de Firmas por Persona</h2>
            <p className="text-xs text-slate-400 font-semibold">Trazabilidad de lectura y firmas completadas por los colaboradores.</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por persona, cédula o cargo..."
                value={searchTracking}
                onChange={e => setSearchTracking(e.target.value)}
                className="h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition-all w-72"
              />
              <Icons.Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>

            <select
              value={filterTrackingEstado}
              onChange={e => setFilterTrackingEstado(e.target.value as any)}
              className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 transition-all cursor-pointer"
            >
              <option value="all">Todos ({tracking.length})</option>
              <option value="firmado">Firmados ({totalFirmados})</option>
              <option value="pendiente">Pendientes ({totalPendientes})</option>
            </select>
          </div>
        </div>

        {linkGenerado && (
          <div className="mx-6 my-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-800 font-medium flex items-center justify-between gap-3">
            <div>
              <p className="font-black uppercase text-[10px] tracking-wider text-emerald-700">✅ Link de firma generado para {linkGenerado.nombre}</p>
              <p className="text-emerald-900 font-mono text-[11px] break-all mt-0.5">{linkGenerado.link}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(linkGenerado.link);
                toast.success('Link copiado nuevamente');
              }}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 hover:bg-emerald-700 transition-all shadow"
            >
              Copiar
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="text-left px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Persona</th>
                <th className="text-left px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Cargo</th>
                <th className="text-left px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                <th className="text-left px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha firma</th>
                <th className="text-right px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Acción / Documento</th>
              </tr>
            </thead>
            <tbody>
              {filteredTracking.map((r, i) => (
                <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-6 py-4 text-xs font-black text-slate-800 uppercase">
                    {r.nombre} <span className="text-slate-400 font-semibold block text-[11px]">{r.cedula}</span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-600 font-semibold">{r.cargo_nombre || r.hoja_excel}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      r.estado === 'firmado'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-amber-50 text-amber-600 border border-amber-100'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${r.estado === 'firmado' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {r.estado === 'firmado' ? 'Firmado' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-semibold">
                    {r.firmado_at ? new Date(r.firmado_at).toLocaleString('es-CO') : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {r.estado === 'firmado' ? (
                      <a
                        href={api.ghPerfilesCargo.verPdfFirmado(r.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-slate-900 hover:bg-emerald-600 transition-all shadow-sm active:scale-95"
                      >
                        <Icons.FileText className="w-3.5 h-3.5 text-emerald-400" />
                        Ver PDF Firmado
                      </a>
                    ) : (
                      <button
                        onClick={() => handleGenerarLink(r)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-sm active:scale-95"
                      >
                        <Icons.Share className="w-3.5 h-3.5" />
                        Generar link público
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredTracking.length === 0 && (
                <tr><td colSpan={5} className="py-16 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  {tracking.length === 0 ? 'Sin registros de firmas — vincula perfiles con cargos para generar pendientes' : 'No se encontraron colaboradores con los filtros seleccionados'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PerfilesCargo;
