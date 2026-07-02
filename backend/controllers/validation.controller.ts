import { Request, Response } from 'express';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const puppeteerExtra = _require('puppeteer-extra');
const StealthPlugin = _require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { URL } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import pool from '../config/database.js';
import { AIOrchestrator } from '../services/ai-orchestrator/orchestrator.js';

const execAsync = promisify(exec);
const RCLONE_REMOTE = 'gdrive_cumplidos';
const DRIVE_BASE_PATH = 'HOJAS DE VIDA MILLA 7';
const LOCAL_PDF_DIR = path.join(process.cwd(), 'backend', 'docs', 'validaciones');

// ─────────────────────────────────────────────
// Helpers rclone (opcional — solo si está instalado)
// ─────────────────────────────────────────────
async function rcloneAvailable(): Promise<boolean> {
    try { await execAsync('which rclone'); return true; } catch { return false; }
}

async function rcloneMkdir(remotePath: string): Promise<void> {
    await execAsync(`rclone mkdir "${RCLONE_REMOTE}:${remotePath}"`);
}

async function rcloneCopyto(localPath: string, remotePath: string): Promise<void> {
    await execAsync(`rclone copyto "${localPath}" "${RCLONE_REMOTE}:${remotePath}"`);
}

async function rcloneLink(remotePath: string): Promise<string> {
    try {
        const { stdout } = await execAsync(`rclone link "${RCLONE_REMOTE}:${remotePath}"`);
        return stdout?.trim() || '';
    } catch {
        return '';
    }
}

