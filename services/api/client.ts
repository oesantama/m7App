/// <reference types="vite/client" />

const isDev = import.meta.env.DEV;
export const API_URL = import.meta.env.VITE_API_URL || (isDev ? 'http://localhost:8080/api' : '/api');

export const getStoredToken = (): string => {
  const sessionStr = localStorage.getItem('m7_user_session');
  let token = localStorage.getItem('token') ||
    localStorage.getItem('m7_token') ||
    localStorage.getItem('m7_auth_token') ||
    localStorage.getItem('m7_client_token');

  if (!token && sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      token = session.token || session.accessToken || session.auth_token;
    } catch (e) { }
  }
  return token || '';
};

export const fetchJson = async (url: string, options?: any) => {
  const executeFetch = async (retryCount = 0): Promise<any> => {
    // Búsqueda exhaustiva del token en múltiples llaves
    const token = getStoredToken();

    if (!token && import.meta.env.DEV) {
      console.error('[API-TOKEN-DIAGNOSTIC] ❌ Token no encontrado. Contenido de localStorage:');
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) console.log(`   - ${key}: ${localStorage.getItem(key)?.substring(0, 20)}...`);
      }
    }

    const customHeaders: any = { ...options?.headers };
    if (token) {
      if (import.meta.env.DEV) {
        console.log('%c [API-AUTH-DIAGNOSTIC] 🔑 TOKEN ENCONTRADO', 'background: #059669; color: white; padding: 4px; border-radius: 4px;');
        console.table({ token_preview: token.substring(0, 30) + '...', length: token.length });
      }
      localStorage.setItem('token', token);
      customHeaders['Authorization'] = `Bearer ${token.trim()}`;
    } else if (import.meta.env.DEV) {
      console.error('%c [API-AUTH-DIAGNOSTIC] ❌ NO HAY TOKEN DISPONIBLE EN LOCALSTORAGE', 'background: #dc2626; color: white; padding: 4px; border-radius: 4px;');
    }

    // DETECCIÓN CRÍTICA: Si el body es FormData, NO debemos poner application/json
    // El navegador necesita poner multipart/form-data con el boundary correcto
    const isFormData = options?.body instanceof FormData;

    const fetchOptions = {
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...customHeaders
      },
      cache: 'no-cache' as RequestCache
    };

    if (import.meta.env.DEV) {
      console.log(`[API-DEBUG] Petición: ${options?.method || 'GET'} ${url}`);
      console.log(`[API-DEBUG] Headers Finales:`, fetchOptions.headers);
    }

    // Sin esto, una conexión colgada (celular con mala señal, servidor sin responder)
    // dejaba el fetch esperando indefinidamente — la pantalla quedaba en "Cargando..."
    // para siempre, sin error ni forma de reintentar.
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 40_000);

    try {
      const res = await fetch(url, { ...fetchOptions, signal: options?.signal || timeoutController.signal });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json().catch(() => ({})) : await res.text();

      if (res.status === 401) {
        console.warn('[ORBIT-AUTH] 401 detectado. Caducidad o token inválido.');
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('orbit-auth-failed', {
          detail: { message: data?.error || 'Su sesión ha caducado por seguridad.' }
        }));
      }

      if (res.status === 431) {
        console.warn('[ORBIT-AUTH] 431 — token demasiado grande. Forzando re-login.');
        localStorage.removeItem('token');
        localStorage.removeItem('m7_user_session');
        window.dispatchEvent(new CustomEvent('orbit-auth-failed', {
          detail: { message: 'Sesión inválida. Por favor inicie sesión nuevamente.' }
        }));
      }

      if (!res.ok) {
        const msg = typeof data === 'object'
          ? (data.error || data.message || `Error HTTP: ${res.status}`)
          : (data || `Error HTTP: ${res.status}`);
        const detail = typeof data === 'object' && data.details ? ` — ${data.details}` : '';
        throw new Error(`${msg}${detail}`);
      }

      return data;
    } catch (err: any) {
      // Reintento en caso de error de red (TypeError) o de tiempo agotado (AbortError) —
      // cubre el caso típico de señal mala en celular, no solo servidor caído.
      const isTimeout = err?.name === 'AbortError';
      if ((err instanceof TypeError || isTimeout) && retryCount < 1) {
        return executeFetch(retryCount + 1);
      }
      if (isTimeout) {
        throw new Error('La solicitud tardó demasiado en responder. Verifica tu conexión e intenta de nuevo.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return executeFetch();
};

// Fetch sin token — para rutas públicas (cap/public, etc.)
export const fetchPublic = async (url: string, options?: any) => {
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
    cache: 'no-cache' as RequestCache,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'object' ? (data.error || data.message || `Error ${res.status}`) : String(data);
    const err: any = new Error(msg);
    if (typeof data === 'object' && data.codigo) err.codigo = data.codigo;
    throw err;
  }
  return data;
};
