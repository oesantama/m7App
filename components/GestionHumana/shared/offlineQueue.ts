/**
 * Cola offline del mensajero (IndexedDB).
 *
 * Cuando no hay señal, la acción (recoger/entregar/incidencia) se guarda completa en el
 * teléfono —campos, firma y foto como Blobs— y se envía al recuperar conexión.
 * Cada acción lleva un `client_uuid`: si el envío llega dos veces al servidor (p. ej. se
 * cortó la red justo después de guardar), el backend responde "duplicado" sin repetirla.
 * Las acciones se envían en el orden en que se capturaron (recoger antes que entregar).
 */
import { AccionMensajero, AccionRechazadaError, enviarAccionMensajero } from '../../../services/api/ghOperaciones.api';

export interface AccionPendiente {
  uuid: string;
  envioId: number;
  tracking: string;
  accion: AccionMensajero;
  campos: Record<string, string>;
  firma?: Blob | null;
  foto?: Blob | null;
  creadoEn: number;
  /** Mensaje del servidor si la rechazó por validación: no se reintenta, el mensajero decide. */
  error?: string;
}

const DB_NAME = 'm7-mensajeria';
const STORE = 'acciones';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'uuid' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

export const colaOffline = {
  async listar(): Promise<AccionPendiente[]> {
    try {
      const all = await tx<AccionPendiente[]>('readonly', s => s.getAll() as IDBRequest<AccionPendiente[]>);
      return all.sort((a, b) => a.creadoEn - b.creadoEn);
    } catch {
      return [];
    }
  },
  guardar: (a: AccionPendiente) => tx('readwrite', s => s.put(a)),
  eliminar: (uuid: string) => tx('readwrite', s => s.delete(uuid)),
};

export function nuevoUuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback para contextos sin randomUUID (http en red local)
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b).map((x: number) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let sincronizando = false;

/**
 * Envía las acciones pendientes en orden. Se detiene en el primer fallo de red (sigue sin
 * conexión). Un rechazo del servidor queda marcado con `error` y se continúa con la siguiente.
 */
export async function sincronizarCola(): Promise<{ enviadas: number; rechazadas: number; pendientes: number }> {
  if (sincronizando) return { enviadas: 0, rechazadas: 0, pendientes: (await colaOffline.listar()).length };
  sincronizando = true;
  let enviadas = 0, rechazadas = 0;
  try {
    for (const a of await colaOffline.listar()) {
      if (a.error) continue;
      try {
        await enviarAccionMensajero(a.envioId, a.accion, { ...a.campos, client_uuid: a.uuid }, a.firma, a.foto);
        await colaOffline.eliminar(a.uuid);
        enviadas++;
      } catch (e: any) {
        if (e instanceof AccionRechazadaError) {
          await colaOffline.guardar({ ...a, error: e.message });
          rechazadas++;
        } else {
          break;
        }
      }
    }
  } finally {
    sincronizando = false;
  }
  return { enviadas, rechazadas, pendientes: (await colaOffline.listar()).length };
}
