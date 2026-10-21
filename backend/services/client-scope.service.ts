/**
 * Alcance por cliente para informes basados en management_orders (preoperacional, facturación).
 *
 * management_orders identifica al cliente por `client_name` y `client_document` (NIT), pero el NIT
 * NO es único por cliente: p. ej. 890904488 aparece en AJOVER_BODEGA10, AJOVER CALI y TDM (PREBEL).
 * Regla de cruce para los clientes seleccionados (maestra `clients`):
 *   1. client_name = nombre del cliente en la maestra, o = managementName de su mapeo en prov_cliente.
 *   2. client_document = NIT mapeado al cliente en prov_cliente — SOLO si el client_name de la orden
 *      no corresponde a ningún cliente de la maestra (evita que un NIT compartido mezcle bodegas).
 */
import pool from '../config/database.js';

export interface AlcanceClientes {
    clientIds: string[];
    /** Nombres (en mayúsculas) que identifican a los clientes seleccionados. */
    nombres: string[];
    /** NIT mapeados a los clientes seleccionados. */
    documentos: string[];
    /** Todos los nombres de la maestra + mapeos (para no usar el NIT cuando el nombre ya es de otro cliente). */
    nombresConocidos: string[];
    /** Texto legible: "AJOVER_BODEGA10, RTD SAS". */
    etiqueta: string;
}

const norm = (s: any) => String(s || '').trim().toUpperCase();

export async function resolverAlcanceClientes(clientIds: string[]): Promise<AlcanceClientes> {
    const ids = [...new Set(clientIds.map(c => String(c).trim()).filter(Boolean))];
    const [clientes, provs] = await Promise.all([
        pool.query(`SELECT id, name FROM clients`),
        pool.query(`SELECT documento, client_mappings FROM prov_cliente WHERE client_mappings IS NOT NULL`),
    ]);

    const nombres = new Set<string>();
    const documentos = new Set<string>();
    const nombresConocidos = new Set<string>();
    const etiquetas: string[] = [];

    for (const c of clientes.rows) {
        nombresConocidos.add(norm(c.name));
        if (ids.includes(c.id)) {
            nombres.add(norm(c.name));
            etiquetas.push(c.name);
        }
    }
    for (const p of provs.rows) {
        const maps = typeof p.client_mappings === 'string' ? JSON.parse(p.client_mappings) : p.client_mappings;
        if (!Array.isArray(maps)) continue;
        for (const m of maps) {
            if (m?.managementName) nombresConocidos.add(norm(m.managementName));
            if (m?.clientId && ids.includes(m.clientId)) {
                if (m.managementName) nombres.add(norm(m.managementName));
                if (p.documento) documentos.add(String(p.documento).trim());
            }
        }
    }

    return {
        clientIds: ids,
        nombres: [...nombres],
        documentos: [...documentos],
        nombresConocidos: [...nombresConocidos],
        etiqueta: etiquetas.length ? etiquetas.join(', ') : ids.join(', '),
    };
}

/**
 * Condición SQL para filtrar management_orders (alias `alias`) por el alcance. Agrega sus
 * parámetros al final de `params` y devuelve el fragmento listo para un WHERE.
 */
export function sqlFiltroClientes(alias: string, alcance: AlcanceClientes, params: any[]): string {
    params.push(alcance.nombres, alcance.documentos, alcance.nombresConocidos);
    const n = params.length;
    return `(
        UPPER(TRIM(${alias}.client_name)) = ANY($${n - 2}::text[])
        OR (TRIM(${alias}.client_document) = ANY($${n - 1}::text[])
            AND NOT (UPPER(TRIM(${alias}.client_name)) = ANY($${n}::text[])))
    )`;
}
