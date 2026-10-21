import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Camera, Eraser, Image as ImageIcon, ImageOff, Loader2, RotateCcw, X } from 'lucide-react';
import { fetchProtectedObjectUrl } from '../../../services/api/ghOperaciones.api';

// ── Compresión de fotos ──────────────────────────────────────────────────────

export interface FotoComprimida { blob: Blob; width: number; height: number }

const LIMITE_BYTES = 4.5 * 1024 * 1024; // el servidor acepta hasta 5 MB

/**
 * Re-codifica la foto a JPEG manteniendo buena calidad: lado mayor ≤ 2048 px (suficiente
 * para leer guías, sellos y documentos), suavizado de alta calidad y calidad 0.85. Solo si
 * el resultado supera ~4,5 MB baja la calidad gradualmente.
 * Re-dibujar en canvas elimina el EXIF (GPS del teléfono, modelo…); la orientación se respeta
 * porque createImageBitmap / <img> aplican la rotación EXIF antes de dibujar.
 */
export async function compressImage(file: Blob, maxSide = 2048, quality = 0.85): Promise<FotoComprimida> {
  let source: ImageBitmap | HTMLImageElement;
  let w: number, h: number;
  let url: string | null = null;
  try {
    if ('createImageBitmap' in window) {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      w = source.width; h = source.height;
    } else {
      url = URL.createObjectURL(file);
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('No se pudo leer la imagen'));
        i.src = url!;
      });
      w = source.naturalWidth; h = source.naturalHeight;
    }
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if ('close' in source) source.close();

    const toBlob = (q: number) => new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(bl => (bl ? resolve(bl) : reject(new Error('No se pudo comprimir la imagen'))), 'image/jpeg', q));
    let q = quality;
    let blob = await toBlob(q);
    while (blob.size > LIMITE_BYTES && q > 0.6) {
      q -= 0.07;
      blob = await toBlob(q);
    }
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

const fmtPeso = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

// ── Firma digital ────────────────────────────────────────────────────────────

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

/**
 * Lienzo de firma responsive (táctil y mouse) con limpiar/deshacer.
 * Exporta PNG con fondo transparente, recortado a la firma y limitado a 600×300 px.
 */
