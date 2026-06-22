import pool from '../../config/database.js';
import crypto from 'crypto';
import {
    AIProvider,
    AIModel,
    AIKey,
    AIRuntimeLog,
    CacheEntry,
    TaskType
} from './types.js';

const ALGORITHM = 'aes-256-cbc';
// Ensure key is exactly 32 bytes
const ENCRYPTION_KEY = Buffer.from(
    (process.env.ORCHESTRATOR_ENCRYPTION_KEY || 'M7_ORCHESTRATOR_DEFAULT_SECRET_KEY_32BYTES').substring(0, 32).padEnd(32, '0'),
    'utf-8'
);
const IV_LENGTH = 16;

// Encryption Helpers
export function encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
    if (!text) return '';
    try {
        const parts = text.split(':');
        if (parts.length !== 2) return text; // Fallback if plain text
        const iv = Buffer.from(parts.shift()!, 'hex');
        const encryptedTextHex = parts.join(':');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedTextHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;

    } catch (e) {
        console.error('[ORCH-DB] Decryption failed, returning raw value', e);
        return text; // Return raw value if not encrypted
    }
}

export async function ensureOrchestratorSchema() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Providers table
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_providers (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'degraded')),
                priority INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Models table
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_models (
                id VARCHAR(100) PRIMARY KEY,
                provider_id VARCHAR(100) REFERENCES ai_providers(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                task_types TEXT[] NOT NULL,
                cost_per_1k_input_tokens NUMERIC(10, 6) DEFAULT 0,
                cost_per_1k_output_tokens NUMERIC(10, 6) DEFAULT 0,
                context_window INTEGER DEFAULT 8192,
                is_multimodal BOOLEAN DEFAULT false,
                status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
                latency_avg_ms INTEGER DEFAULT 0,
                accuracy_score NUMERIC(5, 2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. API Keys table
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_keys (
                id SERIAL PRIMARY KEY,
                provider_id VARCHAR(100) REFERENCES ai_providers(id) ON DELETE CASCADE,
                api_key_encrypted TEXT NOT NULL,
                label VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'exhausted')),
                quota_limit_tokens BIGINT,
                quota_used_tokens BIGINT DEFAULT 0,
                quota_reset_at TIMESTAMP,
                consecutive_errors INTEGER DEFAULT 0,
                last_used_at TIMESTAMP,
                latency_avg_ms INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Runtime Logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_logs (
                id BIGSERIAL PRIMARY KEY,
                task_type VARCHAR(100) NOT NULL,
                provider_id VARCHAR(100) NOT NULL,
                model_id VARCHAR(100) NOT NULL,
                key_id INTEGER NOT NULL,
                prompt_tokens INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                latency_ms INTEGER DEFAULT 0,
                status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed')),
                error_message TEXT,
                cost_usd NUMERIC(12, 8) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 5. Semantic Cache Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_semantic_cache (
                id BIGSERIAL PRIMARY KEY,
                prompt_hash VARCHAR(64) UNIQUE NOT NULL,
                prompt_text TEXT NOT NULL,
                response_text TEXT NOT NULL,
                task_type VARCHAR(100) NOT NULL,
                hits_count INTEGER DEFAULT 0,
                last_hit_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query('COMMIT');

        // Seed default providers and models if empty
        const providerCount = await pool.query('SELECT COUNT(*) FROM ai_providers');
        if (parseInt(providerCount.rows[0].count) === 0) {
            console.log('[ORCH-DB] Seeding default AI Orchestrator configurations...');
            await seedDefaults();
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('[ORCH-DB] Error initializing schema:', e);
        throw e;
    } finally {
        client.release();
    }
}

async function seedDefaults() {
    const providers = [
        { id: 'gemini', name: 'Google Gemini', status: 'active', priority: 1 },
        { id: 'openrouter', name: 'OpenRouter Gateway', status: 'active', priority: 2 },
        { id: 'groq', name: 'Groq Cloud', status: 'active', priority: 2 },
        { id: 'ollama', name: 'Ollama (Local Models)', status: 'active', priority: 3 }
    ];

    const models = [
        // Gemini
        {
            id: 'gemini-1.5-flash',
            provider_id: 'gemini',
            name: 'Gemini 1.5 Flash',
            task_types: ['ocr', 'vision', 'chat', 'summary', 'extraction', 'translation'],
            cost_input: 0.000075,
            cost_output: 0.0003,
            context: 1048576,
            multimodal: true,
            status: 'active',
            accuracy: 85.0
        },
        {
            id: 'gemini-2.0-flash',
            provider_id: 'gemini',
            name: 'Gemini 2.0 Flash',
            task_types: ['ocr', 'vision', 'chat', 'summary', 'extraction', 'translation', 'manual_generation', 'qa'],
            cost_input: 0.000075,
            cost_output: 0.0003,
            context: 1048576,
            multimodal: true,
            status: 'active',
            accuracy: 90.0
        },
        {
            id: 'gemini-2.5-flash',
            provider_id: 'gemini',
            name: 'Gemini 2.5 Flash',
            task_types: ['ocr', 'vision', 'chat', 'summary', 'extraction', 'translation', 'manual_generation', 'qa'],
            cost_input: 0.000075,
            cost_output: 0.0003,
            context: 1048576,
            multimodal: true,
            status: 'active',
            accuracy: 92.0
        },
        {
            id: 'gemini-1.5-pro',
            provider_id: 'gemini',
            name: 'Gemini 1.5 Pro (High Quality)',
            task_types: ['vision', 'chat', 'code', 'manual_generation', 'qa'],
            cost_input: 0.00125,
            cost_output: 0.005,
            context: 2097152,
            multimodal: true,
            status: 'active',
            accuracy: 95.0
        },
        // OpenRouter (DeepSeek, Llama, Qwen, Mistral, GLM, Kimi, Grok)
        {
            id: 'deepseek-chat',
            provider_id: 'openrouter',
            name: 'DeepSeek V3 / Coder',
            task_types: ['chat', 'code', 'summary', 'extraction', 'translation', 'manual_generation', 'qa'],
            cost_input: 0.00014,
            cost_output: 0.00028,
            context: 64000,
            multimodal: false,
            status: 'active',
            accuracy: 94.0
        },
        {
            id: 'qwen-2.5-72b',
            provider_id: 'openrouter',
            name: 'Qwen 2.5 72B Instruct',
            task_types: ['chat', 'code', 'summary', 'extraction', 'translation', 'qa'],
            cost_input: 0.0004,
            cost_output: 0.0004,
            context: 128000,
            multimodal: false,
            status: 'active',
            accuracy: 89.0
        },
        {
            id: 'llama-3.3-70b',
            provider_id: 'openrouter',
            name: 'Meta Llama 3.3 70B Instruct',
            task_types: ['chat', 'summary', 'extraction', 'translation', 'qa'],
            cost_input: 0.0006,
            cost_output: 0.0006,
            context: 128000,
            multimodal: false,
            status: 'active',
            accuracy: 90.0
        },
        {
            id: 'grok-2',
            provider_id: 'openrouter',
            name: 'xAI Grok 2',
            task_types: ['chat', 'code', 'summary', 'qa'],
            cost_input: 0.002,
            cost_output: 0.01,
            context: 131072,
            multimodal: false,
            status: 'active',
            accuracy: 91.0
        },
        // Groq
        {
            id: 'llama-3.3-70b-specdec',
            provider_id: 'groq',
            name: 'Llama 3.3 70B (Groq)',
            task_types: ['chat', 'summary', 'extraction', 'translation', 'qa'],
            cost_input: 0.0,
            cost_output: 0.0,
            context: 8192,
            multimodal: false,
            status: 'active',
            accuracy: 90.0
        },
        {
            id: 'mixtral-8x7b-32768',
            provider_id: 'groq',
            name: 'Mixtral 8x7B (Groq)',
            task_types: ['chat', 'summary', 'translation'],
            cost_input: 0.0,
            cost_output: 0.0,
            context: 32768,
            multimodal: false,
            status: 'active',
            accuracy: 83.0
        },
        // Ollama (Local)
        {
            id: 'llama3:8b',
            provider_id: 'ollama',
            name: 'Llama 3 8B (Local)',
            task_types: ['chat', 'summary', 'translation'],
            cost_input: 0.0,
            cost_output: 0.0,
            context: 8192,
            multimodal: false,
            status: 'active',
            accuracy: 75.0
        },
        {
            id: 'qwen2.5-coder:7b',
            provider_id: 'ollama',
            name: 'Qwen 2.5 Coder 7B (Local)',
            task_types: ['code', 'chat'],
            cost_input: 0.0,
            cost_output: 0.0,
            context: 16384,
            multimodal: false,
            status: 'active',
            accuracy: 82.0
        }
    ];

    for (const p of providers) {
        await pool.query(
            `INSERT INTO ai_providers (id, name, status, priority) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
            [p.id, p.name, p.status, p.priority]
        );
    }

    for (const m of models) {
        await pool.query(
            `INSERT INTO ai_models (id, provider_id, name, task_types, cost_per_1k_input_tokens, cost_per_1k_output_tokens, context_window, is_multimodal, status, accuracy_score)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
            [m.id, m.provider_id, m.name, m.task_types, m.cost_input, m.cost_output, m.context, m.multimodal, m.status, m.accuracy]
        );
    }

    // Sync legacy GEMINI_API_KEYS into the table to initialize automatically
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    for (let i = 0; i < keys.length; i++) {
        const encrypted = encrypt(keys[i]);
        await pool.query(
            `INSERT INTO ai_keys (provider_id, api_key_encrypted, label, status) VALUES ($1, $2, $3, $4)`,
            ['gemini', encrypted, `Gemini Key ${i + 1} (From .env)`, 'active']
        );
    }

    // Seed empty OpenRouter key if present in env
    const openrouterKey = process.env.OPENROUTER_API_KEY || '';
    if (openrouterKey) {
        await pool.query(
            `INSERT INTO ai_keys (provider_id, api_key_encrypted, label, status) VALUES ($1, $2, $3, $4)`,
            ['openrouter', encrypt(openrouterKey), 'Primary OpenRouter Key', 'active']
        );
    }

    // Seed Groq key if present in env
    const groqKey = process.env.GROQ_API_KEY || '';
    if (groqKey) {
        await pool.query(
            `INSERT INTO ai_keys (provider_id, api_key_encrypted, label, status) VALUES ($1, $2, $3, $4)`,
            ['groq', encrypt(groqKey), 'Primary Groq Key', 'active']
        );
    }
}

export async function getActiveProviders(): Promise<AIProvider[]> {
    const result = await pool.query(
        `SELECT id, name, status, priority FROM ai_providers WHERE status != 'inactive' ORDER BY priority ASC`
    );
    return result.rows.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status as any,
        priority: r.priority
    }));
}

