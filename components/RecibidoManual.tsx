import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';
import { DocumentL, User, DocStatus, MasterRecord, Article, DocumentLItem } from '../types';
import BlindCount from './BlindCount';
import { hasPermission } from '../utils/permissions';

interface RecibidoManualProps {
  documents: DocumentL[];
  user: User;
  masterEstados: MasterRecord[];
  masterNotificaciones: MasterRecord[];
  masterTipoNotificacion: MasterRecord[];
  masterArticulo: MasterRecord[];
  clients: MasterRecord[];
  onUpdateDocuments: (docs: DocumentL[]) => void;
  onAddArticleToMaster: (article: Article) => void;
}

const RecibidoManual: React.FC<RecibidoManualProps> = ({
  documents, user, masterEstados, masterNotificaciones,
  masterTipoNotificacion,
  masterArticulo,
  clients,
  onUpdateDocuments, onAddArticleToMaster
}) => {
  const [selectedDocForCount, setSelectedDocForCount] = useState<DocumentL | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>(user.clientId || '');
  const [externalDocId, setExternalDocId] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDocs = useMemo(() => {
    return documents.filter(d => 
      d.clientId === selectedClientId && 
      (d.status === DocStatus.PENDING || d.status === DocStatus.COUNTING) &&
      (d.externalDocId.toLowerCase().includes(searchTerm.toLowerCase()) || d.vehicleData?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [documents, selectedClientId, searchTerm]);

  const handleStartManual = async () => {
    if (!selectedClientId) return toast.error("Seleccione un cliente");
    if (!externalDocId) return toast.error("Ingrese ID de Documento");
    if (!vehiclePlate) return toast.error("Ingrese Placa de Vehículo");

    setIsCreating(true);
    try {
      const res = await api.createManualDocument({
        externalDocId,
        clientId: selectedClientId,
        vehiclePlate,
        user: user.name
      });

      if (res.success) {
        const newDoc: DocumentL = {
          ...res.document,
          items: [] // Inicia vacío para manual
        };
        onUpdateDocuments([...documents, newDoc]);
        setSelectedDocForCount(newDoc);
        toast.success("Recibo manual iniciado");
      } else {
        toast.error(res.error || "Error al crear documento");
      }
    } catch (e: any) {
      toast.error("Error de conexión: " + e.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePartialSave = (currentItems: DocumentLItem[], generalObs: string) => {
    if (!selectedDocForCount) return;

    api.syncInventory({
      docId: selectedDocForCount.id,
      items: currentItems,
      user: user.name,
      notes: generalObs,
      isPartial: true
    }).then(res => {
      if (res.success) {
        const updatedDocs = documents.map(d =>
          d.id === selectedDocForCount.id ? { ...d, items: currentItems, updatedAt: new Date().toISOString() } : d
        );
        onUpdateDocuments(updatedDocs);
      }
    });
  };

  const handleFinishCount = (finalItems: DocumentLItem[], generalObs: string, updateEmail?: string) => {
    if (!selectedDocForCount) return;

    api.syncInventory({
      docId: selectedDocForCount.id,
      items: finalItems,
      user: user.name,
      notes: generalObs,
      isPartial: false,
      driverEmail: updateEmail
    }).then(res => {
      if (res.success) {
        toast.success("Recibo manual finalizado.");
        const updatedDocs = documents.map(d =>
          d.id === selectedDocForCount.id
            ? {
              ...d,
              items: finalItems,
              status: DocStatus.INVENTORED,
              inventoryDate: new Date().toISOString(),
              inventoryUser: user.name,
              inventoryNotes: generalObs,
              updatedBy: user.name,
              updatedAt: new Date().toISOString()
            }
            : d
        );
        onUpdateDocuments(updatedDocs);
        setSelectedDocForCount(null);
      } else {
        toast.error("Error al sincronizar: " + (res.error || "Desconocido"));
      }
    });
  };

  if (selectedDocForCount) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden">
        <BlindCount
          document={selectedDocForCount}
          user={user}
          masterNotificaciones={masterNotificaciones}
          masterTipoNotificacion={masterTipoNotificacion}
          masterArticulo={masterArticulo}
          onConfirm={handleFinishCount}
          onPartialSave={handlePartialSave}
          onCancel={() => setSelectedDocForCount(null)}
          onAddArticleToMaster={onAddArticleToMaster}
          onAddNotificationToMaster={() => {}} // No necesitamos agregar notifs aquí por ahora
          allowExtraItems={true}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 h-full flex flex-col bg-slate-50 overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
        
        {/* PANEL IZQUIERDA: CREAR NUEVO */}
        <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-100 space-y-8 flex flex-col">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-500 text-slate-900 rounded-2xl flex items-center justify-center shadow-lg"><Icons.Plus className="w-8 h-8" /></div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Nuevo Recibo Manual</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inicie un proceso sin documento previo</p>
            </div>
          </div>

          <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Cliente / Operación</label>
              <select 
                value={selectedClientId} 
                onChange={e => setSelectedClientId(e.target.value)}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all cursor-pointer"
              >
                <option value="">SELECCIONE CLIENTE</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Documento de Referencia (ID L)</label>
              <input 
                type="text" 
                value={externalDocId}
                onChange={e => setExternalDocId(e.target.value.toUpperCase())}
                placeholder="EJ: L-2024-XXXX"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Vehículo / Placa</label>
              <input 
                type="text" 
                value={vehiclePlate}
                onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                placeholder="EJ: ABC-123"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <button
            onClick={handleStartManual}
            disabled={isCreating}
            className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-20"
          >
            {isCreating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Icons.Play className="w-5 h-5" />}
            Iniciar Auditoría Manual
          </button>
        </div>

        {/* PANEL DERECHA: CONTINUAR EXISTENTES */}
        <div className="bg-slate-900 rounded-[3rem] p-10 shadow-2xl flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Continuar Pendientes</h3>
            <span className="px-3 py-1 bg-emerald-500 text-slate-950 rounded-lg text-[10px] font-black">{filteredDocs.length}</span>
          </div>

          <div className="relative mb-6">
            <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 w-4 h-4" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="BUSCAR POR ID O PLACA..."
              className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold text-xs outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
            {filteredDocs.map(doc => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocForCount(doc)}
                className="w-full p-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-[2rem] text-left transition-all group flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-emerald-500 uppercase mb-1">{doc.externalDocId}</p>
                  <p className="text-lg font-black text-white uppercase tracking-tighter truncate">{doc.vehicleData || 'S/A'}</p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">{new Date(doc.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-all">
                  <Icons.ChevronRight className="w-6 h-6" />
                </div>
              </button>
            ))}
            {filteredDocs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20">
                <Icons.Package className="w-20 h-20 text-white mb-4" />
                <p className="text-white font-black uppercase text-xs">No hay planes pendientes</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecibidoManual;
