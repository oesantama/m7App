import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Search, RefreshCw, FileSpreadsheet, ChevronDown, ChevronRight, Trash2, AlertCircle, CheckCircle, X, Pencil, Plus, AlertTriangle } from 'lucide-react';
import { User } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Tab = 'subir' | 'consultar';

interface Client { id: string; name: string; }

interface Encabezado {
  id: number;
  os: string;
  fecha_carge: string;
  placa: string;
  conductor: string;
  fecha_programado: string;
  cant_clientes: number;
  nombre_ruta: string;
  coordinador: string;
  usuariocontrol: string;
  fechacontrol: string;
  valor_flete: number;
  client_id: string;
  uploaded_at: string;
  cant_facturas?: number;
}

interface Detalle {
  id: number;
  id_enca: number;
  factura: string;
  notas: string;
  volumen?: number;
  peso?: number;
  cubicaje?: number;
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const fmtMoney = (v?: number) =>
  v != null ? `$${Number(v).toLocaleString('es-CO')}` : '—';

// ─── Tab 1: Subir planilla ────────────────────────────────────────────────────
const TabSubir: React.FC<{ user: User; clients: Client[] }> = ({ user, clients }) => {
  const [clientId, setClientId]     = useState(clients[0]?.id || '');
  const [file, setFile]             = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [result, setResult]         = useState<{ encabezados: number; detalles: number } | null>(null);
  const [error, setError]           = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [encRowsPreview, setEncRowsPreview]     = useState<any[]>([]);
  const [detRowsPreview, setDetRowsPreview]     = useState<any[]>([]);
  const [previewSearch, setPreviewSearch]       = useState('');
  const [editingRowIdx, setEditingRowIdx]       = useState<number | null>(null);
  const [editForm, setEditForm]                 = useState<any>({});
  const [expandedPreview, setExpandedPreview]   = useState<Record<number, boolean>>({});
  const [inhouseUsers, setInhouseUsers]         = useState<any[]>([]);

  const [existingOsList, setExistingOsList] = useState<string[]>([]);
  const [dialogResult, setDialogResult] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'error';
    details: Array<{ os: string; status: 'ok' | 'skipped'; msg: string }>;
  } | null>(null);

  useEffect(() => {
    if (clientId) {
      (api as any).getAuditoriaB36Encabezados({ clientId })
        .then((res: any[]) => {
          setExistingOsList(Array.isArray(res) ? res.map(r => String(r.os).toUpperCase().trim()) : []);
        })
        .catch(() => {});
    }
  }, [clientId]);

  useEffect(() => { if (clients.length > 0 && !clientId) setClientId(clients[0].id); }, [clients]);