export async function getActiveModels(): Promise<AIModel[]> {
    const result = await pool.query(
        `SELECT id, provider_id AS "providerId", name, task_types AS "taskTypes", 
                cost_per_1k_input_tokens AS "costPer1kInput", cost_per_1k_output_tokens AS "costPer1kOutput",
                context_window AS "contextWindow", is_multimodal AS "isMultimodal", status, 
                latency_avg_ms AS "latencyAvgMs", accuracy_score AS "accuracyScore"
         FROM ai_models 
         WHERE status = 'active'`
    );
    return result.rows;
}

export async function getKeysForProvider(providerId: string): Promise<AIKey[]> {
    const result = await pool.query(
        `SELECT id, provider_id AS "providerId", api_key_encrypted AS "apiKeyEncrypted", 
                label, status, quota_limit_tokens AS "quotaLimitTokens", quota_used_tokens AS "quotaUsedTokens", 
                quota_reset_at AS "quotaResetAt", consecutive_errors AS "consecutiveErrors", 
                last_used_at AS "lastUsedAt", latency_avg_ms AS "latencyAvgMs"
         FROM ai_keys 
         WHERE provider_id = $1 AND status != 'blocked'
         ORDER BY consecutive_errors ASC, last_used_at NULLS FIRST`,
        [providerId]
    );
    return result.rows.map(r => ({
        ...r,
        apiKeyEncrypted: decrypt(r.apiKeyEncrypted)
    }));
}

