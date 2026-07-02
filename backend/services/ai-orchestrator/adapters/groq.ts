import axios from 'axios';
import FormData from 'form-data';
import { ProviderAdapter } from './base.js';
import { OrchestrationRequest } from '../types.js';

export class GroqAdapter implements ProviderAdapter {
    id = 'groq';

    async generateContent(
        modelId: string,
        apiKey: string,
        request: OrchestrationRequest
    ): Promise<{
        text: string;
        promptTokens: number;
        completionTokens: number;
    }> {
        // Audio transcription via Groq Whisper (multipart endpoint)
        if (request.audioBuffer && request.audioMimeType) {
            const form = new FormData();
            const ext = request.audioMimeType.split('/')[1]?.split(';')[0] || 'mp3';
            form.append('file', request.audioBuffer, { filename: `audio.${ext}`, contentType: request.audioMimeType });
            form.append('model', 'whisper-large-v3');
            form.append('response_format', 'text');
            form.append('language', 'en');

            const res = await axios.post(
                'https://api.groq.com/openai/v1/audio/transcriptions',
                form,
                { headers: { 'Authorization': `Bearer ${apiKey}`, ...form.getHeaders() }, timeout: 30000 }
            );
            const raw = typeof res.data === 'string' ? res.data : (res.data?.text || '');
            const digits = raw.replace(/\D/g, '');
            return { text: digits, promptTokens: 0, completionTokens: digits.length };
        }

        let apiModelId = modelId;
        // Map common models if necessary, or pass through
        if (modelId === 'llama-3.3-70b-specdec') apiModelId = 'llama-3.3-70b-specdec';
        else if (modelId === 'mixtral-8x7b-32768') apiModelId = 'mixtral-8x7b-32768';

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };

        const messages: any[] = [];
        if (request.systemInstruction) {
            messages.push({
                role: 'system',
                content: request.systemInstruction
            });
        }

        messages.push({
            role: 'user',
            content: request.prompt
        });

        const data: any = {
            model: apiModelId,
            messages,
            temperature: request.temperature ?? 0.2
        };

        if (request.maxTokens !== undefined) {
            data.max_tokens = request.maxTokens;
        }

        if (request.taskType === 'ocr' || request.taskType === 'extraction') {
            data.response_format = { type: 'json_object' };
        }

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            data,
            { headers, timeout: 45000 }
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
