/**
 * rclone.config.ts
 * Configuración y salvaguarda de credenciales para Google Drive vía rclone.
 * Garantiza que las variables de entorno para el remoto 'gdrive_cumplidos'
 * existan siempre con fallback seguro y operativo si el orquestador (Coolify/Docker)
 * no las inyectó directamente.
 */

const DEFAULT_RCLONE_CLIENT_ID = '410862023458-6ca0s3t1ao45ihl4mupodbvugg1gbufo.apps.googleusercontent.com';
const DEFAULT_RCLONE_CLIENT_SECRET = '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';
const DEFAULT_RCLONE_TOKEN = '{"access_token":"ya29.a0AQvPyINyMiVK9BqykFhW5vMbP-7fX16REtrfsl7rOH_LYNmd52k2V2W7WxEKBCvtpukRbSMEUK9mjDeyySxcnobwqAx71Lapvtm5M-S8JybDdRQq5qW2rD6PUSmXex2fMQfzHMtU5xquCLzyHarBk_LdSgV9rtQHsy5QVmV1frLHE9c405ZZlK0Heu1hvbzCp3LYopcaCgYKAYQSARQSFQHGX2Mis4O4rn496LKSLmPZuHj8Pg0206","token_type":"Bearer","refresh_token":"1//05hSCjSte2j4ECgYIARAAGAUSNwF-L9Ir0yWdyc2TO43xc8vby6F0R_7kPo5QLNb7gqwhH2u9-X0v6wTNgQGyg9VhZrk3ws--Gl0","expiry":"2026-05-01T00:28:42.595243355-05:00","expires_in":3599}';

export function ensureRcloneConfig(): void {
    if (!process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_TYPE || !process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_TYPE.trim()) {
        process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_TYPE = 'drive';
    }

    if (!process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_CLIENT_ID || !process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_CLIENT_ID.trim()) {
        process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_CLIENT_ID = DEFAULT_RCLONE_CLIENT_ID;
    }

    if (!process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_CLIENT_SECRET || !process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_CLIENT_SECRET.trim()) {
        process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_CLIENT_SECRET = DEFAULT_RCLONE_CLIENT_SECRET;
    }

    if (!process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_SCOPE || !process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_SCOPE.trim()) {
        process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_SCOPE = 'drive';
    }

    const currentToken = process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_TOKEN;
    if (!currentToken || !currentToken.trim() || currentToken.trim() === '{}') {
        process.env.RCLONE_CONFIG_GDRIVE_CUMPLIDOS_TOKEN = DEFAULT_RCLONE_TOKEN;
    }
}

// Inicialización automática al cargar el módulo
ensureRcloneConfig();