  // Fetch inhouse users (or all users and filter locally if role is not strictly known)
  useEffect(() => {
    api.getUsers().then((res: any[]) => {
       // Filter by role 'inhouse' if applicable, or keep all to let them choose
       const inhouses = res.filter(u => u.role === 'inhouse' || u.role?.toLowerCase().includes('inhouse') || u.role_id === 4 /* assuming 4 is inhouse */);
       setInhouseUsers(inhouses.length ? inhouses : res); // Fallback to all users if none strictly 'inhouse'
    }).catch(() => {});
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setError('');
  };

  const handleProcessFile = () => {
    if (!file)     { toast.error('Seleccione un archivo Excel.'); return; }
    if (!clientId) { toast.error('Seleccione un cliente.'); return; }

    setUploading(true);
    setError('');
    setResult(null);

    const parseExcelDate = (v: any) => {
      if (v == null) return null;
      if (v instanceof Date) return v;
      if (typeof v === 'number') {
        const utcDays = v - 25569;
        return new Date(Math.round(utcDays * 86400000));
      }
      const dObj = new Date(v);
      return isNaN(dObj.getTime()) ? v : dObj;
    };

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSXmod = await import('xlsx');
        const bstr = evt.target?.result;
        const wb = XLSXmod.read(bstr, { type: 'binary', cellDates: false });
        
        const sheetName = wb.SheetNames.find(n => /control entregas/i.test(n)) || wb.SheetNames[0];
        if (!sheetName) {
          throw new Error('No se encontraron hojas válidas en el archivo.');
        }

        // PRE-PASO: Leer la hoja "Facturas" para extraer el mapeo FACTURA -> Datos
        const factSheetName = wb.SheetNames.find(n => /facturas/i.test(n));
        const facturaDataMap = new Map<string, any>();
        if (factSheetName) {
            const factRows: any[] = XLSXmod.utils.sheet_to_json(wb.Sheets[factSheetName], { defval: null });
            factRows.forEach(fr => {
                const fNum = String(fr['FACTURA'] || fr['Documento'] || '').trim();
                if (fNum) {
                    facturaDataMap.set(fNum, {
                        id_viaje: String(fr['ID VIAJE'] || '').trim(),
                        peso: parseFloat(fr['PESO'] || 0) || 0,
                        volumen: parseFloat(fr['VOLUMEN'] || 0) || 0,
                        cantidad: parseFloat(fr['CANTIDAD'] || 0) || 0
                    });
                }
            });
        }

        const ws = wb.Sheets[sheetName];
        // IMPORTANTE: Leemos como arreglo 2D ({ header: 1 }) para mapear la posición visual del formulario
        const rows: any[] = XLSXmod.utils.sheet_to_json(ws, { header: 1, defval: null });

        if (!rows.length) throw new Error('La hoja está vacía.');

        const encMap = new Map<string, any>();
        const dets: any[] = [];
        let currentOS: string | null = null;
        
        for (let i = 0; i < rows.length; i++) {
           const r = rows[i];
           if (!r || !r.length) continue;
           
           const colA = String(r[0] || '').trim().toUpperCase();
           
           if (colA.includes('PLANILLA DE CONTROL DE ENTREGAS')) {
               // Nuevo bloque de encabezado
               const nextRowStr = rows[i+1] ? rows[i+1].join(' ') : '';
               const osMatch = nextRowStr.match(/OS:\s*([A-Z0-9_-]+)/i);
               
               let osVal = null;
               if (osMatch) osVal = osMatch[1];
               else {
                   for(const cell of (rows[i+1]||[])) {
                       if(String(cell).toUpperCase().includes('OS:')) {
                           osVal = String(cell).replace(/.*OS:\s*/i, '').trim();
                       }
                   }
               }
               
               const transportadora = rows[i+5] ? rows[i+5][2] : null;
               // FILTRO: Solo tomar rutas cuya transportadora sea Milla Siete
               if (String(transportadora).toUpperCase().includes('MILLA SIETE')) {
                   currentOS = osVal || `SIN_OS_${i}`;
                   
                   const fechaCargue = parseExcelDate(rows[i+2] ? rows[i+2][2] : null);
                   const placa = rows[i+3] ? rows[i+3][2] : null;
                   const conductor = rows[i+4] ? rows[i+4][2] : null;
                   const fechaProgramacion = parseExcelDate(rows[i+7] ? rows[i+7][2] : null);
                   const ruta = rows[i+10] ? rows[i+10][2] : null;
                   
                   if (!encMap.has(currentOS)) {
                       encMap.set(currentOS, {
                           os: currentOS,
                           id_viaje: '', // Se llenará al encontrar la primera factura
                           fecha_carge: fechaCargue,
                           placa: placa,
                           conductor: conductor,
                           fecha_programado: fechaProgramacion,
                           cant_clientes: 0,
                           nombre_ruta: ruta,
                           coordinador: null,
                           valor_flete: 0,
                           inhouse_id: user.id // Default al usuario que sube
                       });
                   }
               } else {
                   // Si no es Milla Siete, ignoramos este bloque de ruta
                   currentOS = null;
               }
           }
           
           if (colA.startsWith('CLIENTE -') && currentOS) {
               // Buscar la columna FACTURA en las siguientes filas
               let factRowIdx = -1;
               let factColIdx = -1;
               for(let j=1; j<=4; j++) {
                   const subRow = rows[i+j];
                   if(!subRow) break;
                   const colIdx = subRow.findIndex((val: any) => String(val).toUpperCase() === 'FACTURA');
                   if (colIdx !== -1) {
                       factRowIdx = i + j + 1; // El dato está en la fila siguiente al título
                       factColIdx = colIdx;
                       break;
                   }
               }
               
               let facturaVal = null;
               if (factRowIdx !== -1 && rows[factRowIdx]) {
                   facturaVal = rows[factRowIdx][factColIdx];
               }
               
               // Buscar observaciones/notas en la parte inferior del bloque del cliente
               let notas = '';
               for(let j=1; j<=10; j++) {
                   const subRow = rows[i+j];
                   if(!subRow) break;
                   const textA = String(subRow[0] || '').trim();
                   if (textA.toUpperCase().startsWith('OBSERVACIONES:')) {
                       notas = textA;
                       break;
                   }
               }
               
               if (facturaVal) {
                   const fStr = String(facturaVal).trim();
                   const fData = facturaDataMap.get(fStr) || { peso: 0, volumen: 0, cantidad: 0, id_viaje: '' };
                   
                   dets.push({
                       _enc_os: currentOS,
                       factura: fStr,
                       notas: notas,
                       peso: fData.peso,
                       volumen: fData.volumen,
                       cubicaje: fData.cantidad // Asumimos que cubicaje es la cantidad o volumen, guardamos ambos
                   });
                   
                   if (encMap.has(currentOS)) {
                       const enc = encMap.get(currentOS);
                       enc.cant_clientes += 1;
                       // Asignar id_viaje si aún no lo tiene y lo encontramos en el mapa
                       if (!enc.id_viaje && fData.id_viaje) {
                           enc.id_viaje = fData.id_viaje;
                       }
                   }
               }
           }
        }

        const encArray = Array.from(encMap.values());
        const finalDets = dets.map(d => {
            const idx = encArray.findIndex(e => e.os === d._enc_os);
            return {
                id_enca: idx + 1,
                factura: d.factura,
                notas: d.notas,
                peso: d.peso,
                volumen: d.volumen,
                cubicaje: d.cubicaje
            };
        });

        setEncRowsPreview(encArray);
        setDetRowsPreview(finalDets);
        setPreviewModalOpen(true);
      } catch (e: any) {
        setError(e?.message || 'Error al procesar el archivo Excel.');
        toast.error('Error procesando el archivo.');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const exportPreview = async () => {
    const XLSXmod = await import('xlsx');
    const wb = XLSXmod.utils.book_new();
    XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.json_to_sheet(encRowsPreview, { cellDates: true }), 'Encabezado');
    XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.json_to_sheet(detRowsPreview, { cellDates: true }), 'Detalle');
    XLSXmod.writeFile(wb, 'previsualizacion_auditoria.xlsx');
  };

