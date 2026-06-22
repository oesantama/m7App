import { ProviderAdapter } from './base.js';
import { GeminiAdapter } from './gemini.js';
import { OpenRouterAdapter } from './openrouter.js';
import { OllamaAdapter } from './ollama.js';
import { GroqAdapter } from './groq.js';

const adapters: Record<string, ProviderAdapter> = {
    gemini: new GeminiAdapter(),
    openrouter: new OpenRouterAdapter(),
    ollama: new OllamaAdapter(),
    groq: new GroqAdapter()
};

export function getProviderAdapter(providerId: string): ProviderAdapter {
    const adapter = adapters[providerId];
    if (!adapter) {
        throw new Error(`Provider adapter for '${providerId}' not found.`);
    }
    return adapter;
}
