import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../../constants';
import { api, API_URL } from '../../services/api';
import { User } from '../../types';
import { hasPermission } from '../../utils/permissions';
import { toast } from 'sonner';
import NoticiaModal from './NoticiaModal';

interface Noticia {
  id?: number;
  titulo: string;
  descripcion: string;
  link: string;
  archivo_drive_id: string;
  archivo_drive_path: string;
  archivo_nombre: string;
  archivo_tipo: string;
  tipo_acceso: 'INTERNO' | 'EXTERNO' | 'AMBOS';
  fecha_vencimiento: string;
  estado: 'ACTIVO' | 'INACTIVO';
}

const BLANK: Noticia = {
  titulo: '', descripcion: '', link: '',
  archivo_drive_id: '', archivo_drive_path: '', archivo_nombre: '', archivo_tipo: '',
  tipo_acceso: 'AMBOS', fecha_vencimiento: '', estado: 'ACTIVO',
};

interface Props { user: User; }

const ACCESO_LABELS: Record<string, string> = {
  INTERNO: 'Solo App', EXTERNO: 'Solo Enlace', AMBOS: 'App + Enlace',
};
const ACCESO_COLORS: Record<string, string> = {
  INTERNO: 'bg-blue-50 text-blue-700',
  EXTERNO: 'bg-orange-50 text-orange-700',
  AMBOS:   'bg-emerald-50 text-emerald-700',
};

