
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || '';

async function testAI() {
  if (!API_KEY) {
    console.error("No API KEY found in .env");
    return;
  }
  
  console.log(`--- Testing M7 IQ Fix (systemInstruction) ---`);
  const genAI = new GoogleGenerativeAI(API_KEY);
  
  const models = ["gemini-1.5-flash", "gemini-1.5-pro"];
  
  for (const modelName of models) {
    try {
      console.log(`  Probing Model: ${modelName}`);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: "Eres M7 IQ, responde de forma concisa."
      });
      const result = await model.generateContent("Hola");
      const response = await result.response;
      console.log(`  SUCCESS with ${modelName}: ${response.text().trim()}`);
      return;
    } catch (e: any) {
      console.error(`  FAILURE with ${modelName}: ${e.message}`);
    }
  }
}

testAI();
