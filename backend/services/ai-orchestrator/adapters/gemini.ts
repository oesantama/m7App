import { GoogleGenerativeAI } from '@google/generative-ai';
import { ProviderAdapter } from './base.js';
import { OrchestrationRequest } from '../types.js';

export class GeminiAdapter implements ProviderAdapter {
    id = 'gemini';

    async generateContent(
        modelId: string,
        apiKey: string,
        request: OrchestrationRequest
    ): Promise<{
        text: string;
        promptTokens: number;
        completionTokens: number;
    }> {
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Setup configuration
        const generationConfig: any = {};
        if (request.temperature !== undefined) {
            generationConfig.temperature = request.temperature;
        }
        if (request.maxTokens !== undefined) {
            generationConfig.maxOutputTokens = request.maxTokens;
        }

        // Handle JSON response requirement automatically for OCR or extractions
        if (request.taskType === 'ocr' || request.taskType === 'extraction') {
            generationConfig.responseMimeType = 'application/json';
        }

        const model = genAI.getGenerativeModel({
            model: modelId,
            generationConfig,
            systemInstruction: request.systemInstruction
        });

        const promptParts: any[] = [request.prompt];

        // Multimodal: imagen / PDF
        if (request.imageBuffer && request.imageMimeType) {
            promptParts.push({
                inlineData: {
                    data: request.imageBuffer.toString('base64'),
                    mimeType: request.imageMimeType
                }
            });
        }

        // Audio (reCAPTCHA, transcripción, etc.)
        if (request.audioBuffer && request.audioMimeType) {
            promptParts.push({
                inlineData: {
                    data: request.audioBuffer.toString('base64'),
                    mimeType: request.audioMimeType
                }
            });
        }

        // 1. Calculate input tokens
        let inputTokens = 0;
        try {
            const countRes = await model.countTokens(promptParts);
            inputTokens = countRes.totalTokens || 0;
        } catch (e) {
            console.warn('[ORCH-GEMINI] Error counting input tokens:', e);
            // Fallback estimation: ~4 chars per token
            inputTokens = Math.ceil(JSON.stringify(promptParts).length / 4);
        }

        // 2. Generate Content
        const result = await model.generateContent(promptParts);
        const response = await result.response;
        const text = response.text() || '';

        // 3. Extract output tokens from usageMetadata
        let completionTokens = 0;
        const usage = response.usageMetadata;
        if (usage) {
            inputTokens = usage.promptTokenCount || inputTokens;
            completionTokens = usage.candidatesTokenCount || 0;
        } else {
            // Fallback estimation
            completionTokens = Math.ceil(text.length / 4);
        }

        return {
            text,
            promptTokens: inputTokens,
            completionTokens
        };
    }
}
