
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const WAHA_URL = process.env.WAHA_API_URL || 'http://localhost:3000';
const WAHA_KEY = process.env.WAHA_API_KEY || '';
const SESSION_NAME = process.env.WAHA_SESSION_NAME || 'default';

async function sendTargetMessage() {
    const targetNumber = '573212300050'; // Agregamos prefijo 57 de Colombia si no está
    const message = 'todo ok exitoso';

    console.log(`--- ENVIANDO MENSAJE DE PRUEBA ---`);
    console.log(`De: Instancia ${EVO_INSTANCE}`);
    console.log(`Para: ${targetNumber}`);
    console.log(`Mensaje: ${message}`);

    try {
        const response = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVO_KEY
            },
            body: JSON.stringify({
                number: targetNumber,
                text: message,
                delay: 1200,
                linkPreview: false
            })
        });

        const data = await response.json();
        console.log('\nRespuesta del servidor:', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('\n✅ Petición enviada correctamente a Evolution API.');
        } else {
            console.error('\n❌ Error en la petición:', response.statusText);
        }
    } catch (error: any) {
        console.error('\n❌ Error de conexión:', error.message);
        console.log('\nSugerencia: Asegúrate de que Evolution API esté activo en ' + EVO_URL);
    }
}

sendTargetMessage();
