import puppeteer from 'puppeteer';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuración de credenciales de Transportando
const TRANSPORTANDO_URL = 'https://tms.transportando.com.co/#/';
const NIT = '901121286';
const USUARIO = 'OSCAR_SANTAMARIA';
const CLAVE = '986532147';

if (!(globalThis as any).activeScraperLogs) {
    (globalThis as any).activeScraperLogs = [];
}
export const activeScraperLogs: string[] = (globalThis as any).activeScraperLogs;

/**
 * Función para descargar el informe general de manifiestos mes a mes
 * desde el 1 de enero hasta la fecha actual.
 */
export const scrapeTransportandoReports = async (
    reportType: 'manifiestos' | 'recaudos' | 'egresos' = 'manifiestos'
): Promise<string[]> => {
    const logs: string[] = [];
    activeScraperLogs.length = 0; // Clear previous logs
    const log = (msg: string) => {
        const timestamp = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
        const formatted = `[${timestamp}] ${msg}`;
        logs.push(formatted);
        activeScraperLogs.push(formatted);
        console.log(`[SCRAPER] ${formatted}`);
    };
    log(`[${new Date().toLocaleString()}] Iniciando bot de Scraping de Transportando para tipo: ${reportType}...`);

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
        let reportUrl = 'https://tms.transportando.com.co/#/informe-transporte?tipo=general-manifiestos';
        if (reportType === 'recaudos' || reportType === 'egresos') {
            reportUrl = 'https://tms.transportando.com.co/#/informes-contabilidad?tipo=informe-consecutivos';
        }
        log(`Navegando al módulo de informes: ${reportUrl}...`);
        await page.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

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

        // Simular un Request y Response de Express para usar la función existente del backend
        const mockResponse = () => {
            const res: any = {};
            res.status = () => res;
            res.json = (data: any) => data;
            return res;
        };

        for (const [index, { start, end }] of monthsToQuery.entries()) {
            log(`Procesando periodo: ${start} al ${end} (${index + 1}/${monthsToQuery.length})...`);

            // Recargar la página en iteraciones posteriores para asegurar un DOM limpio y evitar detached frames
            if (index > 0) {
                try {
                    log(`Recargando la página para iniciar el nuevo periodo con un DOM limpio...`);
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
                } catch (err: any) {
                    log(`ADVERTENCIA: Timeout recargando la página, intentando continuar de todas formas: ${err.message}`);
                }
                await new Promise(r => setTimeout(r, 4000));
            }

            // Configurar opciones específicas de reporte
            if (reportType === 'recaudos' || reportType === 'egresos') {
                const targetOption = reportType === 'recaudos' ? 'Recaudos' : 'Egresos';
                log(`Esperando a que cargue el selector de secuencia...`);
                
                // Esperar a que el selector o input esté listo
                await page.waitForFunction(() => {
                    return Array.from(document.querySelectorAll('input')).some(i => i.placeholder?.includes('secuencia')) ||
                           document.querySelector('.el-select__wrapper') !== null;
                }, { timeout: 30000 });

                log(`Buscando selector de secuencia para elegir "${targetOption}"...`);
                const selectEl = await page.evaluateHandle(() => {
                    // Buscar el input que tiene el placeholder "Buscar por secuencia"
                    const input = Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.includes('secuencia'));
                    if (input) return input;
                    // Fallback a clase genérica
                    return document.querySelector('.el-select__input') || document.querySelector('.el-select__wrapper');
                });

                if (selectEl) {
                    await (selectEl as any).click();
                    await new Promise(r => setTimeout(r, 1200));

                    log(`Limpiando texto previo e ingresando búsqueda para "${targetOption}"...`);
                    await page.keyboard.down('Control');
                    await page.keyboard.press('A');
                    await page.keyboard.up('Control');
                    await page.keyboard.press('Backspace');
                    await page.keyboard.type(targetOption);
                    await new Promise(r => setTimeout(r, 1500));

                    log(`Buscando opción "${targetOption}" en la lista filtrada...`);
                    const optionSelected = await page.evaluate((opt) => {
                        const items = Array.from(document.querySelectorAll('.el-select-dropdown__item'));
                        const target = items.find(item => item.textContent?.toLowerCase().includes(opt.toLowerCase()));
                        if (target) {
                            (target as any).click();
                            return true;
                        }
                        return false;
                    }, targetOption);

                    if (optionSelected) {
                        log(`Opción "${targetOption}" seleccionada exitosamente.`);
                    } else {
                        log(`ADVERTENCIA: No se pudo seleccionar la secuencia "${targetOption}" en el dropdown.`);
                    }

                    // Cerrar el dropdown usando Escape para evitar que tape otros elementos
                    await page.keyboard.press('Escape');
                    await new Promise(r => setTimeout(r, 1200));
                } else {
                    log(`ERROR: No se encontró el selector de secuencia en la interfaz.`);
                }
            } else {
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
            }
            
            // Llenar inputs de fechas interactuando con el teclado y con fallback DOM
            log(`Ingresando el rango de fechas ${start} - ${end} en formato DD/MM/YYYY...`);
            const startParts = start.split('-'); // [2026, 01, 01]
            const startFormatted = `${startParts[2]}/${startParts[1]}/${startParts[0]}`; // 01/01/2026

            const endParts = end.split('-');
            const endFormatted = `${endParts[2]}/${endParts[1]}/${endParts[0]}`; // 31/01/2026

            const inputs = await page.$$('input.el-range-input');
            if (inputs.length >= 2) {
                // Remover readonly y vaciar los campos via JS para evitar acumulaciones de texto viejo
                await page.evaluate((el1, el2) => {
                    el1.removeAttribute('readonly');
                    el2.removeAttribute('readonly');
                    el1.value = '';
                    el2.value = '';
                    el1.dispatchEvent(new Event('input', { bubbles: true }));
                    el1.dispatchEvent(new Event('change', { bubbles: true }));
                    el2.dispatchEvent(new Event('input', { bubbles: true }));
                    el2.dispatchEvent(new Event('change', { bubbles: true }));
                }, inputs[0], inputs[1]);
                await new Promise(r => setTimeout(r, 500));

                log(`Haciendo clic en la fecha de inicio y escribiendo: ${startFormatted}...`);
                await inputs[0].focus();
                await inputs[0].click();
                await new Promise(r => setTimeout(r, 600));
                await page.keyboard.type(startFormatted, { delay: 50 });
                await new Promise(r => setTimeout(r, 500));
                
                log(`Cambiando al campo de fecha fin y escribiendo: ${endFormatted}...`);
                await inputs[1].focus();
                await inputs[1].click();
                await new Promise(r => setTimeout(r, 600));
                await page.keyboard.type(endFormatted, { delay: 50 });
                await new Promise(r => setTimeout(r, 500));
                
                log(`Confirmando fechas en el calendario...`);
                await page.keyboard.press('Enter');
                await new Promise(r => setTimeout(r, 800));

                // Fallback directo por DOM para garantizar que los modelos reactivos de Vue reciban el valor
                await page.evaluate((sVal, eVal) => {
                    const rangeInputs = Array.from(document.querySelectorAll('input.el-range-input')) as HTMLInputElement[];
                    if (rangeInputs.length >= 2) {
                        rangeInputs[0].value = sVal;
                        rangeInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                        rangeInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
                        
                        rangeInputs[1].value = eVal;
                        rangeInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
                        rangeInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, startFormatted, endFormatted);
                await new Promise(r => setTimeout(r, 500));
            }

            // Esperar a que el calendario y cualquier dropdown se cierre, enviando Escape por seguridad
            await page.keyboard.press('Escape');
            log(`Esperando a que la interfaz se estabilice antes de hacer clic en "Obtener informe"...`);
            await new Promise(r => setTimeout(r, 2000));

            // Obtener y loggear el estado de los inputs para auditoría visual en logs
            const formValues = await page.evaluate(() => {
                const rangeInputs = Array.from(document.querySelectorAll('input.el-range-input')) as HTMLInputElement[];
                const selectWrappers = Array.from(document.querySelectorAll('.el-select__wrapper'));
                const secuenciaText = selectWrappers[0] ? selectWrappers[0].textContent?.trim() : 'No encontrado';
                return {
                    fechaInicio: rangeInputs[0] ? rangeInputs[0].value : 'No encontrado',
                    fechaFin: rangeInputs[1] ? rangeInputs[1].value : 'No encontrado',
                    secuencia: secuenciaText || 'No encontrado'
                };
            });
            log(`RECORRIDO - Estado Formulario: Fecha Inicio = "${formValues.fechaInicio}", Fecha Fin = "${formValues.fechaFin}", Secuencia = "${formValues.secuencia}"`);

            log(`Fechas y opciones ingresadas. Solicitando generación del informe al servidor de Transportando...`);

            // Clic nativo en "Obtener informe" u "Obtener informes"
            const buttons = await page.$$('button.el-button, button');
            let targetButtonHandle: any = null;
            for (const btn of buttons) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text && (text.includes('Obtener informe') || text.includes('Obtener informes'))) {
                    targetButtonHandle = btn;
                    break;
                }
            }

            if (targetButtonHandle) {
                await targetButtonHandle.scrollIntoView();
                await new Promise(r => setTimeout(r, 500));
                await targetButtonHandle.click();
                log(`Se hizo clic exitosamente en el botón "Obtener informe".`);
            } else {
                log(`ERROR: No se encontró el botón "Obtener informe" en la página.`);
            }

            log(`Esperando a que la tabla de resultados cargue...`);
            
            // Esperar hasta 40 segundos a que aparezca el botón de Excel o el texto de "no hay datos"
            let excelButtonFound = false;
            let noDataFound = false;
            for (let i = 0; i < 40; i++) {
                await new Promise(r => setTimeout(r, 1000));
                
                // 1. Verificar si apareció el botón de Excel
                excelButtonFound = await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, a'));
                    return btns.some(b => {
                        const txt = b.textContent?.toLowerCase() || '';
                        return txt.includes('descargar excel') || txt.includes('exportar excel');
                    });
                });
                if (excelButtonFound) break;

                // 2. Verificar si apareció un texto de "no hay datos"
                noDataFound = await page.evaluate(() => {
                    const pageText = document.body.textContent?.toLowerCase() || '';
                    return pageText.includes('no hay datos') || 
                           pageText.includes('sin datos') || 
                           pageText.includes('no se encontraron') || 
                           pageText.includes('no data');
                });
                if (noDataFound) {
                    log(`Información: No se encontraron datos para el periodo ${start} al ${end} (indicado por la plataforma).`);
                    break;
                }
            }

            if (noDataFound) {
                continue; // Saltar al siguiente mes
            }

            if (!excelButtonFound) {
                log(`ADVERTENCIA: El botón de descarga de Excel no apareció después de 40 segundos para el periodo ${start} al ${end}. La consulta pudo no retornar datos o falló.`);
                continue; // Saltar al siguiente mes
            }

            log(`Intentando descargar el archivo Excel del informe para el periodo ${start} al ${end}...`);
            const excelButtons = await page.$$('button, a');
            let excelButtonHandle: any = null;
            for (const btn of excelButtons) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text && (text.toLowerCase().includes('descargar excel') || text.toLowerCase().includes('exportar excel'))) {
                    excelButtonHandle = btn;
                    break;
                }
            }

            if (excelButtonHandle) {
                await excelButtonHandle.scrollIntoView();
                await new Promise(r => setTimeout(r, 500));
                await excelButtonHandle.click();
                log(`Se hizo clic exitosamente en el botón de descarga de Excel.`);
            } else {
                log(`ERROR: No se pudo hacer clic en el botón de descarga de Excel.`);
            }

            // Esperar archivo descargado
            let downloadedFilePath: string | null = null;
            try {
                log(`Esperando a que finalice la descarga del archivo...`);
                downloadedFilePath = await waitForDownload(downloadPath, 45000);
                log(`Descarga finalizada. Archivo temporal guardado en: ${downloadedFilePath}`);

                // LEER EL EXCEL RECIEN DESCARGADO
                log(`Subiendo y parseando los datos a la BD local M7...`);
                const buf = fs.readFileSync(downloadedFilePath);
                const workbook = XLSX.read(buf, { type: 'buffer' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawJson = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

                if (rawJson.length > 0) {
                    log(`Columnas detectadas en el Excel: ${Object.keys(rawJson[0] as object).join(', ')}`);
                }

                log(`Excel leído con éxito: ${rawJson.length} filas encontradas para el periodo ${start} - ${end}.`);

                if (rawJson.length > 0) {
                    if (reportType === 'manifiestos') {
                        const { uploadReports } = await import('../controllers/management-report.controller.js');
                        const mockReq = { body: { records: rawJson }, user: { name: 'CRON_BOT_MANIFIESTOS' } } as any;
                        await uploadReports(mockReq, mockResponse());
                    } else if (reportType === 'recaudos') {
                        const { uploadReceiptDates } = await import('../controllers/management-report.controller.js');
                        const mockReq = { body: { records: rawJson }, user: { name: 'CRON_BOT_RECAUDOS' } } as any;
                        await uploadReceiptDates(mockReq, mockResponse());
                    } else if (reportType === 'egresos') {
                        const { uploadEgressDates } = await import('../controllers/management-report.controller.js');
                        const mockReq = { body: { records: rawJson }, user: { name: 'CRON_BOT_EGRESOS' } } as any;
                        await uploadEgressDates(mockReq, mockResponse());
                    }
                    log(`Importación completada en la BD M7 para el periodo ${start} al ${end}.`);
                } else {
                    log(`No se encontraron registros para importar en este periodo.`);
                }

            } catch (err: any) {
                log(`No se pudo descargar o procesar archivo para el periodo ${start} al ${end}: ${err.message}`);
            } finally {
                // Borrar archivo para limpiar (cumple con la limpieza robusta de temporales)
                if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                    try {
                        fs.unlinkSync(downloadedFilePath);
                        log(`Archivo Excel temporal borrado: ${downloadedFilePath}`);
                    } catch (unlinkErr: any) {
                        log(`ADVERTENCIA: No se pudo borrar el archivo temporal: ${unlinkErr.message}`);
                    }
                }
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
