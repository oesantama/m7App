import axios from 'axios';
import { ProviderAdapter } from './base.js';
import { OrchestrationRequest } from '../types.js';

export class OpenRouterAdapter implements ProviderAdapter {
    id = 'openrouter';

    async generateContent(
        modelId: string,
        apiKey: string,
        request: OrchestrationRequest
    ): Promise<{
        text: string;
        promptTokens: number;
        completionTokens: number;
    }> {
        // Map common models if necessary, or pass through
        // e.g. deepseek-chat -> deepseek/deepseek-chat
        let apiModelId = modelId;
        if (modelId === 'deepseek-chat') apiModelId = 'deepseek/deepseek-chat';
        else if (modelId === 'llama-3.3-70b') apiModelId = 'meta-llama/llama-3.3-70b-instruct';
        else if (modelId === 'qwen-2.5-72b') apiModelId = 'qwen/qwen-2.5-72b-instruct';
        else if (modelId === 'grok-2') apiModelId = 'xai/grok-2';

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://orbitm7.com',
            'X-Title': 'Orbit M7 Enterprise'
        };

        const messages: any[] = [];
        if (request.systemInstruction) {
            messages.push({
                role: 'system',
                content: request.systemInstruction
            });
        }

        // If multimodal (PDF / Image)
        if (request.imageBuffer && request.imageMimeType) {
            const base64Data = request.imageBuffer.toString('base64');
            const dataUrl = `data:${request.imageMimeType};base64,${base64Data}`;
            
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: request.prompt },
                    { type: 'image_url', image_url: { url: dataUrl } }
                ]
            });
        } else {
            messages.push({
                role: 'user',
                content: request.prompt
            });
        }

        const data: any = {
            model: apiModelId,
            messages,
            temperature: request.temperature ?? 0.2
        };

        if (request.maxTokens !== undefined) {
            data.max_tokens = request.maxTokens;
        }

        // Enforce JSON format for extraction/OCR
        if (request.taskType === 'ocr' || request.taskType === 'extraction') {
            data.response_format = { type: 'json_object' };
        }

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            data,
            { headers, timeout: 60000 }
        );

        const choice = response.data?.choices?.[0];
        const text = choice?.message?.content || '';
        const usage = response.data?.usage;

        return {
            text,
            promptTokens: usage?.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 4),
            completionTokens: usage?.completion_tokens || Math.ceil(text.length / 4)
        };
    }
}
