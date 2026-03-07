import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testHttpDirect() {
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const apiKey = keys[0];

    if (!apiKey) {
        console.error("❌ No API key found.");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [{
            parts: [{ text: "Hola, responde 'OK'." }]
        }]
    };

    console.log(`Testing HTTP Direct with Key: ${apiKey.substring(0, 4)}...`);
    try {
        const response = await axios.post(url, payload);
        console.log("✅ HTTP SUCCESS!");
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.error("❌ HTTP FAILED:");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

testHttpDirect();