function sanitizeFolder(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\-_. ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─────────────────────────────────────────────
// CRUD validation_sources
// ─────────────────────────────────────────────
export const getSources = async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(
            'SELECT * FROM validation_sources ORDER BY entity_type, name'
        );
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const createSource = async (req: Request, res: Response) => {
    const { id, name, url, entity_type, file_name, description, is_active } = req.body;
    if (!id || !name || !url || !entity_type || !file_name) {
        return res.status(400).json({ error: 'Campos requeridos: id, name, url, entity_type, file_name' });
    }
    try {
        await pool.query(
            `INSERT INTO validation_sources (id, name, url, entity_type, file_name, description, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
            [id.toLowerCase().trim(), name, url, entity_type, file_name, description || null, is_active !== false]
        );
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const updateSource = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, url, entity_type, file_name, description, is_active } = req.body;
    try {
        await pool.query(
            `UPDATE validation_sources SET name=$1, url=$2, entity_type=$3, file_name=$4,
             description=$5, is_active=$6, updated_at=NOW() WHERE id=$7`,
            [name, url, entity_type, file_name, description || null, is_active !== false, id]
        );
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteSource = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM validation_sources WHERE id=$1', [id]);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
// Historial de validaciones
// ─────────────────────────────────────────────
export const getRecords = async (req: Request, res: Response) => {
    try {
        const entity_type = req.query.entity_type as string | undefined;
        const entity_id   = req.query.entity_id   as string | undefined;
        const limit       = Number(req.query.limit) || 50;
        let query = `SELECT vr.*, vs.name as source_name, vs.file_name
                     FROM validation_records vr
                     LEFT JOIN validation_sources vs ON vs.id = vr.source_id
                     WHERE 1=1`;
        const params: any[] = [];
        if (entity_type) { params.push(entity_type); query += ` AND vr.entity_type=$${params.length}`; }
        if (entity_id)   { params.push(entity_id);   query += ` AND vr.entity_id=$${params.length}`; }
        params.push(limit);
        query += ` ORDER BY vr.validated_at DESC LIMIT $${params.length}`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
// Scraper genérico por source
// ─────────────────────────────────────────────
async function scrapeOFAC(entityId: string, page: any): Promise<{ status: 'found' | 'not_found' | 'error'; summary: string; pdfBuffer: Buffer }> {
    await page.goto('https://sanctionssearch.ofac.treas.gov/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Llenar campo ID # / Digital Currency Address
    const filled = await page.evaluate((idVal: string) => {
        // Buscar por el label "ID"
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])')) as HTMLInputElement[];
        // El campo ID es el 3ro visible en el formulario (después de Name y Last Name)
        // Buscamos por placeholder o por nombre del campo cercano al label "ID"
        let target: HTMLInputElement | null = null;

        // Intentar por nombre de atributo que contenga "ID"
        target = document.querySelector('input[id*="txtID"], input[name*="ID"], input[id*="ID"]') as HTMLInputElement;
        if (!target) {
            // Buscar por label adyacente
            const labels = Array.from(document.querySelectorAll('label, td'));
            for (const lbl of labels) {
                if (lbl.textContent?.includes('ID #') || lbl.textContent?.includes('Digital Currency')) {
                    // Buscar el input más cercano
                    const next = lbl.nextElementSibling;
                    if (next && next.tagName === 'INPUT') { target = next as HTMLInputElement; break; }
                    const parent = lbl.closest('tr');
                    if (parent) {
                        const inp = parent.querySelector('input') as HTMLInputElement;
                        if (inp) { target = inp; break; }
                    }
                }
            }
        }
        if (!target) {
            // Fallback: el 4to input del formulario (Type, Name, ID, Program)
            const allInputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
            if (allInputs.length >= 3) target = allInputs[2]; // 0=Name, 1=Address, 2=ID (aprox)
        }
        if (!target) return false;
        target.value = '';
        target.focus();
        target.value = idVal;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }, entityId);

    if (!filled) throw new Error('No se pudo encontrar el campo ID en OFAC');

    // Poner score 100 para búsqueda exacta
    await page.evaluate(() => {
        const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
        if (slider) { slider.value = '100'; slider.dispatchEvent(new Event('change', { bubbles: true })); }
    });

    // Click en Search
    const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], input[value="Search"], button'));
        const btn = btns.find((b: any) => b.value === 'Search' || b.textContent?.trim() === 'Search');
        if (btn) { (btn as any).click(); return true; }
        return false;
    });
    if (!clicked) throw new Error('No se encontró el botón Search en OFAC');

    // Esperar resultados
    await new Promise(r => setTimeout(r, 3000));
    await page.waitForFunction(() => {
        const body = document.body.textContent || '';
        return body.includes('Lookup Results:') || body.includes('Found') || body.includes('0 Found');
    }, { timeout: 15000 }).catch(() => {});

    // Obtener resumen del resultado
    const summary = await page.evaluate(() => {
        const body = document.body.textContent || '';
        const match = body.match(/Lookup Results:\s*\d+ Found/i);
        return match ? match[0] : 'Resultado no determinado';
    });

    const status: 'found' | 'not_found' = summary.includes('0 Found') ? 'not_found' : 'found';

    // Generar PDF de la página de resultados
    const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' }
    });

    return { status, summary, pdfBuffer: Buffer.from(pdfBuffer) };
}

// ─────────────────────────────────────────────
// Scraper: Procuraduría — HTTP directo (bypass WAF que bloquea Chrome headless)
// El formulario real está en un iframe: apps.procuraduria.gov.co/webcert/inicio.aspx
// ─────────────────────────────────────────────
const PROC_AGENT = new https.Agent({ rejectUnauthorized: false });
const PROC_BASE = 'https://apps.procuraduria.gov.co/webcert';
const PROC_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-CO,es;q=0.9',
    'Referer': 'https://www.procuraduria.gov.co/Pages/Consulta-de-Antecedentes.aspx',
};
const PROC_DOC_TYPES: Record<string, string> = {
    'Cédula de ciudadanía': '1',
    'PEP': '0',
    'Nit': '2',
    'Cédula extranjería': '5',
    'PPT': '10',
};

// Capitales de departamentos de Colombia (con y sin tilde)
const CAPITALES_COL: Record<string, string> = {
    'amazonas': 'Leticia', 'antioquia': 'Medellin', 'arauca': 'Arauca',
    'atlantico': 'Barranquilla', 'bolivar': 'Cartagena',
    'boyaca': 'Tunja', 'caldas': 'Manizales', 'caqueta': 'Florencia',
    'casanare': 'Yopal', 'cauca': 'Popayan', 'cesar': 'Valledupar',
    'choco': 'Quibdo', 'cordoba': 'Monteria', 'cundinamarca': 'Bogota',
    'guainia': 'Inirida', 'guaviare': 'San Jose del Guaviare', 'huila': 'Neiva',
    'guajira': 'Riohacha', 'la guajira': 'Riohacha', 'magdalena': 'Santa Marta',
    'meta': 'Villavicencio', 'narino': 'Pasto', 'norte de santander': 'Cucuta',
    'putumayo': 'Mocoa', 'quindio': 'Armenia', 'risaralda': 'Pereira',
    'san andres': 'San Andres', 'santander': 'Bucaramanga', 'sucre': 'Sincelejo',
    'tolima': 'Ibague', 'valle del cauca': 'Cali', 'valle': 'Cali',
    'vaupes': 'Mitu', 'vichada': 'Puerto Carreno', 'bogota': 'Bogota',
};

const WORD_TO_NUM: Record<string, number> = { 'un': 1, 'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6 };

function parseSpanishNum(q: string): number {
    const numMatch = q.match(/(\d+)/);
    if (numMatch) return parseInt(numMatch[1]);
    for (const [word, val] of Object.entries(WORD_TO_NUM)) {
        if (q.includes(word)) return val;
    }
    return 2;
}

function solveProcCaptcha(captchaText: string, entityId: string, entityName: string): string {
    const q = captchaText.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
        .replace(/[¿?]/g, '').trim();

    const parts = entityName.trim().split(/\s+/);
    const firstName   = parts[0] || '';
    const firstSurname = parts.length >= 3 ? parts[2] : (parts[1] || parts[0]);

    // 1. Matemático: "cuanto es N OP N"
    if (q.includes('cuanto es')) {
        const m = captchaText.match(/(\d+)\s*([xX×*+\-\/÷])\s*(\d+)/);
        if (!m) throw new Error(`Captcha matemático no parseable: "${captchaText}"`);
        const a = parseInt(m[1]), op = m[2], b = parseInt(m[3]);
        if (op === '+') return String(a + b);
        if (op === '-') return String(a - b);
        if ('xX×*'.includes(op)) return String(a * b);
        if (op === '/' || op === '÷') return String(Math.round(a / b));
    }

    // 2. "primeras letras del primer nombre/apellido" (ANTES de "primer nombre" simple)
    if (q.includes('primeras letras') || q.includes('primera letra')) {
        const n = parseSpanishNum(q);
        if (q.includes('apellido')) return firstSurname.substring(0, n);
        return firstName.substring(0, n); // nombre (o cualquier otra cosa)
    }

    // 3. Cantidad de letras del primer nombre / apellido
    if (q.includes('cantidad de letras') && q.includes('primer nombre')) {
        return String(firstName.length);
    }
    if (q.includes('cantidad de letras') && q.includes('primer apellido')) {
        return String(firstSurname.length);
    }

    // 4. Últimos dígitos del documento
    if ((q.includes('ultimo') || q.includes('ultimas')) && q.includes('digito')) {
        const n = parseSpanishNum(q);
        return entityId.slice(-n);
    }

    // 5. Primeros dígitos del documento
    if (q.includes('digito') || q.includes('primeros') || q.includes('primera')) {
        const n = parseSpanishNum(q);
        return entityId.substring(0, n);
    }

    // 6. Primer nombre / apellido completo
    if (q.includes('primer nombre')) return firstName;
    if (q.includes('primer apellido')) return firstSurname;

    // 7. Geografía: "cual es la capital de {dept}"
    if (q.includes('capital de') || q.includes('capital del')) {
        for (const [dept, capital] of Object.entries(CAPITALES_COL)) {
            if (q.includes(dept)) return capital;
        }
    }

    throw new Error(`Captcha no reconocido: "${captchaText}"`);
}

// Versión raw que NO sigue redirects — devuelve status, headers y body como Buffer
function procHttpRaw(method: 'GET' | 'POST', url: string, body?: string, extra: Record<string,string> = {}): Promise<{status: number; html: string; rawBody: Buffer; cookies: string; location: string | undefined; ct: string}> {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const buf = body ? Buffer.from(body, 'utf-8') : null;
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method,
            headers: {
                ...PROC_HEADERS,
                ...(buf ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(buf.length) } : {}),
                ...extra,
            },
            agent: PROC_AGENT,
        }, (res) => {
            const cookies = ((res.headers['set-cookie'] as string[]) || []).map((c: string) => c.split(';')[0]).join('; ');
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
                const rawBody = Buffer.concat(chunks);
                resolve({
                    status: res.statusCode || 0,
                    html: rawBody.toString('utf-8'),
                    rawBody,
                    cookies,
                    location: res.headers.location as string | undefined,
                    ct: (res.headers['content-type'] as string) || '',
                });
            });
        });
        req.on('error', reject);
        if (buf) req.write(buf);
        req.end();
    });
}

function procHttp(method: 'GET' | 'POST', url: string, body?: string, extra: Record<string,string> = {}, redirectCount = 0): Promise<{html: string; cookies: string; finalUrl: string}> {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const buf = body ? Buffer.from(body, 'utf-8') : null;
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method,
            headers: {
                ...PROC_HEADERS,
                ...(buf ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(buf.length) } : {}),
                ...extra
            },
            agent: PROC_AGENT,
        }, (res) => {
            const cookies = ((res.headers['set-cookie'] as string[]) || []).map((c: string) => c.split(';')[0]).join('; ');
            // Seguir redirects automáticamente (máx 5)
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectCount < 5) {
                const location = res.headers.location as string;
                const nextUrl = location.startsWith('http') ? location : `https://apps.procuraduria.gov.co${location.startsWith('/') ? '' : '/'}${location}`;
                res.resume(); // descartar body
                procHttp('GET', nextUrl, undefined, { ...extra, 'Cookie': cookies }, redirectCount + 1)
                    .then(r => resolve({ ...r, cookies: r.cookies || cookies }))
                    .catch(reject);
                return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf-8'), cookies, finalUrl: url }));
        });
        req.on('error', reject);
        if (buf) req.write(buf);
        req.end();
    });
}

