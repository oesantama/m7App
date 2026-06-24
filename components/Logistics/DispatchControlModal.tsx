
import React, { useRef } from 'react';
import { Icons } from '../../constants';

interface DispatchControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: any;
    scannedItems: Record<string, number>;
    handleBarcodeScan: (barcode: string) => void;
    itemPickingModes: Record<string, 'UND' | 'CAJA' | 'STD'>;
    setItemPickingModes: (modes: Record<string, 'UND' | 'CAJA' | 'STD'>) => void;
    isAccompanied: boolean;
    setIsAccompanied: (val: boolean) => void;
    helperCount: number;
    setHelperCount: (count: number) => void;
    selectedHelpers: string[];
    setSelectedHelpers: (helpers: string[]) => void;
    allUsers: any[];
    user: any;
    isValidating: boolean;
    handleConfirmDispatch: () => void;
    onAddQty: (sku: string, qty: number) => void;
}

const DispatchControlModal: React.FC<DispatchControlModalProps> = ({
    isOpen,
    onClose,
    invoice,
    scannedItems,
    handleBarcodeScan,
    isAccompanied,
    setIsAccompanied,
    helperCount,
    setHelperCount,
    selectedHelpers,
    setSelectedHelpers,
    allUsers,
    user,
    isValidating,
    handleConfirmDispatch,
    onAddQty,
    itemPickingModes,
    setItemPickingModes
}) => {
    const scanDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[700] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-[95vw] max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                            <Icons.Scan className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Control de Despacho</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Validación de carga por escaneo</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 hover:bg-slate-200 rounded-full flex items-center justify-center transition-all">
                        <Icons.X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="bg-amber-50 p-4 border-b border-amber-100 flex flex-col md:flex-row items-center justify-center gap-6">
                    <div className="flex-1 flex items-center gap-4 w-full">
                        <input 
                            id="m7-dispatch-barcode-input"
                            type="text"
                            autoFocus
                            autoComplete="off"
                            placeholder="ESCANEANDO... ESPERANDO BARCODE"
                            className="bg-white border-2 border-amber-200 rounded-2xl px-6 py-3 text-center text-sm font-mono font-black text-slate-900 outline-none w-full shadow-inner focus:border-amber-400 transition-all"
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val.includes('Ñ') || val.includes(':')) {
                                    if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
                                    scanDebounceRef.current = setTimeout(() => {
                                        const finalVal = document.getElementById('m7-dispatch-barcode-input') as HTMLInputElement;
                                        if (finalVal && finalVal.value && (finalVal.value.includes('Ñ') || finalVal.value.includes(':'))) {
                                            handleBarcodeScan(finalVal.value.trim());
                                            finalVal.value = '';
                                        }
                                        scanDebounceRef.current = null;
                                    }, 180);
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    if (scanDebounceRef.current) {
                                        clearTimeout(scanDebounceRef.current);
                                        scanDebounceRef.current = null;
                                    }
                                    const val = e.currentTarget.value.trim();
                                    if (val) {
                                        handleBarcodeScan(val);
                                        e.currentTarget.value = '';
                                    }
                                }
                            }}
                        />
                        <div className="hidden md:flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Lectora Activa</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Lista de Artículos y Progreso */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-2 flex justify-between">
                                <span>Artículos a Cargar</span>
                                <span className="text-emerald-600">PROGRESO: {Object.values(scannedItems).reduce((a,b)=>a+b, 0)} / {(invoice.items || []).reduce((a: any, b: any) => a + Number(b.qty || b.expectedQty || 0), 0)}</span>
                            </h4>
                            <div className="space-y-2">
                                {(invoice.items || []).map((item: any, i: number) => {
                                    const scanned = scannedItems[item.sku] || 0;
                                    const expected = Number(item.qty || item.expectedQty || 0);
                                    const isDone = scanned >= expected;
                                    
                                    return (
                                        <div key={i} className={`p-4 rounded-3xl border transition-all flex flex-col gap-3 ${isDone ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 shadow-lg'}`}>
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <p className="text-[13px] font-black text-slate-900 leading-tight mb-1">{item.articleName || 'Artículo'}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">SKU: {item.sku}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className={`text-2xl font-black leading-none ${isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                        {scanned} <span className="text-[12px] text-slate-300">/</span> {expected}
                                                    </p>
                                                    <p className="text-[9px] font-black text-slate-500 uppercase mt-1">{item.unit || 'UND'}</p>
                                                </div>
                                            </div>

                                            {/* SELECCIÓN DE MODO DE PIQUEO (DEFINE CÓMO SUMA AL PISTOLEAR) */}
                                            {!isDone && (
                                                <div className="flex flex-row items-center gap-2 pt-3 border-t border-slate-100">
                                                    <button 
                                                        onClick={() => setItemPickingModes({...itemPickingModes, [item.sku]: 'UND'})}
                                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm flex flex-col items-center leading-none gap-1 ${(!itemPickingModes[item.sku] || itemPickingModes[item.sku] === 'UND') ? 'bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-2' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-200'}`}>
                                                        <span className="text-[11px]">x1</span>
                                                        <span className="text-[7px] opacity-70">{item.unit || 'UNIDAD'}</span>
                                                    </button>
                                                    
                                                    {Number(item.factorInter || 0) > 1 && (
                                                        <button 
                                                            onClick={() => setItemPickingModes({...itemPickingModes, [item.sku]: 'CAJA'})}
                                                            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-md flex flex-col items-center leading-none gap-1 ${itemPickingModes[item.sku] === 'CAJA' ? 'bg-indigo-600 text-white ring-2 ring-indigo-600 ring-offset-2' : 'bg-indigo-50 text-indigo-400 hover:bg-indigo-100 border border-indigo-100'}`}>
                                                            <span className="text-[11px]">x{item.factorInter}</span>
                                                            <span className="text-[7px] opacity-70">{item.uomInterName || 'CAJA'}</span>
                                                        </button>
                                                    )}

                                                    {Number(item.factorStd || 0) > 1 && Number(item.factorStd) !== Number(item.factorInter) && (
                                                        <button 
                                                            onClick={() => setItemPickingModes({...itemPickingModes, [item.sku]: 'STD'})}
                                                            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-md flex flex-col items-center leading-none gap-1 ${itemPickingModes[item.sku] === 'STD' ? 'bg-amber-500 text-white ring-2 ring-amber-500 ring-offset-2' : 'bg-amber-50 text-amber-400 hover:bg-amber-100 border border-amber-100'}`}>
                                                            <span className="text-[11px]">x{item.factorStd}</span>
                                                            <span className="text-[7px] opacity-70">{item.uomStdName || 'STD'}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Configuración de Entrega y Firmas */}
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Equipo de Entrega</h4>
                                <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <Icons.Users className="w-5 h-5 text-slate-400" />
                                        <span className="text-[10px] font-black text-slate-900 uppercase">¿Entrega Acompañada?</span>
                                    </div>
                                    <button 
                                        onClick={() => setIsAccompanied(!isAccompanied)}
                                        className={`w-12 h-6 rounded-full transition-all relative ${isAccompanied ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isAccompanied ? 'left-7' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                {isAccompanied && (
                                    <div className="space-y-4 animate-in slide-in-from-top-2">
                                        <div className="flex items-center gap-4">
                                            <p className="text-[9px] font-black text-slate-400 uppercase">Cantidad Auxiliares:</p>
                                            <div className="flex items-center gap-2">
                                                {[1, 2, 3].map(n => (
                                                    <button 
                                                        key={n}
                                                        onClick={() => setHelperCount(n)}
                                                        className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${helperCount === n ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}
                                                    >
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {Array.from({ length: helperCount }).map((_, i) => (
                                                <select 
                                                    key={i}
                                                    value={selectedHelpers[i] || ''}
                                                    onChange={(e) => {
                                                        const newHelpers = [...selectedHelpers];
                                                        newHelpers[i] = e.target.value;
                                                        setSelectedHelpers(newHelpers);
                                                    }}
                                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                                                >
                                                    <option value="">Seleccionar Auxiliar {i+1}...</option>
                                                    {allUsers.filter((u: any) => u.id !== user.id).map((u : any) => (
                                                        <option key={u.id} value={u.id}>{u.name}</option>
                                                    ))}
                                                </select>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sesión activa = garantía de despacho — sin firma adicional requerida */}
                        </div>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 bg-slate-50 flex gap-4">
                    <button 
                        className="flex-1 py-4 bg-emerald-500 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                        onClick={handleConfirmDispatch}
                        disabled={isValidating}
                    >
                        {isValidating ? (
                            <>
                                <Icons.RotateCcw className="w-4 h-4 animate-spin" />
                                PROCESANDO...
                            </>
                        ) : (
                            <>
                                <Icons.Check className="w-4 h-4" />
                                CONFIRMAR ENTREGA
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DispatchControlModal;