  const submitPreview = async () => {
    setUploading(true);
    try {
      const detailsList: Array<{ os: string; status: 'ok' | 'skipped'; msg: string }> = [];

      // Particionar las filas
      const rowsToSave: any[] = [];
      const rowsToSkip: any[] = [];

      encRowsPreview.forEach((r, idx) => {
        const isDup = existingOsList.includes(String(r.os).toUpperCase().trim());
        if (isDup) {
          rowsToSkip.push(r);
          detailsList.push({
            os: r.os,
            status: 'skipped',
            msg: 'Ya está registrada en el sistema.'
          });
        } else {
          rowsToSave.push(r);
        }
      });

      // Filtrar detalles asociados para el envío
      const matchingDets = detRowsPreview.filter(d => {
        // Encontrar si su encabezado asociado (1-indexed por idx_enca) está en las filas que guardamos
        const encIndex = d.id_enca - 1;
        const parentEnc = encRowsPreview[encIndex];
        return parentEnc && !existingOsList.includes(String(parentEnc.os).toUpperCase().trim());
      });

      // Ajustar temporalmente id_enca en matchingDets para que el backend los asocie correctamente
      const adjustedDets = matchingDets.map(d => {
        const parentEnc = encRowsPreview[d.id_enca - 1];
        const newParentIdx = rowsToSave.indexOf(parentEnc);
        return {
          ...d,
          id_enca: newParentIdx + 1 // 1-indexed
        };
      });

      if (rowsToSave.length === 0) {
        setDialogResult({
          isOpen: true,
          title: 'Ningún Registro Nuevo',
          message: 'Todas las planillas cargadas en el archivo ya se encuentran guardadas en el sistema.',
          type: 'warning',
          details: detailsList
        });
        setPreviewModalOpen(false);
        setFile(null);
        if (fileRef.current) fileRef.current.value = '';
        setUploading(false);
        return;
      }

      const res = await (api as any).uploadAuditoriaB36({
        clientId,
        encRows: rowsToSave,
        detRows: adjustedDets
      });

      rowsToSave.forEach(r => {
        detailsList.push({
          os: r.os,
          status: 'ok',
          msg: 'Guardado con éxito.'
        });
      });

      // Refrescar lista de OS existentes
      (api as any).getAuditoriaB36Encabezados({ clientId })
        .then((resp: any[]) => {
          setExistingOsList(Array.isArray(resp) ? resp.map(r => String(r.os).toUpperCase().trim()) : []);
        })
        .catch(() => {});

      setResult(res);
      setPreviewModalOpen(false);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';

      setDialogResult({
        isOpen: true,
        title: 'Carga Procesada Exitosamente',
        message: `Se han guardado ${res.encabezados} planillas nuevas y ${res.detalles} detalles en la base de datos.`,
        type: 'success',
        details: detailsList
      });

    } catch (e: any) {
      toast.error(e.message || 'Error al guardar en base de datos.');
    } finally {
      setUploading(false);
    }
  };

