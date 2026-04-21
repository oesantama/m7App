import pool from '../config/database.js';

export type MovementType =
    | 'INGRESO'
    | 'DESPACHO'
    | 'ENTREGA'
    | 'ENTREGA_PARCIAL'
    | 'DEVOLUCION_BODEGA'
    | 'SALIDA_PROVEEDOR'
    | 'REPIQUE'
    | 'AJUSTE';

interface LogMovementParams {
    clientId?:      string;
    articleId:      string;
    articleName?:   string;
    batch?:         string;
    movementType:   MovementType;
    quantity:       number;
    locationFrom?:  string;
    locationTo?:    string;
    referenceType?: string;
    referenceId?:   string;
    invoice?:       string;
    vehiclePlate?:  string;
    driverId?:      string;
    userId?:        string;
    notes?:         string;
}

/**
 * Registra un movimiento en el kardex (inventory_movements).
 * Fire-and-forget: nunca lanza excepción para no romper el flujo principal.
 * Acepta opcionalmente un cliente de pool (para usar dentro de una transacción).
 */
export const logMovement = async (
    params: LogMovementParams,
    queryFn?: (text: string, values?: any[]) => Promise<any>
): Promise<void> => {
    const q = queryFn ?? ((text: string, values?: any[]) => pool.query(text, values));
    try {
        await q(`
            INSERT INTO inventory_movements
                (client_id, article_id, article_name, batch,
                 movement_type, quantity,
                 location_from, location_to,
                 reference_type, reference_id, invoice,
                 vehicle_plate, driver_id, user_id, notes, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
        `, [
            params.clientId     || null,
            params.articleId,
            params.articleName  || null,
            params.batch        || 'S/L',
            params.movementType,
            params.quantity,
            params.locationFrom || null,
            params.locationTo   || null,
            params.referenceType || null,
            params.referenceId  || null,
            params.invoice      || null,
            params.vehiclePlate || null,
            params.driverId     || null,
            params.userId       || null,
            params.notes        || null,
        ]);
    } catch (e: any) {
        console.warn('[KARDEX] logMovement skipped:', e.message);
    }
};
