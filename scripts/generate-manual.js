#!/usr/bin/env node
/**
 * Generador de manuales de usuario usando Gemini AI.
 * Analiza el código real del componente y genera un manual preciso.
 *
 * Uso: node scripts/generate-manual.js <ruta/componente.tsx>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MANUALS_DIR = path.join(ROOT, 'backend', 'docs', 'manuals');
const PDF_DIR     = path.join(ROOT, 'backend', 'docs', 'pdf');

// ── Config institucional ──────────────────────────────────────────────────────
const SUPPORT_EMAIL    = 'directorti@millasiete.com';
const SUPPORT_WHATSAPP = '3011825161';

// ── Logo: logo-encuesta.png (el que usan las planillas) ───────────────────────
const LOGO_PATH = path.join(ROOT, 'public', 'logo-encuesta.png');
const LOGO_B64  = fs.existsSync(LOGO_PATH)
  ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
  : null;

// ── Leer claves Gemini del .env (pueden ser varias, separadas por coma) ────────
function loadGeminiKeys() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return [];
  const line = fs.readFileSync(envPath, 'utf8')
    .split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
  if (!line) return [];
  return line.replace('GEMINI_API_KEY=', '').trim().split(',').map(k => k.trim()).filter(Boolean);
}

// ── Consultar DB para obtener módulo y página ─────────────────────────────────
function getNavigation(componentName) {
  // Convertir CamelCase a posibles rutas: ConsultaFacturas → consulta-facturas
  const kebab = componentName
    .replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');

  // Intentar varias formas del nombre de ruta
  const candidates = [
    kebab,
    kebab.replace(/-/g, ''),
    componentName.toLowerCase(),
  ];

  for (const route of candidates) {
    try {
      const sql = `SELECT m.name as mod_name, p.name as pag_name FROM pages p LEFT JOIN modules m ON p.parent_id = m.id WHERE LOWER(p.route) = '${route}' LIMIT 1;`;
      const result = execSync(
        `podman exec m7app_postgres-podman_1 psql -U m7_admin -d m7_logistica -t -A -F'|' -c "${sql}" 2>/dev/null`,
        { timeout: 5000 }
      ).toString().trim();

      if (result && result.includes('|')) {
        const [modName, pagName] = result.split('|');
        return { modName: modName?.trim(), pagName: pagName?.trim(), route };
      }
    } catch { /* continuar con el siguiente candidato */ }
  }
  return null;
}

// ── Llamar a Gemini API con rotación de claves ────────────────────────────────
async function callGemini(keys, prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  });

  for (const apiKey of keys) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (netErr) {
      console.warn(`[HelpDesk] Red falló con clave ...${apiKey.slice(-4)}: ${netErr.message}`);
      continue;
    }

    if (res.status === 429) {
      console.warn(`[HelpDesk] Cuota agotada (429) con clave ...${apiKey.slice(-4)}, rotando...`);
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`);
    }

    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }
  throw new Error('Todas las claves Gemini agotadas (429 en todas)');
}

// ── Prompt para Gemini ────────────────────────────────────────────────────────
function buildPrompt(componentName, code, nav) {
  const navSection = nav
    ? `La ruta de acceso en la app es: Menú lateral → **${nav.modName}** → **${nav.pagName}**`
    : `El módulo se llama **${componentName.replace(/([A-Z])/g, ' $1').trim()}**`;

  // Limitar código a 40.000 chars para no exceder límites
  const codeSnippet = code.length > 40000
    ? code.slice(0, 38000) + '\n\n... [código truncado] ...'
    : code;

  return `Eres un redactor técnico experto en sistemas de gestión logística.
Analiza el siguiente código React del sistema OrbitM7 de Milla 7 S.A.S. y genera un manual de usuario profesional en español.

SISTEMA: OrbitM7 — Milla 7 S.A.S.
MÓDULO: ${componentName}
${navSection}

INSTRUCCIONES CRÍTICAS:
- Describe ÚNICAMENTE lo que existe en el código. No inventes funciones.
- Identifica TODOS los tabs/pestañas con sus nombres exactos del JSX.
- Identifica TODOS los inputs con sus placeholders o labels reales.
- Identifica TODOS los botones con su texto exacto.
- Explica la secuencia de pasos exacta que el usuario debe seguir.
- Si hay acciones que requieren permisos especiales (hasPermission, canDelete, etc.), indícalo claramente.
- Describe qué información se muestra en los resultados.
- Usa el formato exacto indicado más abajo.

CÓDIGO DEL COMPONENTE:
\`\`\`tsx
${codeSnippet}
\`\`\`

Genera el manual en el siguiente formato Markdown exacto:

# Manual de Usuario — ${componentName}

> **Sistema:** OrbitM7 — Milla 7 Logística
> **Módulo:** \`${componentName}\`
> **Fecha:** ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}

---

## Descripción general

[Descripción precisa de qué hace este módulo basada en el código]

---

## Ruta de acceso

[Pasos exactos para llegar al módulo desde el menú lateral]

---

## Pestañas del módulo

[Si tiene tabs, listar cada una con su nombre exacto y descripción]

---

## Guía de uso paso a paso

[Pasos numerados con los nombres exactos de los campos, botones y controles que aparecen en el código]

---

## Información disponible

[Qué datos/campos se muestran al usuario en los resultados]

---

## Acciones y permisos

[Qué acciones puede realizar el usuario, cuáles requieren permisos especiales]

---

## Solución de problemas

| Problema | Causa probable | Solución |
|----------|---------------|----------|
[Mínimo 4 filas con problemas reales del módulo]

---

## Referencias institucionales

| | |
|-|-|
| **Sistema** | OrbitM7 — Plataforma de Gestión Logística |
| **Empresa** | Milla 7 S.A.S. |
| **Soporte** | ${SUPPORT_EMAIL} |
| **WhatsApp** | ${SUPPORT_WHATSAPP} |
| **Versión** | ${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')} |

---

*Manual generado automáticamente por el sistema HelpDesk de OrbitM7.*`;
}

