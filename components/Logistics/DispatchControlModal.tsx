
import React from 'react';
import { Icons } from '../../constants';

interface DispatchControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: any;
    scannedItems: Record<string, number>;
    handleBarcodeScan: (barcode: string) => void;
    isAccompanied: boolean;
    setIsAccompanied: (val: boolean) => void;
    helperCount: number;
    setHelperCount: (count: number) => void;
    selectedHelpers: string[];
    setSelectedHelpers: (helpers: string[]) => void;
    allUsers: any[];
    user: any;
    drivers: any[];
    activeRoutes: any[];
    signNowMap: Record<string, boolean>;
    setSignNowMap: (map: Record<string, boolean>) => void;
    signatureKeys: Record<string, string>;
    setSignatureKeys: (map: Record<string, string>) => void;
    showPasswordMap: Record<string, boolean>;
    setShowPasswordMap: (map: Record<string, boolean>) => void;
    isValidating: boolean;
    handleConfirmDispatch: () => void;
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
    drivers,
    activeRoutes,
    signNowMap,
    setSignNowMap,
    signatureKeys,
    setSignatureKeys,
    showPasswordMap,
    setShowPasswordMap,
    isValidating,
    handleConfirmDispatch
}) => {
    if (!isOpen) return null;

    const route = activeRoutes.find((r: any) => r.id === (invoice.route_id || invoice.routeId));
    const actualDriver = drivers.find((d: any) => d.id === route?.driver_id || d.id === route?.driverId);

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

                <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-center justify-center gap-4">
                    <input 
                        id="m7-dispatch-barcode-input"
                        type="text"
                        autoFocus
                        autoComplete="off"
                        placeholder="ESCANEANDO... ESPERANDO BARCODE"
                        className="bg-transparent text-center text-sm font-mono font-black text-slate-900 outline-none w-full max-w-md"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const val = e.currentTarget.value.trim();
                                if (val) {
                                    handleBarcodeScan(val);
                                    e.currentTarget.value = '';
                                }
                            }
                        }}
                    />
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Lectora Activa</span>
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
                                        <div key={i} className={`p-4 rounded-2xl border transition-all flex justify-between items-center ${isDone ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 opacity-80'}`}>
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{item.articleName || 'Artículo'}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">SKU: {item.sku}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-xl font-black ${isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                    {scanned} / {expected}
                                                </p>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase">{item.unit || 'UND'}</p>
                                            </div>
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

                            {/* Panel de Validación de Firmas */}
                            <div className="bg-slate-900 p-6 rounded-[2rem] shadow-2xl space-y-4 border border-white/5">
                                <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                                    <Icons.Shield className="w-4 h-4" />
                                    PROTOCOLOS DE SEGURIDAD M7
                                </h4>
                                <div className="space-y-3">
                                    {/* Firma del Despachador (USUARIO ACTUAL) */}
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-lg shadow-black/20">
                                        <div className="flex justify-between items-center mb-2">
                                            <div>
                                                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">RESPONSABLE TIENDA</p>
                                                <p className="text-[11px] font-black text-white uppercase">{user.name}</p>
                                            </div>
                                            <div className="flex bg-white/10 p-1 rounded-lg">
                                                <button 
                                                    onClick={() => setSignNowMap({...signNowMap, [user.id]: true})}
                                                    className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[user.id] !== false ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20' : 'text-slate-400'}`}
                                                >AHORA</button>
                                                <button 
                                                    onClick={() => setSignNowMap({...signNowMap, [user.id]: false})}
                                                    className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[user.id] === false ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-400'}`}
                                                >DESPUÉS</button>
                                            </div>
                                        </div>
                                        {signNowMap[user.id] !== false && (
                                            <div className="relative">
                                                <input 
                                                    type={showPasswordMap[user.id] ? "text" : "password"}
                                                    placeholder="SU CLAVE DE FIRMA..."
                                                    autoComplete="new-password"
                                                    className="w-full bg-slate-950 border border-white/5 p-3 rounded-xl text-xs font-black text-emerald-400 outline-none focus:border-emerald-500/50 pr-10 shadow-inner"
                                                    onChange={(e) => setSignatureKeys({...signatureKeys, [user.id]: e.target.value})}
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={() => setShowPasswordMap({...showPasswordMap, [user.id]: !showPasswordMap[user.id]})}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                                >
                                                    {showPasswordMap[user.id] ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Firma del Conductor Real */}
                                    {actualDriver && (
                                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-lg shadow-black/20">
                                            <div className="flex justify-between items-center mb-2">
                                                <div>
                                                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">RESPONSABLE LOGÍSTICO</p>
                                                    <p className="text-[11px] font-black text-white uppercase">{actualDriver.name} (CONDUCTOR)</p>
                                                </div>
                                                <div className="flex bg-white/10 p-1 rounded-lg">
                                                    <button 
                                                        onClick={() => setSignNowMap({...signNowMap, [actualDriver.id]: true})}
                                                        className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[actualDriver.id] !== false ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20' : 'text-slate-400'}`}
                                                    >AHORA</button>
                                                    <button 
                                                        onClick={() => setSignNowMap({...signNowMap, [actualDriver.id]: false})}
                                                        className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[actualDriver.id] === false ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-400'}`}
                                                    >DESPUÉS</button>
                                                </div>
                                            </div>
                                            {signNowMap[actualDriver.id] !== false && (
                                                <div className="relative">
                                                    <input 
                                                        type={showPasswordMap[actualDriver.id] ? "text" : "password"}
                                                        placeholder="CLAVE CONDUCTOR..."
                                                        autoComplete="new-password"
                                                        className="w-full bg-slate-950 border border-white/5 p-3 rounded-xl text-xs font-black text-emerald-400 outline-none focus:border-emerald-500/50 pr-10 shadow-inner"
                                                        onChange={(e) => setSignatureKeys({...signatureKeys, [actualDriver.id]: e.target.value})}
                                                    />
                                                    <button 
                                                        type="button"
                                                        onClick={() => setShowPasswordMap({...showPasswordMap, [actualDriver.id]: !showPasswordMap[actualDriver.id]})}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                                    >
                                                        {showPasswordMap[actualDriver.id] ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Firmas de Auxiliares */}
                                    {isAccompanied && selectedHelpers.slice(0, helperCount).map((hid) => {
                                        const helper = drivers.find((d: any) => d.id === hid);
                                        if (!helper) return null;
                                        return (
                                            <div key={hid} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                                                <div className="flex justify-between items-center mb-2">
                                                    <p className="text-[9px] font-black text-white uppercase">{helper.name} (AUXILIAR)</p>
                                                    <div className="flex bg-white/10 p-1 rounded-lg">
                                                        <button 
                                                            onClick={() => setSignNowMap({...signNowMap, [hid]: true})}
                                                            className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[hid] !== false ? 'bg-emerald-500 text-slate-900' : 'text-slate-400'}`}
                                                        >AHORA</button>
                                                        <button 
                                                            onClick={() => setSignNowMap({...signNowMap, [hid]: false})}
                                                            className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[hid] === false ? 'bg-rose-500 text-white' : 'text-slate-400'}`}
                                                        >DESPUÉS</button>
                                                    </div>
                                                </div>
                                                {signNowMap[hid] !== false && (
                                                    <div className="relative">
                                                        <input 
                                                            type={showPasswordMap[hid] ? "text" : "password"}
                                                            placeholder="CLAVE DE FIRMA AUXILIAR..."
                                                            autoComplete="new-password"
                                                            className="w-full bg-white/10 border border-white/20 p-3 rounded-xl text-xs font-black text-emerald-400 outline-none focus:border-emerald-500 pr-10"
                                                            onChange={(e) => setSignatureKeys({...signatureKeys, [hid]: e.target.value})}
                                                        />
                                                        <button 
                                                            type="button"
                                                            onClick={() => setShowPasswordMap({...showPasswordMap, [hid]: !showPasswordMap[hid]})}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                                        >
                                                            {showPasswordMap[hid] ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
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
