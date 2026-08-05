import React, { useState, useEffect, useRef, useCallback } from 'react';
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
}

const PerfilesCargo: React.FC<{ user: User }> = ({ user }) => {
  const [tab, setTab] = useState<'mis-documentos' | 'administracion'>('mis-documentos');

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
          <Icons.FileText className="text-emerald-600" />
          Perfiles y Funciones del Cargo
        </h1>
        <p className="text-slate-500 font-bold mt-1">FO-SG-008 — Lectura y firma digital del manual de funciones</p>
      </div>

      <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-2">
        <button
          onClick={() => setTab('mis-documentos')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            tab === 'mis-documentos' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Mis documentos
        </button>
        <button
          onClick={() => setTab('administracion')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            tab === 'administracion' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Administración (Gestión Humana)
        </button>
      </div>

      {tab === 'mis-documentos' ? <MisDocumentos /> : <Administracion />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Panel "Mis documentos" — para cualquier usuario autenticado
// ─────────────────────────────────────────────────────────────────────────
const MisDocumentos: React.FC = () => {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [loading, setLoading] = useState(false);
  const [firmando, setFirmando] = useState<Pendiente | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.ghPerfilesCargo.misPendientes();
      setPendientes(res.data || []);
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
        <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Cargando...</p>
      </div>
    );
  }

  if (pendientes.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
        <Icons.FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">No tienes documentos pendientes de firma</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendientes.map(p => (
        <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-black text-slate-800 uppercase">{p.cargo_nombre || p.hoja_excel}</div>
            <div className="text-xs text-slate-400 font-bold mt-0.5">
              Versión {p.version} {p.firmado_at ? `— firmado el ${new Date(p.firmado_at).toLocaleString('es-CO')}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {p.estado === 'firmado' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Firmado
              </span>
            ) : (
              <button onClick={() => setFirmando(p)}
                className="h-10 px-6 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95">
                Leer y firmar
              </button>
            )}
          </div>
        </div>
      ))}

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
// Modal de lectura + firma (reutilizable: in-app y público)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">Leer y firmar</p>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{titulo}</h3>
          </div>
          <button onClick={onCancel} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500">
            <Icons.X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <iframe src={pdfUrl} className="w-full h-[50vh] rounded-xl border border-slate-200 bg-white" title="Perfil de cargo" />
        </div>
        <div className="p-6 pt-2 border-t border-slate-100 space-y-4">
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 uppercase">
            <input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            He leído y entiendo las funciones descritas en este documento
          </label>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Firma</label>
            <div className="bg-slate-50 rounded-xl border border-slate-200 h-32">
              <SignatureCanvas ref={sigCanvas} penColor="navy" canvasProps={{ className: 'w-full h-full' }} backgroundColor="rgba(255,255,255,1)" />
            </div>
            <button onClick={() => sigCanvas.current?.clear()} className="text-[10px] font-bold uppercase text-slate-400 hover:text-slate-600 mt-1.5">Limpiar firma</button>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onCancel} className="h-11 px-6 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
              Cancelar
            </button>
            <button onClick={handleConfirmar} disabled={saving}
              className="h-11 px-6 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-60 flex items-center gap-2">
              {saving && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {saving ? 'Firmando...' : 'Confirmar firma'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Panel de administración — carga de Excel, mapeo, tracking (Gestión Humana)
// ─────────────────────────────────────────────────────────────────────────
const Administracion: React.FC = () => {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [cargos, setCargos] = useState<{ id: number; nombre: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tracking, setTracking] = useState<TrackingRow[]>([]);
  const [linkGenerado, setLinkGenerado] = useState<{ perfil: string; nombre: string; link: string } | null>(null);

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
      toast.success(`Vinculado — ${res.data.pendientes_generados} pendiente(s) generado(s) de ${res.data.personal_coincidente} persona(s) con ese cargo`);
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
      toast.success('Link copiado al portapapeles — válido 7 días, un solo uso');
    } catch (err: any) {
      toast.error(err.message || 'Error al generar el link');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Cargar Excel maestro (FO-SG-008)</h2>
        <p className="text-xs text-slate-500 font-semibold mb-4 max-w-2xl">Cada pestaña del Excel se guarda como un perfil independiente. Si vuelves a cargar el mismo archivo, solo se crea una nueva versión de las pestañas que realmente cambiaron.</p>
        <label className="inline-flex items-center gap-2 h-10 px-6 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all cursor-pointer active:scale-95">
          <Icons.Upload className="w-3.5 h-3.5" />
          {uploading ? 'Procesando...' : 'Seleccionar archivo .xlsx'}
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={uploading}
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perfiles cargados — vincular con catálogo de cargos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Pestaña del Excel</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Vinculado a</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Versión</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Firmados / Pendientes</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Ver PDF</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="py-16 text-center">
                  <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Cargando...</p>
                </td></tr>
              )}
              {!loading && perfiles.length === 0 && (
                <tr><td colSpan={5} className="py-16 text-center text-[10px] font-black uppercase text-slate-300 tracking-widest">Sin perfiles cargados</td></tr>
              )}
              {perfiles.map((p, i) => (
                <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-5 py-3.5 text-[11px] font-bold text-slate-700 uppercase">{p.hoja_excel}</td>
                  <td className="px-5 py-3.5">
                    <select
                      value={p.cargo_id || ''}
                      onChange={e => handleMapear(p.id, Number(e.target.value))}
                      className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                    >
                      <option value="">Sin vincular…</option>
                      {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3.5 text-[11px] font-black text-slate-400">v{p.version}</td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-500 font-semibold">{p.firmados} firmados · {p.pendientes} pendientes</td>
                  <td className="px-5 py-3.5">
                    <a href={api.ghPerfilesCargo.verPdf(p.id)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700">
                      Ver
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seguimiento de firmas</h2>
        </div>
        {linkGenerado && (
          <div className="mx-6 mb-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[11px] text-emerald-700 font-semibold">
            Link para <b>{linkGenerado.nombre}</b> ({linkGenerado.perfil}) copiado al portapapeles: <span className="font-mono break-all">{linkGenerado.link}</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Persona</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Cargo</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha firma</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Acción</th>
              </tr>
            </thead>
            <tbody>
              {tracking.map((r, i) => (
                <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-5 py-3.5 text-[11px] font-bold text-slate-700 uppercase">{r.nombre} <span className="text-slate-400 font-semibold normal-case">({r.cedula})</span></td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-600 font-semibold">{r.cargo_nombre || r.hoja_excel}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      r.estado === 'firmado'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-amber-50 text-amber-600 border border-amber-100'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${r.estado === 'firmado' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {r.estado === 'firmado' ? 'Firmado' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-400 font-semibold">{r.firmado_at ? new Date(r.firmado_at).toLocaleString('es-CO') : '—'}</td>
                  <td className="px-5 py-3.5">
                    {r.estado === 'pendiente' && (
                      <button onClick={() => handleGenerarLink(r)} className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700">
                        Generar link público
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {tracking.length === 0 && (
                <tr><td colSpan={5} className="py-16 text-center text-[10px] font-black uppercase text-slate-300 tracking-widest">Sin registros — vincula un perfil con un cargo para generar pendientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PerfilesCargo;
