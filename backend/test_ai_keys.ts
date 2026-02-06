
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || '';

async function testSingleKey() {
  if (!API_KEY) {
    console.error("No API KEY found in .env");
    return;
  }
  
  console.log(`--- Testing .env Key: ${API_KEY.substring(0, 10)}... ---`);
  const genAI = new GoogleGenerativeAI(API_KEY);
  
  // Probar modelo con nombre completo
  const modelName = "gemini-1.5-flash"; 
  try {
    console.log(`  Probing Model: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Hola' }] }]
    });
    const response = await result.response;
    console.log(`  SUCCESS: ${response.text().trim()}`);
  } catch (e: any) {
    console.error(`  FAILURE: ${e.message}`);
  }
}

testSingleKey();
