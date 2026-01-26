
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const EVO_URL = process.env.EVO_API_URL || 'http://localhost:8080';
const EVO_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'Milla7';

async function testEvolution() {
    console.log('--- TEST AUTOMÁTICO: EVOLUTION WHATSAPP API ---');
    console.log(`URL: ${EVO_URL}`);
    console.log(`Instancia: ${EVO_INSTANCE}`);

    // 1. Verificar Conexión
    try {
        console.log('\n[TEST 1] Verificando estado de la instancia...');
        const resConn = await fetch(`${EVO_URL}/instance/connectionState/${EVO_INSTANCE}`, {
            headers: { 'apikey': EVO_KEY }
        });
        
        if (!resConn.ok) {
            throw new Error(`Error HTTP: ${resConn.status}`);
        }

        const dataConn: any = await resConn.json();
        console.log('Estado:', dataConn.instance?.state || 'Desconocido');
        
        if (dataConn.instance?.state !== 'open') {
            console.warn('¡ADVERTENCIA! La instancia no está conectada (estado: ' + dataConn.instance?.state + ')');
        } else {
            console.log('✅ Instancia lista para enviar mensajes.');
        }

        // 2. Intentar buscar grupos o contactos (opcional para validar API)
        console.log('\n[TEST 2] Verificando lista de instancias activas...');
        const resInst = await fetch(`${EVO_URL}/instance/fetchInstances`, {
            headers: { 'apikey': EVO_KEY }
        });
        const dataInst: any = await resInst.json();
        const found = dataInst.some((inst: any) => inst.instanceName === EVO_INSTANCE);
        console.log(found ? `✅ Instancia "${EVO_INSTANCE}" encontrada en el servidor.` : `❌ Instancia "${EVO_INSTANCE}" NO encontrada.`);

    } catch (error: any) {
        console.error('❌ Error fatal en las pruebas:', error.message);
        console.log('\nSugerencia: Revisa que Evolution API esté corriendo y que la API KEY sea correcta.');
    }
}

testEvolution();