// ── Generar PDF con Puppeteer ─────────────────────────────────────────────────
async function generatePdf(markdownContent, componentName, screenshots = []) {
  let puppeteer;
  try {
    const { default: p } = await import('puppeteer');
    puppeteer = p;
  } catch {
    console.warn('[HelpDesk] Puppeteer no disponible — PDF omitido.');
    return null;
  }

  const html = markdownToHtml(markdownContent, componentName, screenshots);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '18mm', right: '20mm', bottom: '18mm', left: '20mm' },
    printBackground: true,
  });
  await browser.close();
  return pdfBuffer;
}

function markdownToHtml(md, title, screenshots = []) {
  let html = md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Tablas
    .replace(/\|(.+)\|\n\|[-|: ]+\|\n((?:\|.+\|\n?)*)/g, (_, header, rows) => {
      const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const trs = rows.trim().split('\n').filter(Boolean).map(row => {
        const tds = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      const thead = ths.replace(/<th><\/th>/g, '').trim()
        ? `<thead><tr>${ths}</tr></thead>` : '';
      return `<table>${thead}<tbody>${trs}</tbody></table>`;
    })
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^(?!<[hublpt])(.+)$/gm, '<p>$1</p>');

  const logoHtml = LOGO_B64
    ? `<img src="${LOGO_B64}" alt="Milla Siete" style="height:48px;width:auto;object-fit:contain;">`
    : `<div style="font-size:20px;font-weight:900;color:#10b981;">Milla 7</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${title} — Manual de Usuario</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; line-height: 1.65; font-size: 12.5px; }
    h1 { font-size: 20px; color: #0f172a; border-bottom: 3px solid #10b981; padding-bottom: 8px; margin: 8px 0 16px; }
    h2 { font-size: 15px; color: #1e40af; border-left: 4px solid #10b981; padding-left: 10px; margin: 24px 0 10px; }
    h3 { font-size: 13px; color: #334155; margin: 16px 0 6px; font-weight: 700; }
    p  { margin: 6px 0; }
    code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 11px; color: #0f766e; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 10px 0; }
    pre code { background: none; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11.5px; }
    th { background: #1e293b; color: white; padding: 7px 11px; text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; }
    td { padding: 6px 11px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    ul { padding-left: 18px; margin: 6px 0; }
    li { margin: 3px 0; }
    blockquote { border-left: 4px solid #10b981; margin: 8px 0; padding: 6px 14px; background: #f0fdf4; color: #166534; border-radius: 0 5px 5px 0; font-size: 11px; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }
    strong { color: #0f172a; font-weight: 700; }
    .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 3px solid #10b981; margin-bottom: 20px; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-brand { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; }
    .header-right { text-align: right; font-size: 10.5px; color: #64748b; line-height: 1.7; }
    .header-right strong { font-size: 12px; color: #1e293b; display: block; }
    @page { margin: 16mm 18mm; }
  </style>
</head>
<body>
  <div class="page-header">
    <div class="header-left">
      ${logoHtml}
      <div class="header-brand">OrbitM7 — Sistema de Gestión Logística</div>
    </div>
    <div class="header-right">
      <strong>Manual — ${title}</strong>
      ${SUPPORT_EMAIL} · WhatsApp ${SUPPORT_WHATSAPP}
    </div>
  </div>
  ${html}
  ${screenshots.length > 0 ? `
  <div style="margin-top:28px;">
    <h2 style="font-size:15px;color:#1e40af;border-left:4px solid #10b981;padding-left:10px;margin-bottom:16px;">Capturas de Pantalla del Módulo</h2>
    ${screenshots.map((s, i) => `
    <div style="margin-bottom:24px;page-break-inside:avoid;">
      <p style="font-size:10.5px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">
        ${i === 0 ? '📷' : `${i}.`} ${s.caption}
      </p>
      <img src="${s.src}" alt="${s.caption}"
           style="width:100%;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    </div>`).join('')}
  </div>` : ''}
</body>
</html>`;
}

// ── Actualizar índice ─────────────────────────────────────────────────────────
function updateIndex(componentName, filePath) {
  const indexPath = path.join(MANUALS_DIR, '_index.json');
  let index = {};
  if (fs.existsSync(indexPath)) {
    try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { index = {}; }
  }
  index[componentName] = {
    name: componentName,
    file: path.relative(ROOT, filePath),
    updatedAt: new Date().toISOString(),
    hasPdf: fs.existsSync(path.join(PDF_DIR, `${componentName}.pdf`)),
  };
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: node scripts/generate-manual.js <ruta/componente.tsx>');
    process.exit(1);
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`[HelpDesk] No encontrado: ${absPath}`);
    process.exit(1);
  }

  const ext = path.extname(absPath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts'].includes(ext)) {
    console.log(`[HelpDesk] Saltando ${path.basename(absPath)} (no es componente React)`);
    process.exit(0);
  }

  // Extraer nombre del componente — preferir que coincida con el nombre del archivo
  const fileName = path.basename(absPath, ext);
  const code = fs.readFileSync(absPath, 'utf8');
  const candidates = [];
  for (const rx of [
    /export\s+default\s+function\s+(\w+)/g,
    /export\s+const\s+(\w+)\s*[:=][^;]*(?:React\.FC|JSX\.Element)/g,
  ]) {
    for (const m of code.matchAll(rx)) candidates.push(m[1]);
  }
  const componentName = candidates.find(c => c === fileName) || candidates[0] || fileName;

  console.log(`[HelpDesk] Analizando: ${componentName} (${Math.round(code.length / 1024)}KB)`);

  // Obtener ruta de navegación desde la DB
  const nav = getNavigation(componentName);
  if (nav) {
    console.log(`[HelpDesk] Ruta DB: ${nav.modName} → ${nav.pagName}`);
  } else {
    console.log(`[HelpDesk] Sin entrada en DB — se usará nombre del componente`);
  }

  // Llamar a Gemini para generar el manual
  const geminiKeys = loadGeminiKeys();
  let mdContent;

  if (geminiKeys.length > 0) {
    console.log(`[HelpDesk] Generando con Gemini AI (${geminiKeys.length} clave${geminiKeys.length > 1 ? 's' : ''})...`);
    const prompt = buildPrompt(componentName, code, nav);
    try {
      mdContent = await callGemini(geminiKeys, prompt);
      if (!mdContent) throw new Error('Respuesta vacía de Gemini');
      console.log(`[HelpDesk] ✓ Manual generado por IA (${mdContent.length} chars)`);
    } catch (err) {
      console.warn(`[HelpDesk] ⚠ Gemini falló: ${err.message} — usando análisis estático`);
      mdContent = null;
    }
  }

  // Fallback: análisis estático si Gemini falla
  if (!mdContent) {
    mdContent = generateStaticManual(componentName, code, nav);
    console.log(`[HelpDesk] ✓ Manual generado (análisis estático)`);
  }

  // Guardar Markdown
  fs.mkdirSync(MANUALS_DIR, { recursive: true });
  const mdPath = path.join(MANUALS_DIR, `${componentName}.md`);
  fs.writeFileSync(mdPath, mdContent, 'utf8');
  console.log(`[HelpDesk] ✓ Markdown: backend/docs/manuals/${componentName}.md`);

  // Capturar pantallazos anotados
  const ui4screenshots = extractUiElements(code);
  let screenshots = [];
  if (nav?.route) {
    console.log(`[HelpDesk] Capturando pantallazos...`);
    try {
      screenshots = await captureScreenshots(nav, ui4screenshots.mainTabs);
      if (screenshots.length > 0) console.log(`[HelpDesk] ✓ ${screenshots.length} pantallazos capturados`);
      else console.log(`[HelpDesk] Sin pantallazos (app no accesible o sin ruta)`);
    } catch (err) {
      console.warn(`[HelpDesk] ⚠ Pantallazos fallaron: ${err.message}`);
    }
  }

  // Generar PDF
  fs.mkdirSync(PDF_DIR, { recursive: true });
  try {
    const pdfBuffer = await generatePdf(mdContent, componentName, screenshots);
    if (pdfBuffer) {
      fs.writeFileSync(path.join(PDF_DIR, `${componentName}.pdf`), pdfBuffer);
      console.log(`[HelpDesk] ✓ PDF:      backend/docs/pdf/${componentName}.pdf`);
    }
  } catch (err) {
    console.warn(`[HelpDesk] ⚠ PDF omitido: ${err.message}`);
  }

  updateIndex(componentName, absPath);
}

