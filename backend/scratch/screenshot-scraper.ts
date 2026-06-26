import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const TRANSPORTANDO_URL = 'https://tms.transportando.com.co/#/';
const NIT = '901121286';
const USUARIO = 'OSCAR_SANTAMARIA';
const CLAVE = '986532147';

async function run() {
    console.log("Starting visual screenshot test...");
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        console.log("Navigating to login...");
        await page.goto(TRANSPORTANDO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 4000));

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

        await new Promise(r => setTimeout(r, 8000));
        console.log("Logged in. Navigating to reports page...");
        await page.goto('https://tms.transportando.com.co/#/informes-contabilidad?tipo=informe-consecutivos', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 4000));

        // Seleccionar secuencia Egresos (usando la lógica exacta de scraper.service.ts)
        console.log("Selecting Egresos sequence...");
        const selectEl = await page.evaluateHandle(() => {
            const input = Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.includes('secuencia'));
            if (input) return input;
            return document.querySelector('.el-select__input') || document.querySelector('.el-select__wrapper');
        });

        if (selectEl) {
            await (selectEl as any).click();
            await new Promise(r => setTimeout(r, 1200));

            console.log("Typing search option...");
            await page.keyboard.down('Control');
            await page.keyboard.press('A');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            await page.keyboard.type('Egresos');
            await new Promise(r => setTimeout(r, 1500));

            console.log("Clicking item in dropdown...");
            await page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('.el-select-dropdown__item'));
                const target = items.find(item => item.textContent?.toLowerCase().includes('egresos'));
                if (target) (target as any).click();
            });

            await page.keyboard.press('Escape');
            await new Promise(r => setTimeout(r, 1200));
        }

        // Introducir fechas: 01/06/2026 a 25/06/2026
        console.log("Entering dates...");
        const rangeInputs = await page.$$('input.el-range-input');
        if (rangeInputs.length >= 2) {
            // Remover readonly y vaciar los campos via JS
            await page.evaluate((el1, el2) => {
                el1.removeAttribute('readonly');
                el2.removeAttribute('readonly');
                el1.value = '';
                el2.value = '';
                el1.dispatchEvent(new Event('input', { bubbles: true }));
                el1.dispatchEvent(new Event('change', { bubbles: true }));
                el2.dispatchEvent(new Event('input', { bubbles: true }));
                el2.dispatchEvent(new Event('change', { bubbles: true }));
            }, rangeInputs[0], rangeInputs[1]);
            await new Promise(r => setTimeout(r, 800));

            // Escribir Fecha Inicio
            await rangeInputs[0].focus();
            await rangeInputs[0].click();
            await new Promise(r => setTimeout(r, 800));
            await page.keyboard.type('01/06/2026', { delay: 50 });
            await new Promise(r => setTimeout(r, 800));

            // Cambiar a Fecha Fin via Tab
            await page.keyboard.press('Tab');
            await new Promise(r => setTimeout(r, 800));
            await page.keyboard.type('25/06/2026', { delay: 50 });
            await new Promise(r => setTimeout(r, 800));

            // Confirmar rango con Enter
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1000));
        }

        // Escape para asegurar que el calendario se cierre
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 500));

        // Get audit state
        const audit = await page.evaluate(() => {
            const rangeInputs = Array.from(document.querySelectorAll('input.el-range-input')) as HTMLInputElement[];
            const wrapper = document.querySelector('.el-select__wrapper');
            return {
                start: rangeInputs[0]?.value,
                end: rangeInputs[1]?.value,
                seq: wrapper?.textContent?.trim()
            };
        });
        console.log("Audit state before click:", audit);

        console.log("Clicking Obtener informe...");
        const clickedObtener = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const obtBtn = btns.find(b => b.textContent?.includes('Obtener informe'));
            if (obtBtn) {
                (obtBtn as any).click();
                return true;
            }
            return false;
        });
        console.log(`Clicked Obtener informe: ${clickedObtener}`);

        console.log("Waiting for results...");
        await new Promise(r => setTimeout(r, 20000));

        console.log("Saving screenshot...");
        const screenshotPath = '/app/backend/scratch/media_egresos_screenshot.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to: ${screenshotPath}`);

        // Find and print all buttons on page
        const buttons = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.map(b => b.textContent?.trim()).filter(Boolean);
        });
        console.log("Buttons on page after search:", buttons);

    } catch (e: any) {
        console.error("Error during test:", e.message);
    } finally {
        await browser.close();
    }
}

run();
