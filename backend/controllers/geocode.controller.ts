import { Request, Response } from 'express';
import https from 'https';

// Caché en memoria para evitar geocodificar la misma dirección dos veces
const geocodeCache = new Map<string, [number, number] | null>();

// Rate limit: 1 req/seg a Nominatim
let lastNominatimCall = 0;
const NOMINATIM_DELAY_MS = 1100;

const waitForRateLimit = async () => {
    const now = Date.now();
    const elapsed = now - lastNominatimCall;
    if (elapsed < NOMINATIM_DELAY_MS) {
        await new Promise(r => setTimeout(r, NOMINATIM_DELAY_MS - elapsed));
    }
    lastNominatimCall = Date.now();
};

const httpsGet = (url: string): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'Accept-Language': 'es',
                'User-Agent': 'OrbitM7-Logistics/1.0 (logistics@orbitm7.io)',
                'Accept': 'application/json'
            },
            timeout: 8000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 429) return resolve([]);
                    resolve(JSON.parse(data));
                } catch {
                    resolve([]);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
};

const callNominatim = async (query: string): Promise<[number, number] | null> => {
    await waitForRateLimit();
    // Restringir búsqueda al Valle de Aburrá (Medellín y alrededores) mediante viewbox y bounded=1
    // Viewbox approx: MinLon -75.83, MaxLat 6.45, MaxLon -75.35, MinLat 5.95
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=co&viewbox=-75.83,6.45,-75.35,5.95&bounded=1`;
    try {
        const results = await httpsGet(url);
        if (results && results.length > 0) {
            return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
        }
    } catch (e: any) {
        console.warn('[M7-GEO] Nominatim error:', e.message);
    }
    return null;
};

export const geocodeAddress = async (req: Request, res: Response) => {
    const { address, city } = req.query as Record<string, string>;

    if (!address && !city) {
        return res.status(400).json({ success: false, error: 'Se requiere address o city' });
    }

    const cacheKey = `${(address || '').toLowerCase().trim()}|${(city || '').toLowerCase().trim()}`;

    if (geocodeCache.has(cacheKey)) {
        const cached = geocodeCache.get(cacheKey);
        return res.json({ success: true, coords: cached, source: 'cache' });
    }

    try {
        let coords: [number, number] | null = null;

        if (address && city) {
            coords = await callNominatim(`${address}, ${city}, Colombia`);
        }

        if (!coords && address) {
            coords = await callNominatim(`${address}, Colombia`);
        }

        if (!coords && city) {
            coords = await callNominatim(`${city}, Colombia`);
            if (coords) {
                coords = [
                    coords[0] + (Math.random() - 0.5) * 0.009,
                    coords[1] + (Math.random() - 0.5) * 0.009
                ];
            }
        }

        geocodeCache.set(cacheKey, coords);
        return res.json({ success: true, coords, source: 'nominatim' });
    } catch (err: any) {
        console.error('[M7-GEO-PROXY] Error:', err.message);
        return res.status(500).json({ success: false, error: 'Error al geocodificar', coords: null });
    }
};
