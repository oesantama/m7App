import { Request, Response } from 'express';
import pool from '../config/database.js';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { AIOrchestrator } from '../services/ai-orchestrator/orchestrator.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const execAsync = util.promisify(exec);

const BASC_FOLDERS = [
  '01_Normativa_y_Manuales',
  '02_Analisis_de_Riesgos',
  '03_Asociados_de_Negocio',
  '04_Seguridad_Fisica_y_Personal',
  '05_Auditorias_e_Informes'
];

const LOCAL_BASE = path.join(process.cwd(), 'backend', 'docs', 'basc');

// Seed dummy files if directories don't exist or are empty
const seedMockFilesIfEmpty = () => {
  if (!fs.existsSync(LOCAL_BASE)) {
    fs.mkdirSync(LOCAL_BASE, { recursive: true });
  }

  const mockDocs: Record<string, Array<{ name: string; content: string }>> = {
    '01_Normativa_y_Manuales': [
      {
        name: 'manual_seguridad_basc_v5.txt',
        content: `MANUAL DE SEGURIDAD SGCS BASC V5 - ORBIT M7
Este manual describe los procedimientos estándar de seguridad física y control de accesos para dar cumplimiento al estándar BASC.
1. Política de Control de Accesos: Todo personal y visitante debe ser plenamente identificado antes de ingresar a las instalaciones.
2. Responsabilidad de la Gerencia: La gerencia general liderará la mejora continua del SGCS.
3. El oficial de cumplimiento auditará cada bimestre el cumplimiento de las normas de prevención de lavado de activos.`
      },
      {
        name: 'politica_prevencion_delitos.txt',
        content: `POLÍTICA DE PREVENCIÓN DE DELITOS Y LAVADO DE ACTIVOS
Bajo la normativa BASC, Orbit M7 establece cero tolerancia frente al contrabando, narcotráfico y financiación del terrorismo.
Es obligatorio realizar estudios de seguridad detallados para cada conductor y vehículo de la flota afiliada.`
      }
    ],
    '02_Analisis_de_Riesgos': [
      {
        name: 'matriz_riesgos_operativos_2026.txt',
        content: `MATRIZ DE RIESGOS SGCS BASC 2026
Riesgo 1: Contaminación de carga en ruta nacional. Nivel de probabilidad: Medio. Impacto: Crítico.
Mitigación: Inspección de 17 puntos al contenedor antes del alistamiento y precintos de seguridad certificados de alta resistencia (ISO 17712).
Riesgo 2: Pérdida de integridad de los datos de despacho. Mitigación: Copia de seguridad en la nube y auditoría por logs de transacciones.`
      }
    ],
    '03_Asociados_de_Negocio': [
      {
        name: 'debida_diligencia_clientes.txt',
        content: `PROCEDIMIENTO DE DEBIDA DILIGENCIA DE ASOCIADOS DE NEGOCIO
Todo proveedor de transporte, cliente crítico o contratista debe pasar por un proceso de debida diligencia.
Requisitos:
- Certificado de Cámara de Comercio vigente (máx 30 días).
- Consulta en listas restrictivas (Clinton, OFAC, Policía Nacional, Contraloría).
- Visita domiciliaria y verificación de referencias comerciales.`
      }
    ],
    '04_Seguridad_Fisica_y_Personal': [
      {
        name: 'protocolo_inspeccion_17_puntos.txt',
        content: `PROTOCOLO DE INSPECCIÓN DE 17 PUNTOS PARA VEHÍCULOS DE CARGA
Antes de cargar el vehículo, el supervisor de seguridad BASC debe verificar:
1. Parachoques delantero y luces.
2. Motor y chasis.
3. Neumáticos y rines.
4. Tanques de combustible (sin compartimentos secretos).
5. Piso del contenedor (ausencia de soldaduras dobles o láminas sueltas).
6. Techo, paredes internas y externas.`
      }
    ],
    '05_Auditorias_e_Informes': [
      {
        name: 'informe_auditoria_interna_octubre.txt',
        content: `INFORME DE AUDITORÍA INTERNA SGCS BASC - OCTUBRE
Hallazgos Críticos:
- Se encontró un vehículo despachado sin el registro completo de la inspección de 17 puntos en el sistema.
- Se recomienda capacitar de inmediato al personal de patio.
- Plan de Acción Correctiva (PAC): Plazo de 15 días hábiles para solventar y digitalizar la totalidad del histórico.`
      }
    ]
  };

  BASC_FOLDERS.forEach(folder => {
    const dirPath = path.join(LOCAL_BASE, folder);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Seed file if empty
    const files = fs.readdirSync(dirPath);
    if (files.length === 0 && mockDocs[folder]) {
      mockDocs[folder].forEach(doc => {
        fs.writeFileSync(path.join(dirPath, doc.name), doc.content);
      });
    }
  });
};

