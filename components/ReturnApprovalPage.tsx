import React from 'react';
import { API_URL } from '../services/api';

interface BatchItem {
    id: number;
    invoice_id: string;
    return_reason: string;
    return_type: string;
    approved: boolean | null;
    approval_notes: string | null;
    approved_at: string | null;
    approved_by_name: string | null;
    vehicle_plate: string | null;
    driver_name: string | null;
    items: { sku: string; article_name: string; quantity_returned: number; unit: string }[];
}

interface Batch {
    id: number;
    batch_code: string;
    status: string;
    notes: string | null;
    created_at: string;
    confirmed_at: string | null;
    confirmed_by_name: string | null;
    email_proveedor: string | null;
}

type PageState = 'loading' | 'loaded' | 'submitting' | 'done' | 'error';

const ReturnApprovalPage: React.FC<{ batchCode: string; token: string }> = ({ batchCode, token }) => {
    const [state, setState]       = React.useState<PageState>('loading');
    const [batch, setBatch]       = React.useState<Batch | null>(null);
    const [items, setItems]       = React.useState<BatchItem[]>([]);
    const [errorMsg, setErrorMsg] = React.useState('');
    const [nombre, setNombre]     = React.useState('');
    const [obs, setObs]           = React.useState('');
    const [decisions, setDecisions] = React.useState<Record<number, { approved: boolean; notes: string }>>({});

    React.useEffect(() => {
        fetch(`${API_URL}/dispatch/public/return-approval/${encodeURIComponent(batchCode)}/${token}`)
            .then(r => r.json())
            .then(data => {
                if (!data.success) { setErrorMsg(data.error || 'Enlace inválido'); setState('error'); return; }
                setBatch(data.batch);
                setItems(data.items);
                // Pre-cargar decisiones ya guardadas
                const pre: Record<number, { approved: boolean; notes: string }> = {};
                data.items.forEach((it: BatchItem) => {
                    if (it.approved !== null) pre[it.id] = { approved: it.approved, notes: it.approval_notes || '' };
                });
                setDecisions(pre);
                setState('loaded');
            })
            .catch(() => { setErrorMsg('No se pudo cargar el lote. Verifique su conexión.'); setState('error'); });
    }, [batchCode, token]);

    const setDecision = (id: number, approved: boolean) => {
        setDecisions(prev => ({ ...prev, [id]: { approved, notes: prev[id]?.notes || '' } }));
    };

    const setNote = (id: number, notes: string) => {
        setDecisions(prev => ({ ...prev, [id]: { ...prev[id], notes } }));
    };

    const handleSubmit = async () => {
        if (!nombre.trim()) { alert('Por favor ingresa tu nombre para confirmar.'); return; }
        const unanswered = items.filter(it => decisions[it.id] === undefined);
        if (unanswered.length > 0) {
            alert(`Faltan ${unanswered.length} factura(s) por aprobar o rechazar.`);
            return;
        }
        setState('submitting');
        try {
            const payload = {
                nombre_confirmador: nombre.trim(),
                observaciones_generales: obs.trim(),
                items: items.map(it => ({
                    id: it.id,
                    approved: decisions[it.id]?.approved ?? false,
                    approval_notes: decisions[it.id]?.notes || '',
                })),
            };
            const res = await fetch(
                `${API_URL}/dispatch/public/return-approval/${encodeURIComponent(batchCode)}/${token}/confirm`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
            );
            const data = await res.json();
            if (!data.success) { setErrorMsg(data.error || 'Error al confirmar'); setState('error'); return; }
            setState('done');
        } catch {
            setErrorMsg('Error de conexión al enviar la confirmación.');
            setState('error');
        }
    };

    if (state === 'loading') return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-500 text-sm font-medium">Cargando lote de devoluciones…</p>
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

    if (state === 'done') return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">✅</span>
                </div>
                <h2 className="text-xl font-black text-emerald-700 mb-2">¡Confirmación Enviada!</h2>
                <p className="text-slate-500 text-sm">Gracias <strong>{nombre}</strong>. Hemos registrado su confirmación del lote <strong className="font-mono text-slate-700">{batchCode}</strong>.</p>
                <p className="text-[10px] text-slate-400 mt-4">Milla 7 S.A.S. — OrbitM7 · soporte: 3011825161</p>
            </div>
        </div>
    );

    const alreadyConfirmed = batch?.confirmed_at;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-6">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Milla 7 S.A.S. — OrbitM7</p>
                    <h1 className="text-white font-black text-xl mb-1">Aprobación de Devoluciones</h1>
                    <p className="text-slate-400 text-xs font-mono">{batchCode}</p>
                    {alreadyConfirmed && (
                        <div className="mt-3 inline-block bg-emerald-500/20 border border-emerald-500/40 rounded-xl px-4 py-2">
                            <p className="text-emerald-300 text-xs font-bold">
                                ✅ Este lote ya fue confirmado por {batch?.confirmed_by_name} el {new Date(batch!.confirmed_at!).toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' })}
                            </p>
                        </div>
                    )}
                </div>

                {/* Ítems */}
                <div className="space-y-3 mb-6">
                    {items.map(it => {
                        const dec = decisions[it.id];
                        return (
                            <div key={it.id} className={`bg-white rounded-2xl overflow-hidden shadow-sm border-2 transition-all ${
                                dec?.approved === true ? 'border-emerald-400' : dec?.approved === false ? 'border-red-300' : 'border-transparent'
                            }`}>
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Factura</span>
                                        <p className="font-black text-slate-800 text-sm font-mono">{it.invoice_id}</p>
                                    </div>
                                    <div className="text-right">
                                        {it.vehicle_plate && <p className="text-[10px] text-slate-500">🚛 {it.vehicle_plate}</p>}
                                        {it.return_reason && <p className="text-[9px] text-slate-400">{it.return_reason}</p>}
                                    </div>
                                </div>

                                {/* Artículos */}
                                {it.items.length > 0 && (
                                    <div className="px-4 py-2">
                                        {it.items.map((a, i) => (
                                            <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0 border-slate-50">
                                                <div>
                                                    {a.sku && <span className="text-[9px] text-slate-400 font-mono mr-1">{a.sku}</span>}
                                                    <span className="text-sm font-semibold text-slate-700">{a.article_name}</span>
                                                </div>
                                                <span className="text-sm font-black text-slate-800 ml-3 shrink-0">{a.quantity_returned} {a.unit}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Decisión */}
                                {!alreadyConfirmed && (
                                    <div className="px-4 pb-3 pt-2 bg-slate-50/50">
                                        <div className="flex gap-2 mb-2">
                                            <button
                                                onClick={() => setDecision(it.id, true)}
                                                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    dec?.approved === true
                                                        ? 'bg-emerald-500 text-white shadow'
                                                        : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
                                                }`}>
                                                ✓ Apruebo
                                            </button>
                                            <button
                                                onClick={() => setDecision(it.id, false)}
                                                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    dec?.approved === false
                                                        ? 'bg-red-500 text-white shadow'
                                                        : 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-700'
                                                }`}>
                                                ✗ No apruebo
                                            </button>
                                        </div>
                                        {dec !== undefined && (
                                            <input
                                                type="text"
                                                value={dec.notes}
                                                onChange={e => setNote(it.id, e.target.value)}
                                                placeholder="Observación (opcional)"
                                                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                            />
                                        )}
                                    </div>
                                )}
                                {alreadyConfirmed && dec !== undefined && (
                                    <div className={`px-4 py-2 text-xs font-bold ${dec.approved ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {dec.approved ? '✓ Aprobado' : '✗ No aprobado'}{dec.notes ? ` — ${dec.notes}` : ''}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Formulario de envío */}
                {!alreadyConfirmed && (
                    <div className="bg-white rounded-2xl shadow p-5 space-y-4">
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tu nombre completo *</label>
                            <input
                                type="text"
                                value={nombre}
                                onChange={e => setNombre(e.target.value)}
                                placeholder="Nombre y apellido"
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Observaciones generales (opcional)</label>
                            <textarea
                                value={obs}
                                onChange={e => setObs(e.target.value)}
                                rows={2}
                                placeholder="Comentarios adicionales sobre la devolución…"
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                        </div>
                        <div className="text-[9px] text-slate-400">
                            {Object.keys(decisions).length} de {items.length} facturas respondidas
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={state === 'submitting'}
                            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-black text-sm uppercase tracking-widest rounded-xl shadow-lg transition-all">
                            {state === 'submitting' ? 'Enviando confirmación…' : 'Confirmar Recibo de Devoluciones'}
                        </button>
                    </div>
                )}

                <p className="text-center text-[9px] text-slate-500 mt-6">
                    Milla 7 S.A.S. — OrbitM7 · <a href="mailto:directorti@millasiete.com" className="text-emerald-400">directorti@millasiete.com</a> · 3011825161
                </p>
            </div>
        </div>
    );
};

export default ReturnApprovalPage;