export async function logAIRequest(log: AIRuntimeLog): Promise<void> {
    await pool.query(
        `INSERT INTO ai_logs (task_type, provider_id, model_id, key_id, prompt_tokens, completion_tokens, latency_ms, status, error_message, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [log.taskType, log.providerId, log.modelId, log.keyId, log.promptTokens, log.completionTokens, log.latencyMs, log.status, log.errorMessage || null, log.costUsd]
    );

    // Update Model average latency
    if (log.status === 'success') {
        await pool.query(
            `UPDATE ai_models 
             SET latency_avg_ms = (latency_avg_ms * 9 + $1) / 10
             WHERE id = $2`,
            [log.latencyMs, log.modelId]
        );
    }
}

export async function updateKeyMetrics(keyId: number, success: boolean, latencyMs: number, tokensUsed: number): Promise<void> {
    if (success) {
        await pool.query(
            `UPDATE ai_keys 
             SET consecutive_errors = 0,
                 quota_used_tokens = quota_used_tokens + $1,
                 last_used_at = CURRENT_TIMESTAMP,
                 latency_avg_ms = (latency_avg_ms * 9 + $2) / 10
             WHERE id = $3`,
            [tokensUsed, latencyMs, keyId]
        );
    } else {
        await pool.query(
            `UPDATE ai_keys 
             SET consecutive_errors = consecutive_errors + 1,
                 last_used_at = CURRENT_TIMESTAMP,
                 status = CASE WHEN consecutive_errors + 1 >= 5 THEN 'blocked'::varchar ELSE status END
             WHERE id = $1`,
            [keyId]
        );
    }
}

export async function checkCache(hash: string): Promise<CacheEntry | null> {
    const result = await pool.query(
        `SELECT prompt_hash AS "promptHash", prompt_text AS "promptText", response_text AS "responseText", 
                task_type AS "taskType", hits_count AS "hitsCount", last_hit_at AS "lastHitAt"
         FROM ai_semantic_cache 
         WHERE prompt_hash = $1`,
        [hash]
    );

    if (result.rows.length > 0) {
        await pool.query(
            `UPDATE ai_semantic_cache 
             SET hits_count = hits_count + 1, last_hit_at = CURRENT_TIMESTAMP 
             WHERE prompt_hash = $1`,
            [hash]
        );
        return result.rows[0];
    }
    return null;
}

export async function saveToCache(hash: string, prompt: string, response: string, taskType: TaskType): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO ai_semantic_cache (prompt_hash, prompt_text, response_text, task_type)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (prompt_hash) DO NOTHING`,
            [hash, prompt, response, taskType]
        );
    } catch (e) {
        console.error('[ORCH-DB] Error saving to cache:', e);
    }
}

