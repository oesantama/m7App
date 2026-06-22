import { OrchestrationRequest } from '../types.js';

export interface ProviderAdapter {
    id: string;
    generateContent(
        modelId: string,
        apiKey: string,
        request: OrchestrationRequest
    ): Promise<{
        text: string;
        promptTokens: number;
        completionTokens: number;
    }>;
}
