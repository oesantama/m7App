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

interface UploadSummary {
  total_procesadas?: number;
  creados: string[];
  actualizados: string[];
  sin_cambios: string[];
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
// Modal de lectura + firma
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
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  const [tracking, setTracking] = useState<TrackingRow[]>([]);
  const [linkGenerado, setLinkGenerado] = useState<{ perfil: string; nombre: string; link: string } | null>(null);

  // Agregar persona manualmente a un perfil
  const [addPersonaModal, setAddPersonaModal] = useState<Perfil | null>(null);
  const [personaQuery, setPersonaQuery] = useState('');
  const [personaResults, setPersonaResults] = useState<{ id: number; nombre: string; cedula: string; cargo: string }[]>([]);
  const [searchingPersona, setSearchingPersona] = useState(false);
  const [addingPersonaId, setAddingPersonaId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Modal de eliminación elegante
  const [deleteModal, setDeleteModal] = useState<{ firmaId: number; nombre: string; estado: string } | null>(null);
  const [deleteMotivoInput, setDeleteMotivoInput] = useState('');

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
    setUploadFileName(file.name);
    try {
      const res = await api.ghPerfilesCargo.uploadExcel(file);
      setUploadSummary(res.data);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar el Excel');
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

  const handleOpenDeleteModal = (row: { id: number; nombre: string; estado: string }) => {
    setDeleteMotivoInput('');
    setDeleteModal({ firmaId: row.id, nombre: row.nombre, estado: row.estado });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal) return;
    if (deleteModal.estado === 'firmado' && !deleteMotivoInput.trim()) {
      toast.error('Debe especificar un motivo para eliminar un documento firmado');
      return;
    }

    setDeletingId(deleteModal.firmaId);
    const motivoToSend = deleteMotivoInput.trim() || 'Eliminación manual por administración';
    try {
      const res = await api.ghPerfilesCargo.eliminarPendiente(deleteModal.firmaId, motivoToSend);
      toast.success(res.message || 'Registro de firma eliminado exitosamente');
      setDeleteModal(null);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar la firma');
    } finally {
      setDeletingId(null);
    }
  };

  const buscarPersonaDisponible = useCallback(async (perfilId: number, q: string) => {
    setSearchingPersona(true);
    try {
      const res = await api.ghPerfilesCargo.buscarPersonalDisponible(perfilId, q);
      setPersonaResults(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Error al buscar personal');
    } finally {
      setSearchingPersona(false);
    }
  }, []);

  useEffect(() => {
    if (!addPersonaModal) return;
    const t = setTimeout(() => buscarPersonaDisponible(addPersonaModal.id, personaQuery), 300);
    return () => clearTimeout(t);
  }, [addPersonaModal, personaQuery, buscarPersonaDisponible]);

  const handleAgregarPersona = async (personalId: number) => {
    if (!addPersonaModal) return;
    setAddingPersonaId(personalId);
    try {
      await api.ghPerfilesCargo.agregarPersona(addPersonaModal.id, personalId);
      toast.success('Persona agregada como pendiente por firmar');
      setAddPersonaModal(null);
      setPersonaQuery('');
      setPersonaResults([]);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al agregar la persona');
    } finally {
      setAddingPersonaId(null);
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
            Seleccionar archivo .xlsx
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={uploading}
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          </label>
        </div>
      </div>

      {/* MODAL DE PROCESAMIENTO / LOADING */}
      {uploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <div className="w-20 h-20 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
              <Icons.FileText className="w-8 h-8 text-emerald-600 absolute" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Procesando Libro Excel</h3>
              <p className="text-xs text-slate-500 font-semibold mt-1">Archivo: <b className="text-slate-800">{uploadFileName}</b></p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-left text-xs text-slate-600 space-y-2 border border-slate-100">
              <div className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Leyendo pestañas y organigramas...</span>
              </div>
              <div className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Extrayendo competencias y flujogramas...</span>
              </div>
              <div className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Calculando versiones y verificando cambios...</span>
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Por favor no cierres esta ventana</p>
          </div>
        </div>
      )}

      {/* MODAL DE RESULTADOS / DIAGNÓSTICO DE CARGA */}
      {uploadSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Diagnóstico de Procesamiento</p>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Resultado de Carga del Excel</h3>
              </div>
              <button
                onClick={() => setUploadSummary(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            {/* Tarjetas resumen */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Nuevos Creados</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">{uploadSummary.creados.length}</p>
                <p className="text-[9px] text-emerald-600 font-semibold mt-0.5">Versión 1</p>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Actualizados</p>
                <p className="text-2xl font-black text-blue-700 mt-1">{uploadSummary.actualizados.length}</p>
                <p className="text-[9px] text-blue-600 font-semibold mt-0.5">Nueva versión</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Sin Cambios</p>
                <p className="text-2xl font-black text-slate-700 mt-1">{uploadSummary.sin_cambios.length}</p>
                <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Misma versión</p>
              </div>
            </div>

            {/* Listado detallado deslizable */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {uploadSummary.creados.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-black text-emerald-800 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Perfiles Creados ({uploadSummary.creados.length}):
                  </p>
                  <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100 flex flex-wrap gap-1.5">
                    {uploadSummary.creados.map((c, i) => (
                      <span key={i} className="px-2.5 py-1 bg-white border border-emerald-200 rounded-lg text-[10px] font-bold text-emerald-800 uppercase shadow-2xs">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {uploadSummary.actualizados.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-black text-blue-800 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Perfiles Actualizados con Nueva Versión ({uploadSummary.actualizados.length}):
                  </p>
                  <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100 flex flex-wrap gap-1.5">
                    {uploadSummary.actualizados.map((c, i) => (
                      <span key={i} className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg text-[10px] font-bold text-blue-800 uppercase shadow-2xs">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {uploadSummary.sin_cambios.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-black text-slate-600 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Perfiles Sin Cambios ({uploadSummary.sin_cambios.length}):
                  </p>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-wrap gap-1.5">
                    {uploadSummary.sin_cambios.map((c, i) => (
                      <span key={i} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-semibold text-slate-600 uppercase">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setUploadSummary(null)}
                className="h-11 px-8 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md active:scale-95"
              >
                Aceptar y Ver Perfiles
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <td className="px-6 py-4 text-xs text-slate-600 font-semibold whitespace-nowrap">
                    <span className="text-emerald-600 font-black">{p.firmados} firmados</span> · <span className="text-amber-600 font-black">{p.pendientes} pendientes</span>
                    <button
                      onClick={() => { setAddPersonaModal(p); setPersonaQuery(''); setPersonaResults([]); }}
                      className="ml-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700"
                      title="Agregar persona manualmente a este perfil"
                    >
                      <Icons.UserPlus className="w-3.5 h-3.5" /> Agregar persona
                    </button>
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
                    <div className="inline-flex items-center gap-2 justify-end">
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
                      <button
                        onClick={() => handleOpenDeleteModal(r)}
                        disabled={deletingId === r.id}
                        title={r.estado === 'firmado' ? 'Eliminar firma realizada (removerá el PDF de Drive y registrará trazabilidad en histórico)' : 'Eliminar esta solicitud pendiente'}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                      >
                        <Icons.Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
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

      {/* Modal: agregar persona manualmente a un perfil */}
      {addPersonaModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Agregar persona por firmar</h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">{addPersonaModal.cargo_nombre || addPersonaModal.hoja_excel}</p>
              </div>
              <button onClick={() => setAddPersonaModal(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 pb-3">
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar por nombre o cédula..."
                  value={personaQuery}
                  onChange={e => setPersonaQuery(e.target.value)}
                  className="h-11 w-full pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                />
                <Icons.Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-2">
                Solo se muestra personal activo que aún no tiene firma registrada para este perfil.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
              {searchingPersona && (
                <div className="py-8 text-center">
                  <div className="w-6 h-6 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              )}
              {!searchingPersona && personaResults.length === 0 && (
                <p className="text-center text-[10px] font-black uppercase text-slate-400 tracking-widest py-8">
                  Sin resultados
                </p>
              )}
              {!searchingPersona && personaResults.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800 uppercase truncate">{p.nombre}</p>
                    <p className="text-[11px] text-slate-400 font-semibold">CC {p.cedula} · {p.cargo || 'Sin cargo registrado'}</p>
                  </div>
                  <button
                    onClick={() => handleAgregarPersona(p.id)}
                    disabled={addingPersonaId === p.id}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <Icons.Plus className="w-3.5 h-3.5" />
                    {addingPersonaId === p.id ? 'Agregando...' : 'Agregar'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal elegante para eliminar firma / pendiente */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            
            {/* Encabezado e ícono */}
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${deleteModal.estado === 'firmado' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                <Icons.AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  {deleteModal.estado === 'firmado' ? 'Eliminar Firma Realizada' : 'Eliminar Solicitud Pendiente'}
                </h3>
                <p className="text-xs text-slate-500 font-bold truncate mt-0.5">
                  {deleteModal.nombre}
                </p>
              </div>
              <button
                onClick={() => setDeleteModal(null)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            {/* Banner de advertencia */}
            <div className={`p-4 rounded-2xl text-xs space-y-2 border ${deleteModal.estado === 'firmado' ? 'bg-red-50/50 border-red-100 text-red-950' : 'bg-amber-50/50 border-amber-100 text-amber-950'}`}>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${deleteModal.estado === 'firmado' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                  {deleteModal.estado === 'firmado' ? 'Documento Firmado' : 'Pendiente'}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600 font-medium">
                {deleteModal.estado === 'firmado' ? (
                  <>
                    <strong>¡Atención!</strong> Se removerá el PDF firmado físicamente de Google Drive / Almacenamiento Local. Se registrará la traza auditora inmutable en el historial.
                  </>
                ) : (
                  <>
                    Se eliminará la solicitud de firma pendiente. Esta acción no se puede deshacer.
                  </>
                )}
              </p>
            </div>

            {/* Input de motivo (obligatorio para firmado) */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">
                Motivo de Eliminación {deleteModal.estado === 'firmado' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                rows={3}
                value={deleteMotivoInput}
                onChange={(e) => setDeleteMotivoInput(e.target.value)}
                placeholder={deleteModal.estado === 'firmado' ? "Describa el motivo (ej: El colaborador completó erróneamente un perfil que no correspondía)..." : "Motivo opcional..."}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/10 transition-all resize-none"
              />
            </div>

            {/* Botones de acción */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === deleteModal.firmaId || (deleteModal.estado === 'firmado' && !deleteMotivoInput.trim())}
                className="px-5 py-2.5 rounded-2xl text-xs font-black text-white bg-red-600 hover:bg-red-700 border border-red-700 shadow-md shadow-red-600/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {deletingId === deleteModal.firmaId ? (
                  <>
                    <Icons.Loader className="w-4 h-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Icons.Trash className="w-4 h-4" />
                    Confirmar Eliminación
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default PerfilesCargo;
