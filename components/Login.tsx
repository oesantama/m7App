import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const isDemo = import.meta.env.VITE_APP_DEMO_MODE === 'true';
  const savedEmail = localStorage.getItem('m7_remember_email');
  const savedPass = localStorage.getItem('m7_remember_pass');

  const [email, setEmail] = useState(() => {
    if (savedEmail) return savedEmail;
    if (isDemo) return import.meta.env.VITE_APP_DEMO_EMAIL || '';
    return '';
  });

  const [password, setPassword] = useState(() => {
    if (savedPass) return savedPass;
    if (isDemo) return import.meta.env.VITE_APP_DEMO_PASSWORD || '';
    return '';
  });

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!savedEmail);
  const [view, setView] = useState<'login' | 'forgot' | '2fa'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userIdFor2FA, setUserIdFor2FA] = useState<string | null>(null);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(() => {
    return parseInt(localStorage.getItem('m7_login_attempts') || '0');
  });
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  useEffect(() => {
    setError(null);
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

  const handleEmergencyRepair = async () => {
    if (!window.confirm('¿Deseas realizar una limpieza profunda del sistema? Se cerrarán todas las sesiones y se actualizarán los módulos.')) return;
    
    setIsLoading(true);
    try {
      console.log('--- INICIANDO LIMPIEZA ATÓMICA ORBIT ---');
      // 1. Limpiar Service Workers
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      // 2. Limpiar Caches de PWA
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
      // 3. Limpiar Almacenamiento
      localStorage.clear();
      sessionStorage.clear();
      
      toast.success('Sistema depurado. Recargando núcleo...');
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      setError('Falla en la autorreparación.');
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (lockoutUntil && lockoutUntil > Date.now()) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(`SISTEMA BLOQUEADO: Reintente en ${remaining}s por seguridad.`);
      return;
    }

    setIsLoading(true);
    
    try {
      const result = await onLogin(email, password);
      
      if (result.success) {
        if (rememberMe) {
          localStorage.setItem('m7_remember_email', email.trim().toLowerCase());
          localStorage.setItem('m7_remember_pass', password);
        } else {
          localStorage.removeItem('m7_remember_email');
          localStorage.removeItem('m7_remember_pass');
        }

        setError(null);
        setFailedAttempts(0);
        localStorage.removeItem('m7_login_attempts');
        localStorage.removeItem('m7_lockout');
        
        window.location.reload();
      } else {
        const currentFailed = parseInt(localStorage.getItem('m7_login_attempts') || '0');
        const nextFailed = currentFailed + 1;
        setFailedAttempts(nextFailed);
        localStorage.setItem('m7_login_attempts', nextFailed.toString());
        
        if (nextFailed >= 5) {
          const lockTime = Date.now() + 30000;
          setLockoutUntil(lockTime);
          localStorage.setItem('m7_lockout', lockTime.toString());
          setError("SISTEMA BLOQUEADO: Demasiados intentos fallidos. Espere 30s.");
        } else {
          setError(result.error || `Credenciales no válidas. Intento ${nextFailed}/5.`);
        }
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Error de conexión. Intente nuevamente.");
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      // Simulación de búsqueda en el CORE M7
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const demoEmail = import.meta.env.VITE_APP_DEMO_EMAIL || 'admin@millasiete.com';
      if (email.toLowerCase() !== demoEmail.toLowerCase()) {
          setError("ORBIT SECURITY: El correo ingresado no se encuentra en nuestra base de datos.");
          setIsLoading(false);
          return;
      }

      setForgotSuccess(true);
      setError(null);
    } catch (err) {
      setError("Falla crítica en el servicio de recuperación.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden px-4">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full"></div>

      <div className="w-full max-w-sm p-4 relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 mb-4 transition-transform hover:scale-105 active:scale-95 cursor-pointer relative group">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl group-hover:bg-emerald-500/30 transition-all"></div>
              <img 
                src="/assets/brand/orbitm7_logo.png" 
                alt="OrbitM7 Logo" 
                className="w-full h-full object-contain relative z-10"
              />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tighter uppercase leading-none">ORBITM7</h1>
            <p className="text-emerald-500 font-bold text-[8px] uppercase tracking-[0.5em] mt-3">Logística Circular</p>
          </div>

          {error && (
            <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 animate-in shake duration-300 ${error.includes('BLOQUEADO') ? 'bg-red-600' : 'bg-red-500/10 border border-red-500/20'}`}>
              <div className={error.includes('BLOQUEADO') ? 'text-white' : 'text-red-500'}><Icons.Alert /></div>
              <p className={`text-[10px] font-black uppercase tracking-tight ${error.includes('BLOQUEADO') ? 'text-white' : 'text-red-400'}`}>{error}</p>
            </div>
          )}

          {view === 'login' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">
                  Usuario / Documento / Teléfono
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-500 transition-colors">
                    <Icons.Users />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email, Documento o Teléfono"
                    className="w-full bg-slate-800/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold text-sm sm:text-base"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1 mb-1">
                  <label htmlFor="password" className="block text-xs font-black text-slate-400 uppercase tracking-widest">
                    Contraseña
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setView('forgot')} 
                    className="text-[10px] font-black uppercase tracking-tight text-emerald-400 hover:text-emerald-300 transition-colors focus:outline-none focus:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-500 transition-colors">
                    <Icons.Scan />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-800/40 border border-white/10 rounded-2xl py-4 pl-12 pr-14 text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold text-sm sm:text-base"
                    autoComplete="current-password"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-emerald-500 transition-colors min-w-[44px] justify-center"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <Icons.EyeOff /> : <Icons.Eye />}
                  </button>
                </div>
              </div>

              <div 
                className="flex items-center gap-3 ml-1 group cursor-pointer select-none" 
                onClick={() => setRememberMe(!rememberMe)}
                role="checkbox"
                aria-checked={rememberMe}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setRememberMe(!rememberMe); } }}
              >
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${rememberMe ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'border-white/10 bg-slate-800/50 group-hover:border-emerald-500/50 group-focus:ring-2 group-focus:ring-emerald-500/20'}`}>
                  {rememberMe && <Icons.Check />}
                </div>
                <span className={`text-[11px] font-black uppercase tracking-tight transition-colors ${rememberMe ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  Recordar mis credenciales
                </span>
              </div>

              <button
                type="submit"
                disabled={isLoading || (!!lockoutUntil && lockoutUntil > Date.now())}
                className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black py-5 rounded-2xl shadow-[0_10px_30px_rgba(16,185,129,0.2)] transition-all flex items-center justify-center gap-3 focus:ring-4 focus:ring-emerald-500/20 outline-none min-h-[56px]"
              >
                {isLoading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-4 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs uppercase tracking-widest">Estableciendo Conexión...</span>
                  </div>
                ) : (
                  <>
                    <span className="tracking-tight uppercase">Acceder al Sistema</span>
                    <Icons.ChevronRight />
                  </>
                )}
              </button>
            </form>
          ) : view === '2fa' ? (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsLoading(true);
              try {
                const res = await fetch('/api/2fa/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: userIdFor2FA, token: twoFactorToken })
                });
                const data = await res.json();
                if (data.success) {
                  if (rememberMe) {
                    localStorage.setItem('m7_remember_email', email.trim().toLowerCase());
                    localStorage.setItem('m7_remember_pass', password);
                  }
                  window.location.reload();
                } else {
                  setError("Código 2FA incorrecto");
                  setIsLoading(false);
                }
              } catch (err) {
                setError("Error de conexión con el núcleo M7");
                setIsLoading(false);
              }
            }} className="space-y-8 animate-in slide-in-from-right-4">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl mx-auto flex items-center justify-center mb-4">
                   <div style={{ width: '2rem' }}><Icons.Shield /></div>
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Verificación 2FA</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Ingrese el código de su aplicación</p>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                  placeholder="000 000"
                  className="w-full bg-slate-800/50 border border-white/5 rounded-3xl py-6 text-center text-4xl font-black text-emerald-400 tracking-[0.5em] outline-none focus:border-emerald-500 transition-all placeholder:text-slate-700"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || twoFactorToken.length !== 6}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black py-5 rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                {isLoading ? "VERIFICANDO..." : "CONFIRMAR ACCESO"}
              </button>

              <button type="button" onClick={() => setView('login')} className="w-full text-sm font-bold text-slate-500 hover:text-white transition-colors">Volver al Inicio</button>
            </form>
          ) : (
            <div className="animate-in slide-in-from-right-4">
              {forgotSuccess ? (
                <div className="text-center space-y-6">
                  <div className="w-20 h-20 bg-blue-500/20 text-blue-400 rounded-full mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                    <Icons.Check />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight mb-2">Correo Enviado</h3>
                    <p className="text-slate-400 text-[11px] font-semibold leading-relaxed">
                      Si el correo <span className="text-white">{email}</span> está registrado, recibirás un enlace para restablecer tu contraseña en unos minutos.
                    </p>
                  </div>
                  <button 
                    onClick={() => { setView('login'); setForgotSuccess(false); }}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-4 rounded-2xl transition-all uppercase text-xs tracking-widest"
                  >
                    Volver al Inicio
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="recovery-email" className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">
                      Correo de Recuperación
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-500 transition-colors">
                        <Icons.Users />
                      </div>
                      <input
                        id="recovery-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        className="w-full bg-slate-800/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-5 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <span>ENVIAR ENLACE</span>
                        <Icons.ChevronRight />
                      </>
                    )}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setView('login')} 
                    className="w-full text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors py-2"
                  >
                    Cancelar y Volver
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="mt-10 pt-8 border-t border-white/5 text-center group cursor-help">
            <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2 group-hover:text-emerald-500 transition-colors">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
              Estado: Operativo 99.9%
            </p>
            <div className="mt-2 space-y-1">
              <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest">
                OrbitM7 es propiedad de Milla 7
              </p>
              <p className="text-[7px] text-slate-600 font-bold uppercase">
                Arquitectura y Desarrollo por Oscar Santamaría
              </p>
            </div>
            <button 
              onClick={handleEmergencyRepair}
              className="mt-4 text-[7px] text-slate-700 hover:text-emerald-500 font-black uppercase tracking-[0.2em] transition-all border border-transparent hover:border-emerald-500/20 px-4 py-2 rounded-full"
            >
              ¿Problemas de conexión? Reparar Núcleo
            </button>
            <p className="text-[7px] text-slate-800 font-bold uppercase mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              © {new Date().getFullYear()} OrbitM7 Logistics Systems
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
