
import { restoreSystem } from '../services/migration.service.js';

async function run() {
    console.log('[M7-SETUP] Iniciando registro de páginas de firma...');
    try {
        const result = await restoreSystem();
        console.log('[M7-SETUP] Éxito:', result.message);
        process.exit(0);
    } catch (err) {
        console.error('[M7-SETUP] Error crítico:', err);
        process.exit(1);
    }
}

run();