export const SignaturePad = React.forwardRef<SignaturePadHandle, {
  label: string;
  hint?: string;
  height?: number;
  onChange?: (empty: boolean) => void;
}>(({ label, hint, height = 200, onChange }, ref) => {
  const sigRef = useRef<SignatureCanvas>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [empty, setEmpty] = useState(true);

  // El canvas necesita tamaño en px reales; al cambiar el ancho se conserva lo dibujado
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      setWidth(prev => {
        if (prev === w) return prev;
        const data = sigRef.current?.toData();
        requestAnimationFrame(() => { if (data?.length) sigRef.current?.fromData(data); });
        return w;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const update = () => {
    const e = sigRef.current?.isEmpty() ?? true;
    setEmpty(e);
    onChange?.(e);
  };

  const undo = () => {
    const data = sigRef.current?.toData() || [];
    data.pop();
    sigRef.current?.fromData(data);
    update();
  };

  const clear = () => {
    sigRef.current?.clear();
    update();
  };

  React.useImperativeHandle(ref, () => ({
    isEmpty: () => sigRef.current?.isEmpty() ?? true,
    clear,
    toBlob: async () => {
      const src = sigRef.current?.getCanvas();
      if (!src || sigRef.current?.isEmpty()) return null;
      // Recorte a la caja de la firma
      const ctx = src.getContext('2d')!;
      const { width: w, height: h } = src;
      const px = ctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (px[(y * w + x) * 4 + 3] > 0) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      const pad = 10;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
      const cw = maxX - minX + 1, ch = maxY - minY + 1;
      const scale = Math.min(1, 600 / cw, 300 / ch);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(cw * scale));
      out.height = Math.max(1, Math.round(ch * scale));
      out.getContext('2d')!.drawImage(src, minX, minY, cw, ch, 0, 0, out.width, out.height);
      return new Promise<Blob | null>(resolve => out.toBlob(b => resolve(b), 'image/png'));
    },
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 ml-1">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        <div className="flex gap-1">
          <button type="button" onClick={undo} disabled={empty} aria-label="Deshacer último trazo"
            className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Deshacer
          </button>
          <button type="button" onClick={clear} disabled={empty} aria-label="Limpiar firma"
            className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 flex items-center gap-1">
            <Eraser className="w-3 h-3" /> Limpiar
          </button>
        </div>
      </div>
      <div ref={boxRef} className={`relative bg-white border-2 border-dashed rounded-2xl overflow-hidden touch-none ${empty ? 'border-slate-300' : 'border-emerald-400'}`} style={{ height }}>
        {width > 0 && (
          <SignatureCanvas
            ref={sigRef}
            penColor="#0f172a"
            minWidth={1.2}
            maxWidth={2.8}
            backgroundColor="rgba(0,0,0,0)"
            onEnd={update}
            canvasProps={{ width, height, 'aria-label': label, role: 'img' } as any}
          />
        )}
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-xs font-bold uppercase tracking-widest">
            Firme aquí
          </p>
        )}
        <div className="absolute left-6 right-6 bottom-8 border-b border-slate-200 pointer-events-none" />
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1 ml-1">{hint}</p>}
    </div>
  );
});
SignaturePad.displayName = 'SignaturePad';

// ── Captura de foto ──────────────────────────────────────────────────────────

/**
 * Captura de evidencia: "Cámara" abre la cámara trasera directamente; "Galería" permite elegir
 * una foto ya tomada. En ambos casos se comprime con buena calidad antes de entregar el Blob.
 */
export const PhotoCapture: React.FC<{
  label: string;
  value: Blob | null;
  onChange: (b: Blob | null) => void;
}> = ({ label, value, onChange }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) { setPreview(null); setInfo(null); return; }
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const onFile = async (f?: File) => {
    if (!f) return;
    setError(null);
    if (!f.type.startsWith('image/')) { setError('Seleccione una imagen.'); return; }
    setBusy(true);
    try {
      const r = await compressImage(f);
      onChange(r.blob);
      setInfo(`${r.width}×${r.height} px · ${fmtPeso(r.blob.size)}`);
    } catch (e: any) {
      setError(e.message || 'No se pudo procesar la foto');
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = '';
      if (galRef.current) galRef.current.value = '';
    }
  };

  const btn = 'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40';

  return (
    <div>
      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{label}</label>
      {preview ? (
        <div className="space-y-2">
          <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-400 bg-slate-100">
            <img src={preview} alt={label} className="w-full max-h-72 object-contain" />
            <button type="button" onClick={() => onChange(null)} aria-label="Quitar foto"
              className="absolute top-2 right-2 w-10 h-10 rounded-full bg-slate-900/80 text-white flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            {info && <p className="text-[10px] text-slate-400 ml-1">{info}</p>}
            <button type="button" onClick={() => camRef.current?.click()} className="ml-auto text-[11px] font-black uppercase tracking-widest text-slate-600 px-3 py-2 rounded-xl bg-slate-100">
              Repetir foto
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
          {busy ? (
            <div className="h-24 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin" />
              <span className="text-[11px] font-black uppercase tracking-widest">Procesando foto…</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => camRef.current?.click()} className={`${btn} bg-slate-900 text-white`}>
                <Camera className="w-5 h-5" /> Cámara
              </button>
              <button type="button" onClick={() => galRef.current?.click()} className={`${btn} bg-white border border-slate-200 text-slate-700`}>
                <ImageIcon className="w-5 h-5" /> Galería
              </button>
            </div>
          )}
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      {error && <p className="text-[11px] text-rose-600 font-bold mt-1 ml-1">{error}</p>}
    </div>
  );
};

// ── Imagen protegida ─────────────────────────────────────────────────────────

/**
 * Muestra una evidencia servida por el backend autenticado. Carga solo cuando entra en
 * pantalla (lazy) y libera el object URL al desmontar.
 */
export const SecureImage: React.FC<{ src: string; alt: string; className?: string; onClick?: (url: string) => void }> =
  ({ src, alt, className, onClick }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
      io.observe(el);
      return () => io.disconnect();
    }, []);

    useEffect(() => {
      if (!visible) return;
      const ctrl = new AbortController();
      let created: string | null = null;
      fetchProtectedObjectUrl(src, ctrl.signal)
        .then(u => { created = u; setUrl(u); })
        .catch(() => { if (!ctrl.signal.aborted) setFailed(true); });
      return () => { ctrl.abort(); if (created) URL.revokeObjectURL(created); };
    }, [visible, src]);

    return (
      <div ref={ref} className={`bg-slate-100 flex items-center justify-center overflow-hidden ${className || ''}`}>
        {url ? (
          <img src={url} alt={alt} className="w-full h-full object-contain cursor-zoom-in" onClick={() => onClick?.(url)} />
        ) : failed ? (
          <ImageOff className="w-6 h-6 text-slate-300" aria-label="No disponible" />
        ) : (
          <Loader2 className="w-5 h-5 text-slate-300 animate-spin" aria-label="Cargando" />
        )}
      </div>
    );
  };

/** Visor a pantalla completa para ampliar una evidencia. */
export const ImageLightbox: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[900] bg-slate-950/95 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center" aria-label="Cerrar">
        <X className="w-5 h-5" />
      </button>
      <img src={url} alt="Evidencia ampliada" className="max-w-full max-h-full object-contain" />
    </div>
  );
};