async function scrapeProcuraduria(entityId: string, entityName: string, docType: string, page: any): Promise<{ status: 'found' | 'not_found' | 'error'; summary: string; pdfBuffer: Buffer }> {
    // 1. GET inicio.aspx → sigue redirect a Certificado.aspx, acumula cookies de ambos
    const { html: formHtml, cookies: ck1, finalUrl } = await procHttp('GET', `${PROC_BASE}/inicio.aspx`);

    if (!formHtml.includes('lblPregunta')) {
        throw new Error('La Procuraduría bloqueó el acceso o el formulario no cargó. Intente más tarde.');
    }

    // 2. Extraer campos del formulario ASP.NET
    const viewstate  = formHtml.match(/name="__VIEWSTATE"\s+id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1];
    const vsgen      = formHtml.match(/name="__VIEWSTATEGENERATOR"[^>]+value="([^"]+)"/)?.[1] || '';
    const evval      = formHtml.match(/name="__EVENTVALIDATION"[^>]+value="([^"]+)"/)?.[1] || '';
    const formAction = formHtml.match(/<form[^>]+action="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const captchaText = formHtml.match(/id="lblPregunta"[^>]*>([^<]+)/)?.[1]?.trim();

    if (!viewstate || !formAction || !captchaText) throw new Error('No se encontró el formulario de la Procuraduría');

    // 3. Resolver captcha con función inteligente
    const answer = solveProcCaptcha(captchaText, entityId, entityName);
    console.log(`[PROCURADURIA-CAPTCHA] "${captchaText}" → "${answer}"`);

    // 4. POST formulario usando las cookies acumuladas del redirect
    const tipoId = PROC_DOC_TYPES[docType] || '1';
    const actionUrl = formAction.startsWith('http') ? formAction : `https://apps.procuraduria.gov.co${formAction.startsWith('/') ? '' : '/webcert/'}${formAction.replace('./', '')}`;
    const formBody = new URLSearchParams({
        '__EVENTTARGET': '', '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewstate, '__VIEWSTATEGENERATOR': vsgen, '__EVENTVALIDATION': evval,
        'ddlTipoID': tipoId, 'txtNumID': entityId,
        'txtRespuestaPregunta': answer, 'txtEmail': '', 'btnConsultar': 'Consultar',
    }).toString();

    const { html: resultHtml } = await procHttp('POST', actionUrl, formBody, {
        'Cookie': ck1, 'Referer': `${PROC_BASE}/inicio.aspx`,
    });

    // 5. Detectar error de captcha o respuesta incorrecta
    const rLower = resultHtml.toLowerCase();
    const captchaError = rLower.includes('no corresponde con lo que espera') || rLower.includes('captcha incorrecto') || rLower.includes('respuesta incorrecta');
    if (captchaError) {
        throw new Error(`Captcha rechazado por Procuraduría (pregunta: "${captchaText}", respuesta: "${answer}")`);
    }

    // 6. Interpretar resultado — buscar texto específico del resultado
    const noAntecedentes = rLower.includes('no presenta antecedentes') || rLower.includes('no registra antecedentes') || rLower.includes('no presenta antecedentes disciplinarios');
    const tieneAntecedentes = (rLower.includes('presenta antecedentes') || rLower.includes('registra antecedentes')) && !noAntecedentes;
    const status: 'found' | 'not_found' = tieneAntecedentes ? 'found' : 'not_found';
    const summary = tieneAntecedentes
        ? 'ATENCIÓN: El ciudadano presenta antecedentes disciplinarios'
        : noAntecedentes
        ? 'El ciudadano no presenta antecedentes'
        : 'Consulta completada en Procuraduría';

    // 7. Generar PDF — inyectar <base> para que el navegador cargue CSS del sitio
    const htmlWithBase = resultHtml.replace(
        /<head([^>]*)>/i,
        `<head$1><base href="https://apps.procuraduria.gov.co/webcert/"><meta charset="utf-8">`
    );
    await page.goto(`https://apps.procuraduria.gov.co/webcert/inicio.aspx`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.setContent(htmlWithBase, { waitUntil: 'networkidle0', timeout: 20000 });
    const pdfBuffer = await page.pdf({
        format: 'Letter', printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' }
    });

    return { status, summary, pdfBuffer: Buffer.from(pdfBuffer) };
}

// ─────────────────────────────────────────────
// Procuraduría — Generación de certificado oficial PDF
// Usa inicio.aspx?tpo=2 → Certificado.aspx?t=TOKEN → POST → descarga PDF real
// ─────────────────────────────────────────────
async function generateProcuraduria(entityId: string, entityName: string, docType: string): Promise<{ status: 'found' | 'not_found' | 'error'; summary: string; pdfBuffer: Buffer }> {
    const MAX_CAPTCHA_RETRIES = 5;

    for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
        // 1. GET inicio.aspx?tpo=2 → 302 → Certificado.aspx?t=TOKEN
        const r1 = await procHttpRaw('GET', `${PROC_BASE}/inicio.aspx?tpo=2`);
        if (r1.status !== 302 || !r1.location) {
            throw new Error('Procuraduría no devolvió redirect desde inicio.aspx?tpo=2');
        }

        const formUrl = r1.location.startsWith('http')
            ? r1.location
            : `https://apps.procuraduria.gov.co${r1.location}`;
        let cookieJar = r1.cookies;

        // 2. GET formulario Certificado.aspx?t=TOKEN
        const r2 = await procHttpRaw('GET', formUrl, undefined, { Cookie: cookieJar });
        if (r2.cookies) cookieJar = cookieJar + '; ' + r2.cookies;

        if (!r2.html.includes('lblPregunta')) {
            throw new Error('Procuraduría: formulario de generación no cargó (sin lblPregunta)');
        }

        // 3. Extraer campos ASP.NET
        const viewstate  = r2.html.match(/name="__VIEWSTATE"\s+id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1]
                        || r2.html.match(/name="__VIEWSTATE"[^>]+value="([^"]+)"/)?.[1] || '';
        const vsgen      = r2.html.match(/name="__VIEWSTATEGENERATOR"[^>]+value="([^"]+)"/)?.[1] || '';
        const evval      = r2.html.match(/name="__EVENTVALIDATION"[^>]+value="([^"]+)"/)?.[1] || '';
        const formAction = r2.html.match(/<form[^>]+action="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
        const captchaText = r2.html.match(/id="lblPregunta"[^>]*>([^<]+)/)?.[1]?.trim();

        if (!viewstate || !formAction || !captchaText) {
            throw new Error('Procuraduría generación: no se encontraron campos del formulario');
        }

        // 4. Resolver captcha
        let answer: string;
        try {
            answer = solveProcCaptcha(captchaText, entityId, entityName);
        } catch (e: any) {
            throw new Error(`Captcha desconocido en generación: ${e.message}`);
        }
        console.log(`[PROC-GEN] Intento ${attempt} — captcha: "${captchaText}" → "${answer}"`);

        // 5. POST con Ordinario (rblTipoCert=1) y btnExportar=Generar
        const tipoId = PROC_DOC_TYPES[docType] || '1';
        const actionUrl = formAction.startsWith('http')
            ? formAction
            : `https://apps.procuraduria.gov.co${formAction.startsWith('/') ? '' : '/webcert/'}${formAction.replace('./', '')}`;

        const postBody = new URLSearchParams({
            '__EVENTTARGET': '', '__EVENTARGUMENT': '', '__LASTFOCUS': '',
            '__VIEWSTATE': viewstate, '__VIEWSTATEGENERATOR': vsgen, '__EVENTVALIDATION': evval,
            'ddlTipoID': tipoId, 'txtNumID': entityId,
            'rblTipoCert': '1',
            'txtRespuestaPregunta': answer,
            'txtEmail': '', 'btnExportar': 'Generar',
        }).toString();

        const r3 = await procHttpRaw('POST', actionUrl, postBody, {
            Cookie: cookieJar,
            Referer: formUrl,
        });
        if (r3.cookies) cookieJar = cookieJar + '; ' + r3.cookies;

        // 6. Detectar captcha incorrecto
        const captchaWrong = r3.html.toLowerCase().includes('no responde a la pregunta')
            || r3.html.toLowerCase().includes('no corresponde con lo que espera');

        if (captchaWrong) {
            console.warn(`[PROC-GEN] Captcha incorrecto en intento ${attempt}, reintentando...`);
            continue;
        }

        // 7. Éxito: el servidor puede devolver:
        //    a) 302 → redirect a página de resultado o al PDF directamente
        //    b) 200 con HTML que tiene enlace de descarga
        let downloadUrl: string | undefined;

        if (r3.status === 302 && r3.location) {
            const loc = r3.location.startsWith('http')
                ? r3.location
                : `https://apps.procuraduria.gov.co${r3.location.startsWith('/') ? '' : '/webcert/'}${r3.location}`;

            console.log(`[PROC-GEN] Siguiendo redirect a: ${loc.substring(0, 80)}`);
            // Puede ser el PDF directo
            const r4 = await procHttpRaw('GET', loc, undefined, { Cookie: cookieJar, Referer: actionUrl });
            if (r4.cookies) cookieJar = cookieJar + '; ' + r4.cookies;

            if (r4.ct.includes('pdf') || r4.ct.includes('octet-stream')) {
                return buildProcResult(r4.rawBody);
            }

            // verpdf.aspx: formulario con btnDescargar (image button)
            if (r4.html.includes('btnDescargar')) {
                const vs4    = r4.html.match(/name="__VIEWSTATE"\s+id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1]
                             || r4.html.match(/name="__VIEWSTATE"[^>]+value="([^"]+)"/)?.[1] || '';
                const vsgen4 = r4.html.match(/name="__VIEWSTATEGENERATOR"[^>]+value="([^"]+)"/)?.[1] || '';
                const evval4 = r4.html.match(/name="__EVENTVALIDATION"[^>]+value="([^"]+)"/)?.[1] || '';
                const prev4  = r4.html.match(/name="__PREVIOUSPAGE"[^>]+value="([^"]+)"/)?.[1] || '';
                const fa4    = r4.html.match(/<form[^>]+action="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') || './verpdf.aspx';
                const dlUrl  = `https://apps.procuraduria.gov.co/webcert/${fa4.replace('./', '')}`;

                const dlBody = new URLSearchParams({
                    '__EVENTTARGET': '', '__EVENTARGUMENT': '',
                    '__VIEWSTATE': vs4, '__VIEWSTATEGENERATOR': vsgen4,
                    '__PREVIOUSPAGE': prev4, '__EVENTVALIDATION': evval4,
                    'btnDescargar.x': '50', 'btnDescargar.y': '15',
                }).toString();

                const r5 = await procHttpRaw('POST', dlUrl, dlBody, { Cookie: cookieJar, Referer: loc });
                if (r5.cookies) cookieJar = cookieJar + '; ' + r5.cookies;

                if (r5.ct.includes('pdf') || r5.ct.includes('octet-stream')) {
                    console.log(`[PROC-GEN] Certificado obtenido (${r5.rawBody.length} bytes)`);
                    return buildProcResult(r5.rawBody);
                }

                // Si redirige al PDF
                if (r5.status === 302 && r5.location) {
                    const pdfLoc = r5.location.startsWith('http')
                        ? r5.location
                        : `https://apps.procuraduria.gov.co/webcert/${r5.location.replace('./', '')}`;
                    const r6 = await procHttpRaw('GET', pdfLoc, undefined, { Cookie: cookieJar, Referer: dlUrl });
                    if (r6.rawBody.length > 1024) {
                        return buildProcResult(r6.rawBody);
                    }
                }

                // Podría devolver un HTML con iframe/embed al PDF
                if (r5.html.includes('Certificado.pdf') || r5.html.includes('.pdf')) {
                    const pdfHref = r5.html.match(/(?:href|src)="([^"]*\.pdf[^"]*)"/)?.[1];
                    if (pdfHref) {
                        const pdfUrl = pdfHref.startsWith('http') ? pdfHref : `https://apps.procuraduria.gov.co/webcert/${pdfHref.replace('./', '')}`;
                        const r6 = await procHttpRaw('GET', pdfUrl, undefined, { Cookie: cookieJar, Referer: dlUrl });
                        if (r6.rawBody.length > 1024) {
                            return buildProcResult(r6.rawBody);
                        }
                    }
                }

                throw new Error(`btnDescargar POST no devolvió PDF (status=${r5.status}, ct="${r5.ct}", size=${r5.rawBody.length})`);
            }

            // Fallback: buscar href a PDF en la página
            downloadUrl = extractDownloadUrl(r4.html, loc);
            if (downloadUrl) {
                const r5 = await procHttpRaw('GET', downloadUrl, undefined, { Cookie: cookieJar, Referer: loc });
                if (r5.rawBody.length > 1024) {
                    return buildProcResult(r5.rawBody);
                }
            }
        } else if (r3.status === 200) {
            // 200 sin redirect — la página misma puede tener el enlace de descarga
            downloadUrl = extractDownloadUrl(r3.html, formUrl);
            if (downloadUrl) {
                const r4 = await procHttpRaw('GET', downloadUrl, undefined, { Cookie: cookieJar, Referer: actionUrl });
                if (r4.rawBody.length > 1024) {
                    return buildProcResult(r4.rawBody);
                }
            }
        }

        throw new Error(`Procuraduría generación: respuesta inesperada (status=${r3.status}, captchaWrong=false, downloadUrl=${downloadUrl})`);
    }

    throw new Error(`Procuraduría: captcha fallido ${MAX_CAPTCHA_RETRIES} veces seguidas`);
}

