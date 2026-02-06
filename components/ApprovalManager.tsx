import React, { useState } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';

interface ApprovalManagerProps {
    user: any;
    allUsers: any[];
}

const ApprovalManager: React.FC<ApprovalManagerProps> = ({ user, allUsers }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [previewSignature, setPreviewSignature] = useState<string | null>(null);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [approverKey, setApproverKey] = useState('');
    const [loading, setLoading] = useState(false);

    const filteredUsers = allUsers.filter(u => 
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleViewSignature = async (targetUser: any) => {
        setLoading(true);
        try {
            const res = await api.getSignature(targetUser.email);
            if (res && res.digital_signature) {
                setPreviewSignature(res.digital_signature);
                setIsPreviewModalOpen(true);
            } else {
                toast.error('Este usuario no tiene una firma registrada.');
            }
        } catch (err) {
            toast.error('Error al cargar la previsualización.');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!approverKey) {
            toast.error('Debe ingresar su clave de firma para aprobar.');
            return;
        }

        setLoading(true);
        try {
            const res = await api.approveSignature({
                documentNumber: selectedUser.email,
                approverId: user.id,
                approverPasswordSecret: approverKey
            });

            if (res.success) {
                toast.success(`Firma de ${selectedUser.name} aprobada correctamente.`);
                setIsConfirmModalOpen(false);
                setApproverKey('');
                // Forzar refresco si es necesario
            } else {
                toast.error(res.error || 'Error al aprobar la firma.');
            }
        } catch (err) {
            toast.error('Error de conexión al procesar la aprobación.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto animate-in fade-in">
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col h-[80vh]">
                <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-emerald-500 text-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
                            <Icons.Audit className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter">Aprobación de Firmas</h2>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">Control de Seguridad M7 Intelligence</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4 relative">
                    <Icons.Search className="text-slate-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="BUSCAR USUARIO POR NOMBRE O CORREO..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoComplete="off"
                        className="bg-transparent flex-1 outline-none font-black text-xs uppercase text-slate-900 placeholder:text-slate-300"
                    />
                    {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm('')}
                            className="bg-slate-200 hover:bg-red-100 hover:text-red-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all"
                        >
                            Limpiar Búsqueda
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-8 py-5">Usuario</th>
                                <th className="px-8 py-5 text-center">Estado Firma</th>
                                <th className="px-8 py-5 text-center">Aprobación</th>
                                <th className="px-8 py-5 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-black">
                                                {u.name.substring(0,2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 text-xs uppercase">{u.name}</p>
                                                <p className="text-[9px] text-slate-400 font-bold">{u.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${u.hasSignature ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {u.hasSignature ? 'Registrada' : 'Sin Firma'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${u.isApproved ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {u.isApproved ? 'Aprobada' : 'Pendiente'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-right space-x-2">
                                        {u.hasSignature && (
                                            <button 
                                                onClick={() => handleViewSignature(u)}
                                                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                                            >
                                                Ver
                                            </button>
                                        )}
                                        {!u.isApproved && u.hasSignature && (
                                            <button 
                                                onClick={() => { setSelectedUser(u); setIsConfirmModalOpen(true); }}
                                                className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md active:scale-95"
                                            >
                                                Aprobar
                                            </button>
                                        )}
                                        {u.isApproved && (
                                           <div className="inline-flex items-center gap-2 px-6">
                                               <Icons.Check className="w-4 h-4 text-emerald-500" />
                                               <span className="text-[9px] font-black uppercase text-emerald-600">Auditado</span>
                                           </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Previsualización */}
            {isPreviewModalOpen && (
                <div className="fixed inset-0 z-[1100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
                    <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl border border-white/10 flex flex-col gap-8">
                        <div className="text-center">
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Previsualización de Firma</h3>
                            <p className="text-slate-500 font-bold text-sm uppercase">Verificando autenticidad biometría M7</p>
                        </div>
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-8 flex items-center justify-center min-h-[300px]">
                            {previewSignature ? (
                                <img src={previewSignature} alt="Signature Preview" className="max-w-full max-h-[400px] object-contain" />
                            ) : (
                                <p className="text-slate-400 font-black uppercase text-xs">Cargando...</p>
                            )}
                        </div>
                        <button 
                            onClick={() => setIsPreviewModalOpen(false)}
                            className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all"
                        >
                            Cerrar Vista
                        </button>
                    </div>
                </div>
            )}

            {isConfirmModalOpen && (
                <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
                    <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl border border-white/10 flex flex-col gap-8 shadow-emerald-500/10">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center mb-6">
                                <Icons.Lock className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Confirmar Aprobación</h3>
                            <p className="text-slate-500 font-bold text-sm">
                                Está a punto de aprobar la firma de <span className="text-emerald-600">{selectedUser?.name}</span>. 
                                Esta acción es irreversible y deja rastro de auditoría.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Su Clave de Firma (Aprobador)</label>
                            <div className="bg-slate-50 p-5 rounded-2xl flex items-center gap-3 border-2 border-slate-100 focus-within:border-emerald-500 transition-all">
                                <Icons.Key className="text-slate-400" />
                                <input 
                                    type="password" 
                                    value={approverKey}
                                    onChange={(e) => setApproverKey(e.target.value)}
                                    placeholder="INGRESE SU CLAVE PERSONAL"
                                    className="bg-transparent flex-1 outline-none font-black text-slate-950 placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button 
                                onClick={() => setIsConfirmModalOpen(false)}
                                className="flex-1 py-5 bg-slate-100 text-slate-900 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleApprove}
                                disabled={loading}
                                className="flex-1 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {loading ? <Icons.Loader className="animate-spin w-4 h-4" /> : <Icons.Check className="w-4 h-4" />}
                                Confirmar Firma
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApprovalManager;
