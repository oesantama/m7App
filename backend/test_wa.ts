
// Mock env for local test
process.env.WAHA_API_URL = 'http://localhost:3000';
process.env.WAHA_API_KEY = 'milla7_secret_key_123';
process.env.WAHA_SESSION_NAME = 'default';

async function test() {
    try {
        console.log('Testing Connection Status to http://localhost:3000 ...');
        // Dynamic import to avoid hoisting issues
        const { getConnectionStatus, sendWhatsAppMessage } = await import('./services/whatsapp.service.js');
        
        const status = await getConnectionStatus();
        console.log('Connection Status:', status);

        console.log('Testing WhatsApp send...');
        const res = await sendWhatsAppMessage('573212300050', 'Test message from server script');
        console.log('Success:', res);
    } catch (e: any) {
        console.error('FAILED:', e.message);
    }
}

test();
