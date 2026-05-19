import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { FileText, Download, ExternalLink, RefreshCw, FolderOpen, Settings } from 'lucide-react';
import { toast } from 'sonner';

interface Formato {
  id: string;
  nombre: string;
  orden: number;
}

const FormatosTransportes: React.FC = () => {
  const [formatos, setFormatos] = useState<Formato[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // States for Edit Modal
  const [editingFormato, setEditingFormato] = useState<Formato | null>(null);
  const [editId, setEditId] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editOrden, setEditOrden] = useState(1);

  const loadFormatos = async () => {
    setIsLoading(true);
    try {
      const res = await api.getFormatosTransportes();
      if (res.success) {
        setFormatos(res.data || []);
      } else {
        toast.error('No se pudieron cargar los formatos.');
      }
    } catch (err: any) {
      toast.error('Error de conexión al cargar formatos.');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (doc: Formato) => {
    setEditingFormato(doc);
    setEditId(doc.id);
    setEditNombre(doc.nombre);
    setEditOrden(doc.orden);
  };

  const handleSaveEdit = async () => {
    if (!editId.trim() || !editNombre.trim()) {
      toast.error('Todos los campos son obligatorios.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await api.updateFormatoTransporte(editingFormato!.id, {
        newId: editId.trim(),
        nombre: editNombre.trim(),
        orden: Number(editOrden)
      });
      if (res.success) {
        toast.success('Formato actualizado correctamente.');
        setEditingFormato(null);
        loadFormatos();
      } else {
        toast.error(res.error || 'Error al actualizar el formato.');
      }
    } catch (err) {
      toast.error('Error de conexión al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    loadFormatos();
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Glassmorphic Header */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 md:p-12 shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                Operaciones Milla Siete
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
              <FolderOpen className="text-indigo-400" size={40} />
              Formatos de Transportes
            </h1>
            <p className="text-slate-300 font-bold mt-2 text-sm max-w-xl">
              Plantillas y documentos oficiales vinculados a Google Drive. Descargue u obtenga copias directamente para su diligenciamiento.
            </p>
          </div>
          <button
            onClick={loadFormatos}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all border border-white/10 backdrop-blur-md active:scale-95 disabled:opacity-50 text-xs uppercase"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Grid List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
          </div>
          <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Obteniendo formatos del servidor...</span>
        </div>
      ) : formatos.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-100 rounded-[2rem] shadow-sm p-10">
          <div className="w-16 h-16 mx-auto mb-4 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100">
            <FileText size={28} />
          </div>
          <h3 className="text-lg font-black text-slate-800 uppercase">Sin Formatos Disponibles</h3>
          <p className="text-slate-400 text-xs font-bold mt-1">No se encontraron plantillas registradas en el sistema.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {formatos.map((doc) => {
            const driveViewUrl = `https://drive.google.com/file/d/${doc.id}/view?usp=sharing`;
            const driveDownloadUrl = `https://drive.google.com/uc?export=download&id=${doc.id}`;

            return (
              <div 
                key={doc.id}
                className="group relative overflow-hidden bg-white hover:bg-slate-50/50 rounded-[2rem] border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
              >
                <div className="p-6 md:p-8 space-y-6">
                  {/* Icon & Badge */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-indigo-50 group-hover:bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 transition-colors">
                        <FileText size={24} />
                      </div>
                      <button
                        onClick={() => startEditing(doc)}
                        className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all"
                        title="Configurar ID de Drive"
                      >
                        <Settings size={16} />
                      </button>
                    </div>
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
                      Orden {doc.orden}
                    </span>
                  </div>

                  {/* Title */}
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight leading-snug group-hover:text-indigo-600 transition-colors uppercase">
                      {doc.nombre}
                    </h3>
                    <p className="text-slate-400 text-xs font-bold mt-2">
                      ID Documento: <span className="font-mono text-slate-500">{doc.id.substring(0, 12)}...</span>
                    </p>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-6 md:p-8 pt-0 border-t border-slate-100 flex gap-2">
                  <a
                    href={driveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-[10px] uppercase tracking-wider text-center flex items-center justify-center gap-1.5 transition-all active:scale-98"
                  >
                    <ExternalLink size={12} /> Abrir en Drive
                  </a>
                  <a
                    href={driveDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 bg-indigo-50 hover:bg-indigo-150 text-indigo-600 font-bold rounded-xl text-center flex items-center justify-center transition-all active:scale-98"
                    title="Descargar Directamente"
                  >
                    <Download size={14} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingFormato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-950 p-8 text-white relative">
              <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-[50px] pointer-events-none" />
              <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                <Settings className="text-indigo-400" />
                Configurar Formato
              </h3>
              <p className="text-slate-400 text-xs font-bold mt-1">
                Actualiza el ID de Google Drive y el nombre oficial de la plantilla.
              </p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Nombre del Formato</label>
                <input
                  type="text"
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm"
                  placeholder="Ej: F-OPT-007 Inspección Preoperacional"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">ID de Google Drive</label>
                <input
                  type="text"
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800 text-xs"
                  placeholder="ID de archivo en Google Drive (ej: 1aF-K05Jp...)"
                />
                <span className="text-[9px] text-slate-400 block leading-normal">
                  Puedes extraer el ID desde el enlace de compartir de Google Drive (el bloque de caracteres después de <strong>/d/</strong> y antes de <strong>/view</strong>).
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Orden de Visualización</label>
                <input
                  type="number"
                  value={editOrden}
                  onChange={(e) => setEditOrden(Number(e.target.value))}
                  className="w-32 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm"
                  min="1"
                />
              </div>
            </div>

            <div className="p-8 pt-0 flex gap-3">
              <button
                onClick={() => setEditingFormato(null)}
                disabled={isSaving}
                className="flex-1 py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs uppercase tracking-wider transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex-1 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
              >
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormatosTransportes;
