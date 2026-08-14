import React from 'react';
import { User, MapPin, Truck, Clock, Filter, Package, FileText, CheckCircle, XCircle } from 'lucide-react';
import { API_URL } from '../services/api';

interface Pedido {
    numero_documento: string;
    cliente: string;
    direccion: string;
    municipio_destino: string;
    estado: string;
    placa: string;
    ruta: string;
    f_ultimo_corte: string | null;
    fecha_carge: string | null;
    fecha_viaje: string | null;
    fecha_entregado: string | null;
    numero_guia: string | null;
    numero_planilla: string | null;
    clasificacion: string | null;
    cantidad_total: number | null;
    peso_total_prod: number | null;
    tiene_soporte: boolean;
}

interface HistoricoItem {
    estado: string;
    observacion: string;
    fecha: string;
    usuario: string;
}

interface NovedadItem {
    observacion: string;
    fecha: string;
    usuario: string;
}

interface ItemRow {
    producto: string;
    tipo_articulo: string;
    cantidad: number;
    peso: number;
}

type PageState = 'loading' | 'loaded' | 'error';

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const fmtHora = (d: string | null) => d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const DetailItem: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-start gap-3">
        <div className="mt-1 text-blue-500">{icon}</div>
        <div className="flex flex-col">
            <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">{label}</span>
            <span className="font-bold text-slate-900 text-sm leading-tight">{value || '-'}</span>
        </div>
    </div>
);

