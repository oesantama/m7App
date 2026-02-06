
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Intentar cargar .env desde la raíz del proyecto
dotenv.config({ path: path.join(__dirname, '../../.env') });

const apiKey = process.env.GEMINI_API_KEY;
console.log("Testing AI with API Key:", apiKey ? apiKey.substring(0, 8) + "..." : "MISSING");

async function testAI() {
  if (!apiKey) {
    console.error("No GEMINI_API_KEY found in .env");
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    console.log("\nListing available models...");
    // @ts-ignore
    const modelList = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).listModels();
    console.log("Models found:", JSON.stringify(modelList, null, 2));
  } catch (e: any) {
    console.error("❌ Failed to list models:", e.message);
  }

  const configs = [
    { model: "gemini-1.5-flash" },
    { model: "gemini-1.5-pro" },
    { model: "models/gemini-1.5-flash" },
    { model: "models/gemini-pro" }
  ];

  for (const config of configs) {
    try {
      console.log(`\nTesting Config: ${config.model}...`);
      const model = genAI.getGenerativeModel({ model: config.model });
      const result = await model.generateContent("Dime 'Hola' en una palabra.");
      const response = await result.response;
      console.log(`✅ SUCCESS with ${config.model}:`, response.text());
    } catch (e: any) {
      console.error(`❌ FAILED for ${config.model}:`, e.message);
    }
  }
}

testAI().catch(console.error);
