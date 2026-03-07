import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testFlashLatestExact() {
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const apiKey = keys[0];

    if (!apiKey) {
        console.error("❌ No API key found.");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [{
            parts: [{ text: "Hola, responde 'SÍ'." }]
        }]
    };

    console.log(`Testing with gemini-flash-latest...`);
    try {
        const response = await axios.post(url, payload);
        console.log("✅ SUCCESS!");
        console.log(response.data.candidates[0].content.parts[0].text);
    } catch (error: any) {
        console.error("❌ FAILED:");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

testFlashLatestExact();
