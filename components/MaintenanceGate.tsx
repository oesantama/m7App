import React, { useEffect, useState } from 'react';
import { ServerCog } from 'lucide-react';
import { API_URL } from '../services/api/client';

/**
 * Pantalla de mantenimiento (migración de servidor).
 *
 * El backend con MAINTENANCE_MODE=true responde 503 + cabecera X-M7-Maintenance a toda la API.
 * Este componente intercepta fetch una sola vez: ante esa respuesta cierra la sesión local
 * (borra los tokens) y bloquea la aplicación con el aviso, para que nadie siga trabajando
 * sobre un servidor cuyos datos ya no se van a conservar. Revisa el estado cada minuto y
 * recarga sola cuando el mantenimiento termina (o cuando el DNS ya apunta al servidor nuevo).
 */

const EVENT = 'm7-maintenance';
const TOKEN_KEYS = ['token', 'm7_token', 'm7_auth_token', 'm7_client_token', 'm7_user_session'];

let interceptorInstalled = false;
function installInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return;
  interceptorInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await originalFetch(...args);
    // La cabecera solo es legible en mismo origen (sin Expose-Headers); por eso también se mira el cuerpo.
    if (res.status === 503) {
      const porCabecera = res.headers.get('X-M7-Maintenance') === '1';
      res.clone().json()
        .then(body => {
          if (porCabecera || body?.maintenance === true) window.dispatchEvent(new CustomEvent(EVENT, { detail: body?.error }));
        })
        .catch(() => { if (porCabecera) window.dispatchEvent(new CustomEvent(EVENT)); });
    }
    return res;
  };
}
installInterceptor();

async function consultarEstado(): Promise<{ maintenance: boolean; message?: string | null } | null> {
  try {
    const res = await fetch(`${API_URL}/maintenance-status`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const MaintenanceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    const activar = (msg?: string | null) => {
      TOKEN_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch { /* sin storage */ } });
      setMensaje(msg || 'OrbitM7 se está migrando a un nuevo servidor. Intente de nuevo más tarde.');
    };
    const onEvent = (e: Event) => activar((e as CustomEvent).detail);
    window.addEventListener(EVENT, onEvent);

    consultarEstado().then(s => { if (s?.maintenance) activar(s.message); });
    return () => window.removeEventListener(EVENT, onEvent);
  }, []);

  // Mientras está en mantenimiento, revisa cada minuto si ya terminó y recarga.
  useEffect(() => {
    if (!mensaje) return;
    const id = window.setInterval(async () => {
      const s = await consultarEstado();
      if (s && !s.maintenance) window.location.reload();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [mensaje]);

  if (!mensaje) return <>{children}</>;

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10">
      <div role="alert" aria-live="assertive" className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <ServerCog size={32} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Migración en curso</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{mensaje}</p>
        <p className="mt-4 text-xs text-slate-500">
          Su sesión se cerró para proteger la información. Esta página se actualizará sola cuando el sistema esté disponible.
        </p>
        <p className="mt-6 text-xs text-slate-500">
          Soporte: directorti@millasiete.com · WhatsApp 301 182 5161
        </p>
      </div>
    </main>
  );
};

export default MaintenanceGate;
