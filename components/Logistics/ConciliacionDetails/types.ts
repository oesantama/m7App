
export type EstadoEntrega = 'entregado' | 'devolucion' | 'parcial' | 'repice';
export type MetodoPago   = 'TRANSFERENCIA' | 'CONSIGNACION';
export type ModalTab     = 'individual' | 'grupal' | 'sobrecosto';

export interface InvoiceItem {
    id: string | number;
    article_id: string;
    article_name: string;
    qty: number;
    unit: string;
    returned_qty?: number;
}

export interface InvoiceRow {
    invoice_number: string;
    customer_name?: string;
    city?: string;
    address?: string;
    total_qty?: number;
    conciliation_id?: number;
    valor?: number;
    comprobante?: string;
    fecha_pago?: string;
    forma_pago?: string;
    numero_cheque?: string;
    es_devolucion?: boolean;
    conciliado_por?: string;
    conductor_id?: string;
    conductor_name?: string;
    vehicle_plate?: string;
    conciliado_at?: string;
    conciliado_por_nombre?: string;
    invoice_value?: number;
    invoice_metodo_pago?: string;
    item_status?: string;
    route_vehicle_plate?: string;
    mastersuite_estado?: string;
    mastersuite_id_carga?: string;
    mastersuite_fecha_despacho?: string;
    mastersuite_fecha_entrega?: string;
    mastersuite_motivo_dev?: string;
    items?: InvoiceItem[];
    bodega_received_at?: string;
    sobrecosto?: number;
}

export interface RouteGroup {
    route_id: string;
    plate: string;
    driver_name: string | null;
    invoice_count: number;
    efectivo: number;
    credito: number;
    completadas: number;
    devueltas: number;
    parciales: number;
    legalizadas: number;
}

export interface InvoiceFormState {
    estadoEntrega: EstadoEntrega;
    valor: string;
    numConsignacion: string;
    metodo: MetodoPago;
    fecha: string;
    saving: boolean;
    items: InvoiceItem[];
    statusUnlocked: boolean;
}

export interface ConsignacionRow {
    id: string;
    valor: string;
    nroAprobacion: string;
    fecha: string;
    observacion?: string;
    metodo?: MetodoPago;
}

export interface SobrecostoRow {
    id: string;
    valor: string;
    nroAprobacion: string;
    fecha: string;
    statusId: string;
}

export interface PlateTotals {
    totalValue: number;
    legalizedVal: number;
    legalizedIndividual: number;
    legalizedGrupal: number;
    legalCount: number;
    pendingVal: number;
    total: number;
}

export interface SurchargeStats {
    approved: number;
    pending: number;
    approvedCount: number;
    pendingCount: number;
}

export const fmtCOP = (v: number | undefined | null) => {
    if (v === undefined || v === null) return '$ 0';
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(v);
};
