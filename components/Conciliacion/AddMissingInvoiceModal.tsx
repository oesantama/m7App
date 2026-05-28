import React, { useState } from 'react';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface AddMissingInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    documentId: string;
    routes: any[];
    onSuccess: () => void;
}

const AddMissingInvoiceModal: React.FC<AddMissingInvoiceModalProps> = ({ isOpen, onClose, documentId, routes, onSuccess }) => {
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [valor, setValor] = useState<number | ''>('');
    const [metodoPago, setMetodoPago] = useState('EF');
    const [targetRouteId, setTargetRouteId] = useState('');
    
    // Opcionales Generales
    const [showOptionals, setShowOptionals] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [clientRef, setClientRef] = useState('');
    const [unCode, setUnCode] = useState('AJV21');
    const [city, setCity] = useState('');
    const [address, setAddress] = useState('');
    
    // Artículos (items)
    const [items, setItems] = useState([{ articleId: '', expectedQty: 1 as number | '', peso: '' as number | '', volume: '' as number | '', orderNumber: '' }]);
    
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const addItem = () => setItems([...items, { articleId: '', expectedQty: 1, peso: '', volume: '', orderNumber: '' }]);
    const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

    const updateItem = (idx: number, field: string, value: any) => {
        const newItems = [...items];
        (newItems[idx] as any)[field] = value;
        setItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!invoiceNumber || valor === '') {
            toast.error('Factura y Valor son obligatorios');
            return;
        }

        try {
            setLoading(true);
            const userStr = localStorage.getItem('user');
            const userId = userStr ? JSON.parse(userStr).id : '';

            // Clean empty items
            const cleanedItems = items.filter(it => it.articleId || it.orderNumber || (it.expectedQty && Number(it.expectedQty) > 0)).map(it => ({
                articleId: it.articleId || 'GENERICO',
                expectedQty: Number(it.expectedQty) || 1,
                peso: it.peso !== '' ? Number(it.peso) : undefined,
                volume: it.volume !== '' ? Number(it.volume) : undefined,
                orderNumber: it.orderNumber || undefined
            }));

            await api.addMissingInvoice({
                documentId,
                invoiceNumber,
                valor: Number(valor),
                metodoPago,
                targetRouteId: targetRouteId || undefined,
                userId,
                customerName: customerName || undefined,
                clientRef: clientRef || undefined,
                unCode: unCode || undefined,
                city: city || undefined,
                address: address || undefined,
                items: cleanedItems.length > 0 ? cleanedItems : undefined
            });

            toast.success('Factura adicionada correctamente');
            onSuccess();
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Error al adicionar la factura');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-700 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 shrink-0">
                    <h3 className="text-lg font-medium text-white">Adicionar Factura Faltante</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
                </div>
                
                <div className="overflow-y-auto p-5 custom-scrollbar">
                    <form id="add-invoice-form" onSubmit={handleSubmit} className="space-y-6">
                        
                        {/* CAMPOS OBLIGATORIOS */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Campos Obligatorios</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Número de Factura *</label>
                                    <input
                                        type="text"
                                        value={invoiceNumber}
                                        onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                        placeholder="Ej. AFE12345"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Valor de la Factura *</label>
                                    <input
                                        type="number"
                                        value={valor}
                                        onChange={(e) => setValor(e.target.value ? Number(e.target.value) : '')}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                        placeholder="$"
                                        min="0"
                                        required
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Condición de Pago</label>
                                    <select
                                        value={metodoPago}
                                        onChange={(e) => setMetodoPago(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="EF">Efectivo (EF)</option>
                                        <option value="CR">Crédito (CR)</option>
                                        <option value="CONSIGNACION">Consignación / Transf.</option>
                                    </select>
                                </div>
                                {routes.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Asignar a Vehículo</label>
                                        <select
                                            value={targetRouteId}
                                            onChange={(e) => setTargetRouteId(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                        >
                                            <option value="">-- Solo agregar al sistema --</option>
                                            {routes.map(r => (
                                                <option key={r.route_id} value={r.route_id}>
                                                    {r.plate} - {r.driver_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ACORDEÓN DE CAMPOS OPCIONALES */}
                        <div className="border border-slate-700 rounded-xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowOptionals(!showOptionals)}
                                className="w-full bg-slate-800/80 px-4 py-3 flex justify-between items-center text-sm font-bold text-slate-300 hover:text-white transition-colors"
                            >
                                <span>{showOptionals ? 'Ocultar' : 'Mostrar'} Detalles Adicionales y Artículos (Opcionales)</span>
                                <span className={`transform transition-transform ${showOptionals ? 'rotate-180' : ''}`}>▼</span>
                            </button>
                            
                            {showOptionals && (
                                <div className="p-4 bg-slate-800/30 space-y-6 border-t border-slate-700">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Nombre del Cliente</label>
                                            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm" placeholder="Ej. Juan Pérez" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Referencia Cliente (BANCO)</label>
                                            <input type="text" value={clientRef} onChange={(e) => setClientRef(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm" placeholder="Ej. CDT1042387" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Unidad de Negocio (UN_CODE)</label>
                                            <input type="text" value={unCode} onChange={(e) => setUnCode(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm" placeholder="Ej. AJV21" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Ciudad</label>
                                            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm" placeholder="Ej. Medellín Antioquia" />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Dirección</label>
                                            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm" placeholder="Ej. Kr 32 106 A 10" />
                                        </div>
                                    </div>
                                    
                                    <div className="border-t border-slate-700 pt-4">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Artículos de la Factura</h4>
                                            <button type="button" onClick={addItem} className="text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 px-2 py-1 rounded transition-colors">+ Agregar Artículo</button>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            {items.map((item, idx) => (
                                                <div key={idx} className="flex flex-wrap items-end gap-2 bg-slate-900/50 p-2.5 rounded-lg border border-slate-700/50">
                                                    <div className="flex-1 min-w-[120px]">
                                                        <label className="block text-[10px] text-slate-500 mb-1">SKU / Artículo</label>
                                                        <input type="text" value={item.articleId} onChange={(e) => updateItem(idx, 'articleId', e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" placeholder="SKU o Descripción" />
                                                    </div>
                                                    <div className="w-20">
                                                        <label className="block text-[10px] text-slate-500 mb-1">Cant.</label>
                                                        <input type="number" value={item.expectedQty} onChange={(e) => updateItem(idx, 'expectedQty', e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" min="1" placeholder="1" />
                                                    </div>
                                                    <div className="w-24">
                                                        <label className="block text-[10px] text-slate-500 mb-1">Peso</label>
                                                        <input type="number" step="0.01" value={item.peso} onChange={(e) => updateItem(idx, 'peso', e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" min="0" placeholder="0.00" />
                                                    </div>
                                                    <div className="w-24">
                                                        <label className="block text-[10px] text-slate-500 mb-1">Volumen</label>
                                                        <input type="number" step="0.0001" value={item.volume} onChange={(e) => updateItem(idx, 'volume', e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" min="0" placeholder="0.0000" />
                                                    </div>
                                                    <div className="flex-1 min-w-[100px]">
                                                        <label className="block text-[10px] text-slate-500 mb-1">Pedido / Orden</label>
                                                        <input type="text" value={item.orderNumber} onChange={(e) => updateItem(idx, 'orderNumber', e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" placeholder="N° Orden" />
                                                    </div>
                                                    {items.length > 1 && (
                                                        <button type="button" onClick={() => removeItem(idx)} className="h-7 w-7 flex justify-center items-center rounded bg-red-900/30 text-red-400 hover:bg-red-600 hover:text-white transition-colors" title="Quitar artículo">
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                    </form>
                </div>

                <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/50 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="add-invoice-form"
                        disabled={loading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? 'Guardando...' : 'Adicionar Factura'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddMissingInvoiceModal;
