import puppeteer from 'puppeteer';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuración de credenciales de Transportando
const TRANSPORTANDO_URL = 'https://tms.transportando.com.co/#/';
const NIT = '901121286';
const USUARIO = 'LINA_OROZCO';
const CLAVE = 'LINA_OROZCO';

export const activeScraperLogs: string[] = [];

/**
 * Función para descargar el informe general de manifiestos mes a mes
 * desde el 1 de enero hasta la fecha actual.
 */
export const scrapeTransportandoReports = async (): Promise<string[]> => {
    const logs: string[] = [];
    activeScraperLogs.length = 0; // Clear previous logs
    const log = (msg: string) => {
        logs.push(msg);
        activeScraperLogs.push(msg);
    };
    log(`[${new Date().toLocaleString()}] Iniciando bot de Scraping de Transportando...`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true, // Funciona en servidor Coolify
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // Carpeta temporal de descargas
        const downloadPath = path.join(os.tmpdir(), `transportando_downloads_${Date.now()}`);
        if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

        // Configurar Puppeteer para descargar en esta carpeta temporal automáticamente
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath,
        });

        // 1. INICIAR SESIÓN
        log(`Navegando a la página de login...`);
        await page.goto(TRANSPORTANDO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Esperar a que carguen los inputs de login
        await page.waitForSelector('#documento');
        
        // Ingresar credenciales en los campos correctos (Element Plus)
        await page.type('#documento', NIT);
        await page.type('#nombre', USUARIO);
        await page.type('#contrasena', CLAVE);

        // Clic en el botón "Iniciar Sesión" (verde)
        const clickedLogin = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent?.includes('Iniciar Sesión'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        if (!clickedLogin) {
            await page.keyboard.press('Enter');
        }

        // Esperamos unos segundos para que la sesión se establezca en el navegador
        await new Promise(r => setTimeout(r, 8000));
        log(`Login ejecutado. Intentando acceder a la ruta protegida...`);

        // 2. IR A LA RUTA DEL INFORME
        log(`Navegando al módulo de informes de manifiestos...`);
        await page.goto('https://tms.transportando.com.co/#/informe-transporte?tipo=general-manifiestos', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 3. CALCULAR LOS MESES A CONSULTAR (Desde Enero hasta el mes actual)
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth(); // 0 = Enero, 11 = Diciembre

        const monthsToQuery: {start: string, end: string}[] = [];
        for (let m = 0; m <= currentMonth; m++) {
            const firstDay = new Date(currentYear, m, 1);
            let lastDay = new Date(currentYear, m + 1, 0); // Último día del mes

            // Si es el mes actual, consultar hasta hoy
            if (m === currentMonth) {
                lastDay = currentDate;
            }

            monthsToQuery.push({
                start: firstDay.toISOString().slice(0, 10), // YYYY-MM-DD
                end: lastDay.toISOString().slice(0, 10),
            });
        }

        log(`Se realizarán ${monthsToQuery.length} consultas por mes.`);

        // Función para esperar un archivo en la carpeta de descargas
        const waitForDownload = async (downloadDir: string, timeout = 60000): Promise<string> => {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkInterval = setInterval(() => {
                    const files = fs.readdirSync(downloadDir);
                    const file = files.find(f => f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv'));
                    if (file) {
                        // Esperar a que deje de crecer (termine de descargar)
                        setTimeout(() => {
                            clearInterval(checkInterval);
                            resolve(path.join(downloadDir, file));
                        }, 2000);
                    } else if (Date.now() - startTime > timeout) {
                        clearInterval(checkInterval);
                        reject(new Error('Timeout esperando la descarga'));
                    }
                }, 1000);
            });
        };

        // Procesar e inyectar al backend usando importación dinámica para evitar ciclos
        const { uploadReports } = await import('../controllers/management-report.controller.js');
        
        // Simular un Request y Response de Express para usar la función existente del backend
        const mockResponse = () => {
            const res: any = {};
            res.status = () => res;
            res.json = (data: any) => data;
            return res;
        };

        for (const [index, { start, end }] of monthsToQuery.entries()) {
            log(`Procesando periodo: ${start} al ${end} (${index + 1}/${monthsToQuery.length})...`);
            
            // Recargar la página para asegurar un DOM limpio antes de cada interacción
            await page.reload({ waitUntil: 'networkidle2' });
            await new Promise(r => setTimeout(r, 4000));

            log(`Seleccionando "Tipo de fecha"...`);
            await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input.el-select__input'));
                if(inputs[0]) (inputs[0] as any).click();
                
                const wrappers = Array.from(document.querySelectorAll('.el-select__wrapper'));
                if (wrappers[0]) (wrappers[0] as any).click();
            });
            await new Promise(r => setTimeout(r, 1500));

            await page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('.el-select-dropdown__item span'));
                const opt = items.find(s => s.textContent?.trim() === 'Fecha de manifiesto');
                if (opt) (opt as any).click();
            });
            await new Promise(r => setTimeout(r, 1000));

            log(`Configurando "Omitir manifiestos anulados" a NO...`);
            await page.evaluate(() => {
                const labels = Array.from(document.querySelectorAll('label.el-radio'));
                const noLabel = labels.find(l => l.textContent?.includes('No'));
                if (noLabel) (noLabel as any).click();
            });
            await new Promise(r => setTimeout(r, 500));
            
            // Llenar inputs de fechas interactuando con el teclado
            log(`Ingresando el rango de fechas ${start} - ${end} en formato DD/MM/YYYY...`);
            const startParts = start.split('-'); // [2026, 01, 01]
            const startFormatted = `${startParts[2]}/${startParts[1]}/${startParts[0]}`; // 01/01/2026

            const endParts = end.split('-');
            const endFormatted = `${endParts[2]}/${endParts[1]}/${endParts[0]}`; // 31/01/2026

            const inputs = await page.$$('input.el-range-input');
            if (inputs.length >= 2) {
                // Click y limpiar Fecha Inicio
                await inputs[0].click();
                await new Promise(r => setTimeout(r, 500));
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.press('Backspace');
                await page.keyboard.type(startFormatted);
                await page.keyboard.press('Tab');
                
                await new Promise(r => setTimeout(r, 500));
                
                // Click y limpiar Fecha Fin
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.press('Backspace');
                await page.keyboard.type(endFormatted);
                await page.keyboard.press('Enter');
            }

            // Esperar a que el calendario se cierre
            await new Promise(r => setTimeout(r, 2000));

            log(`Fechas y opciones ingresadas. Solicitando generación del informe al servidor de Transportando...`);

            // Clic en "Obtener informe"
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent?.includes('Obtener informe'));
                if (btn) btn.click();
            });

            log(`Esperando a que la tabla de resultados cargue...`);
            
            // Esperar explícitamente hasta 40 segundos a que aparezca el botón de Descargar Excel
            let excelButtonFound = false;
            for (let i = 0; i < 40; i++) {
                await new Promise(r => setTimeout(r, 1000));
                excelButtonFound = await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, a'));
                    return btns.some(b => b.textContent?.toLowerCase().includes('descargar excel'));
                });
                if (excelButtonFound) break;
            }

            if (!excelButtonFound) {
                log(`ADVERTENCIA: El botón "Descargar Excel" no apareció después de 40 segundos para el periodo ${start} al ${end}. La consulta pudo no retornar datos o falló.`);
                continue; // Saltar al siguiente mes
            }

            log(`Intentando descargar el archivo Excel del informe para el periodo ${start} al ${end}...`);
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, a'));
                const btn = btns.find(b => b.textContent?.toLowerCase().includes('descargar excel'));
                if (btn) (btn as any).click();
            });

            // Esperar archivo descargado
            try {
                log(`Esperando a que finalice la descarga del archivo...`);
                const downloadedFilePath = await waitForDownload(downloadPath, 45000);
                log(`Descarga finalizada. Archivo temporal guardado en: ${downloadedFilePath}`);

                // LEER EL EXCEL RECIEN DESCARGADO
                log(`Subiendo y parseando los datos a la BD local M7...`);
                const buf = fs.readFileSync(downloadedFilePath);
                const workbook = XLSX.read(buf, { type: 'buffer' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawJson = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

                log(`Excel leído con éxito: ${rawJson.length} filas encontradas para el periodo ${start} - ${end}.`);

                if (rawJson.length > 0) {
                    // Enviar datos al controlador existente
                    const mockReq = { body: { records: rawJson }, user: { name: 'CRON_BOT' } } as any;
                    await uploadReports(mockReq, mockResponse());
                    log(`Importación completada en la BD M7 para el periodo ${start} al ${end}.`);
                } else {
                    log(`No se encontraron registros para importar en este periodo.`);
                }

                // Borrar archivo para limpiar
                fs.unlinkSync(downloadedFilePath);
                log(`Archivo Excel temporal borrado.`);

            } catch (err: any) {
                log(`No se pudo descargar o procesar archivo para el periodo ${start} al ${end}: ${err.message}`);
            }
        }

        log(`[${new Date().toLocaleString()}] Tarea de Scraping finalizada correctamente.`);
        
        // Limpiar directorio temporal
        fs.rmdirSync(downloadPath, { recursive: true });

    } catch (err: any) {
        log(`ERROR CRÍTICO EN SCRAPER: ${err.message}`);
        console.error('[CRON-SCRAPER-ERR]', err);
    } finally {
        if (browser) await browser.close();
    }

    return logs;
};
