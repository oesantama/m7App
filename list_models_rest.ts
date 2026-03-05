
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

async function listModelsREST() {
    try {
        console.log("--- LISTMODELS REST DIAGNOSTIC ---");
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.models) {
            console.log("Modelos encontrados:");
            response.data.models.forEach((m: any) => {
                console.log(`- ${m.name} (${m.displayName})`);
            });
        } else {
            console.log("No se devolvieron modelos en la respuesta.");
            console.log(JSON.stringify(response.data, null, 2));
        }
    } catch (e: any) {
        console.error("Error en petición REST:", e.response?.status, e.response?.data || e.message);
    }
}

listModelsREST();
