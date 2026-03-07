import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const modelsToTry = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest"
];

async function bruteForceModels() {
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const apiKey = keys[0];

    if (!apiKey) {
        console.error("❌ No API key found.");
        return;
    }

    console.log(`Testing with Key: ${apiKey.substring(0, 4)}...`);

    for (const modelId of modelsToTry) {
        console.log(`--- Testing Model: ${modelId} ---`);
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelId });
            const result = await model.generateContent("Hola, responde solo 'OK' si recibes esto.");
            const response = await result.response;
            console.log(`✅ SUCCESS with ${modelId}: ${response.text()}`);
            process.exit(0);
        } catch (error: any) {
            console.error(`❌ FAILED with ${modelId}: ${error.message}`);
        }
    }
    console.error("❌ All models failed.");
}

bruteForceModels();
