import React from 'react';
import { API_URL } from '../services/api';

interface Pedido {
    id: number;
    numero_documento: string;
    cliente: string;
    direccion: string;
    municipio_destino: string;
    estado: string;
    f_ultimo_corte: string | null;
    tiene_soporte: boolean;
}

type PageState = 'loading' | 'loaded' | 'error';

const fmtFecha = (d: string | null) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const GrupoInterCumplidoPage: React.FC<{ token: string }> = ({ token }) => {
    const [state, setState] = React.useState<PageState>('loading');
    const [errorMsg, setErrorMsg] = React.useState('');
    const [placa, setPlaca] = React.useState('');
    const [ruta, setRuta] = React.useState('');
    const [expiresAt, setExpiresAt] = React.useState('');
    const [pedidos, setPedidos] = React.useState<Pedido[]>([]);
    const [openPedidoId, setOpenPedidoId] = React.useState<number | null>(null);
    const [entregado, setEntregado] = React.useState(true);
    const [observacion, setObservacion] = React.useState('');
    const [fileByPedido, setFileByPedido] = React.useState<Record<number, File | null>>({});
    const [submittingId, setSubmittingId] = React.useState<number | null>(null);

    const load = React.useCallback(() => {
        fetch(`${API_URL}/grupo-inter/public/cumplido/${token}`)
            .then(r => r.json())
            .then(data => {
                if (!data.ok) { setErrorMsg(data.mensaje || 'Enlace inválido'); setState('error'); return; }
                setPlaca(data.placa);
                setRuta(data.ruta || 'Sin ruta asignada');
                setExpiresAt(data.expiresAt);
                setPedidos(data.pedidos);
                setState('loaded');
            })
            .catch(() => { setErrorMsg('No se pudo cargar el enlace. Verifique su conexión.'); setState('error'); });
    }, [token]);

    React.useEffect(() => { load(); }, [load]);

    const openForm = (pedidoId: number) => {
        setOpenPedidoId(pedidoId);
        setEntregado(true);
        setObservacion('');
        setFileByPedido(prev => ({ ...prev, [pedidoId]: null }));
    };

    const handleSubmit = async (pedidoId: number) => {
        const file = fileByPedido[pedidoId];
        if (!file) { alert('Selecciona o toma una foto del cumplido antes de enviar.'); return; }
        if (!entregado && !observacion.trim()) { alert('Indica el motivo por el cual no se pudo entregar.'); return; }

        setSubmittingId(pedidoId);
        try {
            const formData = new FormData();
            formData.append('entregado', String(entregado));
            if (file) formData.append('foto', file);
            if (observacion.trim()) formData.append('observacion', observacion.trim());

            const res = await fetch(`${API_URL}/grupo-inter/public/cumplido/${token}/${pedidoId}`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!data.ok) { alert(data.mensaje || 'Error al registrar la entrega'); setSubmittingId(null); return; }

            const nuevoEstado = entregado ? 'Entregado' : 'No Entregado';
            setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, estado: nuevoEstado, tiene_soporte: p.tiene_soporte || !!file } : p));
            setOpenPedidoId(null);
            setObservacion('');
            setFileByPedido(prev => ({ ...prev, [pedidoId]: null }));
        } catch {
            alert('Error de conexión al enviar la información.');
        } finally {
            setSubmittingId(null);
        }
    };

    if (state === 'loading') return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-500 text-sm font-medium">Cargando facturas de la ruta…</p>
            </div>
        </div>
    );

    if (state === 'error') return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">⚠️</span>
                </div>
                <h2 className="text-lg font-black text-slate-800 mb-2">Enlace no válido</h2>
                <p className="text-slate-500 text-sm">{errorMsg}</p>
                <p className="text-[10px] text-slate-400 mt-4">Si necesita ayuda contacte a Milla 7 — 3011825161</p>
            </div>
        </div>
    );

    const pendientes = pedidos.filter(p => p.estado !== 'Entregado' && p.estado !== 'No Entregado');
    const entregados = pedidos.filter(p => p.estado === 'Entregado');
    const noEntregados = pedidos.filter(p => p.estado === 'No Entregado');

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-6">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Milla 7 S.A.S. — OrbitM7</p>
                    <h1 className="text-white font-black text-xl mb-1">Cumplidos de Ruta — Grupo Inter</h1>
                    <p className="text-slate-400 text-xs">Placa <strong className="text-white font-mono">{placa}</strong> · Ruta <strong className="text-white">{ruta}</strong></p>
                    {expiresAt && (
                        <p className="text-[10px] text-amber-300 mt-1">Este enlace vence el {new Date(expiresAt).toLocaleString('es-CO', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                    )}
                    <div className="mt-3 inline-flex gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                        <span className="text-[11px] font-bold text-amber-300">{pendientes.length} pendientes</span>
                        <span className="text-[11px] font-bold text-emerald-300">{entregados.length} entregadas</span>
                        {noEntregados.length > 0 && <span className="text-[11px] font-bold text-red-300">{noEntregados.length} no entregadas</span>}
                    </div>
                </div>

                {/* Facturas */}
                <div className="space-y-3">
                    {pedidos.map(p => {
                        const isEntregado = p.estado === 'Entregado';
                        const isNoEntregado = p.estado === 'No Entregado';
                        const isResuelto = isEntregado || isNoEntregado;
                        const isOpen = openPedidoId === p.id;
                        const isSubmitting = submittingId === p.id;
                        return (
                            <div key={p.id} className={`bg-white rounded-2xl overflow-hidden shadow-sm border-2 transition-all ${isEntregado ? 'border-emerald-300' : isNoEntregado ? 'border-red-300' : 'border-transparent'}`}>
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Factura</span>
                                            <p className="font-black text-slate-800 text-sm font-mono">{p.numero_documento}</p>
                                        </div>
                                        {isEntregado && <span className="text-[10px] font-black text-emerald-600 uppercase">✓ Entregado</span>}
                                        {isNoEntregado && <span className="text-[10px] font-black text-red-500 uppercase">✗ No Entregado</span>}
                                        {!isResuelto && <span className="text-[10px] font-black text-amber-500 uppercase">Pendiente</span>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
                                        <p><span className="text-slate-400 font-bold">Cliente:</span> {p.cliente}</p>
                                        <p><span className="text-slate-400 font-bold">Fecha:</span> {fmtFecha(p.f_ultimo_corte)}</p>
                                        <p className="col-span-2"><span className="text-slate-400 font-bold">Dirección:</span> {p.direccion || '-'}, {p.municipio_destino}</p>
                                    </div>
                                </div>

                                {!isResuelto && (
                                    <div className="px-4 py-3">
                                        {!isOpen ? (
                                            <button
                                                onClick={() => openForm(p.id)}
                                                className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all"
                                            >
                                                📷 Registrar entrega
                                            </button>
                                        ) : (
                                            <div className="space-y-3">
                                                {/* Toggle Sí/No se entregó */}
                                                <div className="flex bg-slate-100 rounded-xl p-1">
                                                    <button
                                                        onClick={() => setEntregado(true)}
                                                        className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${entregado ? 'bg-emerald-500 text-white shadow' : 'text-slate-500'}`}
                                                    >
                                                        ✓ Se entregó
                                                    </button>
                                                    <button
                                                        onClick={() => setEntregado(false)}
                                                        className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${!entregado ? 'bg-red-500 text-white shadow' : 'text-slate-500'}`}
                                                    >
                                                        ✗ No se entregó
                                                    </button>
                                                </div>

                                                <input
                                                    type="file"
                                                    accept="image/*,application/pdf"
                                                    capture="environment"
                                                    onChange={(e) => setFileByPedido(prev => ({ ...prev, [p.id]: e.target.files?.[0] || null }))}
                                                    className={`w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:text-white ${entregado ? 'file:bg-emerald-500' : 'file:bg-slate-400'}`}
                                                />
                                                <p className="text-[9px] text-slate-400 -mt-2">La foto es obligatoria en ambos casos.</p>

                                                <textarea
                                                    value={observacion}
                                                    onChange={e => setObservacion(e.target.value)}
                                                    rows={2}
                                                    placeholder={entregado ? 'Observación (opcional)…' : 'Motivo por el cual no se entregó (obligatorio)…'}
                                                    className={`w-full border rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 ${entregado ? 'border-slate-200 focus:ring-emerald-400' : 'border-red-200 focus:ring-red-400'}`}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setOpenPedidoId(null)}
                                                        className="flex-1 py-2.5 border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => handleSubmit(p.id)}
                                                        disabled={isSubmitting}
                                                        className={`flex-1 py-2.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 ${entregado ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                                                    >
                                                        {isSubmitting ? 'Enviando…' : entregado ? 'Confirmar entrega' : 'Reportar no entrega'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <p className="text-center text-[9px] text-slate-500 mt-6">
                    Milla 7 S.A.S. — OrbitM7 · <a href="mailto:directorti@millasiete.com" className="text-emerald-400">directorti@millasiete.com</a> · 3011825161
                </p>
            </div>
        </div>
    );
};

export default GrupoInterCumplidoPage;
