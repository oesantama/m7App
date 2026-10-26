/**
 * Conteos de inventario pendientes de enviar al servidor (Recibido de Material).
 *
 * Cuando un guardado del conteo no llega al servidor (sin internet, sesión inválida…), su
 * último estado completo queda en la tablet con la clave `m7_pending_sync_<docId>`.
 * `syncPendingCounts` los envía en cuanto hay sesión y red: al abrir OrbitM7, al iniciar sesión
 * (cualquier usuario de esa tablet), al volver el internet y al renovar la sesión. Así lo contado
 * no depende de que alguien vuelva a abrir el documento.
 */
import { api } from '../services/api';

const PREFIX = 'm7_pending_sync_';

export interface PendingCount {
  docId: string;
  items: any[];
  notes: string;
  user: string;
  savedAt: number;
}

export function markPendingCount(p: Omit<PendingCount, 'savedAt'>): void {
  try {
    localStorage.setItem(PREFIX + p.docId, JSON.stringify({ ...p, savedAt: Date.now() }));
  } catch (err) {
    console.error('[M7-PENDING] No se pudo marcar el conteo pendiente', err);
  }
}

export function clearPendingCount(docId: string): void {
  try { localStorage.removeItem(PREFIX + docId); } catch { /* sin almacenamiento */ }
}

export function listPendingCounts(): PendingCount[] {
  const out: PendingCount[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try { out.push(JSON.parse(localStorage.getItem(k) || '')); } catch { localStorage.removeItem(k); }
    }
  } catch { /* sin almacenamiento */ }
  return out.sort((a, b) => a.savedAt - b.savedAt);
}

let enCurso = false;

/**
 * Envía todos los conteos pendientes. Un documento ya finalizado en el servidor (409) se
 * descarta: el conteo cerrado manda y no se reabre. Los demás errores se reintentan después.
 */
export async function syncPendingCounts(): Promise<{ enviados: number; descartados: number; pendientes: number }> {
  const res = { enviados: 0, descartados: 0, pendientes: 0 };
  if (enCurso || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    res.pendientes = listPendingCounts().length;
    return res;
  }
  enCurso = true;
  try {
    // El documento abierto en el conteo lo envía su propia pantalla (evita mandar una versión vieja encima)
    let abierto: string | null = null;
    try { abierto = sessionStorage.getItem('m7_counting_doc'); } catch { /* sin almacenamiento */ }
    for (const p of listPendingCounts()) {
      if (p.docId === abierto) { res.pendientes++; continue; }
      try {
        const r = await api.syncInventory({ docId: p.docId, items: p.items, user: p.user, notes: p.notes, isPartial: true });
        if (r?.success) { clearPendingCount(p.docId); res.enviados++; }
        else res.pendientes++;
      } catch (err: any) {
        if (/finalizado/i.test(String(err?.message || ''))) {
          clearPendingCount(p.docId);
          res.descartados++;
        } else {
          res.pendientes++;
        }
      }
    }
  } finally {
    enCurso = false;
  }
  return res;
}