  const filteredEncRows = encRowsPreview.filter(r => 
      !previewSearch || 
      (r.os && r.os.toString().toLowerCase().includes(previewSearch.toLowerCase())) ||
      (r.placa && r.placa.toLowerCase().includes(previewSearch.toLowerCase()))
  );

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Instrucciones */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-[11px] text-blue-700 space-y-1">
        <p className="font-black uppercase tracking-widest mb-2">Proceso Automático</p>
        <p>• Sube el archivo base de logística directamente.</p>
        <p>• El sistema buscará la hoja <strong>"Control entregas"</strong> y extraerá automáticamente los agrupamientos por OS y sus facturas asociadas.</p>
        <div className="flex gap-4 mt-4">
        <div className="w-64 bg-slate-100 p-4 rounded-2xl border border-slate-200 self-start">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Cliente Destino</label>
          <div className="relative">
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400">
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mt-4 mb-2">Inhouse (Usuario)</label>
          <div className="relative">
            <select
              className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              onChange={(e) => {
                 const newInhouseId = e.target.value;
                 setEncRowsPreview(prev => prev.map(r => ({...r, inhouse_id: newInhouseId})));
              }}
              defaultValue={user.id}
            >
              <option value={user.id}>{user.name || 'Mi Usuario'} (Actual)</option>
              {inhouseUsers.filter(u => u.id !== user.id).map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>
      </div>

      {/* File input */}
      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Archivo Excel (.xlsx / .xlsm)</label>
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${
            file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 bg-slate-50'
          }`}
        >
          {file ? (
            <>
              <CheckCircle size={28} className="text-emerald-500" />
              <p className="text-[12px] font-black text-emerald-700">{file.name}</p>
              <p className="text-[10px] text-emerald-500">{(file.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <FileSpreadsheet size={28} className="text-slate-300" />
              <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Haga clic para seleccionar</p>
              <p className="text-[10px] text-slate-300">Formato .xlsx o .xlsm — máx. 20 MB</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" />
        </div>
        {file && (
          <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
            className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-500 font-black transition-colors">
            <X size={11} /> Quitar archivo
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-700 font-medium">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Carga exitosa</p>
            <p className="text-[10px] text-emerald-600">{result.encabezados} encabezado(s) y {result.detalles} detalle(s) importados.</p>
          </div>
        </div>
      )}

      {/* Botón previsualizar */}
      <button
        onClick={handleProcessFile}
        disabled={uploading || !file}
        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-40"
      >
        {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
        {uploading ? 'Procesando...' : 'Previsualizar y Extraer'}
      </button>

      {/* Modal Previsualización */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
             <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                 <h3 className="text-lg font-black text-slate-900 uppercase">Previsualización de Carga ({filteredEncRows.length} Rutas)</h3>
                 <button onClick={() => setPreviewModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={18} /></button>
             </div>
             
             <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                 <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Buscar OS o Placa..." value={previewSearch} onChange={e => setPreviewSearch(e.target.value)} 
                           className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white w-64" />
                 </div>
                 <button onClick={exportPreview} className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-200 transition-colors">
                    <Download size={13} /> Exportar Excel
                 </button>
             </div>
             
             <div className="flex-1 overflow-auto bg-slate-50 p-6">
                  <table className="w-full text-[11px] bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
<thead className="bg-slate-100 text-slate-500 border-b border-slate-200 text-left">
                       <tr>
                          <th className="px-3 py-2 font-black uppercase">OS</th>
                          <th className="px-3 py-2 font-black uppercase">ID Viaje</th>
                          <th className="px-3 py-2 font-black uppercase">Ruta</th>
                          <th className="px-3 py-2 font-black uppercase">Placa</th>
                          <th className="px-3 py-2 font-black uppercase">Conductor</th>
                          <th className="px-3 py-2 font-black uppercase">Flete</th>
                          <th className="px-3 py-2 font-black uppercase text-center">Estado</th>
                          <th className="px-3 py-2 font-black uppercase text-center">Facturas</th>
                          <th className="px-3 py-2 font-black uppercase text-center">Acción</th>
                       </tr>
                    </thead>
                     <tbody className="divide-y divide-slate-100">
                       {filteredEncRows.map((r, i) => {
                           const rowDets = detRowsPreview.filter(d => d.id_enca === (encRowsPreview.indexOf(r) + 1));
                           const isExpanded = !!expandedPreview[i];
                           const isDuplicate = existingOsList.includes(String(r.os).toUpperCase().trim());
                           
                           return (
                               <React.Fragment key={i}>
                                   <tr className={`hover:bg-slate-50 cursor-pointer ${isDuplicate ? 'bg-rose-50/20' : ''}`} onClick={() => editingRowIdx !== i && setExpandedPreview({...expandedPreview, [i]: !isExpanded})}>
                                       {editingRowIdx === i ? (
                                          <>
                                             <td className="px-3 py-2"><input type="text" className="w-16 border rounded px-1" value={editForm.os || ''} onChange={e => setEditForm({...editForm, os: e.target.value})} onClick={e => e.stopPropagation()} /></td>
                                             <td className="px-3 py-2"><input type="text" className="w-16 border rounded px-1" value={editForm.id_viaje || ''} onChange={e => setEditForm({...editForm, id_viaje: e.target.value})} onClick={e => e.stopPropagation()} /></td>
                                             <td className="px-3 py-2"><input type="text" className="w-16 border rounded px-1" value={editForm.nombre_ruta || ''} onChange={e => setEditForm({...editForm, nombre_ruta: e.target.value})} onClick={e => e.stopPropagation()} /></td>
                                             <td className="px-3 py-2"><input type="text" className="w-16 border rounded px-1" value={editForm.placa || ''} onChange={e => setEditForm({...editForm, placa: e.target.value})} onClick={e => e.stopPropagation()} /></td>
                                             <td className="px-3 py-2"><input type="text" className="w-24 border rounded px-1" value={editForm.conductor || ''} onChange={e => setEditForm({...editForm, conductor: e.target.value})} onClick={e => e.stopPropagation()} /></td>
                                             <td className="px-3 py-2"><input type="number" className="w-20 border rounded px-1" value={editForm.valor_flete || 0} onChange={e => setEditForm({...editForm, valor_flete: e.target.value})} onClick={e => e.stopPropagation()} /></td>
                                             <td className="px-3 py-2 text-center text-slate-400">—</td>
                                             <td className="px-3 py-2 text-center text-slate-400">{rowDets.length}</td>
                                             <td className="px-3 py-2 text-center">
                                                 <button className="text-emerald-600 font-bold hover:underline" onClick={(e) => {
                                                     e.stopPropagation();
                                                     const newRows = [...encRowsPreview];
                                                     newRows[encRowsPreview.indexOf(r)] = { ...r, ...editForm };
                                                     setEncRowsPreview(newRows);
                                                     setEditingRowIdx(null);
                                                 }}>Guardar</button>
                                             </td>
                                          </>
                                       ) : (
                                          <>
                                            <td className="px-3 py-2 font-black text-slate-800 flex items-center gap-2">
                                               <span className="text-slate-400">{isExpanded ? '▼' : '▶'}</span> {r.os}
                                            </td>
                                            <td className="px-3 py-2 font-bold text-slate-600">{r.id_viaje || '—'}</td>
                                            <td className="px-3 py-2 font-bold text-slate-600">{r.nombre_ruta || '—'}</td>
                                            <td className="px-3 py-2 font-bold text-slate-600">{r.placa}</td>
                                            <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]">{r.conductor}</td>
                                            <td className="px-3 py-2 font-bold text-emerald-600">{fmtMoney(r.valor_flete)}</td>
                                            <td className="px-3 py-2 text-center">
                                               {isDuplicate ? (
                                                  <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-black text-[9px] uppercase tracking-wider">
                                                     Ya en Sistema
                                                  </span>
                                                ) : (
                                                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black text-[9px] uppercase tracking-wider">
                                                     Listo para guardar
                                                  </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                               <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-black text-[10px]">
                                                  {rowDets.length}
                                               </span>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                               <button className="text-blue-600 font-bold hover:underline" onClick={(e) => { e.stopPropagation(); setEditingRowIdx(i); setEditForm(r); }}>Editar</button>
                                            </td>
                                          </>
                                       )}
                                   </tr>
                                   {isExpanded && (
                                     <tr>
                                       <td colSpan={9} className="bg-slate-50 px-8 py-3 border-b border-slate-200">
                                         {rowDets.length === 0 ? (
                                           <p className="text-[10px] text-slate-400 italic">No se extrajeron facturas para esta OS.</p>
                                         ) : (
                                           <table className="w-full text-[10px] bg-white border border-slate-200 rounded-lg overflow-hidden">
                                             <thead className="bg-slate-100">
                                               <tr className="text-slate-500 font-black uppercase tracking-wider">
                                                 <th className="py-1.5 px-3 text-left">Factura</th>
                                                 <th className="py-1.5 px-3 text-left">Volumen</th>
                                                 <th className="py-1.5 px-3 text-left">Peso</th>
                                                 <th className="py-1.5 px-3 text-left">Cubicaje</th>
                                                 <th className="py-1.5 px-3 text-left">Notas / Observaciones</th>
                                               </tr>
                                             </thead>
                                             <tbody className="divide-y divide-slate-100">
                                               {rowDets.map((d, dIdx) => (
                                                 <tr key={dIdx}>
                                                   <td className="py-1.5 px-3 font-black text-slate-800">{d.factura}</td>
                                                   <td className="py-1.5 px-3 font-bold text-slate-600">{d.volumen || 0}</td>
                                                   <td className="py-1.5 px-3 font-bold text-slate-600">{d.peso || 0}</td>
                                                   <td className="py-1.5 px-3 font-bold text-slate-600">{d.cubicaje || 0}</td>
                                                   <td className="py-1.5 px-3 text-slate-500">{d.notas || '—'}</td>
                                                 </tr>
                                               ))}
                                             </tbody>
                                           </table>
                                         )}
                                       </td>
                                     </tr>
                                   )}
                               </React.Fragment>
                           );
                       })}
                    </tbody>
                  </table>
             </div>
             
             <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
                  <button onClick={() => setPreviewModalOpen(false)} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors">Cancelar</button>
                  <button onClick={submitPreview} disabled={uploading} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors disabled:opacity-50">
                     {uploading ? 'Guardando...' : 'Aprobar y Guardar'}
                  </button>
             </div>
          </div>
        </div>
      )}
      {/* Dialog Modal de Carga de Planilla con botón "OK" y Resumen de Estado */}
      {dialogResult && dialogResult.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] w-full max-w-xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            {/* Header del Dialog */}
            <div className={`px-8 py-6 flex items-center gap-3 text-white ${
              dialogResult.type === 'success' ? 'bg-emerald-600' : 'bg-amber-500'
            }`}>
              {dialogResult.type === 'success' ? (
                <CheckCircle size={28} className="shrink-0" />
              ) : (
                <AlertTriangle size={28} className="shrink-0" />
              )}
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider">{dialogResult.title}</h4>
                <p className="text-[10px] opacity-90 font-bold uppercase tracking-wide">Reporte de Auditoría de Carga</p>
              </div>
            </div>

            {/* Contenido / Resumen */}
            <div className="p-8 space-y-4 flex-1 overflow-y-auto max-h-[50vh] custom-scrollbar bg-slate-50">
              <p className="text-xs font-bold text-slate-700">{dialogResult.message}</p>
              
              <div className="space-y-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Detalle por planilla (OS):</span>
                <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden divide-y divide-slate-100 shadow-sm">
                  {dialogResult.details.map((d, dIdx) => (
                    <div key={dIdx} className="px-4 py-3 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-800">OS: {d.os}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.status === 'ok' ? (
                          <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-black text-[9px] uppercase tracking-wider border border-emerald-100">
                            Guardado
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 rounded-full font-black text-[9px] uppercase tracking-wider border border-rose-100">
                            Duplicado (Omitido)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="px-8 py-5 border-t border-slate-100 flex justify-end bg-white">
              <button
                onClick={() => setDialogResult(null)}
                className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md"
              >
                Entendido (OK)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tab 2: Consultar / Descargar ─────────────────────────────────────────────
const TabConsultar: React.FC<{ user: User; clients: Client[] }> = ({ user, clients }) => {
  const [clientId, setClientId]     = useState(clients[0]?.id || '');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [searchOs, setSearchOs]     = useState('');
  const [searchPlaca, setSearchPlaca] = useState('');
  const [rows, setRows]             = useState<Encabezado[]>([]);
  const [loading, setLoading]       = useState(false);
  const [expanded, setExpanded]     = useState<Record<number, Detalle[]>>({});
  const [loadingDet, setLoadingDet] = useState<number | null>(null);

  // Modal de edición de flete y sobrecostos
  const [editingPlanilla, setEditingPlanilla] = useState<Encabezado | null>(null);
  const [editingFlete, setEditingFlete] = useState<number>(0);
  const [editingSobrecostos, setEditingSobrecostos] = useState<Array<{ id?: number, valor: number, observacion: string, estado: string }>>([]);
  const [loadingEditData, setLoadingEditData] = useState(false);
  const [savingPlanilla, setSavingPlanilla] = useState(false);

  // Lista de usuarios e inhouse
  const [users, setUsers] = useState<any[]>([]);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'Todos'>(5);

  const totalPages = pageSize === 'Todos' ? 1 : Math.ceil(rows.length / (pageSize as number));
  const paginatedRows = pageSize === 'Todos'
    ? rows
    : rows.slice((currentPage - 1) * (pageSize as number), currentPage * (pageSize as number));

  useEffect(() => {
    api.getUsers().then(res => setUsers(Array.isArray(res) ? res : [])).catch(() => {});
  }, []);

  useEffect(() => { if (clients.length > 0 && !clientId) setClientId(clients[0].id); }, [clients]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await (api as any).getAuditoriaB36Encabezados({ clientId, from: dateFrom, to: dateTo, placa: searchPlaca, os: searchOs });
      setRows(Array.isArray(data) ? data : []);
      setExpanded({});
      setCurrentPage(1);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleDetalle = async (id: number) => {
    if (expanded[id]) {
      setExpanded(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setLoadingDet(id);
    try {
      const det = await (api as any).getAuditoriaB36Detalle(id);
      setExpanded(prev => ({ ...prev, [id]: Array.isArray(det) ? det : [] }));
    } catch {
      setExpanded(prev => ({ ...prev, [id]: [] }));
    } finally {
      setLoadingDet(null);
    }
  };

  const openEditModal = async (row: Encabezado) => {
    setEditingPlanilla(row);
    setEditingFlete(row.valor_flete || 0);
    setLoadingEditData(true);
    try {
      const data = await (api as any).getAuditoriaB36Sobrecostos(row.id);
      setEditingSobrecostos(Array.isArray(data) ? data : []);
    } catch {
      setEditingSobrecostos([]);
    } finally {
      setLoadingEditData(false);
    }
  };

  const handleSavePlanilla = async () => {
    if (!editingPlanilla) return;
    setSavingPlanilla(true);
    try {
      await (api as any).updateAuditoriaB36Planilla(editingPlanilla.id, {
        valor_flete: editingFlete,
        sobrecostos: editingSobrecostos
      });
      toast.success('Planilla actualizada con éxito.');
      setEditingPlanilla(null);
      fetchData();
    } catch {
      toast.error('Error al guardar cambios.');
    } finally {
      setSavingPlanilla(false);
    }
  };

  const handleDownloadPDF = async (row: Encabezado) => {
    try {
      // 1. Fetch details
      const details = await (api as any).getAuditoriaB36Detalle(row.id);
      // 2. Fetch overcosts
      const overcosts = await (api as any).getAuditoriaB36Sobrecostos(row.id);

      const clientObj = clients.find(c => c.id === row.client_id) || clients.find(c => c.id === clientId);
      const clientName = clientObj ? clientObj.name : 'BODEGA 36';

      const inhouseUserObj = users.find(u => u.id === (row as any).inhouse_id) || users.find(u => u.id === (row as any).usercreated);
      const inhouseName = inhouseUserObj ? (inhouseUserObj.name || inhouseUserObj.email) : ((row as any).inhouse_id || (row as any).usercreated || user.name);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      
      const startX = 15;
      let startY = 15;
      const rh = 6;
      
      // Fila 1: CLIENT NAME | RUTA | SUR
      doc.rect(15, startY, 95, rh);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(String(clientName).toUpperCase(), 15 + 95/2, startY + 4.2, { align: 'center' });
      
      doc.rect(110, startY, 40, rh);
      doc.text("RUTA", 110 + 20, startY + 4.2, { align: 'center' });
      
      doc.rect(150, startY, 50, rh);
      doc.setFont('helvetica', 'normal');
      doc.text(String(row.nombre_ruta || '—').toUpperCase(), 150 + 25, startY + 4.2, { align: 'center' });
      
      startY += rh;
      // Fila 2: NUMERO DE F | OS | SUR | Boxed Count
      doc.rect(15, startY, 40, rh);
      doc.setFont('helvetica', 'bold');
      doc.text("NUMERO DE F", 17, startY + 4.2);
      
      doc.rect(55, startY, 55, rh);
      doc.setFont('helvetica', 'normal');
      doc.text(String(row.os || '—'), 57, startY + 4.2);
      
      doc.rect(110, startY, 40, rh);
      doc.setFont('helvetica', 'bold');
      doc.text(String(row.nombre_ruta || '—').toUpperCase(), 110 + 20, startY + 4.2, { align: 'center' });
      
      doc.rect(150, startY, 50, rh);
      doc.setFont('helvetica', 'bold');
      doc.text(String(row.cant_clientes || details.length), 150 + 25, startY + 4.2, { align: 'center' });
      
      startY += rh;
      // Fila 3: FECHA ENVIO | Fecha | Empty
      doc.rect(15, startY, 40, rh);
      doc.setFont('helvetica', 'bold');
      doc.text("FECHA ENVIO", 17, startY + 4.2);
      
      doc.rect(55, startY, 55, rh);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(row.fecha_carge).toLocaleDateString('es-CO'), 57, startY + 4.2);
      
      doc.rect(110, startY, 90, rh);
      
      startY += rh;
      // Fila 4: PLACA | Placa | Empty
      doc.rect(15, startY, 40, rh);
      doc.setFont('helvetica', 'bold');
      doc.text("PLACA", 17, startY + 4.2);
      
      doc.rect(55, startY, 55, rh);
      doc.setFont('helvetica', 'normal');
      doc.text(String(row.placa || '—').toUpperCase(), 57, startY + 4.2);
      
      doc.rect(110, startY, 90, rh);
      
      startY += rh;
      // Fila 5: CONDUCTOR | Conductor | Empty
      doc.rect(15, startY, 40, rh);
      doc.setFont('helvetica', 'bold');
      doc.text("CONDUCTOR", 17, startY + 4.2);
      
      doc.rect(55, startY, 55, rh);
      doc.setFont('helvetica', 'normal');
      doc.text(String(row.conductor || '—').toUpperCase(), 57, startY + 4.2);
      
      doc.rect(110, startY, 90, rh);
      
      startY += rh;
      // Fila 6: COORDINADOR M7 | Coordinador
      doc.rect(15, startY, 40, rh);
      doc.setFont('helvetica', 'bold');
      doc.text("COORDINADOR M7", 17, startY + 4.2);
      
      doc.rect(55, startY, 145, rh);
      doc.setFont('helvetica', 'normal');
      doc.text(String(inhouseName).toUpperCase(), 55 + 145/2, startY + 4.2, { align: 'center' });
      
      startY += rh + 5;
      
      const columns = [
        { header: '', dataKey: 'factura' },
        { header: '', dataKey: 'c2' },
        { header: '', dataKey: 'c3' },
        { header: '', dataKey: 'c4' },
        { header: 'F PAGO', dataKey: 'fpago' },
        { header: '', dataKey: 'c6' },
        { header: '', dataKey: 'c7' },
        { header: 'VALOR', dataKey: 'valor' }
      ];
      
      const tableData = details.map((d: any) => ({
        factura: d.factura || '',
        c2: '',
        c3: '',
        c4: '',
        fpago: 'CR',
        c6: '',
        c7: '',
        valor: ''
      }));
      
      while (tableData.length < 9) {
        tableData.push({ factura: '', c2: '', c3: '', c4: '', fpago: '', c6: '', c7: '', valor: '' });
      }
      
      autoTable(doc, {
        columns: columns,
        body: tableData,
        startY: startY,
        margin: { left: 15, right: 15 },
        theme: 'plain',
        styles: {
          lineColor: [0, 0, 0],
          lineWidth: 0.15,
          textColor: [0, 0, 0],
          fontSize: 7.5,
          fontStyle: 'bold',
          cellPadding: 1.5,
        },
        headStyles: {
          fillColor: [255, 255, 255],
          lineColor: [0, 0, 0],
          lineWidth: 0.15,
          halign: 'center',
          valign: 'middle',
        },
        columnStyles: {
          factura: { cellWidth: 45, halign: 'center' },
          c2: { cellWidth: 20 },
          c3: { cellWidth: 20 },
          c4: { cellWidth: 20 },
          fpago: { cellWidth: 20, halign: 'center' },
          c6: { cellWidth: 20 },
          c7: { cellWidth: 15 },
          valor: { cellWidth: 25, halign: 'right' }
        },
        didDrawPage: (data) => {
          startY = data.cursor?.y || startY + 50;
        }
      });
      
      const fleteVal = parseFloat(String(row.valor_flete || '0'));
      const scVal = Array.isArray(overcosts) ? overcosts.reduce((acc: number, item: any) => acc + parseFloat(String(item.valor || '0')), 0) : 0;
      const totalVal = fleteVal + scVal;
      
      const fmtCurrency = (num: number) => {
        return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
      };
      
      const rowHeight = rh;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      
      // Fila totales: Flete principal
      doc.rect(15, startY, 145, rowHeight);
      doc.rect(160, startY, 15, rowHeight);
      doc.text("$", 160 + 7.5, startY + 4.2, { align: 'center' });
      doc.rect(175, startY, 25, rowHeight);
      doc.text(fmtCurrency(fleteVal), 175 + 23, startY + 4.2, { align: 'right' });
      
      startY += rowHeight;
      // Fila totales: SOBRECOSTOS
      doc.rect(15, startY, 145, rowHeight);
      doc.text("SOBRECOSTOS", 15 + 145/2, startY + 4.2, { align: 'center' });
      doc.rect(160, startY, 15, rowHeight);
      doc.text("$", 160 + 7.5, startY + 4.2, { align: 'center' });
      doc.rect(175, startY, 25, rowHeight);
      doc.text(fmtCurrency(scVal), 175 + 23, startY + 4.2, { align: 'right' });
      
      startY += rowHeight;
      // Fila totales: TOTAL PAGAR
      doc.rect(15, startY, 145, rowHeight);
      doc.text("TOTAL PAGAR", 15 + 145/2, startY + 4.2, { align: 'center' });
      doc.rect(160, startY, 15, rowHeight);
      doc.text("$", 160 + 7.5, startY + 4.2, { align: 'center' });
      doc.rect(175, startY, 25, rowHeight);
      doc.text(fmtCurrency(totalVal), 175 + 23, startY + 4.2, { align: 'right' });
      
      doc.save(`planilla_auditoria_${row.os || row.id}.pdf`);
      toast.success('PDF generado con éxito.');
    } catch (e: any) {
      console.error(e);
      toast.error('Error al generar el PDF.');
    }
  };

  const handleExportAll = () => {
    const token = (user as any)?.token || localStorage.getItem('token') || '';
    const qs = new URLSearchParams({ clientId, from: dateFrom, to: dateTo, placa: searchPlaca, os: searchOs }).toString();
    const isDev = window.location.hostname === 'localhost';
    const baseUrl = import.meta.env.VITE_API_URL || (isDev ? 'http://localhost:8081/api' : '/api');
    const url = `${baseUrl}/ajover-b36/export-all?${qs}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `auditoria_completa_${new Date().toISOString().slice(0,10)}.xlsx`;
        a.click();
      });
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
        >
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <input type="text" placeholder="OS / Carga..." value={searchOs}
          onChange={e => setSearchOs(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white w-32" />

        <input type="text" placeholder="Placa..." value={searchPlaca}
          onChange={e => setSearchPlaca(e.target.value.toUpperCase())}
          className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white w-28" />

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white" />
        </div>

        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50">
          {loading ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
          {loading ? 'Buscando...' : 'Consultar'}
        </button>
      </div>

      {/* Tabla */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
            Planillas — {rows.length} registro{rows.length !== 1 ? 's' : ''}
          </span>
          {rows.length > 0 && (
             <button onClick={handleExportAll} className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 text-[10px] font-black uppercase transition-all">
                <FileSpreadsheet size={12} />
                Exportar Todo lo Consultado
             </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                {['OS', 'Fecha Carge', 'Placa', 'Conductor', 'Ruta', 'F. Programado', 'Clientes', 'Valor Flete', 'Facturas', 'Cargado', 'Acciones'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={12} className="py-16 text-center">
                  <RefreshCw size={20} className="animate-spin text-slate-300 mx-auto" />
                </td></tr>
              ) : paginatedRows.length === 0 ? (
                <tr><td colSpan={12} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet size={28} className="text-slate-300" />
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Sin planillas</p>
                    <p className="text-[10px] text-slate-300">Seleccione filtros y presione Consultar</p>
                  </div>
                </td></tr>
              ) : paginatedRows.map(row => (
                <React.Fragment key={row.id}>
                  <tr className="hover:bg-slate-50 transition-colors">
                    {/* Expandir detalle */}
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleDetalle(row.id)}
                        className="text-slate-400 hover:text-emerald-600 transition-colors">
                        {loadingDet === row.id
                          ? <RefreshCw size={13} className="animate-spin" />
                          : expanded[row.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-black text-slate-900">{row.os || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fmtDate(row.fecha_carge)}</td>
                    <td className="px-3 py-2.5">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-black">{row.placa || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.conductor || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-medium">{row.nombre_ruta || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fmtDate(row.fecha_programado)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700 font-bold">{row.cant_clientes ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right font-black text-emerald-700">{fmtMoney(row.valor_flete)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-black text-[10px]">{row.cant_facturas ?? 0}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-[10px]">{fmtDate(row.uploaded_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDownloadPDF(row)} title="Descargar PDF"
                          className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors">
                          <Download size={12} />
                        </button>
                        <button onClick={() => openEditModal(row)} title="Editar Flete y Sobrecostos"
                          className="p-1.5 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors">
                          <Pencil size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Detalle expandido */}
                  {expanded[row.id] && (
                    <tr>
                      <td colSpan={12} className="bg-slate-50 px-8 py-3 border-b border-slate-200">
                        {expanded[row.id].length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic">Sin facturas de detalle registradas.</p>
                        ) : (
                          <table className="w-full text-[10px] bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <thead className="bg-slate-100">
                              <tr className="text-slate-500 font-black uppercase tracking-wider">
                                <th className="py-1.5 px-3 text-left">#</th>
                                <th className="py-1.5 px-3 text-left">Factura</th>
                                <th className="py-1.5 px-3 text-left">Volumen</th>
                                <th className="py-1.5 px-3 text-left">Peso</th>
                                <th className="py-1.5 px-3 text-left">Cubicaje</th>
                                <th className="py-1.5 px-3 text-left">Notas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {expanded[row.id].map((d, i) => (
                                <tr key={d.id}>
                                  <td className="py-1.5 px-3 text-slate-400">{i + 1}</td>
                                  <td className="py-1.5 px-3 font-black text-slate-800">{d.factura || '—'}</td>
                                  <td className="py-1.5 px-3 font-bold text-slate-600">{d.volumen || 0}</td>
                                  <td className="py-1.5 px-3 font-bold text-slate-600">{d.peso || 0}</td>
                                  <td className="py-1.5 px-3 font-bold text-slate-600">{d.cubicaje || 0}</td>
                                  <td className="py-1.5 px-3 text-slate-500">{d.notas || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mostrar</span>
              <div className="relative">
                <select
                  value={pageSize}
                  onChange={e => {
                    const val = e.target.value;
                    setPageSize(val === 'Todos' ? 'Todos' : parseInt(val));
                    setCurrentPage(1);
                  }}
                  className="appearance-none pl-3 pr-8 py-1.5 border border-slate-200 rounded-xl text-[11px] font-bold bg-white focus:outline-none focus:border-emerald-400 transition-colors cursor-pointer text-slate-700"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value="Todos">Todos</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold ml-1">
                de {rows.length} registros (Mostrando {paginatedRows.length})
              </span>
            </div>

            {pageSize !== 'Todos' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white transition-all shadow-sm active:scale-95"
                >
                  Anterior
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const p = idx + 1;
                    return (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`w-8 h-8 flex items-center justify-center text-[11px] font-black rounded-xl transition-all shadow-sm active:scale-95 ${
                          currentPage === p
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                            : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white transition-all shadow-sm active:scale-95"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de edición de flete y sobrecostos */}
      {editingPlanilla && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Editar Planilla - {editingPlanilla.os}</h3>
                <p className="text-[10px] text-slate-400">Edite el flete principal y gestione sobrecostos relacionados.</p>
              </div>
              <button onClick={() => setEditingPlanilla(null)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {loadingEditData ? (
                <div className="py-12 text-center">
                  <RefreshCw size={24} className="animate-spin text-slate-300 mx-auto" />
                  <p className="text-[10px] text-slate-400 mt-2">Cargando sobrecostos...</p>
                </div>
              ) : (
                <>
                  {/* Flete Principal */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Valor de Flete Principal</label>
                    <input
                      type="number"
                      value={editingFlete}
                      onChange={e => setEditingFlete(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[11px] font-black text-slate-800 focus:outline-none focus:border-emerald-400 bg-white"
                    />
                  </div>

                  {/* Sección Sobrecostos */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Sobrecostos Asociados</label>
                      <button
                        onClick={() => setEditingSobrecostos(prev => [...prev, { valor: 0, observacion: '', estado: 'PENDIENTE' }])}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-200 transition-colors"
                      >
                        <Plus size={10} /> Adicionar Sobrecosto
                      </button>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[40vh] overflow-y-auto">
                      <table className="w-full text-[10px]">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr className="text-slate-500 font-black uppercase tracking-wider border-b border-slate-200">
                            <th className="py-2 px-3 text-left">Valor ($)</th>
                            <th className="py-2 px-3 text-left">Observación</th>
                            <th className="py-2 px-3 text-left">Estado</th>
                            <th className="py-2 px-3 text-center">Eliminar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {editingSobrecostos.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-slate-400 italic">No hay sobrecostos registrados para esta planilla.</td>
                            </tr>
                          ) : (
                            editingSobrecostos.map((s, idx) => (
                              <tr key={idx}>
                                <td className="py-2 px-3 w-32">
                                  <input
                                    type="number"
                                    value={s.valor}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setEditingSobrecostos(prev => prev.map((item, i) => i === idx ? { ...item, valor: val } : item));
                                    }}
                                    className="w-full px-2 py-1 border border-slate-200 rounded text-[10px] font-bold text-slate-700 focus:outline-none focus:border-emerald-400"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="text"
                                    value={s.observacion}
                                    placeholder="Motivo..."
                                    onChange={e => {
                                      const obs = e.target.value;
                                      setEditingSobrecostos(prev => prev.map((item, i) => i === idx ? { ...item, observacion: obs } : item));
                                    }}
                                    className="w-full px-2 py-1 border border-slate-200 rounded text-[10px] text-slate-600 focus:outline-none focus:border-emerald-400"
                                  />
                                </td>
                                <td className="py-2 px-3 w-36">
                                  <select
                                    value={s.estado}
                                    onChange={e => {
                                      const st = e.target.value;
                                      setEditingSobrecostos(prev => prev.map((item, i) => i === idx ? { ...item, estado: st } : item));
                                    }}
                                    className="w-full px-2 py-1 border border-slate-200 rounded text-[10px] font-bold bg-white focus:outline-none focus:border-emerald-400"
                                  >
                                    <option value="PENDIENTE">PENDIENTE</option>
                                    <option value="APROBADO">APROBADO</option>
                                  </select>
                                </td>
                                <td className="py-2 px-3 text-center w-16">
                                  <button
                                    onClick={() => setEditingSobrecostos(prev => prev.filter((_, i) => i !== idx))}
                                    className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
              <button onClick={() => setEditingPlanilla(null)} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={handleSavePlanilla} disabled={savingPlanilla || loadingEditData} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors disabled:opacity-50">
                {savingPlanilla ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────
const AuditoriaFactura: React.FC<{ user: User }> = ({ user }) => {
  const [tab, setTab]         = useState<Tab>('subir');
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    const allowedIds: string[] = (user as any)?.clientIds?.length
      ? (user as any).clientIds
      : (user as any)?.clientId ? [(user as any).clientId] : [];

    api.getClients().then((all: any[]) => {
      const isAdmin = allowedIds.includes('CLI-01') || allowedIds.length === 0;
      const filtered = isAdmin ? all : all.filter((c: any) => allowedIds.includes(c.id));
      setClients(filtered.map((c: any) => ({ id: c.id, name: c.name || c.id })));
    }).catch(() => {});
  }, [user]);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'subir',     label: 'Subir Planilla',         icon: <Upload size={13} /> },
    { key: 'consultar', label: 'Consultar / Descargar',  icon: <Download size={13} /> },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1">Gestión Ajover — MOD-03</p>
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Auditoría Factura — Bodega 36</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'subir'     && <TabSubir     user={user} clients={clients} />}
      {tab === 'consultar' && <TabConsultar user={user} clients={clients} />}
    </div>
  );
};

export default AuditoriaFactura;
