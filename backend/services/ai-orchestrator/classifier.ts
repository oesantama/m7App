import { TaskType, OrchestrationRequest } from './types.js';

export class TaskClassifier {
    static classify(request: OrchestrationRequest): TaskType {
        // If explicit task type is passed, respect it
        if (request.taskType) {
            return request.taskType;
        }

        const promptLower = (request.prompt || '').toLowerCase();

        // 1. Multimodal / Image inputs
        if (request.imageBuffer) {
            const ocrKeywords = [
                'lee', 'extrae', 'ocr', 'cruz', 'factura', 'remision', 
                'planilla', 'texto', 'tabla', 'codigo', 'datos', 'placa',
                'parse', 'item', 'cedula', 'cliente'
            ];
            
            if (ocrKeywords.some(keyword => promptLower.includes(keyword))) {
                return 'ocr';
            }
            return 'vision';
        }

        // 2. Code and Programming
        const codeKeywords = [
            'escribe un script', 'codigo', 'code', 'javascript', 'typescript', 
            'python', 'sql', 'query', 'function', 'class', 'desarrolla', 
            'api', 'tsconfig', 'npm', 'dockerfile', 'combina las tablas'
        ];
        if (codeKeywords.some(keyword => promptLower.includes(keyword))) {
            return 'code';
        }

        // 3. QA, Auditing and Recommendations
        const qaKeywords = [
            'evalua', 'califica', 'audita', 'diagnostica', 'qa', 
            'detecta errores', 'soluciones recomendadas', 'severidad', 
            'riesgo', 'calificacion', 'pregunta', 'respuesta correcta'
        ];
        if (qaKeywords.some(keyword => promptLower.includes(keyword))) {
            return 'qa';
        }

        // 4. Manual generation & SOP
        const manualKeywords = [
            'manual', 'guia', 'procedimiento', 'paso a paso', 'sop', 
            'documentacion tecnica', 'pasos para', 'tutorial'
        ];
        if (manualKeywords.some(keyword => promptLower.includes(keyword))) {
            return 'manual_generation';
        }

        // 5. Extraction
        const extractionKeywords = [
            'extrae', 'json', 'formato json', 'devolver json', 'estructurado',
            'llaves', 'valores', 'expresiones regulares', 'patron'
        ];
        if (extractionKeywords.some(keyword => promptLower.includes(keyword))) {
            return 'extraction';
        }

        // 6. Summarization
        const summaryKeywords = [
            'resume', 'resumen', 'sintetiza', 'sintesis', 'puntos clave', 
            'en pocas palabras', 'abrevia'
        ];
        if (summaryKeywords.some(keyword => promptLower.includes(keyword))) {
            return 'summary';
        }

        // 7. Translation
        const translationKeywords = [
            'traduce', 'traduccion', 'translate', 'ingles', 'espanol', 
            'idioma', 'al frances', 'al portugues'
        ];
        if (translationKeywords.some(keyword => promptLower.includes(keyword))) {
            return 'translation';
        }

        // Default to chat
        return 'chat';
    }
}
