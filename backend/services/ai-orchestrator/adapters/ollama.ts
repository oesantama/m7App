import axios from 'axios';
import { ProviderAdapter } from './base.js';
import { OrchestrationRequest } from '../types.js';

export class OllamaAdapter implements ProviderAdapter {
    id = 'ollama';

    async generateContent(
        modelId: string,
        apiKey: string, // Not strictly required for local, but passed
        request: OrchestrationRequest
    ): Promise<{
        text: string;
        promptTokens: number;
        completionTokens: number;
    }> {
        const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
        
        const messages: any[] = [];
        if (request.systemInstruction) {
            messages.push({
                role: 'system',
                content: request.systemInstruction
            });
        }

        const userMessage: any = {
            role: 'user',
            content: request.prompt
        };

        // Ollama multimodal images are sent as a base64 array in the user message
        if (request.imageBuffer) {
            const base64Data = request.imageBuffer.toString('base64');
            userMessage.images = [base64Data];
        }

        messages.push(userMessage);

        const data: any = {
            model: modelId,
            messages,
            stream: false,
            options: {
                temperature: request.temperature ?? 0.2
            }
        };

        // Enforce JSON format if required
        if (request.taskType === 'ocr' || request.taskType === 'extraction') {
            data.format = 'json';
        }

        const response = await axios.post(
            `${ollamaHost}/api/chat`,
            data,
            { timeout: 90000 } // Local models can take longer to warm up
        );

        const text = response.data?.message?.content || '';
        const promptTokens = response.data?.prompt_eval_count || Math.ceil(JSON.stringify(messages).length / 4);
        const completionTokens = response.data?.eval_count || Math.ceil(text.length / 4);

        return {
            text,
            promptTokens,
            completionTokens
        };
    }
}