// ── Extraer código de un sub-componente por nombre (conteo de llaves) ─────────
function extractSubComponentCode(code, componentName) {
  const startPatterns = [
    `const ${componentName}:`,
    `const ${componentName} =`,
    `function ${componentName}(`,
  ];
  let startIdx = -1;
  for (const p of startPatterns) {
    const idx = code.indexOf(p);
    if (idx >= 0 && (startIdx < 0 || idx < startIdx)) startIdx = idx;
  }
  if (startIdx < 0) return null;

  // Buscar la llave del CUERPO de la función (no las de los tipos genéricos)
  // Buscamos ") {" o "=> {" en los primeros 600 chars desde startIdx
  const headerSlice = code.slice(startIdx, startIdx + 600);
  const bodyMatch = headerSlice.match(/(?:=>\s*\{|\)\s*\{)/);
  if (!bodyMatch) return null;
  const braceStart = startIdx + bodyMatch.index + bodyMatch[0].indexOf('{');

  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) return code.slice(startIdx, i + 1); }
  }
  return code.slice(startIdx, startIdx + 8000);
}

// Mapa tab-key → nombre de sub-componente renderizado
function extractSubComponentMap(code) {
  const mapping = {};

  // tab === 'key' ? <CompA .../> : <CompB .../> — captura ambos lados del ternario
  const ternRx = /\b(?:tab|activeTab)\s*===\s*['"](\w[\w-]*)['"][\s\S]{0,100}?<(\w+)[\s\S]{0,200}?:\s*<(\w+)/g;
  for (const m of code.matchAll(ternRx)) {
    if (/^[A-Z]/.test(m[2]) && !mapping[m[1]]) mapping[m[1]] = m[2];
    // La rama else del ternario: buscar el key que NO es m[1]
    // e.g. type Tab='factura'|'item' → 'item' maps to CompB
  }

  // Patrón simple: tab === 'key' seguido de < ComponentName
  for (const rx of [
    /\btab(?:Name)?\s*===\s*['"](\w[\w-]*)['"][\s\S]{0,80}?<(\w+)/g,
    /activeTab\s*===\s*['"](\w[\w-]*)['"][\s\S]{0,80}?<(\w+)/g,
  ]) {
    for (const m of code.matchAll(rx)) {
      if (!mapping[m[1]] && /^[A-Z]/.test(m[2])) mapping[m[1]] = m[2];
    }
  }

  // switch case
  for (const m of code.matchAll(/case\s*['"](\w[\w-]*)['"]\s*:[^<]{0,60}<(\w+)/g)) {
    if (!mapping[m[1]] && /^[A-Z]/.test(m[2])) mapping[m[1]] = m[2];
  }

  // Ternario completo: para cada ternario tab===X?<CompA>:<CompB>,
  // mapear el key opuesto al CompB también
  // Buscar pattern: tab === 'keyA' ? <CompA ... /> : <CompB
  const fullTernRx = /\b(?:tab|activeTab)\s*===\s*['"](\w+)['"]\s*\?[\s\S]{0,300}?<(\w+)[^>]*\/>[\s\S]{0,30}?:[\s\S]{0,30}?<(\w+)/g;
  for (const m of code.matchAll(fullTernRx)) {
    // m[1]=keyA, m[2]=CompA, m[3]=CompB
    // Find the OTHER key from type Tab declaration
    const typeTabRx2 = /type \w*[Tt]ab\s*=\s*((?:'[\w -]+'(?:\s*\|\s*)?)+)/;
    const ttMatch = code.match(typeTabRx2);
    if (ttMatch) {
      const allKeys = (ttMatch[1].match(/'([\w -]+)'/g) || []).map(s => s.replace(/'/g, ''));
      const otherKeys = allKeys.filter(k => k !== m[1]);
      if (otherKeys.length === 1 && /^[A-Z]/.test(m[3]) && !mapping[otherKeys[0]]) {
        mapping[otherKeys[0]] = m[3];
      }
    }
  }

  return mapping;
}

// ── Capturas de pantalla con Puppeteer ────────────────────────────────────────
async function captureScreenshots(nav, mainTabLabels) {
  if (!nav?.route) return [];
  let puppeteer;
  try { const { default: p } = await import('puppeteer'); puppeteer = p; } catch { return []; }

  const envContent = fs.existsSync(path.join(ROOT, '.env'))
    ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '';
  const getEnv = (k) => {
    const l = envContent.split('\n').find(x => x.startsWith(`${k}=`));
    return l ? l.split('=').slice(1).join('=').trim() : null;
  };

  const appUrl  = 'http://localhost:5174';
  // Usar cuenta administrador para capturas — ignoramos DEMO_EMAIL (puede no existir en prod)
  const email   = 'directorti@millasiete.com';
  const pass    = getEnv('VITE_APP_DEMO_PASSWORD') || 'admin123';

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  const screenshots = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 820 });

    // Login — OrbitM7 usa type="text" para el campo de correo
    await page.goto(appUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForSelector('input[name="email"]', { timeout: 8000 });
    await page.click('input[name="email"]');
    await page.type('input[name="email"]', email, { delay: 40 });
    await page.type('input[type="password"]', pass, { delay: 40 });
    await page.keyboard.press('Enter');
    // Esperar a que desaparezca el formulario de login (indica sesión iniciada)
    await new Promise(r => setTimeout(r, 3000));

    // Navegar al módulo via sidebar — primero botón exacto, luego parcial
    if (nav.modName) {
      await page.evaluate((text) => {
        // Buscar botón exacto primero
        for (const el of document.querySelectorAll('button')) {
          if (el.textContent.trim().toUpperCase() === text.toUpperCase()) { el.click(); return; }
        }
        // Fallback: incluye el texto
        for (const el of document.querySelectorAll('button, a, div[role="button"]')) {
          if (el.textContent.trim().toUpperCase().includes(text.slice(0, 10).toUpperCase())) { el.click(); return; }
        }
      }, nav.modName);
      await new Promise(r => setTimeout(r, 700));
    }

    if (nav.pagName) {
      await page.evaluate((text) => {
        for (const el of document.querySelectorAll('button, a, li, span, div')) {
          const t = el.textContent.trim().toUpperCase();
          if (t.startsWith(text.slice(0, 14).toUpperCase()) && t.length < 30 && el.children.length <= 1) {
            el.click(); return;
          }
        }
      }, nav.pagName);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Captura general del módulo (estado inicial)
    const buf0 = await page.screenshot({ type: 'png' });
    screenshots.push({
      src: `data:image/png;base64,${buf0.toString('base64')}`,
      caption: `Vista general del módulo`,
      step: 0,
    });

    // Captura por tab (si hay tabs visibles)
    for (let i = 0; i < mainTabLabels.length && i < 4; i++) {
      const tabLabel = mainTabLabels[i];
      // Intentar clic en la pestaña
      const tabClicked = await page.evaluate((text) => {
        for (const el of document.querySelectorAll('button')) {
          if (el.textContent.trim().toUpperCase() === text.toUpperCase()) {
            el.click(); return true;
          }
        }
        return false;
      }, tabLabel);

      if (tabClicked) {
        await new Promise(r => setTimeout(r, 800));
        // Anotar el tab activo con un resaltado rojo
        await page.evaluate((text) => {
          const prev = document.getElementById('_manual_ann');
          if (prev) prev.remove();
          const ann = document.createElement('div');
          ann.id = '_manual_ann';
          ann.style.cssText = 'position:fixed;inset:0;z-index:99998;pointer-events:none;';
          for (const el of document.querySelectorAll('button')) {
            if (el.textContent.trim().toUpperCase() === text.toUpperCase()) {
              const r = el.getBoundingClientRect();
              const box = document.createElement('div');
              box.style.cssText = `position:absolute;left:${r.left-3}px;top:${r.top-3}px;width:${r.width+6}px;height:${r.height+6}px;border:3px solid #ef4444;border-radius:8px;box-shadow:0 0 0 4px rgba(239,68,68,.2);`;
              const badge = document.createElement('div');
              badge.style.cssText = 'position:absolute;top:-10px;left:-10px;width:20px;height:20px;background:#ef4444;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;font-family:sans-serif;';
              badge.textContent = '→';
              box.appendChild(badge);
              ann.appendChild(box);
            }
          }
          document.body.appendChild(ann);
        }, tabLabel);
        const buf = await page.screenshot({ type: 'png' });
        screenshots.push({
          src: `data:image/png;base64,${buf.toString('base64')}`,
          caption: `Pestaña: ${tabLabel}`,
          step: i + 1,
        });
        // Limpiar anotación
        await page.evaluate(() => { const el = document.getElementById('_manual_ann'); if (el) el.remove(); });
      }
    }
  } catch (err) {
    console.warn(`[HelpDesk] ⚠ Screenshots fallaron: ${err.message}`);
  } finally {
    await browser.close();
  }
  return screenshots;
}

// ── Analizador de UI avanzado ─────────────────────────────────────────────────
function extractUiElements(code) {
  // Tabs principales (botones dentro de nav de tabs)
  const mainTabs = [];

  // Mapa global key→label desde arrays { id, label } y { key, label }
  const tabKeyLabelMap = {};
  const tabArrayRx = /\{\s*(?:id|key):\s*['"](\w[\w-]*)['"]\s*(?:as\s+\w+)?\s*,\s*label:\s*['"]([^'"]{2,60})['"]/g;
  for (const m of code.matchAll(tabArrayRx)) tabKeyLabelMap[m[1]] = m[2].trim();
  // También patrón invertido: { label, id }
  const tabArrayRx2 = /\{\s*label:\s*['"]([^'"]{2,60})['"],\s*(?:id|key):\s*['"](\w[\w-]*)['"]/g;
  for (const m of code.matchAll(tabArrayRx2)) tabKeyLabelMap[m[2]] = m[1].trim();

  // Estrategia 1: type Tab = 'x' | 'y' — declaración más precisa del tipo principal
  const typeTabRx = /type \w*(?<![Ll]iberar|[Ss]ub|[Ii]nner)[Tt]ab\s*=\s*((?:'[\w -]+'(?:\s*\|\s*)?)+)/;
  const typeTabMatch = code.match(typeTabRx);
  if (typeTabMatch) {
    const keys = typeTabMatch[1].match(/'([\w -]+)'/g)?.map(s => s.replace(/'/g, '')) || [];
    for (const key of keys) {
      if (tabKeyLabelMap[key]) {
        // Usar el label del mapa (más preciso)
        mainTabs.push(tabKeyLabelMap[key]);
      } else {
        // Buscar el texto del botón que activa este key
        const btnForKeyRx = new RegExp(`set\\w{0,10}[Tt]ab\\(['"]${key}['"]\\)[\\s\\S]{0,900}?>\\s*\\n?\\s*([A-ZÁÉÍÓÚÑ\\w][^\\n<{]{2,50})\\s*\\n?\\s*<\\/button>`, 'g');
        const btnMatch = [...code.matchAll(btnForKeyRx)][0];
        mainTabs.push(btnMatch ? btnMatch[1].trim() : key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
      }
    }
  }

  // Estrategia 2: solo array { id/key, label } si no hay type declaration
  if (mainTabs.length === 0 && Object.keys(tabKeyLabelMap).length > 0) {
    for (const label of Object.values(tabKeyLabelMap)) mainTabs.push(label);
  }

  // Estrategia 3 (fallback): botones con setter setTab/setActiveTab
  if (mainTabs.length === 0) {
    const tabBtnRx = /onClick=\{[^}]*(?:setTab|setActiveTab)\(['"][\w-]+['"]\)[^}]*\}[\s\S]{0,900}?>\s*\n?\s*([A-ZÁÉÍÓÚÑ\w][^\n<{]{2,50})\s*\n?\s*<\/button>/g;
    for (const m of code.matchAll(tabBtnRx)) {
      const t = m[1].trim();
      if (t && t.length < 50 && !mainTabs.includes(t)) mainTabs.push(t);
    }
  }

  // Inputs con sus labels/placeholders (excluye JSX expressions)
  const inputs = [];
  const isJsx = (s) => /^\{|^\s*\{|\$\{/.test(s);
  // Label + input adyacentes
  const labelRx = /<label[^>]*>([^<{]{3,60})<\/label>/g;
  for (const m of code.matchAll(labelRx)) {
    const t = m[1].replace(/<[^>]+>/g, '').trim();
    if (t && t.length < 60 && !isJsx(t) && !inputs.includes(t)) inputs.push(t);
  }
  // Placeholders
  const phRx = /placeholder="([^"]{4,60})"/g;
  for (const m of code.matchAll(phRx)) {
    const t = m[1].trim();
    if (!isJsx(t) && !inputs.includes(t)) inputs.push(t);
  }

  // Botones (texto visible real, filtrar JSX props y cortos)
  const buttons = new Set();
  const btnRx = /<button[^>]*>\s*(?:\{[^}]*\}\s*)?([A-ZÁÉÍÓÚÑ][^<\n{]{2,40})\s*<\/button>/g;
  for (const m of code.matchAll(btnRx)) {
    const t = m[1].trim().replace(/\s+/g, ' ');
    if (t.length > 2 && t.length < 40 && !/^[{<]/.test(t)) buttons.add(t);
  }
  // Texto de botones con ternario (estado cargando vs normal)
  const ternaryBtnRx = /loading\s*\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(ternaryBtnRx)) {
    buttons.add(m[2].trim()); // usar el texto no-cargando
  }

  // Columnas de tabla
  const columns = [];
  const thRx = /<th[^>]*>([^<\n]{2,50})<\/th>/g;
  for (const m of code.matchAll(thRx)) {
    const t = m[1].trim();
    if (t && !columns.includes(t)) columns.push(t);
  }

  // Secciones / títulos (excluye JSX expressions {})
  const sections = [];
  for (const rx of [
    /<h1[^>]*>([^<{}{]{3,80})<\/h1>/g,
    /<h2[^>]*>([^<{}{]{3,80})<\/h2>/g,
    /<h3[^>]*>([^<{}{]{3,80})<\/h3>/g,
    /title:\s*['"]([^'"]{3,60})['"]/g,
  ]) {
    for (const m of code.matchAll(rx)) {
      const t = m[1].trim();
      if (t && !t.startsWith('{') && !sections.includes(t)) sections.push(t);
    }
  }

  // Permisos especiales
  const permissions = [];
  const permRx = /hasPermission\(['"]([^'"]+)['"]\)|can\w+\s*&&|user\.role/g;
  for (const m of code.matchAll(permRx)) {
    const t = m[1] ? m[1].trim() : null;
    if (t && !permissions.includes(t)) permissions.push(t);
  }

  // Subtabs o tabs internos (liberarTab, etc.)
  const subTabs = [];
  const subTabRx = /setLiberarTab\(['"](\w+)['"]\)|set\w+Tab\(['"](\w+)['"]\)/g;
  for (const m of code.matchAll(subTabRx)) {
    const t = (m[1] || m[2] || '').trim();
    if (t && !subTabs.includes(t)) subTabs.push(t);
  }
  // Encontrar labels de esos subtabs
  const subTabLabels = {};
  const subTabLabelRx = /(?:setLiberarTab|set\w+Tab)\(['"](\w+)['"]\)[\s\S]{0,300}?>([^<\n]{2,30})<\/button>/g;
  for (const m of code.matchAll(subTabLabelRx)) {
    subTabLabels[m[1]] = m[2].trim();
  }

  // Exportaciones
  const exports = [];
  if (/exportToExcel|xlsx|export.*excel/i.test(code)) exports.push('Excel (.xlsx)');
  if (/exportToPdf|export.*pdf|generatePdf/i.test(code)) exports.push('PDF');

  // Modales
  const modals = [];
  const modalRx = /show\w*Modal|is\w*Open|dialog\w*Open/g;
  const modalNames = new Set();
  for (const m of code.matchAll(modalRx)) modalNames.add(m[0]);
  for (const n of modalNames) {
    const labelized = n
      .replace(/^show/, '').replace(/^is/, '').replace(/Modal|Open$/, '')
      .replace(/([A-Z])/g, ' $1').trim();
    if (labelized.length > 2) modals.push(labelized);
  }

  return {
    mainTabs: [...new Set(mainTabs)],
    inputs: inputs.slice(0, 10),
    buttons: [...buttons].slice(0, 12),
    columns: columns.slice(0, 10),
    sections: sections.slice(0, 8),
    permissions,
    subTabs,
    subTabLabels,
    exports,
    modals: [...new Set(modals)].slice(0, 5),
  };
}

function generateStaticManual(componentName, code, nav) {
  const now = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  const navLine = nav
    ? `Ingresa al módulo **${nav.modName}** → página **${nav.pagName}** del módulo`
    : `Menú lateral → buscar **${componentName.replace(/([A-Z])/g, ' $1').trim()}**`;

  const ui = extractUiElements(code);
  const displayName = componentName.replace(/([A-Z])/g, ' $1').trim();

  // Mapa key→label para tabs
  const subCompMap = extractSubComponentMap(code);
  const typeTabRx2 = /type \w*(?<![Ll]iberar|[Ss]ub|[Ii]nner)[Tt]ab\s*=\s*((?:'[\w -]+'(?:\s*\|\s*)?)+)/;
  const typeTabMatch2 = code.match(typeTabRx2);
  const tabKeyLabelMap2 = {};
  const tabArrayRx3 = /\{\s*(?:id|key):\s*['"](\w[\w-]*)['"]\s*(?:as\s+\w+)?\s*,\s*label:\s*['"]([^'"]{2,60})['"]/g;
  for (const m of code.matchAll(tabArrayRx3)) tabKeyLabelMap2[m[1]] = m[2].trim();

  // Extraer UI por sub-componente para cada tab key
  const tabKeys = typeTabMatch2
    ? (typeTabMatch2[1].match(/'([\w -]+)'/g) || []).map(s => s.replace(/'/g, ''))
    : Object.keys(subCompMap);

  const tabDataMap = {}; // tabLabel → { inputs, buttons, columns, exports }
  for (const key of tabKeys) {
    const label = tabKeyLabelMap2[key] || ui.mainTabs.find(t => t.toLowerCase().includes(key.replace(/_/g,' '))) || key;
    const subCompName = subCompMap[key];
    if (subCompName) {
      const subCode = extractSubComponentCode(code, subCompName);
      if (subCode) {
        tabDataMap[label] = extractUiElements(subCode);
      }
    }
  }

  // Construir sección de tabs
  let tabsSection = '';
  if (ui.mainTabs.length > 0) {
    tabsSection = `## Pestañas del módulo\n\nEl módulo cuenta con ${ui.mainTabs.length} pestaña${ui.mainTabs.length > 1 ? 's' : ''}:\n\n${ui.mainTabs.map(t => `- **${t}**`).join('\n')}\n\n---\n`;
  }

  // Guía de uso — con datos específicos por tab si están disponibles
  let guideSteps = '';
  if (ui.mainTabs.length > 0) {
    guideSteps = ui.mainTabs.map((tabName, idx) => {
      const tabData = tabDataMap[tabName];
      const stepLines = [`### ${idx + 1}. Pestaña — ${tabName}`, ''];
      const relevantInputs = tabData ? tabData.inputs : ui.inputs.slice(idx * 3, idx * 3 + 4);
      const relevantBtns   = tabData ? [...tabData.buttons].slice(0, 4) : [...ui.buttons].slice(idx * 2, idx * 2 + 3);

      if (relevantInputs.length > 0) {
        stepLines.push('**Campos de entrada:**');
        relevantInputs.slice(0, 5).forEach(inp => stepLines.push(`- Ingrese el valor en el campo **${inp}**`));
        stepLines.push('');
      }
      if (relevantBtns.length > 0) {
        stepLines.push('**Acciones disponibles:**');
        relevantBtns.forEach(btn => stepLines.push(`- Haga clic en **${btn}**`));
      }
      // Columnas de resultado
      const cols = tabData ? tabData.columns : [];
      if (cols.length > 0) {
        stepLines.push('');
        stepLines.push('**Resultados — columnas visibles:**');
        cols.slice(0, 6).forEach(c => stepLines.push(`- ${c}`));
      }
      return stepLines.join('\n');
    }).join('\n\n');
  } else {
    const steps = ['1. Acceda al módulo según la ruta de acceso indicada.'];
    ui.inputs.slice(0, 4).forEach((inp, i) => steps.push(`${i + 2}. Complete el campo **${inp}**.`));
    ui.buttons.slice(0, 3).forEach((btn, i) => steps.push(`${ui.inputs.slice(0,4).length + i + 2}. Haga clic en **${btn}**.`));
    steps.push(`${steps.length + 1}. Espere a que se carguen los resultados en pantalla.`);
    guideSteps = steps.join('\n');
  }

  // Columnas globales (solo si no hay por-tab)
  const globalCols = Object.keys(tabDataMap).length === 0 ? ui.columns : [];
  let tableSection = '';
  if (globalCols.length > 0) {
    tableSection = `## Información disponible\n\nLos resultados se muestran en tabla con las siguientes columnas:\n\n${globalCols.map(c => `- **${c}**`).join('\n')}\n\n---\n`;
  }

  // Exportaciones
  let exportSection = '';
  if (ui.exports.length > 0) {
    exportSection = `## Exportación de datos\n\nFormatos disponibles: ${ui.exports.join(', ')}. Aplique los filtros deseados y haga clic en el ícono de descarga.\n\n---\n`;
  }

  // Permisos / acciones especiales
  let permSection = '';
  if (ui.permissions.length > 0 || ui.modals.length > 0) {
    permSection = `## Acciones y permisos\n\n`;
    if (ui.permissions.length > 0) {
      permSection += `Algunas acciones requieren permisos asignados por el administrador:\n\n${ui.permissions.map(p => `- \`${p}\``).join('\n')}\n\n`;
    }
    if (ui.modals.length > 0) {
      permSection += `Ventanas de acción disponibles:\n\n${ui.modals.map(m => `- **${m}**`).join('\n')}\n\n`;
    }
    permSection += '---\n';
  }

  return `# Manual de Usuario — ${displayName}

> **Sistema:** OrbitM7 — Milla 7 Logística
> **Módulo:** \`${componentName}\`
> **Fecha:** ${now}

---

## Descripción general

Módulo **${displayName}** del Sistema de Gestión Logística OrbitM7.
${ui.sections.length > 0 ? `\nSecciones del módulo: ${ui.sections.slice(0,3).join(', ')}.` : ''}

---

## Ruta de acceso

${navLine}

---

${tabsSection}## Guía de uso paso a paso

${guideSteps}

---

${tableSection}${exportSection}${permSection}## Solución de problemas

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| El módulo no carga | Sesión expirada o sin permisos | Cierre sesión e ingrese nuevamente |
| No se muestran resultados | Filtros o datos incorrectos | Verifique los valores ingresados |
| Error al guardar | Campos obligatorios vacíos | Revise los campos marcados en rojo |
| Botón de acción no visible | Permisos insuficientes | Contacte al administrador del sistema |
| La exportación falla | Demasiados registros | Aplique filtros para reducir el volumen |

---

## Soporte técnico

- **Correo:** ${SUPPORT_EMAIL}
- **WhatsApp:** ${SUPPORT_WHATSAPP}

---

## Referencias institucionales

| | |
|-|-|
| **Sistema** | OrbitM7 — Plataforma de Gestión Logística |
| **Empresa** | Milla 7 S.A.S. |
| **Soporte** | ${SUPPORT_EMAIL} |
| **WhatsApp** | ${SUPPORT_WHATSAPP} |
| **Versión** | ${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')} |

---

*Manual generado automáticamente por el sistema HelpDesk de OrbitM7.*`;
}

main().catch(err => {
  console.error('[HelpDesk] Error fatal:', err.message);
  process.exit(1);
});
