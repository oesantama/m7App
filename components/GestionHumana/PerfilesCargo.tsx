import React, { useState, useEffect, useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { toast } from 'sonner';
import { api, API_URL } from '../../services/api';
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
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <Icons.FileText />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Perfiles y Funciones del Cargo</h1>
          <p className="text-sm text-slate-400">FO-SG-008 — Lectura y firma digital del manual de funciones</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        <button onClick={() => setTab('mis-documentos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'mis-documentos' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
          Mis documentos
        </button>
        <button onClick={() => setTab('administracion')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'administracion' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
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

  if (loading) return <div className="text-center py-10 text-slate-500 text-sm">Cargando…</div>;

  if (pendientes.length === 0) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-8 text-center text-slate-400 text-sm">
        No tienes documentos de perfil de cargo asociados a tu cédula todavía.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendientes.map(p => (
        <div key={p.id} className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-slate-100">{p.cargo_nombre || p.hoja_excel}</div>
            <div className="text-xs text-slate-500">Versión {p.version} {p.firmado_at ? `— firmado el ${new Date(p.firmado_at).toLocaleString('es-CO')}` : ''}</div>
          </div>
          <div className="flex items-center gap-2">
            {p.estado === 'firmado' ? (
              <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium"><Icons.CheckCircle /> Firmado</span>
            ) : (
              <button onClick={() => setFirmando(p)}
                className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">{titulo}</h2>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300">✕</button>
        </div>
        <div className="flex-1 overflow-hidden p-2">
          <iframe src={pdfUrl} className="w-full h-[50vh] rounded border border-slate-800 bg-white" title="Perfil de cargo" />
        </div>
        <div className="p-4 border-t border-slate-800 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)} className="w-4 h-4" />
            He leído y entiendo las funciones descritas en este documento
          </label>
          <div>
            <label className="text-xs text-slate-400">Firma</label>
            <div className="bg-white rounded-md border border-slate-700 h-32">
              <SignatureCanvas ref={sigCanvas} penColor="navy" canvasProps={{ className: 'w-full h-full' }} backgroundColor="rgba(255,255,255,1)" />
            </div>
            <button onClick={() => sigCanvas.current?.clear()} className="text-xs text-slate-500 hover:text-slate-300 mt-1">Limpiar firma</button>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm">Cancelar</button>
            <button onClick={handleConfirmar} disabled={saving}
              className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Firmando…' : 'Confirmar firma'}
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
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide mb-3">Cargar Excel maestro (FO-SG-008)</h2>
        <p className="text-xs text-slate-500 mb-3">Cada pestaña del Excel se guarda como un perfil independiente. Si vuelves a cargar el mismo archivo, solo se crea una nueva versión de las pestañas que realmente cambiaron.</p>
        <label className="inline-block px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium cursor-pointer border border-slate-700">
          {uploading ? 'Procesando…' : 'Seleccionar archivo .xlsx'}
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={uploading}
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
        </label>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide mb-3">Perfiles cargados — vincular con catálogo de cargos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-3">Pestaña del Excel</th>
                <th className="py-2 pr-3">Vinculado a</th>
                <th className="py-2 pr-3">Versión</th>
                <th className="py-2 pr-3">Firmados / Pendientes</th>
                <th className="py-2 pr-3">Ver PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Cargando…</td></tr>}
              {!loading && perfiles.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Sin perfiles cargados</td></tr>}
              {perfiles.map(p => (
                <tr key={p.id} className="text-slate-200">
                  <td className="py-2 pr-3">{p.hoja_excel}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={p.cargo_id || ''}
                      onChange={e => handleMapear(p.id, Number(e.target.value))}
                      className="border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-2 py-1 text-xs"
                    >
                      <option value="">Sin vincular…</option>
                      {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">v{p.version}</td>
                  <td className="py-2 pr-3 text-xs">{p.firmados} firmados · {p.pendientes} pendientes</td>
                  <td className="py-2 pr-3">
                    <a href={api.ghPerfilesCargo.verPdf(p.id)} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 text-xs">Ver</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide mb-3">Seguimiento de firmas</h2>
        {linkGenerado && (
          <div className="bg-emerald-500/10 border border-emerald-700/40 rounded-md p-3 mb-3 text-xs text-emerald-300">
            Link para <b>{linkGenerado.nombre}</b> ({linkGenerado.perfil}) copiado al portapapeles: <span className="font-mono break-all">{linkGenerado.link}</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-3">Persona</th>
                <th className="py-2 pr-3">Cargo</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Fecha firma</th>
                <th className="py-2 pr-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tracking.map(r => (
                <tr key={r.id} className="text-slate-200">
                  <td className="py-2 pr-3">{r.nombre} <span className="text-slate-500 text-xs">({r.cedula})</span></td>
                  <td className="py-2 pr-3">{r.cargo_nombre || r.hoja_excel}</td>
                  <td className="py-2 pr-3">
                    {r.estado === 'firmado'
                      ? <span className="text-emerald-400 text-xs font-medium">Firmado</span>
                      : <span className="text-amber-400 text-xs font-medium">Pendiente</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-400">{r.firmado_at ? new Date(r.firmado_at).toLocaleString('es-CO') : '—'}</td>
                  <td className="py-2 pr-3">
                    {r.estado === 'pendiente' && (
                      <button onClick={() => handleGenerarLink(r)} className="text-emerald-400 hover:text-emerald-300 text-xs">
                        Generar link público
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {tracking.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Sin registros — vincula un perfil con un cargo para generar pendientes</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PerfilesCargo;
