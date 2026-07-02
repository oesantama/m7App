export type TaskType =
    | 'ocr'
    | 'vision'
    | 'chat'
    | 'code'
    | 'summary'
    | 'extraction'
    | 'translation'
    | 'manual_generation'
    | 'qa'
    | 'audio_transcription';

export type ProviderStatus = 'active' | 'inactive' | 'degraded';
export type KeyStatus = 'active' | 'blocked' | 'exhausted';
export type LogStatus = 'success' | 'failed';

export interface AIProvider {
    id: string; // e.g. 'gemini', 'openrouter', 'ollama'
    name: string;
    status: ProviderStatus;
    priority: number;
}

export interface AIModel {
    id: string; // e.g. 'gemini-1.5-flash', 'deepseek-chat'
    providerId: string;
    name: string;
    taskTypes: TaskType[];
    costPer1kInput: number; // USD
    costPer1kOutput: number; // USD
    contextWindow: number;
    isMultimodal: boolean;
    status: 'active' | 'inactive';
    latencyAvgMs: number;
    accuracyScore: number; // Scale 0-100
}

export interface AIKey {
    id: number;
    providerId: string;
    apiKeyEncrypted: string;
    label: string; // e.g. "Key 1", "Backup Key"
    status: KeyStatus;
    quotaLimitTokens?: number;
    quotaUsedTokens: number;
    quotaResetAt?: Date;
    consecutiveErrors: number;
    lastUsedAt?: Date;
    latencyAvgMs: number;
}

export interface OrchestrationRequest {
    prompt: string;
    imageBuffer?: Buffer;
    imageMimeType?: string;
    audioBuffer?: Buffer;
    audioMimeType?: string;
    context?: any;
    taskType?: TaskType; // optional, can be auto-classified
    forceProvider?: string;
    forceModel?: string;
    temperature?: number;
    maxTokens?: number;
    systemInstruction?: string;
}

export interface OrchestrationResponse {
    text: string;
    providerId: string;
    modelId: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    cached: boolean;
}

export interface AIRuntimeLog {
    id?: number;
    taskType: TaskType;
    providerId: string;
    modelId: string;
    keyId: number;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    status: LogStatus;
    errorMessage?: string;
    costUsd: number;
    createdAt?: Date;
}

export interface CacheEntry {
    promptHash: string;
    promptText: string;
    responseText: string;
    taskType: TaskType;
    hitsCount: number;
    lastHitAt: Date;
}