function extractDownloadUrl(html: string, baseUrl: string): string | undefined {
    // Buscar href con Descargar, Certificado, .pdf
    const patterns = [
        /href="([^"]*(?:[Dd]escargar[Cc]ertificado|[Dd]escargar|Certificado\.pdf)[^"]*)"/g,
        /href="([^"]*\.pdf[^"]*)"/g,
        /href="([^"]*[Dd]escargar[^"]*)"/g,
    ];
    for (const re of patterns) {
        const m = re.exec(html);
        if (m) {
            const href = m[1];
            if (href.startsWith('http')) return href;
            const base = new URL(baseUrl);
            return `${base.protocol}//${base.host}/webcert/${href.replace('./', '')}`;
        }
    }
    // onclick con window.location o similar
    const onclick = html.match(/onclick="[^"]*window\.location[^"]*=\s*'([^']+)'"/);
    if (onclick) {
        const href = onclick[1];
        if (href.startsWith('http')) return href;
        const base = new URL(baseUrl);
        return `${base.protocol}//${base.host}/webcert/${href.replace('./', '')}`;
    }
    return undefined;
}

function buildProcResult(rawBody: Buffer): { status: 'found' | 'not_found'; summary: string; pdfBuffer: Buffer } {
    return {
        status: 'not_found',
        summary: 'Certificado de antecedentes disciplinarios generado (Procuraduría)',
        pdfBuffer: rawBody,
    };
}

