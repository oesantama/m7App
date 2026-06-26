// Mock Date to June 25th, 2026
const OriginalDate = global.Date;
class MockDate extends OriginalDate {
    constructor(...args: any[]) {
        super();
        if (args.length === 0) {
            // June 25, 2026 (month is 0-indexed, so 5 is June)
            return new OriginalDate(2026, 5, 25);
        }
        return new (OriginalDate as any)(...args);
    }
}
// Static methods
(MockDate as any).now = () => new OriginalDate(2026, 5, 25).getTime();
(MockDate as any).UTC = OriginalDate.UTC;
(MockDate as any).parse = OriginalDate.parse;
global.Date = MockDate as any;

import { scrapeTransportandoReports } from '../services/scraper.service.js';

async function run() {
    console.log("--------------------------------------------------");
    console.log("INICIANDO PRUEBA CON FECHA DE HOY MOCKEADA A 25/06/2026");
    console.log("--------------------------------------------------");
    try {
        const resultLogs = await scrapeTransportandoReports('egresos');
        console.log("--------------------------------------------------");
        console.log("RESULTADOS DE LA PRUEBA DE EGRESOS:");
        console.log("--------------------------------------------------");
        console.log(resultLogs.join('\n'));
    } catch (e) {
        console.error("PRUEBA FALLIDA CON ERROR:", e);
    }
}

run();