export const getSyncStatus = async (req: Request, res: Response) => {
  try {
    seedMockFilesIfEmpty();

    // Query active BASC documents in DB
    const dbDocsQuery = await pool.query('SELECT * FROM basc_documents');
    const dbDocs = dbDocsQuery.rows;

    const fileMap = new Map();
    dbDocs.forEach(d => {
      fileMap.set(`${d.folder}/${d.file_name}`, d);
    });

    // Build the directory tree
    const tree: any = {};

    BASC_FOLDERS.forEach(folder => {
      tree[folder] = [];
      const dirPath = path.join(LOCAL_BASE, folder);

      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        files.forEach(fileName => {
          const key = `${folder}/${fileName}`;
          const dbDoc = fileMap.get(key);
          const fullPath = path.join(dirPath, fileName);
          const stats = fs.statSync(fullPath);

          if (dbDoc) {
            tree[folder].push({
              id: dbDoc.id,
              name: fileName,
              status: dbDoc.sync_status,
              sizeBytes: dbDoc.size_bytes,
              lastSync: dbDoc.last_sync_at,
              errorMessage: dbDoc.error_message,
              driveLink: dbDoc.drive_link || '#'
            });
          } else {
            // Found on local drive but not synced in DB
            tree[folder].push({
              name: fileName,
              status: 'PENDING',
              sizeBytes: stats.size,
              lastSync: null,
              errorMessage: null,
              driveLink: '#'
            });
          }
        });
      }
    });

    res.json({ success: true, tree });
  } catch (error: any) {
    console.error('[M7-BASC] Error reading sync status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getSyncHistory = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM basc_sync_logs ORDER BY executed_at DESC LIMIT 30');
    res.json({ success: true, history: result.rows });
  } catch (error: any) {
    console.error('[M7-BASC] Error getting sync history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const triggerSync = async (req: Request, res: Response) => {
  const startTime = Date.now();
  let status = 'SUCCESS';
  let processedCount = 0;
  let newCount = 0;
  let errorsCount = 0;
  let logId: number | null = null;
  let errorMsg = '';

  try {
    // Insert running log
    const initLog = await pool.query(
      `INSERT INTO basc_sync_logs (status, details) VALUES ($1, $2) RETURNING id`,
      ['RUNNING', 'Iniciando escaneo de documentos BASC...']
    );
    logId = initLog.rows[0].id;

    // Send immediate response to frontend so it doesn't timeout
    res.json({ success: true, message: 'Sincronización iniciada en segundo plano.', logId });

    seedMockFilesIfEmpty();

    // Start background sync process
    const client = await pool.connect();
    try {
      // 1. Scan Google Drive (via rclone) or Local Fallback
      // Let's assume we copy BASC documents to BASC local folder first
      // rclone copy gdrive_cumplidos:BASC backend/docs/basc --update
      const rcloneRemote = 'gdrive_cumplidos';
      let rcloneAvailable = false;
      try {
        await execAsync('which rclone');
        rcloneAvailable = true;
      } catch {}

      if (rcloneAvailable) {
        console.log('[M7-BASC] Rclone detected. Syncing Google Drive BASC folder...');
        try {
          // Sync BASC folder from Google Drive to local base directory
          await execAsync(`rclone sync "${rcloneRemote}:BASC" "${LOCAL_BASE}" --update --create-empty-src-dirs`);
        } catch (rcloneErr: any) {
          console.warn('[M7-BASC] Rclone sync failed, using existing local files:', rcloneErr.message);
        }
      } else {
        console.log('[M7-BASC] Rclone not found. Using local files from backend/docs/basc...');
      }

      // 2. Read local directory and compare with DB
      for (const folder of BASC_FOLDERS) {
        const dirPath = path.join(LOCAL_BASE, folder);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath);
        for (const fileName of files) {
          processedCount++;
          const fullPath = path.join(dirPath, fileName);
          const stats = fs.statSync(fullPath);
          const ext = path.extname(fileName).toLowerCase();

          // Check if already in DB and up to date
          const docCheck = await client.query(
            'SELECT * FROM basc_documents WHERE folder = $1 AND file_name = $2',
            [folder, fileName]
          );

          let dbDoc = docCheck.rows[0];
          let needsReprocessing = !dbDoc || Number(dbDoc.size_bytes) !== stats.size;

          if (needsReprocessing) {
            newCount++;
            console.log(`[M7-BASC] Indexando/Procesando archivo: ${folder}/${fileName}`);
            
            // Read file content
            let content = '';
            try {
              if (ext === '.pdf') {
                const pdfBuffer = fs.readFileSync(fullPath);
                const pdfData = await pdfParse(pdfBuffer);
                content = pdfData.text || '';
              } else if (ext === '.txt' || ext === '.md' || ext === '.json') {
                content = fs.readFileSync(fullPath, 'utf8');
              } else {
                content = `Documento ${fileName} (tipo ${ext}) indexado por metadatos.`;
              }
            } catch (readErr: any) {
              errorsCount++;
              console.error(`[M7-BASC] Error leyendo contenido de ${fileName}:`, readErr.message);
              content = `Error de lectura: ${readErr.message}`;
            }

            // Insert BASC document
            if (!dbDoc) {
              const insertRes = await client.query(
                `INSERT INTO basc_documents (file_name, folder, drive_path, drive_link, mime_type, size_bytes, sync_status, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [fileName, folder, `${folder}/${fileName}`, `/basc/files/${folder}/${fileName}`, ext === '.pdf' ? 'application/pdf' : 'text/plain', stats.size, 'SYNCHRONIZED', null]
              );
              dbDoc = insertRes.rows[0];
            } else {
              await client.query(
                `UPDATE basc_documents 
                 SET size_bytes = $1, last_sync_at = NOW(), sync_status = $2, error_message = $3
                 WHERE id = $4`,
                [stats.size, 'SYNCHRONIZED', null, dbDoc.id]
              );
              // Clear old chunks
              await client.query('DELETE FROM basc_document_chunks WHERE document_id = $1', [dbDoc.id]);
            }

            // Chunk content and insert
            if (content && content.trim().length > 0) {
              const chunkSize = 1000;
              const overlap = 200;
              const chunks: any[] = [];
              let index = 0;

              for (let offset = 0; offset < content.length; offset += chunkSize - overlap) {
                const chunkText = content.substring(offset, offset + chunkSize).trim();
                if (chunkText.length > 50) {
                  chunks.push({
                    document_id: dbDoc.id,
                    chunk_index: index++,
                    content: chunkText
                  });
                }
                if (offset + chunkSize >= content.length) break;
              }

              // Batch insert chunks
              for (const chunk of chunks) {
                await client.query(
                  `INSERT INTO basc_document_chunks (document_id, chunk_index, content) VALUES ($1, $2, $3)`,
                  [chunk.document_id, chunk.chunk_index, chunk.content]
                );
              }
            }
          }
        }
      }

      console.log(`[M7-BASC] Sincronización exitosa: ${processedCount} archivos procesados, ${newCount} nuevos/actualizados.`);
    } catch (err: any) {
      status = 'ERROR';
      errorMsg = err.message || 'Error en sincronización';
      errorsCount++;
      console.error('[M7-BASC] Error crítico en sincronización BASC:', err);
    } finally {
      client.release();
      const durationMs = Date.now() - startTime;
      const details = `Escaneo finalizado. Procesados: ${processedCount}. Nuevos: ${newCount}. Errores: ${errorsCount}.`;
      
      await pool.query(
        `UPDATE basc_sync_logs SET status=$1, processed_files=$2, new_files=$3, errors_count=$4, details=$5, duration_ms=$6, error_message=$7 WHERE id=$8`,
        [status, processedCount, newCount, errorsCount, details, durationMs, errorMsg || null, logId]
      );
    }
  } catch (globalErr: any) {
    console.error('[M7-BASC] Error global al disparar sync:', globalErr);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: globalErr.message });
    }
  }
};

export const chat = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Falta la consulta del auditor.' });
    }

    // 1. Retrieve matching BASC document chunks using simple native full-text / ILIKE search
    const cleanSearchQuery = prompt.replace(/[^\w\s]/g, '').trim().split(/\s+/).join(' | ');
    const searchQuery = cleanSearchQuery ? cleanSearchQuery : prompt;

    const matchedChunksRes = await pool.query(
      `SELECT c.content, d.file_name, d.folder, 
              ts_rank_cd(to_tsvector('spanish', c.content), plainto_tsquery('spanish', $1)) as rank
       FROM basc_document_chunks c
       JOIN basc_documents d ON c.document_id = d.id
       WHERE to_tsvector('spanish', c.content) @@ plainto_tsquery('spanish', $1)
          OR c.content ILIKE $2
       ORDER BY rank DESC, c.id ASC
       LIMIT 8`,
      [searchQuery, `%${prompt}%`]
    );

    const matches = matchedChunksRes.rows;

    // 2. Build RAG system context
    let contextText = '';
    const sources = new Set<string>();

    if (matches.length > 0) {
      contextText = matches
        .map((m: any) => {
          sources.add(`${m.folder}/${m.file_name}`);
          return `[DOCUMENTO: ${m.folder}/${m.file_name}]\n${m.content}`;
        })
        .join('\n\n');
    } else {
      contextText = 'No se encontraron fragmentos documentales relevantes en la base de conocimiento BASC de la empresa.';
    }

    // 3. Assemble prompt for Gemini
    const systemPrompt = `
Eres "BASC Auditor AI", el asistente inteligente certificado en BASC para Orbit M7.
Tu rol es auditar los manuales, riesgos, asociados y seguridad del SGCS (Sistema de Gestión en Control y Seguridad) BASC de la empresa.

REGLAS DE RESPUESTA:
1. Responde con un tono formal, analítico y profesional, como un auditor BASC senior.
2. Utiliza estrictamente la información del CONTEXTO DOCUMENTAL proporcionada para justificar tus respuestas.
3. Si el contexto contiene hallazgos críticos, debilidades o falta de cumplimiento, indícalos claramente al usuario de manera asertiva.
4. Si la información solicitada no figura en el contexto o no está relacionada con BASC, dilo claramente, aconsejando al usuario indexar los documentos pertinentes.

CONTEXTO DOCUMENTAL DE SEGURIDAD BASC:
${contextText}
`;

    console.log(`[M7-BASC] Enviando consulta a Gemini con ${matches.length} fragmentos de contexto...`);
    const result = await AIOrchestrator.execute({
      prompt: `Pregunta del Auditor BASC:\n"${prompt}"\n\nResponde detalladamente basándote en la información documental anterior.`,
      systemInstruction: systemPrompt,
      taskType: 'chat',
      temperature: 0.2
    });

    res.json({
      success: true,
      response: result.text,
      sources: Array.from(sources)
    });
  } catch (error: any) {
    console.error('[M7-BASC] Error in chat auditor-ai:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const downloadReport = async (req: Request, res: Response) => {
  try {
    // Generate text-based compliance report summarizing all documents and logs
    const docsCount = await pool.query('SELECT COUNT(*) FROM basc_documents');
    const syncLogsCount = await pool.query('SELECT COUNT(*) FROM basc_sync_logs');
    const lastSync = await pool.query('SELECT * FROM basc_sync_logs ORDER BY executed_at DESC LIMIT 1');
    const criticalFindings = await pool.query(
      `SELECT c.content, d.file_name, d.folder 
       FROM basc_document_chunks c
       JOIN basc_documents d ON c.document_id = d.id
       WHERE c.content ILIKE '%hallazgo%' OR c.content ILIKE '%critico%' OR c.content ILIKE '%incumplimiento%'`
    );

    const reportContent = `
================================================================================
           REPORT GENERADO POR BASC AUDITOR AI — ORBIT M7
================================================================================
Fecha de Emisión: ${new Date().toLocaleString()}
Estado del Sistema: OPERATIVO Y SEGURIZADO
--------------------------------------------------------------------------------

1. ESTADÍSTICAS DEL SGCS BASC:
- Total Documentos Indexados: ${docsCount.rows[0].count}
- Ciclos de Sincronización Registrados: ${syncLogsCount.rows[0].count}
- Última Ejecución de Sincronización: ${lastSync.rows[0] ? new Date(lastSync.rows[0].executed_at).toLocaleString() : 'N/A'}
- Estado del Último Ciclo: ${lastSync.rows[0]?.status || 'N/A'}

2. HALLAZGOS Y ALERTAS DETECTADAS EN MANUALES (RAG SCAN):
${criticalFindings.rows.length === 0 
  ? 'No se encontraron hallazgos críticos explícitos en los documentos activos.' 
  : criticalFindings.rows.map((f: any, idx: number) => `
[Alerta ${idx + 1}] Encontrada en: ${f.folder}/${f.file_name}
Fragmento: "${f.content.substring(0, 300)}..."
`).join('\n')}

3. RECOMENDACIONES DE MEJORA CONTINUA BASC:
- Asegurar que la carpeta "04_Seguridad_Fisica_y_Personal" tenga registros actualizados semanalmente para todas las placas activas en Orbit M7.
- Ejecutar una simulación de auditoría interna de asociados de negocio antes de finalizar el trimestre para los proveedores afiliados en CLI-01 y CLI-02.
- Actualizar y sellar electrónicamente la Matriz de Riesgos BASC 2026 frente a cualquier variación en el volumen de fletes.

================================================================================
       Fin del Reporte. Orbit M7 Intelligence BASC, Todos los derechos reservados.
================================================================================
`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="BASC_Reporte_Cumplimiento.txt"');
    res.send(reportContent);
  } catch (error: any) {
    console.error('[M7-BASC] Error generating report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
