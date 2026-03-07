import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function listModelsHttp() {
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const apiKey = keys[0];

    if (!apiKey) {
        console.error("❌ No API key found.");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    console.log(`Listing Models with Key: ${apiKey.substring(0, 4)}...`);
    try {
        const response = await axios.get(url);
        console.log("✅ Models found:");
        const models = response.data.models;
        if (models) {
            models.forEach((m: any) => console.log(`- ${m.name}`));
        } else {
            console.log("No models in response.");
        }
    } catch (error: any) {
        console.error("❌ FAILED to list models:");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

listModelsHttp();
