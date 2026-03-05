
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function findCorrectModel() {
    const modelsToTry = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "models/gemini-1.5-flash",
        "gemini-pro-vision"
    ];

    console.log("--- DIAGNÓSTICO DE MODELOS GEMINI ---");
    
    for (const modelName of modelsToTry) {
        try {
            console.log(`Probando: "${modelName}"...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            // Una petición mínima para validar el modelo
            const result = await model.generateContent("test");
            const response = await result.response;
            console.log(`✅ EXITO con "${modelName}"`);
            process.exit(0);
        } catch (e) {
            console.error(`❌ FALLO con "${modelName}": ${e.message}`);
        }
    }
    console.log("Ningún modelo funcionó.");
    process.exit(1);
}

findCorrectModel();
