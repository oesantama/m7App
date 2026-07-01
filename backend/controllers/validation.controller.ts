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
    // 1. GET form page (iframe real)
    const { html: formHtml, cookies } = await procHttp('GET', `${PROC_BASE}/inicio.aspx`);

    // Detectar bloqueo
    if (formHtml.includes('No Disponible') && !formHtml.includes('lblPregunta')) {
        throw new Error('La Procuraduría bloqueó el acceso. Intente más tarde.');
    }

    // 2. Extraer campos del formulario ASP.NET
    const viewstate   = formHtml.match(/name="__VIEWSTATE"\s+id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1];
    const vsgen       = formHtml.match(/name="__VIEWSTATEGENERATOR"[^>]+value="([^"]+)"/)?.[1] || '';
    const evval       = formHtml.match(/name="__EVENTVALIDATION"[^>]+value="([^"]+)"/)?.[1] || '';
    const formAction  = formHtml.match(/<form[^>]+action="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const captchaText = formHtml.match(/<span[^>]+id="lblPregunta"[^>]*>([^<]+)<\/span>/)?.[1];

    if (!viewstate || !formAction) throw new Error('No se encontró el formulario de la Procuraduría');

    // 3. Resolver captcha (matemático o pregunta de nombre)
    let answer = '';
    const captchaLower = captchaText?.toLowerCase() || '';
    if (captchaLower.includes('cuanto') || captchaLower.includes('cuánto')) {
        // Captcha matemático: "¿ Cuanto es 2 X 3 ?"
        const mathMatch = captchaText?.match(/[Cc]u[aá]nto\s+es\s+(\d+)\s*([xX×*+\-\/÷])\s*(\d+)/);
        if (!mathMatch) throw new Error(`Captcha matemático no reconocido: "${captchaText}"`);
        const ai = parseInt(mathMatch[1]), op = mathMatch[2], bi = parseInt(mathMatch[3]);
        if (op === '+') answer = String(ai + bi);
        else if (op === '-') answer = String(ai - bi);
        else if ('xX×*'.includes(op)) answer = String(ai * bi);
        else if (op === '/' || op === '÷') answer = String(Math.round(ai / bi));
    } else if (captchaLower.includes('primer nombre')) {
        // Pregunta de texto: "¿Cual es el primer nombre de la persona...?"
        answer = entityId; // Se responde con el número de cédula que ya ingresamos
        // En realidad pide el primer nombre de entity_name
        answer = entityName.trim().split(/\s+/)[0];
    } else {
        throw new Error(`Captcha no reconocido: "${captchaText}"`);
    }
    console.log(`[PROCURADURIA-CAPTCHA] "${captchaText?.trim()}" → "${answer}"`);
    if (!answer) throw new Error(`No se pudo resolver captcha: "${captchaText}"`);

    // 4. POST formulario
    const tipoId = PROC_DOC_TYPES[docType] || '1';
    const actionUrl = formAction.startsWith('http') ? formAction : `${PROC_BASE}/${formAction.replace('./', '')}`;
    const formBody = new URLSearchParams({
        '__EVENTTARGET': '', '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewstate, '__VIEWSTATEGENERATOR': vsgen, '__EVENTVALIDATION': evval,
        'ddlTipoID': tipoId, 'txtNumID': entityId,
        'txtRespuestaPregunta': answer, 'txtEmail': '', 'btnConsultar': 'Consultar',
    }).toString();

    const { html: resultHtml } = await procHttp('POST', actionUrl, formBody, {
        'Cookie': cookies, 'Referer': `${PROC_BASE}/inicio.aspx`,
    });

    // 5. Interpretar resultado
    const lower = resultHtml.toLowerCase();
    const noAntecedentes = lower.includes('no presenta antecedentes') || lower.includes('no registra antecedentes');
    const tieneAntecedentes = lower.includes('presenta antecedentes') && !noAntecedentes;
    const status: 'found' | 'not_found' = tieneAntecedentes ? 'found' : 'not_found';
    const summary = tieneAntecedentes
        ? 'ATENCIÓN: El ciudadano presenta antecedentes'
        : noAntecedentes
        ? 'El ciudadano no presenta antecedentes'
        : 'Consulta completada en Procuraduría';

    // 6. Generar PDF renderizando el HTML localmente (sin navegar al sitio)
    const fullHtml = resultHtml.includes('<html') ? resultHtml : `<html><head><meta charset="utf-8"></head><body>${resultHtml}</body></html>`;
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const pdfBuffer = await page.pdf({
        format: 'Letter', printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' }
    });

    return { status, summary, pdfBuffer: Buffer.from(pdfBuffer) };
}

