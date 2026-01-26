
import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';

interface LoginProps {
  onLogin: (email: string, pass: string) => Promise<boolean>;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  // Cargar credenciales guardadas al montar el componente
  useEffect(() => {
    const savedEmail = localStorage.getItem('m7_remember_email');
    const savedPass = localStorage.getItem('m7_remember_pass');
    if (savedEmail && savedPass) {
      setEmail(savedEmail);
      setPassword(savedPass);
      setRememberMe(true);
    }
    
    // Verificar bloqueo existente
    const lock = localStorage.getItem('m7_lockout');
    if (lock) {
      const lockTime = parseInt(lock);
      if (lockTime > Date.now()) {
        setLockoutUntil(lockTime);
      } else {
        localStorage.removeItem('m7_lockout');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Verificar bloqueo
    if (lockoutUntil && lockoutUntil > Date.now()) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(`SISTEMA BLOQUEADO: Reintente en ${remaining}s por seguridad.`);
      return;
    }

    setIsLoading(true);
    
    try {
      const cleanEmail = email.trim().toLowerCase();
      const success = await onLogin(cleanEmail, password);
      
      if (success === true) {
        setFailedAttempts(0);
        localStorage.removeItem('m7_lockout');
        // Si el login es exitoso y rememberMe está activo, guardar
        if (rememberMe) {
          localStorage.setItem('m7_remember_email', cleanEmail);
          localStorage.setItem('m7_remember_pass', password);
        } else {
          localStorage.removeItem('m7_remember_email');
          localStorage.removeItem('m7_remember_pass');
        }
      } else {
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);
        
        if (nextFailed >= 5) {
          const lockTime = Date.now() + 30000; // 30 segundos
          setLockoutUntil(lockTime);
          localStorage.setItem('m7_lockout', lockTime.toString());
          setError("SISTEMA BLOQUEADO: Demasiados intentos fallidos. Espere 30s.");
        } else {
          setError(`Credenciales no válidas. Intento ${nextFailed}/5.`);
        }
        setIsLoading(false);
      }
    } catch (error) {
      setError("Error de conexión. Intente nuevamente.");
      setIsLoading(false);
    }
  };

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Se ha enviado un enlace de recuperación a: ${email}`);
    setView('login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full"></div>

      <div className="w-full max-w-md p-8 relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/10 p-10 rounded-[3rem] shadow-2xl">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.3)] mb-6 transition-transform hover:scale-105 active:scale-95 cursor-pointer">
              <span className="text-4xl font-black text-slate-950">M7</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Milla Siete</h1>
            <p className="text-slate-400 font-medium text-sm mt-2 uppercase tracking-widest text-[10px]">Logística Inteligente</p>
          </div>

          {error && (
            <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 animate-in shake duration-300 ${error.includes('BLOQUEADO') ? 'bg-red-600' : 'bg-red-500/20 border border-red-500/50'}`}>
              <div className={error.includes('BLOQUEADO') ? 'text-white' : 'text-red-500'}><Icons.Alert /></div>
              <p className={`text-xs font-black uppercase tracking-tight ${error.includes('BLOQUEADO') ? 'text-white' : 'text-red-200'}`}>{error}</p>
            </div>
          )}

          {view === 'login' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                    <Icons.Users />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@millasiete.com"
                    className="w-full bg-slate-800/50 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Contraseña</label>
                  <button type="button" onClick={() => setView('forgot')} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors">¿Olvidaste tu contraseña?</button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                    <Icons.Scan />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-800/50 border border-white/5 rounded-2xl py-4 pl-12 pr-14 text-white placeholder:text-slate-600 focus:border-emerald-500 outline-none transition-all"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-emerald-500 transition-colors"
                  >
                    {showPassword ? <Icons.EyeOff /> : <Icons.Eye />}
                  </button>
                </div>
              </div>

              {/* Opción Guardar Usuario/Contraseña */}
              <div className="flex items-center gap-3 ml-1 group cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${rememberMe ? 'bg-emerald-500 border-emerald-500' : 'border-white/10 bg-slate-800/50 group-hover:border-emerald-500/50'}`}>
                  {rememberMe && <Icons.Check />}
                </div>
                <span className={`text-xs font-bold uppercase tracking-tight transition-colors ${rememberMe ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`}>Recordar mis credenciales</span>
              </div>

              <button
                type="submit"
                disabled={isLoading || (!!lockoutUntil && lockoutUntil > Date.now())}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black py-5 rounded-2xl shadow-[0_10px_30px_rgba(16,185,129,0.2)] transition-all flex items-center justify-center gap-3 active:scale-95 overflow-hidden"
              >
                {isLoading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                    <span>ESTABLECIENDO CONEXIÓN...</span>
                  </div>
                ) : (
                  <>
                    <span>ACCEDER AL SISTEMA</span>
                    <Icons.ChevronRight />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-6 animate-in slide-in-from-right-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Correo de Recuperación</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@millasiete.com"
                  className="w-full bg-slate-800/50 border border-white/5 rounded-2xl py-4 px-6 text-white outline-none focus:border-emerald-500 font-bold"
                />
              </div>
              <button className="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-5 rounded-2xl transition-all">
                Enviar Enlace
              </button>
              <button type="button" onClick={() => setView('login')} className="w-full text-sm font-bold text-slate-500 hover:text-white transition-colors">Volver al Login</button>
            </form>
          )}

          <div className="mt-10 pt-8 border-t border-white/5 text-center">
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Estado: Operativo 99.9%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