// ─────────────────────────────────────────────
// reCAPTCHA v2 — resolver con Gemini AI (GRATIS)
// Estrategia: audio challenge → Gemini transcribe → submit
// Usa las llaves GEMINI_API_KEY rotatorias del .env
// ─────────────────────────────────────────────
// transcripción de audio delegada al orquestador (Gemini 7 llaves → Groq Whisper → error)
async function transcribeAudioCaptcha(audioBuffer: Buffer, mimeType: string): Promise<string> {
    return AIOrchestrator.transcribeAudio(audioBuffer, mimeType);
}

async function solveRecaptchaAudio(page: any, timeoutMs = 60000): Promise<void> {
    const isAnchorFrame = (url: string) =>
        url.includes('recaptcha/api2/anchor') ||
        url.includes('recaptcha/enterprise/anchor') ||
        url.includes('recaptcha.net/recaptcha');

    const isBframe = (url: string) =>
        url.includes('recaptcha/api2/bframe') ||
        url.includes('recaptcha/enterprise/bframe');

    // Scroll al widget para activar inicialización (lazy load)
    await page.evaluate(() => {
        const el = document.querySelector('.g-recaptcha, div[data-sitekey], iframe[src*="recaptcha"]') as HTMLElement;
        if (el) el.scrollIntoView({ block: 'center' });
    }).catch(() => {});

    // Detección por evento (waitForFrame) — más fiable que polling en Node.js ocupado
    console.log('[RECAPTCHA] Esperando iframe anchor...');
    const anchor: any = await page.waitForFrame(isAnchorFrame, { timeout: timeoutMs }).catch(() => null);

    if (!anchor) {
        const urls = page.frames().map((f: any) => f.url()).filter((u: string) => u && u !== 'about:blank');
        console.warn('[RECAPTCHA] Frames al timeout:', JSON.stringify(urls));
        throw new Error('reCAPTCHA iframe no apareció');
    }
    console.log('[RECAPTCHA] anchor:', anchor.url().substring(0, 70));

    // Click en checkbox
    await anchor.waitForSelector('#recaptcha-anchor', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 500));
    await anchor.click('#recaptcha-anchor');
    await new Promise(r => setTimeout(r, 3000));

    // Verificar si pasó sin challenge
    const alreadyDone = await page.evaluate(() => {
        const ta = document.querySelector('textarea[name="g-recaptcha-response"]') as HTMLTextAreaElement;
        return !!(ta?.value && ta.value.length > 20);
    }).catch(() => false);
    if (alreadyDone) { console.log('[RECAPTCHA] Resuelto sin desafío visual'); return; }

    // Esperar bframe (challenge popup)
    const bframe: any = await page.waitForFrame(isBframe, { timeout: 20000 }).catch(() => null);
    if (!bframe) throw new Error('Frame de desafío reCAPTCHA no apareció');
    await new Promise(r => setTimeout(r, 1000));

    // Cambiar a audio
    await bframe.waitForSelector('#recaptcha-audio-button', { timeout: 8000 }).catch(() => {});
    await bframe.click('#recaptcha-audio-button');
    await new Promise(r => setTimeout(r, 2500));

    // Obtener URL del audio
    const audioSrc: string = await bframe.evaluate(() => {
        const a = document.querySelector('.rc-audiochallenge-tdownload-link') as HTMLAnchorElement;
        const s2 = document.querySelector('#audio-source') as HTMLSourceElement;
        const au = document.querySelector('audio') as HTMLAudioElement;
        return a?.href || s2?.src || au?.src || '';
    });
    if (!audioSrc) throw new Error('URL de audio reCAPTCHA no encontrada');

    // Descargar y transcribir con Gemini/Groq
    console.log('[RECAPTCHA] Descargando y transcribiendo audio...');
    const audioRes = await fetch(audioSrc);
    const audioBuf = Buffer.from(await audioRes.arrayBuffer());
    const mimeType = audioRes.headers.get('content-type') || 'audio/mp3';
    const answer = await transcribeAudioCaptcha(audioBuf, mimeType);
    console.log('[RECAPTCHA] Respuesta IA:', answer);

    // Ingresar respuesta
    await bframe.waitForSelector('#audio-response', { timeout: 5000 });
    await bframe.click('#audio-response');
    await bframe.type('#audio-response', answer, { delay: 60 });
    await bframe.click('#recaptcha-verify-button');
    await new Promise(r => setTimeout(r, 2500));

    const solved = await page.evaluate(() => {
        const ta = document.querySelector('textarea[name="g-recaptcha-response"]') as HTMLTextAreaElement;
        return !!(ta?.value && ta.value.length > 20);
    }).catch(() => false);

    if (!solved) throw new Error('reCAPTCHA no verificado — respuesta IA incorrecta');
    console.log('[RECAPTCHA] ✓ Resuelto');
}

