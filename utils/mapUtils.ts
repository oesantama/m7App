// Constantes de origen del HUB M7
export const M7_HUB_ORIGIN = {
    lat: 6.110595,
    lng: -75.641505,
    address: "CR 48C N°100 Sur - 72 Bodega 4 y 10, La Tablaza"
};

// Tipo para coordenadas geográficas
export interface GeoCoordinates {
    lat: number;
    lng: number;
    address?: string;
}

/**
 * Calcula la distancia haversine entre dos puntos geográficos
 * @param lat1 Latitud del punto 1
 * @param lng1 Longitud del punto 1
 * @param lat2 Latitud del punto 2
 * @param lng2 Longitud del punto 2
 * @returns Distancia en kilómetros
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Normaliza nombre de ciudad para comparación
 */
export function normalizeCityName(city: string): string {
    return city.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
