
import React, { useState } from 'react';
import { toast } from 'sonner';

interface ClientLoginProps {
    onLogin: (token: string, clientData: any) => void;
}

const ClientLogin: React.FC<ClientLoginProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/portal/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                onLogin(data.token, data.user);
                toast.success(`Bienvenido, ${data.user.name}`);
            } else {
                toast.error(data.error || 'Error de acceso');
            }
        } catch (err) {
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-20 p-8 bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-[2rem] shadow-2xl">
            <div className="text-center mb-10">
                <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Acceso Cliente</h2>
                <p className="text-slate-400 text-sm">Ingresa tus credenciales para gestionar tus pedidos</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Email Corporativo</label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder="ej. logistica@empresa.com"
                        required
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Contraseña</label>
                    <input 
                        type="password" 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder="••••••••"
                        required
                    />
                </div>
                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-xl uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Verificando...' : 'Ingresar al Portal'}
                </button>
            </form>
            
            <div className="mt-8 pt-8 border-t border-white/5 text-center">
                <p className="text-xs text-slate-500">
                    ¿Tienes un código de rastreo?
                    <br/>
                    <a href="#/portal/tracking" className="text-emerald-500 font-bold hover:underline mt-2 inline-block">Rastrear sin login</a>
                </p>
            </div>
        </div>
    );
};

export default ClientLogin;
