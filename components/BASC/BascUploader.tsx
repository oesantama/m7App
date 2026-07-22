import React, { useState, useRef } from 'react';
import { api } from '../../services/api';
import { Icons } from '../../constants';

const BASC_FOLDERS = [
  '1. ADMINISTRATIVO GA',
  '2. ALMACENAMIENTO OBT Y OBM',
  '3. COMERCIAL GC',
  '4. CONTABLE Y JURÍDICA CJ',
  '5. DOCUMENTOS GENERALES',
  '6. ESTRATÉGICO GE',
  '7. SISTEMA GESTION',
  '8. FINANCIERO GF',
  '9. GESTIÓN AMBIENTAL',
  '10. INFRAESTRUCTURA TI+SF',
  '11. SERVICIO AL CLIENTE SC',
  '12. TRANSPORTE OPT',
  '13. SARLAFT+PTEE',
  'CERTIFICADOS BASC',
  'DOC A BASC'
];

const BascUploader: React.FC = () => {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [selectedFolder, setSelectedFolder] = useState(BASC_FOLDERS[4]);
  const [subFolder, setSubFolder] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isBaseFile, setIsBaseFile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setResults([]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
      setResults([]);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setResults([]);
    try {
      const combinedFolder = `${year}/${selectedFolder}${subFolder.trim() ? '/' + subFolder.trim() : ''}`;
      const res = await api.bascUploadDocument(files, combinedFolder, notes, isBaseFile);
      if (res && res.success && res.validations) {
        setResults(res.validations);
      } else {
        throw new Error(res.error || 'Error al subir archivos');
      }
    } catch (err: any) {
      setResults([{ status: 'ERROR', fileName: 'Múltiples archivos', observations: err.message || 'Error de conexión' }]);
    } finally {
      setLoading(false);
    }
  };

  const downloadCorrectedFile = (base64: string, name: string) => {
    if (!base64) return;
    const link = document.createElement('a');
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
    link.download = name || 'Corregido.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col p-6 md:p-10 bg-slate-950 text-white overflow-y-auto">
      <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-800">
        <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
          <Icons.Upload className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-white">Carga de Documentos</h1>
          <p className="text-slate-400 text-sm">Sube documentos para alimentar el cerebro o analizarlos contra la norma BASC V5.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full grid gap-8">
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <label className="block text-sm font-bold text-slate-300 uppercase tracking-wider">Carpeta de Destino</label>
            
            <div className="flex items-center gap-3 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setIsBaseFile(false)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                  !isBaseFile ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Para Validar
              </button>
              <button
                onClick={() => setIsBaseFile(true)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                  isBaseFile ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Archivo Base
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Año de Vigencia</label>
              <select
                value={year}
                onChange={e => setYear(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Carpeta Principal</label>
              <select
                value={selectedFolder}
                onChange={e => setSelectedFolder(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {BASC_FOLDERS.map(f => (
                  <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Subcarpetas (Opcional - Estructura de árbol)</label>
                <button
                  type="button"
                  onClick={() => setSubFolder([...subFolder, ''])}
                  className="text-xs text-blue-400 hover:text-blue-300 font-bold uppercase flex items-center gap-1"
                >
                  <Icons.Plus className="w-3 h-3" /> Agregar Nivel
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="text-xs text-slate-500 font-bold bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 flex items-center gap-2">
                  <Icons.Folder className="w-3 h-3" />
                  {year} / {selectedFolder.split(' ')[0]}...
                </div>
                {Array.isArray(subFolder) && subFolder.map((sub, idx) => (
                  <React.Fragment key={idx}>
                    <Icons.ChevronRight className="w-4 h-4 text-slate-600" />
                    <div className="relative flex-1 min-w-[150px] max-w-[250px]">
                      <input
                        type="text"
                        value={sub}
                        onChange={e => {
                          const newSub = [...subFolder];
                          newSub[idx] = e.target.value;
                          setSubFolder(newSub as any);
                        }}
                        placeholder={`Nivel ${idx + 1}...`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 pr-8"
                      />
                      {subFolder.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newSub = [...subFolder];
                            newSub.splice(idx, 1);
                            setSubFolder(newSub as any);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-red-400"
                        >
                          <Icons.X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Ejemplo: Nivel 1: "10.3 Seguridad de la información", Nivel 2: "10.3.1 Formatos".
              </p>
            </div>
          </div>

          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-950/50 hover:bg-slate-900 transition-colors rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer text-center"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={handleFileChange}
            />
            <Icons.Upload className="w-12 h-12 text-slate-500 mb-4" />
            <p className="text-sm font-bold text-slate-300 mb-1">Haz clic o arrastra archivos aquí</p>
            <p className="text-xs text-slate-500">Soporta PDF, Word (.docx) y Excel (.xlsx)</p>
            
            {files.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {files.map((file, i) => (
                  <div key={i} className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg border border-blue-500/30 text-xs font-bold flex items-center gap-2">
                    <Icons.FileText className="w-3 h-3" />
                    {file.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">Contexto de la Empresa / Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Este año se cambiaron las políticas de transporte. Tener en cuenta para la validación..."
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-24"
            ></textarea>
            <p className="text-xs text-slate-500 mt-1">
              Las notas se cruzarán con el repositorio inteligente para una auditoría más precisa.
            </p>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={files.length === 0 || loading}
              className={`flex items-center gap-2 text-white px-8 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50 ${
                isBaseFile 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20'
              } shadow-lg`}
            >
              {loading ? <Icons.Loader className="w-5 h-5 animate-spin" /> : (isBaseFile ? <Icons.Save className="w-5 h-5" /> : <Icons.Shield className="w-5 h-5" />)}
              {loading ? 'Procesando...' : (isBaseFile ? 'Subir al Cerebro BASC' : 'Validar y Subir')}
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-4">Resultados del Procesamiento</h2>
            {results.map((result, idx) => (
              <div key={idx} className={`p-6 rounded-3xl border ${
                result.status === 'INDEXADO' ? 'bg-slate-900/60 border-slate-700/50' :
                result.status === 'CUMPLE' ? 'bg-emerald-950/20 border-emerald-900/50' : 
                result.status === 'ERROR' ? 'bg-red-950/20 border-red-900/50' : 
                'bg-amber-950/20 border-amber-900/50'
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  {result.status === 'INDEXADO' ? (
                    <div className="p-2 bg-slate-500/20 text-slate-400 rounded-lg"><Icons.Save className="w-6 h-6" /></div>
                  ) : result.status === 'CUMPLE' ? (
                    <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><Icons.Check className="w-6 h-6" /></div>
                  ) : result.status === 'ERROR' ? (
                    <div className="p-2 bg-red-500/20 text-red-400 rounded-lg"><Icons.Alert className="w-6 h-6" /></div>
                  ) : (
                    <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg"><Icons.AlertTriangle className="w-6 h-6" /></div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{result.fileName}</p>
                    <h3 className="text-xl font-black uppercase tracking-wider text-white">
                      {result.status === 'INDEXADO' ? 'Indexado' : 
                       result.status === 'CUMPLE' ? 'Aprobado BASC' : 
                       result.status === 'ERROR' ? 'Error' : 'No Cumple / Observado'}
                    </h3>
                  </div>
                </div>
                <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                  {result.observations}
                </div>
                
                {result.correctedFileBase64 && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => downloadCorrectedFile(result.correctedFileBase64, result.downloadFileName)}
                      className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                    >
                      <Icons.Download className="w-4 h-4" />
                      Descargar Excel Corregido
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BascUploader;