const fmtDate = (d: string) => {
  if (!d) return '';
  try {
    return new Date(d + (d.includes('T') ? '' : 'T12:00:00Z')).toLocaleDateString('es-CO', {
      timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return d; }
};

// Devuelve YYYY-MM-DD para input[type=date]
const toDateInput = (d: string) => {
  if (!d) return '';
  return d.includes('T') ? d.split('T')[0] : d;
};

export default function NoticiasAdmin({ user }: Props) {
  const [noticias, setNoticias]   = useState<Noticia[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState<Noticia | null>(null);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<Noticia | null>(null);
  const [confirmDel, setConfirmDel] = useState<Noticia | null>(null);
  const [viewerUrl, setViewerUrl] = useState<{ url: string; tipo: string; nombre: string } | null>(null);
  const [confirmDelArchivo, setConfirmDelArchivo] = useState(false);
  const [animPreview, setAnimPreview] = useState<Noticia | null>(null);
  const [deletingArchivo, setDeletingArchivo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission(user, 'NOTICIAS', 'create');
  const canEdit   = hasPermission(user, 'NOTICIAS', 'edit');
  const canDelete = hasPermission(user, 'NOTICIAS', 'delete');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setNoticias(await api.noticiasGetAll()); }
    catch { toast.error('Error al cargar noticias'); }
    finally { setLoading(false); }
  };

  const setF = (patch: Partial<Noticia>) => setModal(m => m ? { ...m, ...patch } : m);

  const handleSave = async () => {
    if (!modal) return;
    if (!modal.titulo.trim()) { toast.error('El título es requerido'); return; }
    setSaving(true);
    try {
      await api.noticiasSave({ ...modal, usuario_control: user.name });
      toast.success(modal.id ? 'Noticia actualizada' : 'Noticia creada');
      setModal(null); load();
    } catch (e: any) { toast.error(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const r = await api.noticiasUpload(file);
      setF({ archivo_drive_path: r.archivo_drive_path, archivo_nombre: r.archivo_nombre, archivo_tipo: r.archivo_tipo });
      toast.success('Archivo subido al Drive');
    } catch (e: any) { toast.error(e.message || 'Error al subir archivo'); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel?.id) return;
    try {
      await api.noticiasDelete(confirmDel.id);
      toast.success('Noticia eliminada');
      setConfirmDel(null); load();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleDeleteArchivo = async () => {
    if (!modal) return;
    setDeletingArchivo(true);
    try {
      if (modal.id) {
        await api.noticiasDeleteArchivo(modal.id);
      }
      setF({ archivo_drive_path: '', archivo_drive_id: '', archivo_nombre: '', archivo_tipo: '' });
      setConfirmDelArchivo(false);
      toast.success('Archivo eliminado del Drive');
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar archivo');
    } finally {
      setDeletingArchivo(false);
    }
  };

  const copyPublicLink = (n: Noticia) => {
    const url = `${window.location.origin}/publico/noticia?id=${n.id}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Enlace público copiado'));
  };

  const tipoIcon = (tipo: string) => {
    if (tipo === 'PDF')    return <Icons.FileText className="w-4 h-4 text-red-500" />;
    if (tipo === 'VIDEO')  return <Icons.Play className="w-4 h-4 text-blue-500" />;
    if (tipo === 'IMAGEN') return <Icons.Image className="w-4 h-4 text-emerald-500" />;
    return <Icons.Link className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="p-6 md:p-10 space-y-8 animate-in fade-in duration-500 bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Noticias y Avisos</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
            {noticias.length} noticia(s) registrada(s)
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setModal({ ...BLANK })}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase hover:bg-emerald-600 transition-all shadow-lg">
            <Icons.Plus className="w-4 h-4" /> Nueva Noticia
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : noticias.length === 0 ? (
        <div className="text-center py-24 text-slate-300 font-black uppercase text-sm">
          No hay noticias aún. ¡Crea la primera!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {noticias.map(n => {
            const vencida = n.fecha_vencimiento && new Date(n.fecha_vencimiento) < new Date();
            const hasPublicLink = n.tipo_acceso === 'EXTERNO' || n.tipo_acceso === 'AMBOS';
            return (
              <div key={n.id} className={`bg-white rounded-[2rem] shadow border overflow-hidden transition-all hover:shadow-xl ${n.estado === 'INACTIVO' || vencida ? 'opacity-60' : 'border-slate-100'}`}>
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-white font-black text-sm uppercase leading-tight line-clamp-2">{n.titulo}</p>
                    <span className={`flex-shrink-0 px-2 py-1 rounded-lg text-[8px] font-black uppercase ${n.estado === 'ACTIVO' ? 'bg-emerald-500 text-white' : 'bg-slate-500 text-white'}`}>
                      {n.estado}
                    </span>
                  </div>
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${ACCESO_COLORS[n.tipo_acceso]}`}>
                    {ACCESO_LABELS[n.tipo_acceso]}
                  </span>
                </div>

                <div className="p-5 space-y-3">
                  {n.descripcion && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{n.descripcion}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {n.link && <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400"><Icons.Link className="w-3 h-3" /> Enlace</div>}
                    {n.archivo_nombre && (
                      <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                        {tipoIcon(n.archivo_tipo)} {n.archivo_nombre.length > 20 ? n.archivo_nombre.slice(0, 20) + '…' : n.archivo_nombre}
                      </div>
                    )}
                  </div>

                  {n.fecha_vencimiento && (
                    <p className={`text-[9px] font-bold ${vencida ? 'text-rose-500' : 'text-slate-400'}`}>
                      Vence: {fmtDate(n.fecha_vencimiento)}{vencida && ' · VENCIDA'}
                    </p>
                  )}

                  {/* Enlace público */}
                  {hasPublicLink && n.id && (
                    <button onClick={() => copyPublicLink(n)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-orange-50 text-orange-600 rounded-xl text-[9px] font-black uppercase hover:bg-orange-100 transition-all">
                      <Icons.ExternalLink className="w-3 h-3" /> Copiar enlace público
                    </button>
                  )}

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button onClick={() => setAnimPreview(n)}
                      className="flex items-center justify-center gap-1 py-2 bg-slate-100 rounded-2xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all">
                      <Icons.Eye className="w-3 h-3" /> Ver
                    </button>
                    {canEdit && (
                      <button onClick={() => setModal({ ...n, fecha_vencimiento: toDateInput(n.fecha_vencimiento) })}
                        className="flex items-center justify-center gap-1 py-2 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase hover:bg-emerald-600 transition-all">
                        <Icons.Edit className="w-3 h-3" /> Editar
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setConfirmDel(n)}
                        className="flex items-center justify-center gap-1 py-2 border border-rose-100 text-rose-400 rounded-2xl text-[9px] font-black uppercase hover:bg-rose-500 hover:text-white transition-all">
                        <Icons.Trash className="w-3 h-3" /> Borrar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL EDITOR ── */}
      {modal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh]">
            <div className="p-8 border-b border-slate-100 bg-slate-900 text-white flex-shrink-0">
              <h2 className="text-xl font-black uppercase tracking-tighter">{modal.id ? 'Editar Noticia' : 'Nueva Noticia'}</h2>
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5">Centro de Formación · Noticias y Avisos</p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Título *</label>
                <input value={modal.titulo} onChange={e => setF({ titulo: e.target.value })}
                  placeholder="Título de la noticia o aviso"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Descripción</label>
                <textarea value={modal.descripcion} onChange={e => setF({ descripcion: e.target.value })}
                  rows={4} placeholder="Contenido del aviso..."
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all resize-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Enlace externo (opcional)</label>
                <input value={modal.link} onChange={e => setF({ link: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Archivo adjunto (PDF / Video / Imagen)</label>
                {modal.archivo_nombre ? (
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100">
                    {tipoIcon(modal.archivo_tipo)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">{modal.archivo_nombre}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">{modal.archivo_tipo} · Drive</p>
                    </div>
                    <button onClick={() => setConfirmDelArchivo(true)}
                      className="p-1.5 hover:bg-rose-100 rounded-xl transition-all">
                      <Icons.X className="w-4 h-4 text-rose-400" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-black text-slate-400 uppercase hover:border-slate-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    {uploading
                      ? <><div className="w-4 h-4 border-2 border-slate-400 border-t-emerald-500 rounded-full animate-spin" /> Subiendo al Drive...</>
                      : <><Icons.Upload className="w-4 h-4" /> Subir archivo a "Noticias Milla 7"</>}
                  </button>
                )}
                <input ref={fileRef} type="file" className="hidden"
                  accept=".pdf,video/*,image/*"
                  onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de acceso</label>
                  <select value={modal.tipo_acceso} onChange={e => setF({ tipo_acceso: e.target.value as any })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all">
                    <option value="AMBOS">App + Enlace</option>
                    <option value="INTERNO">Solo App</option>
                    <option value="EXTERNO">Solo Enlace</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Estado</label>
                  <select value={modal.estado} onChange={e => setF({ estado: e.target.value as any })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all">
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                  Fecha de vencimiento <span className="normal-case font-medium">(dejar vacío = ilimitado)</span>
                </label>
                <input type="date" value={modal.fecha_vencimiento} onChange={e => setF({ fecha_vencimiento: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all" />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 flex-shrink-0">
              <button onClick={() => setModal(null)} disabled={saving}
                className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-2xl text-xs font-black uppercase hover:bg-slate-300 transition-all">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase hover:bg-emerald-600 transition-all disabled:opacity-50">
                {saving ? 'Guardando...' : modal.id ? 'Actualizar' : 'Crear Noticia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VISTA PREVIA ── */}
      {preview && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[92vh] flex flex-col">
            <div className="p-8 bg-gradient-to-br from-slate-900 to-emerald-900 text-white flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase mb-3 ${ACCESO_COLORS[preview.tipo_acceso]}`}>
                    {ACCESO_LABELS[preview.tipo_acceso]}
                  </span>
                  <h2 className="text-2xl font-black uppercase tracking-tighter leading-tight">{preview.titulo}</h2>
                  {preview.fecha_vencimiento && (
                    <p className="text-[10px] text-slate-300 font-bold mt-1">
                      Vence: {fmtDate(preview.fecha_vencimiento)}
                    </p>
                  )}
                </div>
                <button onClick={() => setPreview(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all flex-shrink-0">
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-5">
              {preview.descripcion && (
                <p className="text-sm text-slate-600 leading-relaxed">{preview.descripcion}</p>
              )}

              {/* Enlace externo */}
              {preview.link && (
                <a href={preview.link} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2.5 px-5 py-3.5 bg-blue-50 text-blue-700 rounded-2xl text-xs font-bold hover:bg-blue-100 transition-all">
                  <Icons.ExternalLink className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{preview.link}</span>
                </a>
              )}

              {/* Visualizador de archivo */}
              {preview.archivo_nombre && preview.id && (
                <ResourceViewer
                  id={preview.id}
                  nombre={preview.archivo_nombre}
                  tipo={preview.archivo_tipo}
                  isAdmin={true}
                />
              )}

              {/* Enlace público (si aplica) */}
              {(preview.tipo_acceso === 'EXTERNO' || preview.tipo_acceso === 'AMBOS') && preview.id && (
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 space-y-2">
                  <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Enlace Público</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[10px] text-slate-600 bg-white rounded-xl px-3 py-2 border border-orange-100 truncate">
                      {preview.archivo_nombre
                        ? api.noticiasPublicStreamUrl(preview.id)
                        : preview.link || 'Sin URL pública'}
                    </code>
                    <button onClick={() => copyPublicLink(preview)}
                      className="p-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl transition-all flex-shrink-0">
                      <Icons.Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE ── */}
      {confirmDel && (
        <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-300">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
                <Icons.Trash className="w-7 h-7 text-rose-500" />
              </div>
              <h3 className="font-black text-slate-900 uppercase">¿Eliminar noticia?</h3>
              <p className="text-xs text-slate-500">"{confirmDel.titulo}" será eliminada permanentemente.</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl text-xs font-black uppercase">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 py-3 bg-rose-500 text-white rounded-2xl text-xs font-black uppercase hover:bg-rose-600 transition-all">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM ELIMINAR ARCHIVO DEL DRIVE ── */}
      {confirmDelArchivo && modal && (
        <div className="fixed inset-0 z-[150] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-300">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
                <Icons.Trash className="w-7 h-7 text-rose-500" />
              </div>
              <h3 className="font-black text-slate-900 uppercase text-sm">¿Eliminar archivo?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                El archivo <span className="font-bold text-slate-700">"{modal.archivo_nombre}"</span> será eliminado permanentemente del Drive.
                {!modal.id && <span className="block mt-1 text-amber-600 font-bold">Este archivo solo se eliminará localmente (la noticia aún no ha sido guardada).</span>}
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setConfirmDelArchivo(false)} disabled={deletingArchivo}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl text-xs font-black uppercase hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={handleDeleteArchivo} disabled={deletingArchivo}
                className="flex-1 py-3 bg-rose-500 text-white rounded-2xl text-xs font-black uppercase hover:bg-rose-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {deletingArchivo
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Eliminando...</>
                  : 'Eliminar del Drive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PREVIEW ANIMADO CON FURGÓN ── */}
      {animPreview && (
        <NoticiaModal
          noticias={[animPreview as any]}
          userId={`__preview_${animPreview.id}`}
          isPublic={false}
          onAllSeen={() => setAnimPreview(null)}
        />
      )}

      {/* Viewer flotante para el modal principal */}
      {viewerUrl && (
        <div className="fixed inset-0 z-[130] bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setViewerUrl(null)}>
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-white font-bold text-sm truncate">{viewerUrl.nombre}</span>
              <div className="flex gap-2">
                <a href={viewerUrl.url} download={viewerUrl.nombre}
                  className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-600 transition-all flex items-center gap-1.5">
                  <Icons.Download className="w-3.5 h-3.5" /> Descargar
                </a>
                <button onClick={() => setViewerUrl(null)} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all">
                  <Icons.X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white rounded-2xl overflow-hidden">
              {viewerUrl.tipo === 'IMAGEN' && <img src={viewerUrl.url} alt={viewerUrl.nombre} className="w-full h-full object-contain" />}
              {viewerUrl.tipo === 'VIDEO'  && <video src={viewerUrl.url} controls autoPlay className="w-full h-full" />}
              {viewerUrl.tipo === 'PDF'    && <iframe src={viewerUrl.url} className="w-full h-full min-h-[70vh]" title={viewerUrl.nombre} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Componente visualizador de recurso ── */
function ResourceViewer({ id, nombre, tipo, isAdmin }: { id: number; nombre: string; tipo: string; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const url = isAdmin
    ? `${API_URL}/noticias/${id}/stream`
    : `${API_URL}/noticias/public/${id}/stream`;

  const TipoIcon = tipo === 'PDF'
    ? Icons.FileText
    : tipo === 'VIDEO'
    ? Icons.Play
    : Icons.Image;

  const iconColor = tipo === 'PDF' ? 'text-red-500' : tipo === 'VIDEO' ? 'text-blue-500' : 'text-emerald-500';

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
        <TipoIcon className={`w-5 h-5 flex-shrink-0 ${iconColor}`} />
        <span className="flex-1 text-xs font-bold text-slate-700 truncate">{nombre}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a href={url} download={nombre}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-600 transition-all"
            onClick={e => e.stopPropagation()}>
            <Icons.Download className="w-3 h-3" /> Descargar
          </a>
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all">
            <Icons.Eye className="w-3 h-3" />
            {expanded ? 'Ocultar' : 'Ver'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="bg-slate-100">
          {tipo === 'IMAGEN' && <img src={url} alt={nombre} className="w-full max-h-[50vh] object-contain bg-slate-200" />}
          {tipo === 'VIDEO'  && <video src={url} controls className="w-full max-h-[50vh]" />}
          {tipo === 'PDF'    && <iframe src={url} className="w-full h-[55vh]" title={nombre} />}
        </div>
      )}
    </div>
  );
}
