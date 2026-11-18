import { useEffect, useState } from 'react';
import { api } from '../services/api';

export interface Banco {
  id: string;
  name: string;
}

/** Banco por defecto cuando no se elige uno (histórico: todo se registraba como Bancolombia). */
export const BANCO_DEFAULT_ID = 'BANCO-BANCOLOMBIA';

let cache: Banco[] | null = null;
let pendiente: Promise<Banco[]> | null = null;

const cargar = (): Promise<Banco[]> => {
  if (cache) return Promise.resolve(cache);
  if (!pendiente) {
    pendiente = api
      .getGenericMasters()
      .then((rows: any) => {
        const lista: Banco[] = (Array.isArray(rows) ? rows : [])
          .filter((r: any) => r.category === 'bancos' && (r.status_id || r.statusId || 'EST-01') === 'EST-01')
          .map((r: any) => ({ id: String(r.id), name: String(r.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        cache = lista;
        return lista;
      })
      .catch(() => [] as Banco[])
      .finally(() => {
        pendiente = null;
      });
  }
  return pendiente;
};

/** Bancos activos de la maestra (master_records, category = 'bancos'). Se cargan una vez por sesión. */
export function useBancos(): Banco[] {
  const [bancos, setBancos] = useState<Banco[]>(cache || []);
  useEffect(() => {
    let vivo = true;
    cargar().then((l) => vivo && setBancos(l));
    return () => {
      vivo = false;
    };
  }, []);
  return bancos;
}

/** Fuerza recarga (p. ej. después de editar la maestra de bancos). */
export const invalidarBancos = () => {
  cache = null;
};
