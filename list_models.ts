
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function listModels() {
    try {
        const models = await genAI.listModels();
        for (const m of models.models) {
            console.log(`Model: ${m.name} | Methods: ${m.supportedGenerationMethods.join(', ')}`);
        }
    } catch (e) {
        console.error("Error listing models:", e.message);
    }
}

listModels();