// ─────────────────────────────────────────────
// Contraloría General — Antecedentes Fiscales Persona Natural
// URL: cfiscal.contraloria.gov.co/Certificados/CertificadoPersonaNatural.aspx
// ─────────────────────────────────────────────
const CONTRALORIA_URL = 'https://cfiscal.contraloria.gov.co/Certificados/CertificadoPersonaNatural.aspx';

async function scrapeContraloria(
    entityId: string, docType: string, page: any
): Promise<{ status: 'found' | 'not_found' | 'error'; summary: string; pdfBuffer: Buffer }> {

    // 1. Navegar al formulario (networkidle2 para que reCAPTCHA script cargue)
    await page.goto(CONTRALORIA_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('div.g-recaptcha, div[data-sitekey], .recaptcha-checkbox', { timeout: 15000 })
        .catch(() => console.warn('[CONTRALORIA] Contenedor reCAPTCHA no encontrado en DOM'));
    await new Promise(r => setTimeout(r, 800));

    // 2. Seleccionar tipo de documento (extraer valores reales del select)
    const selectId = await page.$eval(
        'select[name*="TipoDocumento"], select[name*="tipoDocumento"], select[id*="TipoDocumento"]',
        (el: any) => el.id || el.name
    ).catch(() => 'MainContent_ddlTipoDocumento');

    const options: Record<string, string> = await page.$$eval(
        `#${selectId} option, select[name*="TipoDocumento"] option`,
        (opts: any[]) => Object.fromEntries(
            opts.map(o => [o.textContent.trim().toLowerCase(), o.value])
        )
    ).catch(() => ({}));

    const tipoKey = docType.toLowerCase();
    const tipoVal = Object.entries(options).find(([k]) =>
        tipoKey.includes('ciudadan') ? k.includes('ciudadan') :
        tipoKey.includes('extranjeri') ? k.includes('extranjeri') :
        tipoKey.includes('nit') ? k.includes('nit') :
        tipoKey.includes('pasaporte') ? k.includes('pasaporte') : false
    )?.[1] || '1';

    await page.select(`#${selectId}`, tipoVal).catch(() => {});

    // 3. Escribir número de documento
    const numInput = await page.$('input[name*="NumeroDocumento"], input[name*="numeroDocumento"], input[id*="NumeroDocumento"]');
    if (numInput) {
        await numInput.click({ clickCount: 3 });
        await numInput.type(entityId, { delay: 50 });
    }

    // 4. Resolver reCAPTCHA vía audio + Gemini
    console.log('[CONTRALORIA] Resolviendo reCAPTCHA...');
    await solveRecaptchaAudio(page, 90000);

    // 5. Click Buscar y esperar resultado
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        page.click('input[type="submit"][value*="Buscar"], button[id*="btnBuscar"], input[id*="btnBuscar"]'),
    ]);
    await new Promise(r => setTimeout(r, 2000));

    const resultHtml = await page.content();

    // 6. Interpretar resultado
    const lower = resultHtml.toLowerCase();
    const noAntecedentes = lower.includes('no reporta') || lower.includes('sin antecedentes') || lower.includes('no registra antecedentes');
    const tieneAntecedentes = !noAntecedentes && (lower.includes('reporta') || lower.includes('bolet') || lower.includes('antecedentes fiscales'));
    const status: 'found' | 'not_found' = tieneAntecedentes ? 'found' : 'not_found';
    const summary = tieneAntecedentes
        ? 'ATENCIÓN: El ciudadano presenta antecedentes fiscales (Contraloría)'
        : 'El ciudadano no presenta antecedentes fiscales (Contraloría)';

    // 7. Generar PDF de la página resultado
    const pdfBuffer = Buffer.from(await page.pdf({
        format: 'Letter', printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    }));

    return { status, summary, pdfBuffer };
}

