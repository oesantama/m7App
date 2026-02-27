
import React from 'react';
import { Icons } from '../../constants';

interface SignatureInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (password: string) => void;
    user: any;
}

const SignatureInputModal: React.FC<SignatureInputModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    user
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[800] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95">
                <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                        <Icons.Signature className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-1">Firma Requerida</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-6 tracking-widest">Ingrese su clave personal para {user.name}</p>
                    
                    <input 
                        type="password" 
                        autoFocus
                        id="signature-modal-input-ext"
                        className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-center text-lg font-black text-slate-900 outline-none focus:border-indigo-500 mb-6"
                        placeholder="••••••"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onConfirm(e.currentTarget.value);
                            }
                        }}
                    />

                    <div className="flex gap-3 w-full">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 rounded-xl"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => {
                                const val = (document.getElementById('signature-modal-input-ext') as HTMLInputElement).value;
                                onConfirm(val);
                            }}
                            className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all"
                        >
                            Firmar Ahora
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignatureInputModal;
