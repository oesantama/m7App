import { Request, Response } from 'express';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
        const { entity_type, entity_id, limit = 50 } = req.query;
        let query = `SELECT vr.*, vs.name as source_name, vs.file_name
                     FROM validation_records vr
                     LEFT JOIN validation_sources vs ON vs.id = vr.source_id
                     WHERE 1=1`;
        const params: any[] = [];
        if (entity_type) { params.push(entity_type); query += ` AND vr.entity_type=$${params.length}`; }
        if (entity_id)   { params.push(entity_id);   query += ` AND vr.entity_id=$${params.length}`; }
        params.push(Number(limit));
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
// Scraper: Procuraduría General de la Nación
// ─────────────────────────────────────────────
async function scrapeProcuraduria(entityId: string, docType: string, page: any): Promise<{ status: 'found' | 'not_found' | 'error'; summary: string; pdfBuffer: Buffer }> {
    await page.goto('https://www.procuraduria.gov.co/Pages/Consulta-de-Antecedentes.aspx', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 5000));

    // 1. Seleccionar tipo de documento
    await page.evaluate((tipoDoc: string) => {
        const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
        const sel = selects.find(s => {
            const opts = Array.from(s.options).map(o => o.text.trim());
            return opts.some(o => o.includes('ciudadan') || o.includes('Cédula'));
        });
        if (!sel) return false;
        const opt = Array.from(sel.options).find(o => o.text.trim() === tipoDoc || o.text.includes(tipoDoc));
        if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
    }, docType);
    await new Promise(r => setTimeout(r, 800));

    // 2. Ingresar número de identificación
    await page.evaluate((idVal: string) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
        // Buscar por label o por posición — el input de número es el primero visible
        let target: HTMLInputElement | null = null;
        const labels = Array.from(document.querySelectorAll('label, span, td'));
        for (const lbl of labels) {
            if (lbl.textContent?.includes('Número Identificación') || lbl.textContent?.includes('Numero')) {
                const row = (lbl as HTMLElement).closest('tr') || (lbl as HTMLElement).parentElement;
                if (row) { target = row.querySelector('input[type="text"]'); if (target) break; }
            }
        }
        if (!target) target = inputs[0];
        if (!target) return false;
        target.value = idVal;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }, entityId);
    await new Promise(r => setTimeout(r, 500));

    // 3. Resolver captcha matemático "¿ Cuánto es X OP Y ?"
    const captchaResult = await page.evaluate(() => {
        // Buscar en todos los nodos de texto del documento
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const texts: string[] = [];
        let node;
        while ((node = walker.nextNode())) {
            const t = node.textContent?.trim() || '';
            if (t.length > 0) texts.push(t);
        }
        const allText = texts.join(' ');

        // Regex amplio: acepta X, x, ×, *, +, -, con espacios variables
        const match = allText.match(/[Cc]u[aá]nto\s+es\s+(\d+)\s*([xX×\*\+\-\/÷])\s*(\d+)/);
        if (!match) return { answer: null, debug: allText.substring(0, 500) };

        const a = parseInt(match[1]);
        const op = match[2];
        const b = parseInt(match[3]);
        let answer: string | null = null;
        if (op === '+')                          answer = String(a + b);
        else if (op === '-')                     answer = String(a - b);
        else if ('xX×*'.includes(op))            answer = String(a * b);
        else if (op === '/' || op === '÷')       answer = String(Math.round(a / b));
        return { answer, debug: `${a} ${op} ${b} = ${answer}` };
    });

    console.log('[PROCURADURIA-CAPTCHA]', captchaResult?.debug);
    if (!captchaResult?.answer) {
        throw new Error(`No se pudo leer el captcha matemático de la Procuraduría. Texto encontrado: ${captchaResult?.debug?.substring(0, 200)}`);
    }
    const captchaAnswer = captchaResult.answer;

    // Ingresar respuesta del captcha (segundo input de texto visible)
    await page.evaluate((answer: string) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
        // El captcha suele ser el último input antes del botón
        let target: HTMLInputElement | null = null;
        const labels = Array.from(document.querySelectorAll('label, span, td'));
        for (const lbl of labels) {
            if (lbl.textContent?.includes('Cuanto') || lbl.textContent?.includes('cuanto')) {
                const row = (lbl as HTMLElement).closest('tr') || (lbl as HTMLElement).parentElement;
                if (row) { target = row.querySelector('input[type="text"]'); if (target) break; }
            }
        }
        if (!target && inputs.length >= 2) target = inputs[inputs.length - 1];
        if (!target) return false;
        target.value = answer;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }, captchaAnswer);
    await new Promise(r => setTimeout(r, 500));

    // 4. Click en "Consultar"
    const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], button, input[type="button"]'));
        const btn = btns.find((b: any) =>
            b.value?.includes('Consultar') || b.textContent?.trim()?.includes('Consultar')
        );
        if (btn) { (btn as any).click(); return true; }
        return false;
    });
    if (!clicked) throw new Error('No se encontró el botón Consultar en Procuraduría');

    // 5. Esperar resultado
    await new Promise(r => setTimeout(r, 4000));
    await page.waitForFunction(() => {
        const body = document.body.textContent || '';
        return body.includes('no presenta antecedentes') || body.includes('presenta antecedentes') ||
               body.includes('ciudadano') || body.includes('Error') || body.includes('captcha');
    }, { timeout: 20000 }).catch(() => {});

    // 6. Extraer resumen
    const summary = await page.evaluate(() => {
        const body = document.body.textContent || '';
        if (body.includes('no presenta antecedentes')) return 'El ciudadano no presenta antecedentes';
        if (body.includes('presenta antecedentes'))    return 'ATENCIÓN: El ciudadano presenta antecedentes';
        if (body.includes('captcha') || body.includes('incorrecta') || body.includes('inválido')) return 'Captcha incorrecto — reintente';
        return 'Resultado no determinado';
    });

    if (summary.includes('Captcha') || summary.includes('captcha')) {
        throw new Error('Captcha rechazado por Procuraduría — el valor calculado no coincidió');
    }

    const status: 'found' | 'not_found' = summary.includes('no presenta') ? 'not_found' : 'found';

    const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
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
        browser = await puppeteer.launch({
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
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            (window as any).chrome = { runtime: {} };
        });
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7' });

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
                    const result = await scrapeProcuraduria(entity_id, tipoDoc, page);
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
    const { folder, filename } = req.params;
    const filePath = path.join(LOCAL_PDF_DIR, decodeURIComponent(folder), decodeURIComponent(filename));
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PDF no encontrado' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${decodeURIComponent(filename)}"`);
    fs.createReadStream(filePath).pipe(res);
};