// ─────────────────────────────────────────────
// Endpoint principal: ejecutar validación
// ─────────────────────────────────────────────
export const runValidation = async (req: Request, res: Response) => {
    const { entity_type, entity_id, entity_name, source_ids, doc_type } = req.body;
    const user = (req as any).user?.name || 'SYSTEM';

    if (!entity_type || !entity_id || !entity_name || !Array.isArray(source_ids) || source_ids.length === 0) {
        return res.status(400).json({ error: 'entity_type, entity_id, entity_name y source_ids son requeridos' });
    }

    // Obtener fuentes a ejecutar
    const sourcesResult = await pool.query(
        `SELECT * FROM validation_sources WHERE id = ANY($1) AND is_active = true`,
        [source_ids]
    );
    if (sourcesResult.rows.length === 0) {
        return res.status(400).json({ error: 'No se encontraron fuentes activas con los IDs indicados' });
    }

    const results: any[] = [];
    let browser: any;

    try {
        browser = await puppeteerExtra.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,900'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => {
            // Ocultar webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // Chrome runtime completo
            (window as any).chrome = {
                runtime: {}, loadTimes: () => {}, csi: () => {}, app: {}
            };
            // Plugins reales (headless tiene 0, detectado fácilmente)
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            // Idiomas colombianos
            Object.defineProperty(navigator, 'languages', { get: () => ['es-CO', 'es', 'en-US', 'en'] });
            // Permissions override (Notification check es un fingerprint común)
            const origPerms = window.navigator.permissions.query.bind(window.navigator.permissions);
            (window.navigator.permissions as any).query = (p: any) =>
                p.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
                    : origPerms(p);
        });
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
        });

        // Carpeta Drive según tipo de entidad
        const folderName = entity_type === 'tercero'
            ? sanitizeFolder(`${entity_id}-${entity_name}`)
            : sanitizeFolder(entity_id.toUpperCase());

        const subFolder = entity_type === 'tercero' ? 'terceros' : 'placas';
        const driveFolderPath = `${DRIVE_BASE_PATH}/${subFolder}/${folderName}`;

        const hasRclone = await rcloneAvailable();
        if (!hasRclone) {
            console.log('[VALIDATION] rclone no disponible en este entorno — PDF no se subirá a Drive');
        }

        for (const source of sourcesResult.rows) {
            let status: 'found' | 'not_found' | 'error' = 'error';
            let summary = '';
            let drivePath = '';
            let driveLink = '';

            try {
                let pdfBuffer: Buffer;

                if (source.id === 'ofac') {
                    const result = await scrapeOFAC(entity_id, page);
                    status = result.status;
                    summary = result.summary;
                    pdfBuffer = result.pdfBuffer;
                } else if (source.id === 'procuraduria') {
                    const tipoDoc = doc_type || 'Cédula de ciudadanía';
                    const result = await scrapeProcuraduria(entity_id, entity_name, tipoDoc, page);
                    status = result.status;
                    summary = result.summary;
                    pdfBuffer = result.pdfBuffer;
                } else {
                    throw new Error(`Scraper para fuente "${source.id}" no implementado aún`);
                }

                // Guardar PDF: Drive si rclone disponible, local si no
                if (hasRclone) {
                    const tmpPath = path.join(os.tmpdir(), `validation_${entity_id}_${source.id}_${Date.now()}.pdf`);
                    fs.writeFileSync(tmpPath, pdfBuffer);
                    drivePath = `${driveFolderPath}/${source.file_name}`;
                    await rcloneMkdir(driveFolderPath);
                    await rcloneCopyto(tmpPath, drivePath);
                    driveLink = await rcloneLink(drivePath);
                    fs.unlinkSync(tmpPath);
                } else {
                    // Guardar localmente en backend/docs/validaciones/{entity_id}/{source.file_name}
                    const localFolder = path.join(LOCAL_PDF_DIR, folderName);
                    fs.mkdirSync(localFolder, { recursive: true });
                    const localFile = path.join(localFolder, source.file_name);
                    fs.writeFileSync(localFile, pdfBuffer);
                    drivePath = `local:${folderName}/${source.file_name}`;
                    driveLink = `/api/validation/pdf/${encodeURIComponent(folderName)}/${encodeURIComponent(source.file_name)}`;
                    console.log(`[VALIDATION] PDF guardado localmente: ${localFile}`);
                }

            } catch (err: any) {
                status = 'error';
                summary = err.message;
                console.error(`[VALIDATION-ERR] ${source.id}:`, err.message);
            }

            // Guardar/actualizar registro en DB (upsert por entity_id + source_id)
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

            results.push({
                source_id: source.id,
                source_name: source.name,
                status,
                summary,
                drive_path: drivePath,
                drive_link: driveLink,
            });
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
