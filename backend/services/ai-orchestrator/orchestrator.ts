import {
    ensureOrchestratorSchema,
    getActiveProviders,
    getActiveModels,
    getKeysForProvider,
    logAIRequest,
    updateKeyMetrics
} from './database.js';
import { getProviderAdapter } from './adapters/factory.js';
import { TaskClassifier } from './classifier.js';
import { AICacheManager } from './cache.js';
import {
    OrchestrationRequest,
    OrchestrationResponse,
    AIModel,
    AIProvider,
    AIKey,
    TaskType
} from './types.js';

let isInitialized = false;

export class AIOrchestrator {
    /**
     * Start the AI Orchestrator and setup the tables/seed data if missing
     */
    static async initialize(): Promise<void> {
        if (isInitialized) return;
        try {
            await ensureOrchestratorSchema();
            isInitialized = true;
            console.log('[AI-ORCHESTRATOR] Core initialized successfully.');
        } catch (e) {
            console.error('[AI-ORCHESTRATOR] Failed to initialize database tables:', e);
            throw e;
        }
    }

    /**
     * Central execution method for all AI calls in the application
     */
    static async execute(request: OrchestrationRequest): Promise<OrchestrationResponse> {
        await this.initialize();

        // 1. Classify the task
        const taskType = TaskClassifier.classify(request);
        request.taskType = taskType;

        // 2. Check cache (unless explicit temperature suggests bypass, e.g. > 0.8)
        const bypassCache = (request.temperature !== undefined && request.temperature > 0.8);
        const cacheHash = AICacheManager.calculateHash(
            request.prompt,
            request.context,
            request.systemInstruction,
            request.imageBuffer
        );

        if (!bypassCache) {
            const cachedResult = await AICacheManager.get(cacheHash);
            if (cachedResult) {
                console.log(`[AI-ORCHESTRATOR] 🎯 Cache Hit (Hash: ${cacheHash.substring(0, 8)}) for task [${taskType}]`);
                return {
                    text: cachedResult.responseText,
                    providerId: 'cache',
                    modelId: 'cache',
                    latencyMs: 0,
                    promptTokens: 0,
                    completionTokens: 0,
                    costUsd: 0.0,
                    cached: true
                };
            }
        }

        // 3. Load candidates
        const providers = await getActiveProviders();
        const models = await getActiveModels();

        // Filter models that support this task type
        let candidateModels = models.filter(m => m.taskTypes.includes(taskType));

        if (request.imageBuffer) {
            candidateModels = candidateModels.filter(m => m.isMultimodal);
        }

        if (candidateModels.length === 0) {
            throw new Error(`No active AI models found that support task type: '${taskType}'`);
        }

        // 4. Sort models according to quality/cost metrics
        // We prioritize explicit overrides first, then sort by priority, accuracy, cost
        let selectedModels = this.sortModels(candidateModels, providers, request);

        let lastError: any = null;

        // 5. Try candidate models & providers sequentially
        for (const model of selectedModels) {
            const provider = providers.find(p => p.id === model.providerId);
            if (!provider) continue;

            // Load keys for this provider
            const keys = await getKeysForProvider(provider.id);
            if (keys.length === 0) {
                console.warn(`[AI-ORCHESTRATOR] No active keys found for provider: ${provider.name}`);
                continue;
            }

            // Iterate keys (Round-robin / Failover)
            for (const key of keys) {
                const startTime = Date.now();
                try {
                    console.log(`[AI-ORCHESTRATOR] 🤖 Executing task [${taskType}] with model [${model.id}] on key [${key.label}]`);
                    const adapter = getProviderAdapter(provider.id);
                    
                    const response = await adapter.generateContent(model.id, key.apiKeyEncrypted, request);
                    const latencyMs = Date.now() - startTime;

                    // Calculate cost
                    const costUsd = this.calculateCost(
                        model,
                        response.promptTokens,
                        response.completionTokens
                    );

                    // Update metrics
                    await updateKeyMetrics(key.id, true, latencyMs, response.promptTokens + response.completionTokens);
                    await logAIRequest({
                        taskType,
                        providerId: provider.id,
                        modelId: model.id,
                        keyId: key.id,
                        promptTokens: response.promptTokens,
                        completionTokens: response.completionTokens,
                        latencyMs,
                        status: 'success',
                        costUsd
                    });

                    // Save to Cache
                    if (!bypassCache) {
                        await AICacheManager.set(cacheHash, request.prompt, response.text, taskType);
                    }

                    return {
                        text: response.text,
                        providerId: provider.id,
                        modelId: model.id,
                        latencyMs,
                        promptTokens: response.promptTokens,
                        completionTokens: response.completionTokens,
                        costUsd,
                        cached: false
                    };

                } catch (err: any) {
                    const latencyMs = Date.now() - startTime;
                    lastError = err;
                    const errorMsg = err.message || err.toString();
                    
                    console.error(`[AI-ORCHESTRATOR] ❌ Key failed: [${key.label}]. Error: ${errorMsg.substring(0, 100)}`);
                    
                    // Update key as degraded/blocked
                    await updateKeyMetrics(key.id, false, latencyMs, 0);
                    await logAIRequest({
                        taskType,
                        providerId: provider.id,
                        modelId: model.id,
                        keyId: key.id,
                        promptTokens: 0,
                        completionTokens: 0,
                        latencyMs,
                        status: 'failed',
                        errorMessage: errorMsg,
                        costUsd: 0
                    });

                    // Check if error is retryable (quota 429, timeout, server error 5xx)
                    const errStr = errorMsg.toLowerCase();
                    const isQuotaOrServer = errStr.includes('429') || errStr.includes('quota') || errStr.includes('503') || errStr.includes('500') || errStr.includes('overloaded');
                    
                    if (!isQuotaOrServer) {
                        // If it's a structural or auth error, don't try other keys of this model, fail-over to next model/provider immediately
                        break; 
                    }
                    
                    // If it is a quota/server error, try next key in the loop
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
        }

        throw new Error(`AI Orchestrator failed to fulfill task '${taskType}' after trying all available models and keys. Last error: ${lastError?.message || lastError}`);
    }

    /**
     * Sort candidate models according to preference metrics:
     * 1. Match forced model / provider
     * 2. Multimodal requirement
     * 3. Provider priority (lower is better, e.g. 1 is highest)
     * 4. Model Accuracy score (descending)
     * 5. Model Cost (ascending)
     */
    private static sortModels(models: AIModel[], providers: AIProvider[], request: OrchestrationRequest): AIModel[] {
        return [...models].sort((a, b) => {
            // Force specific model override
            if (request.forceModel) {
                if (a.id === request.forceModel) return -1;
                if (b.id === request.forceModel) return 1;
            }

            // Force specific provider override
            if (request.forceProvider) {
                if (a.providerId === request.forceProvider && b.providerId !== request.forceProvider) return -1;
                if (b.providerId === request.forceProvider && a.providerId !== request.forceProvider) return 1;
            }

            // Provider priority
            const provA = providers.find(p => p.id === a.providerId);
            const provB = providers.find(p => p.id === b.providerId);
            const priorityA = provA ? provA.priority : 99;
            const priorityB = provB ? provB.priority : 99;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Accuracy score (higher accuracy preferred)
            if (b.accuracyScore !== a.accuracyScore) {
                return b.accuracyScore - a.accuracyScore;
            }

            // Cost (lower cost preferred)
            const costA = a.costPer1kInput + a.costPer1kOutput;
            const costB = b.costPer1kInput + b.costPer1kOutput;
            return costA - costB;
        });
    }

    /**
     * Transcripción de audio de reCAPTCHA usando todos los proveedores disponibles.
     * Estrategia: Gemini 2.0 Flash (7 llaves) → Groq Whisper → error.
     * Completamente GRATIS usando la cuota diaria de cada proveedor.
     */
    static async transcribeAudio(audioBuffer: Buffer, audioMimeType: string): Promise<string> {
        await this.initialize();

        // Proveedor 1: Gemini (7 llaves rotatorias)
        try {
            const geminiKeys = await getKeysForProvider('gemini');
            const adapter = getProviderAdapter('gemini');
            for (const key of geminiKeys.filter(k => k.status === 'active')) {
                try {
                    const result = await adapter.generateContent(
                        'gemini-2.0-flash',
                        key.apiKeyEncrypted,
                        {
                            prompt: 'This is a reCAPTCHA audio challenge. Listen carefully and extract ONLY the spoken digits in order. Respond with ONLY the digit sequence, no spaces, no punctuation. Example: "381924"',
                            audioBuffer,
                            audioMimeType,
                            temperature: 0,
                            maxTokens: 20,
                            taskType: 'audio_transcription',
                        }
                    );
                    const digits = result.text.replace(/\D/g, '');
                    if (digits.length >= 4) {
                        console.log(`[AUDIO-TRANSCRIBE] Gemini (${key.label}): "${digits}"`);
                        await updateKeyMetrics(key.id, true, 0, result.promptTokens + result.completionTokens);
                        return digits;
                    }
                } catch (e: any) {
                    const isQuota = e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('RESOURCE_EXHAUSTED');
                    await updateKeyMetrics(key.id, false, 0, 0);
                    if (!isQuota) break; // error estructural → no reintentar con esta llave
                }
            }
        } catch (e) {
            console.warn('[AUDIO-TRANSCRIBE] Gemini no disponible:', (e as any).message);
        }

        // Proveedor 2: Groq Whisper (gratis hasta cuota diaria)
        try {
            const groqKeys = await getKeysForProvider('groq');
            const adapter = getProviderAdapter('groq');
            for (const key of groqKeys.filter(k => k.status === 'active')) {
                try {
                    const result = await adapter.generateContent(
                        'whisper-large-v3',
                        key.apiKeyEncrypted,
                        { prompt: '', audioBuffer, audioMimeType, taskType: 'audio_transcription' }
                    );
                    const digits = result.text.replace(/\D/g, '');
                    if (digits.length >= 4) {
                        console.log(`[AUDIO-TRANSCRIBE] Groq Whisper: "${digits}"`);
                        await updateKeyMetrics(key.id, true, 0, result.completionTokens);
                        return digits;
                    }
                } catch (e: any) {
                    await updateKeyMetrics(key.id, false, 0, 0);
                }
            }
        } catch (e) {
            console.warn('[AUDIO-TRANSCRIBE] Groq no disponible:', (e as any).message);
        }

        throw new Error('Ningún proveedor de IA pudo transcribir el audio del reCAPTCHA (Gemini + Groq agotados)');
    }

    /**
     * Calculate cost based on input/output token counts
     */
    private static calculateCost(model: AIModel, promptTokens: number, completionTokens: number): number {
        const inputCost = (promptTokens / 1000) * model.costPer1kInput;
        const completionCost = (completionTokens / 1000) * model.costPer1kOutput;
        return parseFloat((inputCost + completionCost).toFixed(8));
    }
}