const GrupoInterSeguimientoPage: React.FC<{ numeroDocumento: string; token: string }> = ({ numeroDocumento, token }) => {
    const [state, setState] = React.useState<PageState>('loading');
    const [errorMsg, setErrorMsg] = React.useState('');
    const [pedido, setPedido] = React.useState<Pedido | null>(null);
    const [soporteUrl, setSoporteUrl] = React.useState<string | null>(null);
    const [items, setItems] = React.useState<ItemRow[]>([]);
    const [historico, setHistorico] = React.useState<HistoricoItem[]>([]);
    const [novedades, setNovedades] = React.useState<NovedadItem[]>([]);

    React.useEffect(() => {
        fetch(`${API_URL}/grupo-inter/public/seguimiento/${encodeURIComponent(numeroDocumento)}?token=${token}`)
            .then(r => r.json())
            .then(data => {
                if (!data.ok) { setErrorMsg(data.mensaje || 'No se pudo consultar la factura'); setState('error'); return; }
                setPedido(data.pedido);
                setSoporteUrl(data.soporteUrl);
                setItems(data.items || []);
                setHistorico(data.historico || []);
                setNovedades(data.novedades || []);
                setState('loaded');
            })
            .catch(() => { setErrorMsg('No se pudo cargar la información. Verifique su conexión.'); setState('error'); });
    }, [numeroDocumento, token]);

    if (state === 'loading') return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-500 text-sm font-medium">Consultando factura…</p>
            </div>
        </div>
    );

    if (state === 'error' || !pedido) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">⚠️</span>
                </div>
                <h2 className="text-lg font-black text-slate-800 mb-2">No disponible</h2>
                <p className="text-slate-500 text-sm">{errorMsg}</p>
                <p className="text-[10px] text-slate-400 mt-4">Si necesita ayuda contacte a Milla 7 — 3011825161</p>
            </div>
        </div>
    );

    const isEntregado = pedido.estado === 'Entregado';
    const isNoEntregado = pedido.estado === 'No Entregado';

    return (
        <div className="min-h-screen bg-slate-50 py-8 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-6">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Milla 7 S.A.S. — OrbitM7</p>
                    <h1 className="text-slate-900 font-black text-2xl mb-1">Seguimiento de Factura</h1>
                    <p className="text-slate-500 text-sm font-mono">{pedido.numero_documento}</p>
                </div>

                {/* Estado */}
                <div className={`rounded-2xl p-5 mb-6 text-center border ${
                    isEntregado ? 'bg-emerald-50 border-emerald-200' : isNoEntregado ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}>
                    <p className={`font-black text-lg flex items-center justify-center gap-2 ${
                        isEntregado ? 'text-emerald-700' : isNoEntregado ? 'text-red-700' : 'text-amber-700'
                    }`}>
                        {isEntregado ? <><CheckCircle size={22}/> Entregado</> : isNoEntregado ? <><XCircle size={22}/> No Entregado</> : <><Package size={22}/> {pedido.estado || 'En proceso'}</>}
                    </p>
                    {pedido.fecha_entregado && <p className="text-xs text-slate-500 mt-1">{isEntregado ? 'Entregado' : 'Actualizado'} el {fmtHora(pedido.fecha_entregado)}</p>}
                </div>

                {/* Cards estilo detalle interno — sin ningún dato financiero */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col gap-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cliente &amp; Destino</h4>
                        <DetailItem icon={<User size={14}/>} label="Cliente" value={pedido.cliente} />
                        <DetailItem icon={<MapPin size={14}/>} label="Dirección" value={pedido.direccion} />
                        <DetailItem icon={<MapPin size={14}/>} label="Ciudad" value={pedido.municipio_destino} />
                    </div>

                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col gap-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Logística Operativa</h4>
                        <DetailItem icon={<Truck size={14}/>} label="Placa" value={pedido.placa} />
                        <DetailItem icon={<MapPin size={14}/>} label="Ruta" value={pedido.ruta || ''} />
                        <DetailItem icon={<Clock size={14}/>} label="Fecha Viaje" value={fmt(pedido.fecha_viaje)} />
                        <DetailItem icon={<Clock size={14}/>} label="Fecha Factura" value={fmt(pedido.f_ultimo_corte)} />
                        <DetailItem icon={<Filter size={14}/>} label="Clasificación" value={pedido.clasificacion || ''} />
                        <DetailItem icon={<Package size={14}/>} label="Manifiesto" value={pedido.numero_guia || ''} />
                    </div>

                    <div className="bg-slate-900 rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
                        <h4 className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Resumen</h4>
                        <div className="flex items-start gap-3">
                            <div className="mt-1 text-emerald-400"><Package size={14}/></div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase font-black tracking-widest text-white/50">Cantidad Total</span>
                                <span className="font-bold text-white text-sm">{pedido.cantidad_total ?? 0}</span>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="mt-1 text-emerald-400"><Package size={14}/></div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase font-black tracking-widest text-white/50">Peso Total</span>
                                <span className="font-bold text-white text-sm">{pedido.peso_total_prod ?? 0} Kg</span>
                            </div>
                        </div>
                        {soporteUrl && (
                            <a
                                href={soporteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all"
                            >
                                <FileText size={14}/> Ver Soporte de Entrega
                            </a>
                        )}
                    </div>
                </div>

                {/* Items */}
                {items.length > 0 && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6 overflow-x-auto">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Productos</h3>
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                    <th className="pb-2 pr-4">Producto</th>
                                    <th className="pb-2 pr-4">Tipo</th>
                                    <th className="pb-2 pr-4 text-right">Cantidad</th>
                                    <th className="pb-2 text-right">Peso</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((it, i) => (
                                    <tr key={i} className="border-b last:border-0 border-slate-50">
                                        <td className="py-2 pr-4 font-bold text-slate-800">{it.producto || '-'}</td>
                                        <td className="py-2 pr-4 text-slate-500">{it.tipo_articulo || '-'}</td>
                                        <td className="py-2 pr-4 text-right font-bold text-slate-800">{it.cantidad}</td>
                                        <td className="py-2 text-right text-slate-500">{it.peso} Kg</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Novedades */}
                {novedades.length > 0 && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Novedades</h3>
                        <div className="space-y-3">
                            {novedades.map((n, i) => (
                                <div key={i} className="pb-3 border-b last:border-0 border-slate-50">
                                    <p className="text-sm text-slate-700">{n.observacion}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtHora(n.fecha)} · {n.usuario}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Histórico / Trazabilidad */}
                {historico.length > 0 && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Trazabilidad</h3>
                        <div className="space-y-3">
                            {historico.map((h, i) => (
                                <div key={i} className="flex gap-3 pb-3 border-b last:border-0 border-slate-50">
                                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${h.estado === 'No Entregado' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800">{h.estado}</p>
                                        {h.observacion && <p className="text-xs text-slate-500">{h.observacion}</p>}
                                        <p className="text-[10px] text-slate-400 mt-0.5">{fmtHora(h.fecha)} · {h.usuario}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <p className="text-center text-[9px] text-slate-400 mt-6">
                    Milla 7 S.A.S. — OrbitM7 · <a href="mailto:directorti@millasiete.com" className="text-emerald-600">directorti@millasiete.com</a> · 3011825161
                </p>
            </div>
        </div>
    );
};

export default GrupoInterSeguimientoPage;
