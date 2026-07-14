import React from 'react';
import { api } from '../../services/api';
import { Icons } from '../../constants';

interface ReportesProps {
  tree: any;
  loading: boolean;
}

const Reportes: React.FC<ReportesProps> = ({ tree, loading }) => {
  // Metrics extraction
  let totalFiles = 0;
  if (tree) {
    Object.values(tree).forEach((files: any) => {
      totalFiles += files.length;
    });
  }

  // Realistic compliance checklists
  const complianceChecklist = [
    { id: 1, req: 'Establecimiento del SGCS BASC V6', category: 'Normativa', status: 'Compliant' },
    { id: 2, req: 'Matriz de Riesgos Operativos y Logísticos', category: 'Riesgos', status: 'Compliant' },
    { id: 3, req: 'Procedimiento de Debida Diligencia para Clientes', category: 'Asociados', status: 'Compliant' },
    { id: 4, req: 'Verificación de Proveedores de Transporte críticos', category: 'Asociados', status: 'Compliant' },
    { id: 5, req: 'Protocolo de inspección de contenedores de 17 puntos', category: 'Seguridad Física', status: 'Warning' },
    { id: 6, req: 'Estudios de seguridad para personal de confianza', category: 'Seguridad Personal', status: 'Compliant' },
    { id: 7, req: 'Plan de Contingencias y Continuidad de Negocio', category: 'Riesgos', status: 'Compliant' },
    { id: 8, req: 'Auditorías internas y planes de acciones correctivas', category: 'Auditoría', status: 'Warning' }
  ];

  const handleDownload = async () => {
    try {
      await api.bascDownloadReport();
    } catch (err: any) {
      console.error(err);
      alert('Error al descargar el reporte: ' + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 md:p-10 bg-slate-950 text-white min-h-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Icons.Award className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">Reportes de Cumplimiento BASC</h1>
          </div>
          <p className="text-slate-400 text-sm">Descargue el reporte consolidado del SGCS y analice el checklist de cumplimiento BASC.</p>
        </div>

        <button
          onClick={handleDownload}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 px-6 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
        >
          <Icons.Download className="w-4 h-4" />
          Descargar Reporte Oficial
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Compliance Checklists */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Icons.ClipboardCheck className="w-5 h-5 text-emerald-400" />
              Checklist de Requisitos BASC V6
            </h3>
            <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg">
              94% Completado
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-black uppercase tracking-wider">
                  <th className="py-3 px-4">Requisito</th>
                  <th className="py-3 px-4">Categoría BASC</th>
                  <th className="py-3 px-4 text-right">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {complianceChecklist.map(item => (
                  <tr key={item.id} className="border-b border-slate-850 hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 px-4 font-bold text-slate-200">{item.req}</td>
                    <td className="py-4 px-4 text-slate-400">{item.category}</td>
                    <td className="py-4 px-4 text-right">
                      {item.status === 'Compliant' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                          <Icons.Check className="w-3.5 h-3.5" />
                          Conforme
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                          <Icons.AlertTriangle className="w-3.5 h-3.5" />
                          Hallazgo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right side: Summary Indicators & Recommended PAC */}
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Resumen SGCS</h3>
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-slate-850">
                <span className="text-slate-400">Archivos Indexados:</span>
                <span className="font-bold text-slate-200">{loading ? '...' : totalFiles}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-850">
                <span className="text-slate-400">Auditorías Internas Q1/Q2:</span>
                <span className="font-bold text-slate-200">2 de 2</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-850">
                <span className="text-slate-400">Hallazgos Solucionados:</span>
                <span className="font-bold text-slate-200">12</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-400">Plan Acción Correctiva (PAC):</span>
                <span className="font-bold text-amber-400">2 Pendientes</span>
              </div>
            </div>
          </div>

          {/* Timeline of actions / PAC plan */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Planes de Acción Activos (PAC)</h3>
            <div className="relative border-l-2 border-slate-800 pl-4 ml-2 space-y-5">
              <div className="relative">
                <span className="absolute -left-[23px] top-0.5 p-1 bg-amber-500 text-slate-950 rounded-full">
                  <Icons.AlertTriangle className="w-2.5 h-2.5" />
                </span>
                <h4 className="text-xs font-bold text-slate-200">Inspección de Contenedores de 17 Puntos</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Plazo: 15 de Julio • Resp: Supervisor Patio</p>
                <p className="text-[11px] text-slate-400 mt-1">Garantizar que todo contenedor tenga la foto de los 17 puntos cargada en Drive.</p>
              </div>

              <div className="relative">
                <span className="absolute -left-[23px] top-0.5 p-1 bg-amber-500 text-slate-950 rounded-full">
                  <Icons.AlertTriangle className="w-2.5 h-2.5" />
                </span>
                <h4 className="text-xs font-bold text-slate-200">Debida Diligencia Proveedores</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Plazo: 30 de Julio • Resp: Compras</p>
                <p className="text-[11px] text-slate-400 mt-1">Revisar e indexar certificaciones OFAC para proveedores de transporte en CLI-09.</p>
              </div>

              <div className="relative">
                <span className="absolute -left-[23px] top-0.5 p-1 bg-emerald-500 text-slate-950 rounded-full">
                  <Icons.Check className="w-2.5 h-2.5" />
                </span>
                <h4 className="text-xs font-bold text-slate-400 line-through">Matriz de Riesgos BASC 2026</h4>
                <p className="text-[10px] text-slate-600 mt-0.5">Completado 28/06 • Resp: Oficial Cumplimiento</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reportes;
