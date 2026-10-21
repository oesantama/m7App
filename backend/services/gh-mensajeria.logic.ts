/**
 * Reglas de negocio de Mensajería (sin dependencias de BD ni Express, para poder testearlas).
 *
 *   PENDIENTE ─asignar─▶ ASIGNADO ─recoger─▶ EN_CAMINO ─entregar─▶ ENTREGADO
 *       │                  │  ▲                  │
 *       └──cancelar──▶ CANCELADO  └──reintentar── FALLIDO ◀─incidencia─┘
 *                                                │
 *                                                └─devolver─▶ DEVUELTO
 */

export type EstadoEnvio =
    | 'PENDIENTE' | 'ASIGNADO' | 'EN_CAMINO' | 'ENTREGADO' | 'FALLIDO' | 'DEVUELTO' | 'CANCELADO';

export type TipoArchivoEnvio =
    | 'FIRMA_MENSAJERO' | 'FIRMA_DESTINATARIO' | 'FOTO_PAQUETE' | 'FOTO_ENTREGA' | 'FOTO_INCIDENCIA';

/**
 * En BD se guarda el ID de la maestra global `estados`; el código se usa en la lógica y en la API.
 * EN_CAMINO reutiliza "EN RUTA" (EST-11); FALLIDO y CANCELADO se crearon en la migración 008.
 */
export const ESTADO_ID: Record<EstadoEnvio, string> = {
    PENDIENTE: 'EST-03',
    ASIGNADO: 'EST-10',
    EN_CAMINO: 'EST-11',
    ENTREGADO: 'EST-12',
    DEVUELTO: 'EST-13',
    FALLIDO: 'EST-28',
    CANCELADO: 'EST-29',
};
const ID_ESTADO: Record<string, EstadoEnvio> = Object.fromEntries(
    Object.entries(ESTADO_ID).map(([k, v]) => [v, k as EstadoEnvio])
);
export function estadoDesdeId(id: string | null | undefined): EstadoEnvio | null {
    return id ? ID_ESTADO[id] ?? null : null;
}
/** Lista de IDs como literal SQL (solo constantes internas, nunca entrada del usuario). */
export function idsSql(estados: EstadoEnvio[]): string {
    return estados.map(e => `'${ESTADO_ID[e]}'`).join(',');
}

export const ESTADOS_ENVIO: EstadoEnvio[] = ['PENDIENTE', 'ASIGNADO', 'EN_CAMINO', 'ENTREGADO', 'FALLIDO', 'DEVUELTO', 'CANCELADO'];
export const ESTADOS_FINALES: EstadoEnvio[] = ['ENTREGADO', 'DEVUELTO', 'CANCELADO'];
/** Estados que cuentan para la alerta de atraso (aún no se resolvieron). */
export const ESTADOS_ABIERTOS: EstadoEnvio[] = ['PENDIENTE', 'ASIGNADO', 'EN_CAMINO', 'FALLIDO'];

const TRANSICIONES: Record<EstadoEnvio, EstadoEnvio[]> = {
    PENDIENTE: ['ASIGNADO', 'CANCELADO'],
    // ASIGNADO → ASIGNADO permite reasignar a otro mensajero
    ASIGNADO: ['ASIGNADO', 'EN_CAMINO', 'PENDIENTE', 'CANCELADO'],
    EN_CAMINO: ['ENTREGADO', 'FALLIDO'],
    FALLIDO: ['ASIGNADO', 'DEVUELTO'],
    ENTREGADO: [],
    DEVUELTO: [],
    CANCELADO: [],
};

/** Evidencia mínima exigida para entrar a cada estado. */
export const EVIDENCIA_REQUERIDA: Partial<Record<EstadoEnvio, TipoArchivoEnvio[]>> = {
    EN_CAMINO: ['FIRMA_MENSAJERO', 'FOTO_PAQUETE'],
    ENTREGADO: ['FIRMA_DESTINATARIO', 'FOTO_ENTREGA'],
    FALLIDO: ['FOTO_INCIDENCIA'],
};

/** Estados que exigen un motivo escrito. */
export const MOTIVO_REQUERIDO: EstadoEnvio[] = ['FALLIDO', 'DEVUELTO', 'CANCELADO'];