export async function getDashboardMetrics(): Promise<any> {
    const providers = await pool.query(`
        SELECT p.id, p.name, p.status, p.priority,
               COUNT(k.id) as "totalKeys",
               COUNT(CASE WHEN k.status = 'active' THEN 1 END) as "activeKeys",
               COUNT(CASE WHEN k.status = 'blocked' THEN 1 END) as "blockedKeys"
        FROM ai_providers p
        LEFT JOIN ai_keys k ON p.id = k.provider_id
        GROUP BY p.id
    `);

    const logsSummary = await pool.query(`
        SELECT 
            COUNT(*) as "totalRequests",
            COUNT(CASE WHEN status = 'success' THEN 1 END) as "successRequests",
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as "failedRequests",
            AVG(latency_ms)::integer as "avgLatencyMs",
            SUM(cost_usd)::numeric(12,6) as "totalCostUsd",
            SUM(prompt_tokens + completion_tokens) as "totalTokens"
        FROM ai_logs
        WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    const modelUsage = await pool.query(`
        SELECT model_id as "modelId", 
               COUNT(*) as "count",
               AVG(latency_ms)::integer as "avgLatencyMs",
               SUM(cost_usd)::numeric(12,6) as "costUsd",
               COUNT(CASE WHEN status = 'success' THEN 1 END) * 100.0 / COUNT(*) as "successRate"
        FROM ai_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY model_id
        ORDER BY count DESC
    `);

    const cacheHits = await pool.query(`
        SELECT COUNT(*)::integer as "totalCachedItems",
               SUM(hits_count)::integer as "totalHits"
        FROM ai_semantic_cache
    `);

    return {
        providers: providers.rows,
        summary24h: logsSummary.rows[0] || {
            totalRequests: 0,
            successRequests: 0,
            failedRequests: 0,
            avgLatencyMs: 0,
            totalCostUsd: 0,
            totalTokens: 0
        },
        modelUsage: modelUsage.rows,
        cache: cacheHits.rows[0] || { totalCachedItems: 0, totalHits: 0 }
    };
}
