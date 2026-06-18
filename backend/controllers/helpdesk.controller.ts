import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(BACKEND_DIR, '..');
const MANUALS_DIR = path.join(BACKEND_DIR, 'docs', 'manuals');
const PDF_DIR = path.join(BACKEND_DIR, 'docs', 'pdf');
const INDEX_FILE = path.join(MANUALS_DIR, '_index.json');
const PROGRESS_FILE = path.join(BACKEND_DIR, 'docs', 'progress.json');

interface ManualEntry {
  name: string;
  file: string;
  updatedAt: string;
  hasPdf: boolean;
}

interface ProgressState {
  running: boolean;
  done: number;
  total: number;
  current: string;
  errors: string[];
  startedAt: string | null;
}

function readIndex(): Record<string, ManualEntry> {
  if (!fs.existsSync(INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeProgress(p: ProgressState) {
  try {
    const docsDir = path.join(BACKEND_DIR, 'docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p));
  } catch { /* ignore */ }
}

function execFileAsync(cmd: string, args: string[], opts: { cwd: string; timeout: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

function getTopLevelTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(tsx|jsx)$/.test(e.name))
    .map(e => path.join(dir, e.name))
    .sort();
}

function getAllTsxFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsxFiles(fullPath));
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

// GET /api/helpdesk/manuals
export const listManuals = async (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(MANUALS_DIR)) {
      return res.json({ manuals: [] });
    }
    const index = readIndex();
    const files = fs
      .readdirSync(MANUALS_DIR)
      .filter(f => f.endsWith('.md') && f !== '_index.json')
      .map(f => {
        const name = f.replace('.md', '');
        const stat = fs.statSync(path.join(MANUALS_DIR, f));
        const indexed = index[name];
        return {
          name,
          filename: f,
          hasPdf: fs.existsSync(path.join(PDF_DIR, `${name}.pdf`)),
          updatedAt: indexed?.updatedAt || stat.mtime.toISOString(),
          sourceFile: indexed?.file || null,
          size: stat.size,
        };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json({ manuals: files, total: files.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Error listando manuales', detail: err.message });
  }
};

// GET /api/helpdesk/manuals/:name
export const getManual = async (req: Request, res: Response) => {
  const name = req.params.name as string;
  if (!/^[\w-]+$/.test(name)) {
    return res.status(400).json({ error: 'Nombre de manual inválido' });
  }
  const filePath = path.join(MANUALS_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Manual no encontrado' });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  res.json({
    name,
    content,
    updatedAt: stat.mtime.toISOString(),
    hasPdf: fs.existsSync(path.join(PDF_DIR, `${name}.pdf`)),
  });
};

// GET /api/helpdesk/manuals/:name/pdf
export const getManualPdf = async (req: Request, res: Response) => {
  const name = req.params.name as string;
  if (!/^[\w-]+$/.test(name)) {
    return res.status(400).json({ error: 'Nombre de manual inválido' });
  }
  const filePath = path.join(PDF_DIR, `${name}.pdf`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'PDF no disponible. Regenere el manual.' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-manual.pdf"`);
  fs.createReadStream(filePath).pipe(res);
};

// GET /api/helpdesk/components — lista todos los tsx con estado de manual
export const listComponents = async (_req: Request, res: Response) => {
  const componentsDir = path.join(ROOT, 'components');
  try {
    const allFiles = getAllTsxFiles(componentsDir);
    const components = allFiles.map(f => {
      const name = path.basename(f, path.extname(f));
      const relativePath = path.relative(ROOT, f);
      const isTopLevel = path.dirname(f) === componentsDir;
      const hasManual = fs.existsSync(path.join(MANUALS_DIR, `${name}.md`));
      const hasPdf = fs.existsSync(path.join(PDF_DIR, `${name}.pdf`));
      let updatedAt: string | null = null;
      if (hasManual) {
        const stat = fs.statSync(path.join(MANUALS_DIR, `${name}.md`));
        updatedAt = stat.mtime.toISOString();
      }
      return { name, relativePath, isTopLevel, hasManual, hasPdf, updatedAt };
    });

    res.json({
      components,
      total: components.length,
      withManual: components.filter(c => c.hasManual).length,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error listando componentes', detail: err.message });
  }
};

// GET /api/helpdesk/progress — estado de generación en curso
export const getProgress = async (_req: Request, res: Response) => {
  if (!fs.existsSync(PROGRESS_FILE)) {
    return res.json({ running: false, done: 0, total: 0, current: '', errors: [], startedAt: null });
  }
  try {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    res.json(data);
  } catch {
    res.json({ running: false, done: 0, total: 0, current: '', errors: [], startedAt: null });
  }
};

// POST /api/helpdesk/generate — genera manual de un componente específico
export const generateManual = async (req: Request, res: Response) => {
  const { componentPath } = req.body as { componentPath?: string };
  if (!componentPath) {
    return res.status(400).json({ error: 'componentPath es requerido' });
  }
  const absPath = path.resolve(ROOT, componentPath);
  if (!absPath.startsWith(ROOT)) {
    return res.status(400).json({ error: 'Ruta fuera del proyecto' });
  }
  if (!/\.(tsx|jsx)$/.test(absPath)) {
    return res.status(400).json({ error: 'Solo se soportan archivos .tsx y .jsx' });
  }
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: 'Componente no encontrado' });
  }

  const scriptPath = path.join(ROOT, 'scripts', 'generate-manual.js');
  execFile('node', [scriptPath, absPath], { cwd: ROOT, timeout: 120_000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[HelpDesk] Error generando manual:', stderr);
      return res.status(500).json({ error: 'Error al generar manual', detail: stderr });
    }
    console.log('[HelpDesk]', stdout);
    const componentName = path.basename(absPath, path.extname(absPath));
    res.json({
      success: true,
      name: componentName,
      mdPath: `docs/manuals/${componentName}.md`,
      pdfPath: `docs/pdf/${componentName}.pdf`,
    });
  });
};

// POST /api/helpdesk/generate-all — genera todos los manuales (top-level, secuencial)
export const generateAllManuals = async (_req: Request, res: Response) => {
  // Verificar si ya hay una generación en curso
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const current = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) as ProgressState;
      if (current.running) {
        return res.json({
          success: false,
          message: 'Ya hay una generación en curso.',
          progress: current,
        });
      }
    } catch { /* ignore */ }
  }

  const componentsDir = path.join(ROOT, 'components');
  if (!fs.existsSync(componentsDir)) {
    return res.status(404).json({ error: 'Directorio de componentes no encontrado' });
  }

  const files = getTopLevelTsxFiles(componentsDir);
  const scriptPath = path.join(ROOT, 'scripts', 'generate-manual.js');

  const progress: ProgressState = {
    running: true,
    done: 0,
    total: files.length,
    current: '',
    errors: [],
    startedAt: new Date().toISOString(),
  };
  writeProgress(progress);

  // Responder inmediatamente
  res.json({
    success: true,
    message: `Generación iniciada: ${files.length} componentes en cola (secuencial).`,
    total: files.length,
  });

  // Correr secuencialmente en background
  (async () => {
    for (const file of files) {
      const name = path.basename(file, path.extname(file));
      progress.current = name;
      writeProgress(progress);

      try {
        await execFileAsync('node', [scriptPath, file], { cwd: ROOT, timeout: 120_000 });
        console.log(`[HelpDesk] ✓ ${name} (${progress.done + 1}/${files.length})`);
      } catch (err: any) {
        console.error(`[HelpDesk] ✗ ${name}:`, err.message);
        progress.errors.push(name);
      }

      progress.done++;
      writeProgress(progress);
    }

    progress.running = false;
    progress.current = '';
    writeProgress(progress);
    console.log(`[HelpDesk] Generación completa: ${progress.done}/${files.length} (${progress.errors.length} errores)`);
  })();
};
