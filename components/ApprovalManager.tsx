import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';

interface ApprovalManagerProps {
    user: any;
}

const ApprovalManager: React.FC<ApprovalManagerProps> = ({ user }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [signatures, setSignatures] = useState<any[]>([]);
    const [selectedSig, setSelectedSig] = useState<any>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [previewSignature, setPreviewSignature] = useState<string | null>(null);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [approverKey, setApproverKey] = useState('');
    const [showApproverKey, setShowApproverKey] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadSignatures = async () => {
        setLoading(true);
        try {
            const data = await api.getAllSignatures();
            setSignatures(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error('Error al cargar las firmas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSignatures();
    }, []);

    const filteredSignatures = signatures.filter(s => 
        (s.userName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (s.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.userId || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const canApprove = (sig: any) => {
        // M7 Intelligence: Validación de permisos por PAG-27
        const pagePerms = user.permissions?.find((p: any) => p.module === 'PAG-27');
        const actions = pagePerms?.actions || [];
        
        // El usuario debe tener permiso de 'approve' o 'edit'
        const hasPermission = actions.includes('approve') || actions.includes('edit');
        if (!hasPermission) return false;

        // Regla de NO auto-aprobar (excepto Super Administrador ROL-01)
        if (sig.userId === user.id && user.roleId !== 'ROL-01') return false;

        return true;
    };

    const handleViewSignature = (sig: any) => {
        setPreviewSignature(sig.signature);
        setIsPreviewModalOpen(true);
    };

    const handleApprove = async () => {
        if (!approverKey) {
            toast.error('Debe ingresar su clave de firma para aprobar.');
            return;
        }

        // Validación local (opcional, el backend lo hace también)
        if (selectedSig.userId === user.id && user.roleId !== 'ROL-01') {
            toast.error('No puede aprobar su propia firma.');
            return;
        }

        setLoading(true);
        try {
            const res = await api.approveSignature({
                userId: selectedSig.userId,
                approverId: user.id,
                approverPassword: approverKey
            });

            if (res.success) {
                toast.success(`Firma de ${selectedSig.userName} aprobada correctamente.`);
                setIsConfirmModalOpen(false);
                setApproverKey('');
                setSelectedSig(null);
                loadSignatures(); // Recargar lista
            } else {
                toast.error(res.error || 'Error al aprobar la firma.');
            }
        } catch (err: any) {
            toast.error('Error al procesar la aprobación: ' + (err.message || 'Error de conexión'));
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
                    {loading && <Icons.Loader className="animate-spin w-6 h-6 text-emerald-400" />}
                </div>

                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4 relative">
                    {/* Hack para evitar que el navegador auto-llene el filtro con el usuario al detectar un password modal */}
                    <input type="text" name="chrome-is-annoying" style={{ display: 'none' }} />
                    <Icons.Search className="text-slate-400 w-5 h-5" />
                    <input 
                        type="text" 
                        id="approval-search-filter"
                        name="approval-search-filter"
                        placeholder="BUSCAR FIRMA POR NOMBRE, CORREO O ID..." 
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
                            Limpiar
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-8 py-5">Usuario Solicitante</th>
                                <th className="px-8 py-5 text-center">Estado Firma</th>
                                <th className="px-8 py-5 text-center">Registro</th>
                                <th className="px-8 py-5 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredSignatures.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="px-8 py-20 text-center text-slate-300 font-black uppercase text-xs">
                                        No se encontraron firmas pendientes o registradas
                                    </td>
                                </tr>
                            )}
                            {filteredSignatures.map(s => (
                                <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-black">
                                                {s.userName?.substring(0,2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 text-xs uppercase">{s.userName}</p>
                                                <p className="text-[9px] text-slate-400 font-bold">{s.email} | {s.userId}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${s.aprobada ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {s.aprobada ? 'Aprobada' : 'Pendiente'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">
                                            {s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-CO') : 'S/F'}
                                        </p>
                                    </td>
                                    <td className="px-8 py-5 text-right space-x-2">
                                        <button 
                                            onClick={() => handleViewSignature(s)}
                                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                                        >
                                            Ver Firma
                                        </button>
                                        {canApprove(s) && !s.aprobada && (
                                            <button 
                                                onClick={() => { setSelectedSig(s); setIsConfirmModalOpen(true); }}
                                                className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md active:scale-95"
                                            >
                                                Aprobar
                                            </button>
                                        )}
                                        {!s.aprobada && !canApprove(s) && (
                                            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest bg-slate-100 px-3 py-2 rounded-xl cursor-not-allowed">
                                                Solo Vista
                                            </span>
                                        )}
                                        {s.aprobada && (
                                           <div className="inline-flex items-center gap-2 px-6">
                                               <Icons.Check className="w-4 h-4 text-emerald-500" />
                                               <span className="text-[9px] font-black uppercase text-emerald-600">Auditado por {s.approvedBy}</span>
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
                <div className="fixed inset-0 z-[1100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95" onClick={() => setIsPreviewModalOpen(false)}>
                    <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl border border-white/10 flex flex-col gap-8" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Previsualización de Firma</h3>
                            <p className="text-slate-500 font-bold text-sm uppercase">Verificando autenticidad biometría M7</p>
                        </div>
                        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-8 flex items-center justify-center min-h-[300px]">
                            {previewSignature ? (
                                <img src={previewSignature} alt="Signature Preview" className="max-w-full max-h-[400px] object-contain" />
                            ) : (
                                <p className="text-slate-400 font-black uppercase text-xs">Sin imagen de firma</p>
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
                            <div className="text-slate-500 font-bold text-sm space-y-2">
                                <p>Está a punto de aprobar la firma de <span className="text-emerald-600">{selectedSig?.userName}</span>.</p>
                                <p className="text-[10px] text-red-500 uppercase tracking-widest font-black">Esta acción es irreversible y deja rastro de auditoría.</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Su Clave de Acceso (Aprobador)</label>
                            <div className="bg-slate-50 p-5 rounded-2xl flex items-center gap-3 border-2 border-slate-100 focus-within:border-emerald-500 transition-all">
                                <Icons.Key className="text-slate-400" />
                                <input 
                                    type={showApproverKey ? "text" : "password"} 
                                    value={approverKey}
                                    onChange={(e) => setApproverKey(e.target.value)}
                                    placeholder="INGRESE SU CONTRASEÑA"
                                    className="bg-transparent flex-1 outline-none font-black text-slate-950 placeholder:text-slate-300"
                                    onKeyDown={(e) => e.key === 'Enter' && handleApprove()}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApproverKey(!showApproverKey)}
                                    className="text-slate-400 hover:text-slate-600 transition-colors px-2"
                                >
                                    {showApproverKey ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button 
                                onClick={() => { setIsConfirmModalOpen(false); setApproverKey(''); setSelectedSig(null); setShowApproverKey(false); }}
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
