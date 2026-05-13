
import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../constants';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { MasterCategory } from '../types';
import { api } from '../services/api';
import { useAppStore } from '../stores/useAppStore';

interface DataImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeMaster: MasterCategory;
  existingData?: any[];
  onImport: (data: any[]) => Promise<void>;
}

export const DataImportDialog: React.FC<DataImportDialogProps> = ({ 
  isOpen, onClose, activeMaster, existingData = [], onImport 
}) => {
  const { user, allMasterData } = useAppStore();
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [localClients, setLocalClients] = useState<any[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const FIELD_DESCRIPTIONS: Record<string, string> = {
    sku: "Identificador único. Obligatorio.",
    name: "Nombre descriptivo del registro.",
    clientId: "ID del cliente (ej: CLI-VALOR). Debe coincidir con uno existente.",
    roleId: "ID del rol (ej: ROL-ADMIN).",
    documentType: "Tipo de documento (CC, NIT, CE, etc).",
    documentNumber: "Número de identificación sin puntos ni comas.",
    statusId: "Estado (EST-01: ACTIVO, EST-02: INACTIVO).",
    uomGeneralId: "Unidad para reportes generales.",
    uomInterId: "Unidad de empaque intermedio.",
    uomStdId: "Unidad mínima de despacho.",
    factorInter: "Cantidad de unidades estándar en la intermedia. Solo números.",
    factorStd: "Factor de conversión a unidad mínima. Solo números.",
    categoryArticuloId: "ID de la categoría (ej: CAT-01).",
    phone: "Número telefónico de contacto.",
    email: "Correo electrónico válido.",
    address: "Dirección física completa.",
    route: "Ruta del sistema (ej: /inventory).",
    iconClass: "Nombre del icono (ej: Package, Truck).",
    parentId: "ID del módulo o página padre."
  };

  useEffect(() => {
    const fetchLocalClients = async () => {
      try {
        const data = await api.getClients();
        if (Array.isArray(data)) {
          setLocalClients(data);
        }
      } catch (err) {
        console.error("Error loading clients in DataImportDialog:", err);
      }
    };
    if (isOpen) {
      fetchLocalClients();
    }
  }, [isOpen]);

  const isSuper = user?.roleId === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const masterList = localClients.length > 0 ? localClients : (allMasterData?.masterClientes || []);

  const allClients = masterList.map((c: any) => ({
      id: String(c.id || c.clientId || ''),
      name: String(c.name || c.nombre || c.businessName || c.business_name || ''),
  })).filter((c: any) => c.id && c.name);

  const userClientIds = (user?.clientIds || (user?.clientId ? [user.clientId] : []))
      .map((id: any) => String(id));

  const authorizedClients = isSuper
      ? allClients
      : allClients.filter(c => userClientIds.includes(String(c.id)));

  useEffect(() => {
    if (activeMaster === 'masterVehiculos') {
      if (authorizedClients.length === 1) {
        setSelectedClientId(authorizedClients[0].id);
      } else if (user?.clientId) {
        setSelectedClientId(user.clientId);
      }
    }
  }, [authorizedClients.length, activeMaster]);

  if (!isOpen) return null;

  // Mapa de campos esperados y ejemplos por Maestro
  const getTemplateStructure = (master: any): { fields: string[], examples: any[] } => {
    switch (master) {
      case 'masterUsuarios': 
        return { 
          fields: ['name', 'email', 'phone', 'roleId', 'documentType', 'documentNumber', 'statusId'],
          examples: [
            { name: 'JUAN PÉREZ', email: 'juan.perez@millasiete.com', phone: '3001234567', roleId: 'ROL-ADMIN', documentType: 'CC', documentNumber: '12345678', statusId: 'EST-01' },
            { name: 'MARIA LOPEZ', email: 'maria.lopez@millasiete.com', phone: '3109876543', roleId: 'ROL-OPER', documentType: 'CC', documentNumber: '87654321', statusId: 'EST-01' }
          ]
        };
      case 'masterArticulo': 
        return { 
          fields: ['sku', 'name', 'clientIds', 'categoryArticuloId', 'uomGeneralId', 'uomInterId', 'uomStdId', 'factorInter', 'factorStd', 'statusId'],
          examples: [
            { sku: 'ART-001', name: 'CEMENTO GRIS 50KG', clientIds: 'CLI-01, CLI-02', categoryArticuloId: 'CAT-01', uomGeneralId: 'UOM-01', uomInterId: 'UOM-02', uomStdId: 'UOM-03', factorInter: 1, factorStd: 50, statusId: 'EST-01' },
            { sku: 'ART-002', name: 'VARILLA CORRUGADA 1/2', clientIds: 'CLI-01', categoryArticuloId: 'CAT-01', uomGeneralId: 'UOM-01', uomInterId: 'UOM-02', uomStdId: 'UOM-03', factorInter: 1, factorStd: 6, statusId: 'EST-01' }
          ]
        };
      case 'masterClientes':
        return {
          fields: ['name', 'documentNumber', 'address', 'phone', 'email', 'statusId'],
          examples: [
            { name: 'CONSTRUCTORA BOLIVAR', documentNumber: '900.123.456-1', address: 'AV CALLE 26 # 68-10', phone: '6012345678', email: 'contacto@bolivar.com', statusId: 'EST-01' },
            { name: 'FERRETERIA CENTRAL', documentNumber: '800.987.654-2', address: 'CRA 15 # 45-20', phone: '6018765432', email: 'gerencia@central.com', statusId: 'EST-01' }
          ]
        };
      case 'masterRol':
        return {
          fields: ['name', 'description', 'statusId'],
          examples: [
            { name: 'ADMINISTRADOR SISTEMA', description: 'Acceso total a todos los módulos y configuraciones.', statusId: 'EST-01' },
            { name: 'OPERADOR BODEGA', description: 'Acceso a inventarios y despachos.', statusId: 'EST-01' }
          ]
        };
      case 'masterUnidadMedida':
        return {
          fields: ['name', 'description', 'statusId'],
          examples: [
            { name: 'UNIDAD', description: 'Unidad de medida individual.', statusId: 'EST-01' },
            { name: 'KILOGRAMO', description: 'Medida de peso estándar.', statusId: 'EST-01' }
          ]
        };
      case 'masterCategorias':
        return {
          fields: ['name', 'description', 'statusId'],
          examples: [
            { name: 'CONSTRUCCIÓN', description: 'Materiales pesados de obra gris.', statusId: 'EST-01' },
            { name: 'ACABADOS', description: 'Pinturas, cerámicas y grifería.', statusId: 'EST-01' }
          ]
        };
      case 'masterModulos':
        return {
          fields: ['name', 'iconClass', 'statusId'],
          examples: [
            { name: 'INVENTARIOS', iconClass: 'Package', statusId: 'EST-01' },
            { name: 'LOGÍSTICA', iconClass: 'Truck', statusId: 'EST-01' }
          ]
        };
      case 'masterPaginas':
        return {
          fields: ['name', 'route', 'parentId', 'statusId'],
          examples: [
            { name: 'CONTROL STOCK', route: '/inventory/stock', parentId: 'MOD-INV', statusId: 'EST-01' },
            { name: 'DESPACHOS', route: '/logistics/shipping', parentId: 'MOD-LOG', statusId: 'EST-01' }
          ]
        };
      case 'masterMarcas':
        return {
          fields: ['name', 'description', 'statusId'],
          examples: [
            { name: 'CHEVROLET', description: 'Vehículos de carga liviana y pesada.', statusId: 'EST-01' },
            { name: 'HINO', description: 'Camiones y flotas de distribución.', statusId: 'EST-01' }
          ]
        };
      case 'masterVehiculos' as any: 
        return { 
          fields: ['plate', 'brand', 'owner', 'capacityM3', 'modelYear', 'color', 'vehicleTypeId', 'statusId'],
          examples: [
            { plate: 'FGH789', brand: 'FOTON', owner: 'MILLA SIETE SAS', capacityM3: 35, modelYear: '2024', color: 'BLANCO', vehicleTypeId: 'SENCILLO', statusId: 'EST-01' },
            { plate: 'ABC123', brand: 'CHEVROLET', owner: 'LOGISTICA EXPRESS', capacityM3: 15, modelYear: '2022', color: 'AZUL', vehicleTypeId: 'TURBO', statusId: 'EST-01' }
          ]
        };
      case 'masterConductores' as any: 
        return { 
          fields: ['name', 'documentType', 'documentNumber', 'phone', 'licenseCategory', 'licenseExpiry', 'statusId'],
          examples: [
            { name: 'JUAN PEREZ', documentType: 'CC', documentNumber: '12345678', phone: '3001234567', licenseCategory: 'C2', licenseExpiry: '2028-12-31', statusId: 'EST-01' },
            { name: 'MARIA LOPEZ', documentType: 'CC', documentNumber: '87654321', phone: '3109876543', licenseCategory: 'C3', licenseExpiry: '2027-06-15', statusId: 'EST-01' }
          ]
        };
      default: 
        return { 
          fields: ['name', 'description', 'statusId'],
          examples: [
            { name: 'EJEMPLO A', description: 'Descripción detallada del registro A', statusId: 'EST-01' },
            { name: 'EJEMPLO B', description: 'Descripción detallada del registro B', statusId: 'EST-01' }
          ]
        };
    }
  };

   const handleDownloadTemplate = () => {
    const { fields, examples } = getTemplateStructure(activeMaster);
    const ws = XLSX.utils.json_to_sheet(examples, { header: fields });

    // Añadir comentarios a las cabeceras para guiar al usuario
    fields.forEach((f, i) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: i });
      if (ws[cellAddress] && FIELD_DESCRIPTIONS[f]) {
        ws[cellAddress].c = [{ a: "Mella 7", t: FIELD_DESCRIPTIONS[f] }];
        ws[cellAddress].c.hidden = true; // Solo visibles al pasar el mouse (triángulo morado)
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, `Plantilla_${activeMaster}.xlsx`);
    toast.success("Plantilla Descargada", { description: "Revise los comentarios en los encabezados para completar los datos." });
  };

  const validateData = async (data: any[]) => {
    const errors: string[] = [];
    const internalSet = new Set();
    
    setIsProcessing(true);
    try {
        // Obtener la clave única del ítem según el maestro activo
        const getKeyValue = (item: any): string => {
            if ((activeMaster as any) === 'masterVehiculos') {
                // El Excel puede tener la columna en mayúsculas (PLATE) o camelCase (plate)
                return (item.PLATE || item.plate || '').toString().trim();
            }
            if ((activeMaster as any) === 'masterConductores') {
                return (item.DOCUMENT_NUMBER || item.documentNumber || item.DOCUMENTNUMBER || '').toString().trim();
            }
            return (item.sku || item.email || item.name || '').toString().trim();
        };

        // Claves existentes en el sistema (para contar cuántos se actualizarán)
        const systemKeys = new Set(existingData.map(item => {
            if ((activeMaster as any) === 'masterVehiculos') return item.plate?.toString().trim().toLowerCase();
            if ((activeMaster as any) === 'masterConductores') return item.documentNumber?.toString().trim().toLowerCase();
            return (item.sku || item.email || item.name || '')?.toString().trim().toLowerCase();
        }));

        let updateCount = 0;

        data.forEach((item: any, index) => {
            const value = getKeyValue(item);
            
            if (!value) {
                const label = (activeMaster as any) === 'masterVehiculos' ? 'PLATE' :
                              (activeMaster as any) === 'masterConductores' ? 'DOCUMENT_NUMBER' : 'name/sku/email';
                errors.push(`Fila ${index + 1}: El campo identificador (${label}) es obligatorio y está vacío.`);
            } else {
                const valueLower = value.toLowerCase();
                
                // Duplicado DENTRO del mismo Excel: esto SÍ bloquea
                if (internalSet.has(valueLower)) {
                    errors.push(`Fila ${index + 1}: "${value}" está duplicado dentro del archivo Excel.`);
                }
                
                // Duplicado en el SISTEMA: se ACTUALIZARÁ vía UPSERT, NO es error
                if (systemKeys.has(valueLower)) {
                    updateCount++;
                }
                
                internalSet.add(valueLower);
            }
        });

        // Mensaje informativo (no bloquea)
        if (updateCount > 0) {
            const newCount = data.length - updateCount;
            setImportSummary(`${newCount} registros nuevos a CREAR, ${updateCount} registros existentes a ACTUALIZAR.`);
        } else {
            setImportSummary(`${data.length} registros nuevos a CREAR.`);
        }

    } catch (e: any) {
        console.error('[M7-IMPORT] Error en validación:', e);
        errors.push(`Error durante la validación: ${e?.message || 'error desconocido'}`);
    } finally {
        setIsProcessing(false);
    }
    
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    // Validar extensión
    const ext = uploadedFile.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
        toast.error("Formato no válido", { description: "Por favor use archivos Excel (.xlsx o .xls)" });
        return;
    }

    setFile(uploadedFile);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length === 0) {
          toast.error("El archivo está vacío");
          return;
        }

        // Ejecutar validaciones
        const isValid = await validateData(data);
        
        const dataHeaders = Object.keys(data[0] as object);
        setHeaders(dataHeaders);
        setPreviewData(data); // Guardamos todo para el preview (que será paginado o limitado)
        
        if (isValid) {
            toast.success("Archivo Leído", { description: "Se detectaron los registros correctamente." });
            setStep(3);
        } else {
            toast.warning("Errores detectados", { description: "Revise los problemas encontrados en el paso 3." });
            setStep(3);
        }
      } catch (err) {
        console.error(err);
        toast.error("Error al leer el archivo");
      }
    };
    reader.readAsBinaryString(uploadedFile);
  };

  const confirmImport = async () => {
    if (validationErrors.length > 0) {
        toast.error("No se puede importar", { description: "Debe corregir los errores para continuar." });
        return;
    }
    
    setIsProcessing(true);
    try {
        let dataToSend = previewData;
        if (activeMaster === 'masterVehiculos' && selectedClientId) {
          dataToSend = previewData.map(row => ({
            ...row,
            clientId: selectedClientId,
            selectedClientId: selectedClientId
          }));
        }
        await onImport(dataToSend);
        toast.success("Importación Exitosa", { description: `${previewData.length} registros procesados.` });
        handleClose();
    } catch (err) {
        toast.error("Error en importación");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setFile(null);
    setPreviewData([]);
    setValidationErrors([]);
    setSelectedClientId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-[90vw] h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-500 text-slate-950 rounded-xl flex items-center justify-center shadow-xl"><Icons.Excel /></div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter leading-none">Importación Masiva</h3>
                <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mt-1">{activeMaster.replace('master', '')}</p>
              </div>
           </div>
           <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-2xl font-thin">×</button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
           {/* STEPPER */}
           <div className="flex items-center justify-between relative">
              <div className="absolute left-0 right-0 top-1/2 h-1 bg-slate-100 -z-10"></div>
              {[1, 2, 3].map((s) => (
                <button 
                  key={s} 
                  onClick={() => setStep(s as 1 | 2 | 3)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm border-4 transition-all hover:scale-110 active:scale-95 ${step >= s ? 'bg-emerald-500 border-white text-white shadow-lg scale-110' : 'bg-slate-200 border-white text-slate-400'}`}
                >
                   {s}
                </button>
              ))}
           </div>

           <div className="text-center">
              <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">
                 {step === 1 && "Paso 1: Descargar Estructura"}
                 {step === 2 && "Paso 2: Cargar Datos"}
                 {step === 3 && "Paso 3: Validar y Confirmar"}
              </h4>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
                 {step === 1 && "Obtenga la plantilla oficial para asegurar que los datos se importen correctamente sin errores de formato."}
                 {step === 2 && "Seleccione el archivo Excel (.xlsx) con la información ya diligenciada según la plantilla."}
                 {step === 3 && "Revise la previsualización de los primeros registros y confirme la importación definitiva."}
              </p>
           </div>

           <div className="bg-slate-50 rounded-[2rem] p-8 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center min-h-[200px]">
              {step === 1 && (
                 <button onClick={handleDownloadTemplate} className="flex flex-col items-center gap-4 group">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                       <Icons.Download className="w-10 h-10" />
                    </div>
                     <span className="font-bold text-slate-600 group-hover:text-emerald-600 uppercase text-xs tracking-widest">Descargar Plantilla Excel</span>
                  </button>
               )}

               {step === 2 && (
                  <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">
                     {activeMaster === 'masterVehiculos' && (
                        <div className="w-full space-y-2 text-left bg-slate-100/80 p-4 rounded-2xl border border-slate-200">
                           <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                              <Icons.User className="w-3.5 h-3.5 text-blue-500" />
                              <span>Cliente Destinatario</span>
                           </label>
                           <select 
                              value={selectedClientId} 
                              onChange={(e) => setSelectedClientId(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                           >
                              <option value="">-- SELECCIONE UN CLIENTE --</option>
                              {authorizedClients.map(c => (
                                 <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                           </select>
                           <p className="text-[9px] text-slate-400 font-bold">
                              * Todos los vehículos de este cargue masivo se asociarán a este cliente.
                           </p>
                        </div>
                     )}

                     <input 
                        type="file" 
                        accept=".xlsx, .xls" 
                        ref={fileInputRef}
                        className="hidden" 
                        onChange={handleFileUpload}
                     />
                     <button 
                        onClick={() => {
                           if (activeMaster === 'masterVehiculos' && !selectedClientId) {
                              toast.error('Por favor, seleccione un cliente antes de cargar el archivo.');
                              return;
                           }
                           fileInputRef.current?.click();
                        }} 
                        className={`flex flex-col items-center gap-4 group ${activeMaster === 'masterVehiculos' && !selectedClientId ? 'opacity-50 cursor-not-allowed' : ''}`}
                     >
                         <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Icons.Upload className="w-10 h-10" />
                         </div>
                         <span className="font-bold text-slate-600 group-hover:text-blue-600 uppercase text-xs tracking-widest">Seleccionar Archivo</span>
                     </button>
                  </div>
               )}

               {step === 3 && (
                  <div className="w-full space-y-4">
                     {importSummary && (
                        <div className="p-4 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex items-center gap-3 text-blue-800 font-bold text-xs shadow-xs">
                           <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                              ℹ️
                           </div>
                           <span>{importSummary}</span>
                        </div>
                     )}
                     {validationErrors.length > 0 && (
                        <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl space-y-2">
                           <div className="flex items-center gap-2 text-red-600 font-black text-[10px] uppercase">
                              <Icons.Alert className="w-4 h-4" />
                              <span>Errores de Validación Encontrados ({validationErrors.length})</span>
                           </div>
                           <div className="max-h-[100px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                              {validationErrors.map((err, idx) => (
                                 <p key={idx} className="text-[9px] text-red-500 font-bold">• {err}</p>
                              ))}
                           </div>
                        </div>
                     )}
                     <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black uppercase text-slate-400">Previsualización ({previewData.length > 5 ? '5' : previewData.length} registros)</span>
                        <span className="text-[10px] font-black uppercase text-emerald-500">{file?.name}</span>
                     </div>
                     <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-100 p-2">
                        <table className="w-full text-[9px] text-left">
                           <thead className="bg-slate-50 text-slate-500 font-black uppercase">
                              <tr>
                                 {headers.map(h => <th key={h} className="p-2">{h}</th>)}
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-50">
                              {previewData.slice(0, 5).map((row, i) => (
                                 <tr key={i}>
                                    {headers.map(h => <td key={h} className="p-2 text-slate-700 truncate max-w-[100px]">{row[h]}</td>)}
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
               )}
           </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4">
           {step > 1 && (
              <button onClick={() => setStep(step === 3 ? 2 : 1)} className="px-6 py-4 rounded-xl font-black text-[10px] uppercase text-slate-400 hover:text-slate-600 transition-colors">
                 Atrás
              </button>
           )}
            {step === 1 && (
               <button onClick={() => setStep(2)} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-500 transition-all">
                  Siguiente
               </button>
            )}
            {step === 2 && file && (
               <button onClick={() => setStep(3)} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-500 transition-all">
                  Siguiente
               </button>
            )}
            {step === 3 && (
               <button 
                  onClick={confirmImport} 
                  disabled={isProcessing || validationErrors.length > 0}
                  className="px-8 py-4 bg-emerald-500 text-slate-900 rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-400 transition-all disabled:opacity-50"
               >
                  {isProcessing ? "Procesando Importación..." : "Confirmar Importación"}
               </button>
            )}
        </div>
      </div>
    </div>
  );
};
