import crypto from 'crypto';
import { checkCache, saveToCache } from './database.js';
import { CacheEntry, TaskType } from './types.js';

export class AICacheManager {
    /**
     * Generate a unique SHA-256 hash for the request to check cache
     */
    static calculateHash(
        prompt: string, 
        context?: any, 
        systemInstruction?: string, 
        imageBuffer?: Buffer
    ): string {
        const hasher = crypto.createHash('sha256');
        hasher.update(prompt || '');
        
        if (context) {
            hasher.update(JSON.stringify(context));
        }
        
        if (systemInstruction) {
            hasher.update(systemInstruction);
        }
        
        if (imageBuffer) {
            hasher.update(imageBuffer);
        }
        
        return hasher.digest('hex');
    }

    /**
     * Search cache for an existing response
     */
    static async get(hash: string): Promise<CacheEntry | null> {
        try {
            return await checkCache(hash);
        } catch (e) {
            console.error('[ORCH-CACHE] Error checking cache:', e);
            return null;
        }
    }

    /**
     * Persist response in cache
     */
    static async set(
        hash: string, 
        prompt: string, 
        response: string, 
        taskType: TaskType
    ): Promise<void> {
        try {
            await saveToCache(hash, prompt, response, taskType);
        } catch (e) {
            console.error('[ORCH-CACHE] Error saving to cache:', e);
        }
    }
}
