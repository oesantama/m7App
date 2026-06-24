import React from 'react';
import { Upload, X, CheckCircle2, RefreshCw, FileSpreadsheet } from 'lucide-react';

interface TabCargarProps {
  excelData: any[];
  setExcelData: (v: any[]) => void;
  uploadType: 'general' | 'recibo' | 'egreso';
  setUploadType: (v: 'general' | 'recibo' | 'egreso') => void;
  isUploading: boolean;
  dragActive: boolean;
  showColumns: boolean;
  setShowColumns: (v: boolean | ((prev: boolean) => boolean)) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleDrop: (e: React.DragEvent) => void;
  handleDrag: (e: React.DragEvent) => void;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleConfirmUpload: () => void;
  formatDate: (val: any) => string;
  formatMoney: (val: any) => string;
}

export const TabCargar: React.FC<TabCargarProps> = ({
  excelData,
  setExcelData,
  uploadType,
  setUploadType,
  isUploading,
  dragActive,
  showColumns,
  setShowColumns,
  fileInputRef,
  handleDrop,
  handleDrag,
  handleFileInputChange,
  handleConfirmUpload,
  formatDate,
  formatMoney,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* SELECTOR DE TIPO DE CARGA */}
      <div className="flex items-center justify-center p-1 bg-slate-100/80 rounded-2xl max-w-md mx-auto shadow-sm border border-slate-200/50">
        <button
          onClick={() => { setUploadType('general'); setExcelData([]); }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
            uploadType === 'general'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Carga General
        </button>
        <button
          onClick={() => { setUploadType('recibo'); setExcelData([]); }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
            uploadType === 'recibo'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Recibidos
        </button>
        <button
          onClick={() => { setUploadType('egreso'); setExcelData([]); }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
            uploadType === 'egreso'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Egresos
        </button>
      </div>

      {excelData.length === 0 ? (
        <>
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center p-24 border-2 border-dashed rounded-3xl cursor-pointer transition-all ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50/40'
                : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/50'
            }`}
          >
            <div className="p-5 rounded-full bg-indigo-50 text-indigo-600 mb-4 shadow-sm">
              <Upload size={28} className="animate-bounce" />
            </div>
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide text-center">
              {uploadType === 'general' && 'Arrastra tu archivo formatoinforme.xlsx aquí'}
              {uploadType === 'recibo' && 'Arrastra tu archivo de Recibos aquí'}
              {uploadType === 'egreso' && 'Arrastra tu archivo de Egresos aquí'}
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">O haz clic para explorar tus archivos locales (.xlsx, .xls).</p>
            <div className="flex items-center gap-2 mt-4 bg-slate-100/60 text-slate-500 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase">
              <FileSpreadsheet size={12} />
              <span>
                {uploadType === 'general' && '25 Columnas del archivo'}
                {uploadType === 'recibo' && 'Columnas requeridas: Consecutivo, Fecha'}
                {uploadType === 'egreso' && 'Columnas requeridas: Consecutivo, Fecha'}
              </span>
            </div>
          </div>

          {uploadType === 'general' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowColumns(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet size={12} />
                  Columnas requeridas en el archivo (25)
                </span>
                <span className="text-slate-400">{showColumns ? '▲' : '▼'}</span>
              </button>
              {showColumns && (
                <div className="px-5 pb-4 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    'Número OC','Estado OC','Fecha OC','Número Remesa','Remisión',
                    'Estado Remesa','Fecha Remesa','Número Manifiesto','Orden Cliente','Observaciones Manifiesto',
                    'Estado Manifiesto','Fecha Manifiesto','Placa','Nombre Cliente','Valor Total CXC final',
                    'Valor Tot CXP final','Factura CXC','Recibo','Fecha Factura','Total CXC',
                    'Egreso','Fecha CXP','Total CXP','Documento Cliente','Origen',
                  ].map((col, i) => (
                    <div key={col} className="flex items-center gap-1.5 bg-slate-50 rounded-xl px-3 py-2">
                      <span className="text-[9px] font-black text-slate-300 w-4 shrink-0">{i + 1}</span>
                      <span className="text-[10px] font-bold text-slate-600 leading-tight">{col}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-350">
          {/* Previsualization Table Header */}
          <div className="border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  {uploadType === 'general' && `Previsualización de Carga Gerencial (${excelData.length} registros)`}
                  {uploadType === 'recibo' && `Previsualización de Carga de Recibos (${excelData.length} registros)`}
                  {uploadType === 'egreso' && `Previsualización de Carga de Egresos (${excelData.length} registros)`}
                </h2>
                <p className="text-[10px] text-slate-400">
                  {uploadType === 'general' && 'Verifique detenidamente las 25 columnas cargadas antes de consolidar la información.'}
                  {(uploadType === 'recibo' || uploadType === 'egreso') && 'Verifique las columnas cargadas. Se actualizará la fecha correspondiente según el Consecutivo.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setExcelData([])}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
              >
                Descartar Archivo
              </button>
              <button
                onClick={handleConfirmUpload}
                disabled={isUploading}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="animate-spin" size={13} />
                    <span>Guardando en BD...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} />
                    <span>Confirmar Carga</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Alert banner inside preview uploader */}
          <div className="bg-indigo-50/60 border-b border-indigo-100 px-6 py-2.5 flex flex-wrap gap-4 items-center justify-between text-[10px] font-black uppercase text-indigo-800 font-mono">
            <span>Registros listos para importar/actualizar: {excelData.length}</span>
            <span className="text-indigo-600 bg-white px-2 py-0.5 rounded-lg border border-indigo-100">
              {uploadType === 'general' ? 'ON CONFLICT (oc_number) DO UPDATE' : `UPDATE BY CONSECUTIVE (${uploadType === 'recibo' ? 'receipt' : 'egress'})`}
            </span>
          </div>

          {/* Responsive Scrollable Preview Table */}
          <div className="overflow-x-auto max-h-[550px]">
            {uploadType === 'general' ? (
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100/85 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                    <th className="p-3 whitespace-nowrap">Número OC</th>
                    <th className="p-3 whitespace-nowrap">Estado OC</th>
                    <th className="p-3 whitespace-nowrap">Fecha OC</th>
                    <th className="p-3 whitespace-nowrap">Número Remesa</th>
                    <th className="p-3 whitespace-nowrap">Remisión</th>
                    <th className="p-3 whitespace-nowrap">Estado Remesa</th>
                    <th className="p-3 whitespace-nowrap">Fecha Remesa</th>
                    <th className="p-3 whitespace-nowrap">Número Manifiesto</th>
                    <th className="p-3 whitespace-nowrap">Orden Cliente</th>
                    <th className="p-3 whitespace-nowrap">Observaciones Manifiesto</th>
                    <th className="p-3 whitespace-nowrap">Estado Manifiesto</th>
                    <th className="p-3 whitespace-nowrap">Fecha Manifiesto</th>
                    <th className="p-3 whitespace-nowrap">Placa</th>
                    <th className="p-3 whitespace-nowrap">Nombre Cliente</th>
                    <th className="p-3 whitespace-nowrap">Documento Cliente</th>
                    <th className="p-3 whitespace-nowrap text-right">Valor CXC Final</th>
                    <th className="p-3 whitespace-nowrap text-right">Valor CXP Final</th>
                    <th className="p-3 whitespace-nowrap">Factura CXC</th>
                    <th className="p-3 whitespace-nowrap">Recibo</th>
                    <th className="p-3 whitespace-nowrap">Fecha Factura</th>
                    <th className="p-3 whitespace-nowrap text-right">Total CXC</th>
                    <th className="p-3 whitespace-nowrap">Egreso</th>
                    <th className="p-3 whitespace-nowrap">Fecha CXP</th>
                    <th className="p-3 whitespace-nowrap text-right text-slate-800">Total CXP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                  {excelData.slice(0, 100).map((row, idx) => {
                    const ocNo = row.ocNumber || row['Número OC'];
                    const stateOc = row.ocStatus || row['Estado OC'];
                    const dtOc = row.ocDate || row['Fecha OC'];
                    const remNum = row.remesaNumber || row['Número Remesa'];
                    const remision = row.remission || row['Remisión'];
                    const stRem = row.remissionStatus || row['Estado Remesa'];
                    const dtRem = row.remissionDate || row['Fecha Remesa'];
                    const manNum = row.manifestNumber || row['Número Manifiesto'];
                    const cliOrd = row.clientOrder || row['Orden Cliente'];
                    const obsMan = row.manifestObservations || row['Observaciones Manifiesto'];
                    const stMan = row.manifestStatus || row['Estado Manifiesto'];
                    const dtMan = row.manifestDate || row['Fecha Manifiesto'];
                    const placa = row.plate || row['Placa'];
                    const cliName = row.clientName || row['Nombre Cliente'];
                    const cliDoc = row.clientDocument || row['Documento Cliente'] || row['NIT Cliente'] || row['Nit Cliente'] || row['NIT cliente'] || row['Documento cliente'];
                    const valCxcF = row.totalValueCxcFinal || row['Valor Total CXC final'];
                    const valCxpF = row.totalValueCxpFinal || row['Valor Tot CXP final'];
                    const invCxc = row.invoiceCxc || row['Factura CXC'];
                    const recibo = row.receipt || row['Recibo'];
                    const dtInv = row.invoiceDate || row['Fecha Factura'];
                    const totCxc = row.totalCxc || row['Total CXC'];
                    const egreso = row.egress || row['Egreso'];
                    const dtCxp = row.cxpDate || row['Fecha CXP'];
                    const totCxp = row.totalCxp || row['Total CXP'];

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-all">
                        <td className="p-3 font-black text-slate-800">{ocNo || 'S/I'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-100 text-slate-600">
                            {stateOc || 'S/I'}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">{formatDate(dtOc)}</td>
                        <td className="p-3 font-bold">{remNum || 'S/I'}</td>
                        <td className="p-3 font-bold text-slate-800">{remision || 'S/I'}</td>
                        <td className="p-3">{stRem || 'S/I'}</td>
                        <td className="p-3 whitespace-nowrap">{formatDate(dtRem)}</td>
                        <td className="p-3 font-bold">{manNum || 'S/I'}</td>
                        <td className="p-3">{cliOrd || 'S/I'}</td>
                        <td className="p-3 truncate max-w-[120px]">{obsMan || 'S/I'}</td>
                        <td className="p-3">{stMan || 'S/I'}</td>
                        <td className="p-3 whitespace-nowrap">{formatDate(dtMan)}</td>
                        <td className="p-3">
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-black text-slate-600">{placa || 'S/I'}</span>
                        </td>
                        <td className="p-3 truncate max-w-[150px] font-bold">{cliName || 'S/I'}</td>
                        <td className="p-3 font-mono text-[10px] text-slate-500">{cliDoc || '—'}</td>
                        <td className="p-3 font-bold text-right text-indigo-600">{formatMoney(valCxcF)}</td>
                        <td className="p-3 font-bold text-right text-slate-800">{formatMoney(valCxpF)}</td>
                        <td className="p-3">{invCxc || 'S/I'}</td>
                        <td className="p-3">{recibo || 'S/I'}</td>
                        <td className="p-3 whitespace-nowrap">{formatDate(dtInv)}</td>
                        <td className="p-3 font-black text-right text-indigo-600">{formatMoney(totCxc)}</td>
                        <td className="p-3">{egreso || 'S/I'}</td>
                        <td className="p-3 whitespace-nowrap">{formatDate(dtCxp)}</td>
                        <td className="p-3 font-black text-right text-slate-800">{formatMoney(totCxp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100/85 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                    <th className="p-3 whitespace-nowrap">Sede</th>
                    <th className="p-3 whitespace-nowrap">Tipo Documento</th>
                    <th className="p-3 whitespace-nowrap">Consecutivo</th>
                    <th className="p-3 whitespace-nowrap">Estado</th>
                    <th className="p-3 whitespace-nowrap">Fecha (Nueva fecha)</th>
                    <th className="p-3 whitespace-nowrap text-right">Total</th>
                    <th className="p-3 whitespace-nowrap">Nombre Tercero</th>
                    <th className="p-3 whitespace-nowrap">Documento Tercero</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                  {excelData.slice(0, 100).map((row, idx) => {
                    const sede = row.Sede || row.sede || 'S/I';
                    const tipoDoc = row['Tipo Documento'] || row.tipoDoc || 'S/I';
                    const consecutivo = row.Consecutivo || row.consecutivo || 'S/I';
                    const estado = row.Estado || row.estado || 'S/I';
                    const fechaVal = row.Fecha || row.fecha;
                    const totalVal = row.Total || row.total;
                    const nombreTercero = row['Nombre tercero'] || row['Nombre Tercero'] || row.nombreTercero || 'S/I';
                    const documentoTercero = row['Documento tercero'] || row['Documento Tercero'] || row.documentoTercero || 'S/I';

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-all">
                        <td className="p-3">{sede}</td>
                        <td className="p-3">{tipoDoc}</td>
                        <td className="p-3 font-black text-slate-800">{consecutivo}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-100 text-slate-600">
                            {estado}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap font-bold text-indigo-600">{formatDate(fechaVal)}</td>
                        <td className="p-3 font-bold text-right text-slate-800">{formatMoney(totalVal)}</td>
                        <td className="p-3 font-bold truncate max-w-[150px]">{nombreTercero}</td>
                        <td className="p-3 font-mono">{documentoTercero}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {excelData.length > 100 && (
            <p className="text-[10px] text-slate-400 p-4 border-t border-slate-100 font-black text-center uppercase tracking-wider">
              * Mostrando las primeras 100 de {excelData.length} filas totales cargadas.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