// ─────────────────────────────────────────────
// Policía Nacional — Antecedentes Judiciales
// URL: antecedentes.policia.gov.co:7005/WebJudicial/
// ─────────────────────────────────────────────
const POLICIA_BASE = 'https://antecedentes.policia.gov.co:7005/WebJudicial';
const POLICIA_DOC_TYPES: Record<string, string> = {
    'Cédula de ciudadanía': 'CC',
    'Cédula extranjería': 'CE',
    'Pasaporte': 'PA',
    'PEP': 'PE',
    'PPT': 'PT',
};

async function scrapePoliciaNacional(
    entityId: string, docType: string, page: any
): Promise<{ status: 'found' | 'not_found' | 'error'; summary: string; pdfBuffer: Buffer }> {

    // 1. Navegar a términos y aceptar
    await page.goto(`${POLICIA_BASE}/index.xhtml`, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1000));

    // Click radio "Acepto"
    await page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        for (const r of radios) {
            const val = (r as HTMLInputElement).value?.toLowerCase();
            if (val === 'true' || val === 'acepto' || val === '1') {
                (r as HTMLInputElement).click();
                return;
            }
        }
        // Si no encontró por value, clic en el primero
        (radios[0] as HTMLInputElement)?.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Click Enviar/Continuar
    await page.evaluate(() => {
        const btn = document.querySelector('button[id*="continuar"], input[type="submit"], button[type="submit"]') as HTMLElement;
        btn?.click();
    });
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // Si sigue en index, navegar manualmente a antecedentes
    if (page.url().includes('index.xhtml')) {
        await page.goto(`${POLICIA_BASE}/antecedentes.xhtml`, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1000));
    }

    // 2. Seleccionar tipo de documento
    const tipoDoc = POLICIA_DOC_TYPES[docType] || 'CC';
    await page.evaluate((val: string) => {
        const sel = document.querySelector('select') as HTMLSelectElement;
        if (sel) {
            for (const opt of Array.from(sel.options)) {
                if (opt.value === val || opt.text.includes(val)) {
                    sel.value = opt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        }
    }, tipoDoc);

    // 3. Escribir número de documento
    const numInput = await page.$('input[type="text"]:not([id*="captcha"]):not([name*="captcha"])');
    if (numInput) {
        await numInput.click({ clickCount: 3 });
        await numInput.type(entityId, { delay: 50 });
    }

    // 4. Resolver reCAPTCHA vía audio + Gemini
    await page.waitForSelector('div.g-recaptcha, div[data-sitekey], .recaptcha-checkbox', { timeout: 15000 })
        .catch(() => console.warn('[POLICIA] Contenedor reCAPTCHA no encontrado en DOM'));
    await new Promise(r => setTimeout(r, 800));
    console.log('[POLICIA] Resolviendo reCAPTCHA...');
    await solveRecaptchaAudio(page, 90000);

    // 5. Click Consultar y esperar resultado
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        page.evaluate(() => {
            const btn = document.querySelector('button[id*="Consultar"], input[id*="Consultar"], button[type="submit"], input[type="submit"]') as HTMLElement;
            btn?.click();
        }),
    ]);
    await new Promise(r => setTimeout(r, 2000));

    const resultHtml = await page.content();

    // 6. Interpretar resultado
    const lower = resultHtml.toLowerCase();
    const noAntecedentes = lower.includes('no registra') || lower.includes('no presenta antecedentes') || lower.includes('no tiene antecedentes');
    const tieneAntecedentes = !noAntecedentes && (lower.includes('registra antecedentes') || lower.includes('antecedentes judiciales') || lower.includes('tiene antecedentes'));
    const status: 'found' | 'not_found' = tieneAntecedentes ? 'found' : 'not_found';
    const summary = tieneAntecedentes
        ? 'ATENCIÓN: El ciudadano presenta antecedentes judiciales (Policía Nacional)'
        : 'El ciudadano no presenta antecedentes judiciales (Policía Nacional)';

    // 7. Generar PDF
    const pdfBuffer = Buffer.from(await page.pdf({
        format: 'Letter', printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    }));

    return { status, summary, pdfBuffer };
}

// ─────────────────────────────────────────────
// Helper: crea página Puppeteer ya configurada
// ─────────────────────────────────────────────
async function createConfiguredPage(browser: any): Promise<any> {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['es-CO', 'es', 'en-US', 'en'] });
        const origPerms = window.navigator.permissions.query.bind(window.navigator.permissions);
        (window.navigator.permissions as any).query = (p: any) =>
            p.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
                : origPerms(p);
    });
    // Nota: no usar setExtraHTTPHeaders con Sec-Fetch-* — interfiere con los
    // sub-requests internos de reCAPTCHA (iframes de Google envían headers diferentes)
    return page;
}

