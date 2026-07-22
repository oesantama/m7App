import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { signAccessToken } from './backend/utils/jwt.util.js';

async function testLiveEndpointWithRealAuth() {
    console.log('[TEST-ENDPOINT] Probando endpoint /api/grupo-inter/process-pdf con signAccessToken (RS256)...');
    const pdfPath = '/app/pdf_test1.pdf';

    // Generar token firmado con la llave RS256 oficial del backend
    const token = signAccessToken({
        id: 1,
        email: 'admin@millasiete.com',
        role_id: 1,
        roleId: 1
    });

    const form = new FormData();
    form.append('file', fs.createReadStream(pdfPath));
    form.append('planilla', '103363');
    form.append('username', 'Test Admin System');

    try {
        const response = await axios.post(
            'http://localhost:8080/api/grupo-inter/process-pdf',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${token}`
                },
                responseType: 'stream',
                timeout: 180000
            }
        );

        console.log('[TEST-ENDPOINT] ✅ Petición aceptada con éxito. SSE Streaming recibido:\n');

        response.data.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.replace('data: ', '').trim();
                    if (jsonStr) {
                        try {
                            const data = JSON.parse(jsonStr);
                            if (data.type === 'log') {
                                console.log(`  📝 ${data.message}`);
                            } else if (data.type === 'progress') {
                                console.log(`  📊 Progreso: ${data.percent}% (Pág ${data.page})`);
                            } else if (data.type === 'end') {
                                console.log(`\n  🎉 FIN: ${data.message} | Coincidencias Totales: ${data.matches}`);
                                console.log('  Detalles:', JSON.stringify(data.matchedDetails, null, 2));
                            }
                        } catch (e) {
                            console.log(`  RAW: ${line}`);
                        }
                    }
                }
            }
        });

        response.data.on('end', () => {
            console.log('\n[TEST-ENDPOINT] Flujo completado exitosamente.');
            process.exit(0);
        });

    } catch (err: any) {
        console.error('[TEST-ENDPOINT] Error llamando al endpoint:', err?.response?.data || err?.message);
        process.exit(1);
    }
}

testLiveEndpointWithRealAuth().catch(err => {
    console.error(err);
    process.exit(1);
});
