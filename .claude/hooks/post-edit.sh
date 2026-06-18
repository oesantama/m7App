#!/usr/bin/env bash
# Hook: PostToolUse — Genera manual cuando se edita un componente React.
# Se activa automáticamente tras cada uso de las herramientas Edit o Write.
# Variables disponibles: CLAUDE_TOOL_NAME, CLAUDE_TOOL_INPUT (JSON)

set -euo pipefail

# Extraer file_path del JSON de entrada
FILE_PATH=$(echo "${CLAUDE_TOOL_INPUT:-}" | node -e "
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(chunks.join(''));
      const fp = j.file_path || '';
      if (/\.(tsx|jsx)$/.test(fp)) process.stdout.write(fp);
    } catch (_) {}
  });
" 2>/dev/null || echo "")

# Si no es un archivo .tsx/.jsx, salir silenciosamente
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Ir al directorio raíz del proyecto (2 niveles arriba de .claude/hooks/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "[HelpDesk Hook] Componente modificado: $FILE_PATH"

# Ejecutar el generador de manuales
cd "$PROJECT_ROOT"
node scripts/generate-manual.js "$FILE_PATH" &

# No bloquear a Claude esperando la generación
exit 0