// ─────────────────────────────────────────────
// Endpoint principal: ejecutar validación (paralelo)
// ─────────────────────────────────────────────
export const runValidation = async (req: Request, res: Response) => {
    const { entity_type, entity_id, entity_name, source_ids, doc_type } = req.body;
    const user = (req as any).user?.name || 'SYSTEM';

    if (!entity_type || !entity_id || !entity_name || !Array.isArray(source_ids) || source_ids.length === 0) {
        return res.status(400).json({ error: 'entity_type, entity_id, entity_name y source_ids son requeridos' });
    }

    const sourcesResult = await pool.query(
        `SELECT * FROM validation_sources WHERE id = ANY($1) AND is_active = true`,
        [source_ids]
    );
    if (sourcesResult.rows.length === 0) {
        return res.status(400).json({ error: 'No se encontraron fuentes activas con los IDs indicados' });
    }

    let browser: any;

    try {
        browser = await puppeteerExtra.launch({
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,900',
                '--ignore-certificate-errors'
            ]
        });

        const folderName = entity_type === 'tercero'
            ? sanitizeFolder(`${entity_id}-${entity_name}`)
            : sanitizeFolder(entity_id.toUpperCase());
        const subFolder = entity_type === 'tercero' ? 'terceros' : 'placas';
        const driveFolderPath = `${DRIVE_BASE_PATH}/${subFolder}/${folderName}`;

        const hasRclone = await rcloneAvailable();
        if (!hasRclone) console.log('[VALIDATION] rclone no disponible — PDF guardado localmente');

        const tipoDoc = doc_type || 'Cédula de ciudadanía';
        const t0 = Date.now();
        console.log(`[VALIDATION] Iniciando ${sourcesResult.rows.length} fuentes en paralelo para ${entity_id}`);

        // Ejecutar TODAS las fuentes en paralelo, cada una con su propia página
        const settled = await Promise.allSettled(
            sourcesResult.rows.map(async (source: any) => {
                const page = source.id === 'procuraduria' ? null : await createConfiguredPage(browser);
                try {
                    let result: { status: 'found' | 'not_found' | 'error'; summary: string; pdfBuffer: Buffer };

                    if (source.id === 'ofac') {
                        result = await scrapeOFAC(entity_id, page);
                    } else if (source.id === 'procuraduria') {
                        result = await generateProcuraduria(entity_id, entity_name, tipoDoc);
                    } else if (source.id === 'contraloria') {
                        result = await scrapeContraloria(entity_id, tipoDoc, page);
                    } else if (source.id === 'policia') {
                        result = await scrapePoliciaNacional(entity_id, tipoDoc, page);
                    } else {
                        throw new Error(`Scraper para fuente "${source.id}" no implementado`);
                    }

                    return { source, ...result };
                } finally {
                    if (page) await page.close().catch(() => {});
                }
            })
        );

        console.log(`[VALIDATION] Completado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

        // Procesar resultados y guardar en DB
        const results: any[] = [];

        for (const outcome of settled) {
            let source: any, status: 'found' | 'not_found' | 'error', summary: string, pdfBuffer: Buffer | undefined;

            if (outcome.status === 'fulfilled') {
                ({ source, status, summary, pdfBuffer } = outcome.value);
            } else {
                // No tenemos source aquí — buscar por índice
                const idx = settled.indexOf(outcome);
                source = sourcesResult.rows[idx];
                status = 'error';
                summary = (outcome.reason as any)?.message || 'Error desconocido';
                console.error(`[VALIDATION-ERR] ${source?.id}:`, summary);
            }

            let drivePath = '';
            let driveLink = '';

            if (pdfBuffer && pdfBuffer.length > 0) {
                try {
                    if (hasRclone) {
                        const tmpPath = path.join(os.tmpdir(), `validation_${entity_id}_${source.id}_${Date.now()}.pdf`);
                        fs.writeFileSync(tmpPath, pdfBuffer);
                        drivePath = `${driveFolderPath}/${source.file_name}`;
                        await rcloneMkdir(driveFolderPath);
                        await rcloneCopyto(tmpPath, drivePath);
                        driveLink = await rcloneLink(drivePath);
                        fs.unlinkSync(tmpPath);
                    } else {
                        const localFolder = path.join(LOCAL_PDF_DIR, folderName);
                        fs.mkdirSync(localFolder, { recursive: true });
                        const localFile = path.join(localFolder, source.file_name);
                        fs.writeFileSync(localFile, pdfBuffer);
                        drivePath = `local:${folderName}/${source.file_name}`;
                        driveLink = `/api/validation/pdf/${encodeURIComponent(folderName)}/${encodeURIComponent(source.file_name)}`;
                        console.log(`[VALIDATION] PDF local: ${localFile}`);
                    }
                } catch (saveErr: any) {
                    console.error(`[VALIDATION] Error guardando PDF ${source.id}:`, saveErr.message);
                }
            }

            const existing = await pool.query(
                'SELECT id FROM validation_records WHERE entity_id=$1 AND source_id=$2 AND entity_type=$3',
                [entity_id, source.id, entity_type]
            );
            if (existing.rows.length > 0) {
                await pool.query(
                    `UPDATE validation_records SET entity_name=$1, status=$2, drive_path=$3, drive_link=$4,
                     result_summary=$5, validated_at=NOW(), validated_by=$6 WHERE id=$7`,
                    [entity_name, status, drivePath || null, driveLink || null, summary, user, existing.rows[0].id]
                );
            } else {
                await pool.query(
                    `INSERT INTO validation_records (entity_type, entity_id, entity_name, source_id, status,
                     drive_path, drive_link, result_summary, validated_at, validated_by)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)`,
                    [entity_type, entity_id, entity_name, source.id, status, drivePath || null, driveLink || null, summary, user]
                );
            }

            results.push({ source_id: source.id, source_name: source.name, status, summary, drive_path: drivePath, drive_link: driveLink });
        }

        res.json({ success: true, results });

    } catch (err: any) {
        console.error('[VALIDATION-CRITICAL]', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (browser) await browser.close();
    }
};

// ─────────────────────────────────────────────
// Servir PDF local (entorno sin rclone)
// ─────────────────────────────────────────────
export const getLocalPdf = (req: Request, res: Response) => {
    const folder   = String(req.params.folder);
    const filename = String(req.params.filename);
    const filePath = path.join(LOCAL_PDF_DIR, decodeURIComponent(folder), decodeURIComponent(filename));
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PDF no encontrado' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${decodeURIComponent(filename)}"`);
    fs.createReadStream(filePath).pipe(res);
};
