import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

async function listModels() {
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const apiKey = keys[0];

    if (!apiKey) {
        console.error("❌ No API key found.");
        return;
    }

    console.log(`Using API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);

    try {
        const genAI = new GoogleGenerativeAI(apiKey) as any;
        const models = await genAI.listModels();
        console.log("--- Supported Models ---");
        for (const model of models.models) {
            console.log(`- ${model.name} (${model.displayName})`);
            console.log(`  Methods: ${model.supportedGenerationMethods.join(', ')}`);
        }
    } catch (error: any) {
        console.error("❌ Error listing models:", error.message);
    }
}

listModels();
