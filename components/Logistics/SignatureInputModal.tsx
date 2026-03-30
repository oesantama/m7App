import React, { useRef, useEffect, useState } from 'react';
import { Icons } from '../../constants';

type SignatureRole = 'DISPATCHER' | 'DRIVER' | 'HELPER';

interface SignatureInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (password: string) => void;
    user: any;
    role?: string;
    invoice?: any;
}

const ROLE_CONFIG: Record<SignatureRole, { label: string; sublabel: string; color: string; bg: string; border: string; icon: string }> = {
    DISPATCHER: {
        label: 'AUXILIAR DE BODEGA',
        sublabel: 'Firma de entrega al transportador',
        color: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        icon: '🏭',
    },
    DRIVER: {
        label: 'CONDUCTOR',
        sublabel: 'Confirma recepción de mercancía',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: '🚛',
    },
    HELPER: {
        label: 'AUXILIAR DE ENTREGA',
        sublabel: 'Confirma participación en la entrega',
        color: 'text-violet-700',
        bg: 'bg-violet-50',
        border: 'border-violet-200',
        icon: '👤',
    },
};

const SignatureInputModal: React.FC<SignatureInputModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    user,
    role,
    invoice,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [showPwd, setShowPwd] = useState(false);

    const normalizedRole = (role as SignatureRole) || 'DRIVER';
    const config = ROLE_CONFIG[normalizedRole] || ROLE_CONFIG.DRIVER;

    useEffect(() => {
        if (isOpen) {
            setShowPwd(false);
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        const val = inputRef.current?.value || '';
        if (val) onConfirm(val);
    };

    return (
        <div className="fixed inset-0 z-[900] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full sm:max-w-sm rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-250 overflow-hidden">

                {/* Header con rol */}
                <div className={`${config.bg} ${config.border} border-b px-6 pt-7 pb-5`}>
                    <div className="flex items-start gap-4">
                        <div className="text-3xl leading-none mt-0.5">{config.icon}</div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${config.color} mb-0.5`}>
                                {config.sublabel}
                            </p>
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight">
                                {config.label}
                            </h3>
                            <p className="text-[11px] font-semibold text-slate-500 mt-1 truncate">
                                {user?.name || 'Usuario'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                        >
                            <Icons.X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Factura referenciada */}
                    {invoice && (
                        <div className="mt-4 flex items-center gap-2 bg-white/70 rounded-xl px-3 py-2 border border-white">
                            <Icons.FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wide truncate">
                                Factura {invoice.invoiceNumber || invoice.id || '—'}
                            </span>
                            {invoice.customerName && (
                                <span className="text-[10px] text-slate-400 truncate">— {invoice.customerName}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="px-6 py-6 space-y-5">
                    <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            Clave personal de acceso
                        </label>
                        <div className="relative">
                            <input
                                ref={inputRef}
                                type={showPwd ? 'text' : 'password'}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-900 focus:bg-white px-4 py-3.5 pr-11 rounded-2xl text-center text-xl font-black text-slate-900 outline-none transition-all tracking-widest placeholder:text-slate-300 placeholder:text-base placeholder:tracking-widest"
                                placeholder="• • • • • •"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                            />
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowPwd(v => !v)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                {showPwd
                                    ? <Icons.EyeOff className="w-4 h-4" />
                                    : <Icons.Eye className="w-4 h-4" />
                                }
                            </button>
                        </div>
                    </div>

                    {/* Botones */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-none px-5 py-3.5 rounded-2xl text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 border border-slate-100 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-1 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2"
                        >
                            <Icons.Signature className="w-4 h-4" />
                            Firmar Ahora
                        </button>
                    </div>

                    {/* Footer informativo */}
                    <p className="text-center text-[9px] text-slate-400 leading-relaxed">
                        Al firmar confirmas que la información es veraz y aceptas responsabilidad sobre este despacho.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SignatureInputModal;