/** Transiciones que puede ejecutar el propio mensajero (las demás son de administración). */
export const TRANSICIONES_MENSAJERO: EstadoEnvio[] = ['EN_CAMINO', 'ENTREGADO', 'FALLIDO'];

export function esEstadoValido(estado: string): estado is EstadoEnvio {
    return (ESTADOS_ENVIO as string[]).includes(estado);
}

export function puedeTransicionar(desde: EstadoEnvio, hacia: EstadoEnvio): boolean {
    return TRANSICIONES[desde]?.includes(hacia) ?? false;
}

export interface ValidacionTransicion {
    ok: boolean;
    error?: string;
}

/**
 * Valida una transición completa: que esté permitida, que traiga motivo cuando aplica,
 * que exista mensajero al asignar y que estén todas las evidencias requeridas.
 */
export function validarTransicion(params: {
    desde: EstadoEnvio;
    hacia: EstadoEnvio;
    motivo?: string | null;
    mensajeroId?: number | null;
    evidencias: TipoArchivoEnvio[];
    receptorNombre?: string | null;
}): ValidacionTransicion {
    const { desde, hacia, motivo, mensajeroId, evidencias, receptorNombre } = params;

    if (!puedeTransicionar(desde, hacia)) {
        return { ok: false, error: `No se puede pasar de ${desde} a ${hacia}.` };
    }
    if (MOTIVO_REQUERIDO.includes(hacia) && !motivo?.trim()) {
        return { ok: false, error: `Debe indicar el motivo para marcar el envío como ${hacia}.` };
    }
    if (hacia === 'ASIGNADO' && !mensajeroId) {
        return { ok: false, error: 'Debe seleccionar un mensajero.' };
    }
    if (hacia === 'ENTREGADO' && !receptorNombre?.trim()) {
        return { ok: false, error: 'Debe registrar el nombre de quien recibe.' };
    }
    const faltantes = (EVIDENCIA_REQUERIDA[hacia] || []).filter(t => !evidencias.includes(t));
    if (faltantes.length > 0) {
        return { ok: false, error: `Faltan evidencias obligatorias: ${faltantes.map(etiquetaArchivo).join(', ')}.` };
    }
    return { ok: true };
}

export function etiquetaArchivo(tipo: TipoArchivoEnvio): string {
    const map: Record<TipoArchivoEnvio, string> = {
        FIRMA_MENSAJERO: 'firma del mensajero',
        FIRMA_DESTINATARIO: 'firma del destinatario',
        FOTO_PAQUETE: 'foto del paquete',
        FOTO_ENTREGA: 'foto de la entrega',
        FOTO_INCIDENCIA: 'foto de la incidencia',
    };
    return map[tipo];
}

/** Tracking legible y ordenable: ENV-AAMMDD-0001 (consecutivo diario). */
export function generarTracking(fecha: Date, consecutivoDelDia: number): string {
    const yy = String(fecha.getFullYear()).slice(-2);
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    return `ENV-${yy}${mm}${dd}-${String(consecutivoDelDia).padStart(4, '0')}`;
}

/** Enmascara documentos de terceros en listados: 1023456789 → ******6789 */
export function enmascararDocumento(doc?: string | null): string | null {
    if (!doc) return null;
    const limpio = String(doc).trim();
    if (limpio.length <= 4) return '****';
    return '*'.repeat(limpio.length - 4) + limpio.slice(-4);
}

/** Horas transcurridas sin cerrar el envío; null si ya está en estado final. */
export function horasAbierto(estado: EstadoEnvio, creadoEn: Date, ahora: Date = new Date()): number | null {
    if (ESTADOS_FINALES.includes(estado)) return null;
    return (ahora.getTime() - creadoEn.getTime()) / 3_600_000;
}

export const HORAS_ALERTA_ATRASO = Number(process.env.GH_MENSAJERIA_HORAS_ALERTA || 24);

export function estaAtrasado(estado: EstadoEnvio, creadoEn: Date, ahora: Date = new Date(), umbralHoras = HORAS_ALERTA_ATRASO): boolean {
    const h = horasAbierto(estado, creadoEn, ahora);
    return h !== null && h >= umbralHoras;
}
