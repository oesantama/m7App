import React from 'react';
import { Icons } from '../../constants';

interface DashboardProps {
  tree: any;
  loading: boolean;
  onNavigate: (pageId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ tree, loading, onNavigate }) => {
  // Calculate document metrics
  let totalIndexed = 0;
  let pendingSync = 0;
  let hasErrors = 0;

  if (tree) {
    Object.values(tree).forEach((files: any) => {
      files.forEach((file: any) => {
        totalIndexed++;
        if (file.status === 'PENDING') pendingSync++;
        if (file.status === 'ERROR') hasErrors++;
      });
    });
  }

  // Fallback / Initial mockup numbers if empty
  const complianceScore = 94; // %
  const pendingAudits = 2;
  const criticalFindings = hasErrors > 0 ? hasErrors : 1;

  return (
    <div className="flex-1 flex flex-col p-6 md:p-10 bg-slate-950 text-white min-h-full overflow-y-auto">
      {/* Header section with glassmorphism */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Icons.Shield className="w-6 h-6 animate-pulse" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">Módulo BASC Inteligente</h1>
          </div>
          <p className="text-slate-400 text-sm">Monitoreo de seguridad de la cadena de suministro BASC y RAG-Auditor en Orbit M7.</p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('PAG-72')}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Icons.Brain className="w-4 h-4" />
            Auditor IA
          </button>
          
          <button
            onClick={() => onNavigate('PAG-BASC-05')}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-blue-500/20 active:scale-95"
          >
            <Icons.Upload className="w-4 h-4" />
            Validar Docs
          </button>
          
          <button
            onClick={() => onNavigate('PAG-71')}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300"
          >
            <Icons.RefreshCw className="w-4 h-4" />
            Gestionar Drive
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {/* Compliance percentage */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-500">
          <div className="absolute top-0 right-0 p-8 text-emerald-500/5 group-hover:scale-110 transition-transform duration-500">
            <Icons.Shield style={{ width: '120px', height: '120px' }} />
          </div>
          <div className="flex justify-between items-start mb-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cumplimiento Global</p>
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-[10px] font-bold">Nivel A</span>
          </div>
          <div className="flex items-end gap-3">
            <h2 className="text-5xl font-black tracking-tight text-white">{complianceScore}%</h2>
            <div className="mb-1 text-xs text-emerald-400 flex items-center gap-1">
              <Icons.ChevronRight className="-rotate-90 w-3.5 h-3.5" />
              <span>+1.5%</span>
            </div>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full" style={{ width: `${complianceScore}%` }}></div>
          </div>
          <p className="text-[10px] text-slate-500 mt-3 font-medium">Última auditoría oficial hace 14 días</p>
        </div>

        {/* Total Indexed Documents */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 relative overflow-hidden group hover:border-blue-500/30 transition-all duration-500">
          <div className="absolute top-0 right-0 p-8 text-blue-500/5 group-hover:scale-110 transition-transform duration-500">
            <Icons.FileText style={{ width: '120px', height: '120px' }} />
          </div>
          <div className="flex justify-between items-start mb-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Docs en Repositorio</p>
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-[10px] font-bold">RAG Ready</span>
          </div>
          <div className="flex items-end gap-3">
            <h2 className="text-5xl font-black tracking-tight text-white">{loading ? '...' : totalIndexed}</h2>
            <p className="text-xs text-slate-500 mb-1">Archivos PDF/TXT</p>
          </div>
          <div className="flex items-center gap-2 mt-4 text-[10px] text-slate-400">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span>{pendingSync} pendientes de sincronización</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Búsqueda semántica activa</p>
        </div>

        {/* Pending Audits */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 relative overflow-hidden group hover:border-amber-500/30 transition-all duration-500">
          <div className="absolute top-0 right-0 p-8 text-amber-500/5 group-hover:scale-110 transition-transform duration-500">
            <Icons.Clock style={{ width: '120px', height: '120px' }} />
          </div>
          <div className="flex justify-between items-start mb-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auditorías Pendientes</p>
            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-[10px] font-bold">Q2 Plan</span>
          </div>
          <div className="flex items-end gap-3">
            <h2 className="text-5xl font-black tracking-tight text-white">{pendingAudits}</h2>
            <p className="text-xs text-slate-500 mb-1">Internas</p>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full" style={{ width: '40%' }}></div>
          </div>
          <p className="text-[10px] text-slate-500 mt-3 font-medium">Próxima: Auditoría de Asociados el 24/07</p>
        </div>

        {/* Critical Findings / Warnings */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 relative overflow-hidden group hover:border-red-500/30 transition-all duration-500">
          <div className="absolute top-0 right-0 p-8 text-red-500/5 group-hover:scale-110 transition-transform duration-500">
            <Icons.AlertTriangle style={{ width: '120px', height: '120px' }} />
          </div>
          <div className="flex justify-between items-start mb-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hallazgos Críticos</p>
            <span className={`px-2 py-0.5 ${criticalFindings > 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400'} rounded-md text-[10px] font-bold`}>
              {criticalFindings > 0 ? 'Acción Requerida' : 'Sin Alertas'}
            </span>
          </div>
          <div className="flex items-end gap-3">
            <h2 className={`text-5xl font-black tracking-tight ${criticalFindings > 0 ? 'text-red-400' : 'text-white'}`}>{criticalFindings}</h2>
            <p className="text-xs text-slate-500 mb-1">Alertas activas</p>
          </div>
          <div className="flex items-center gap-2 mt-4 text-[10px] text-slate-400">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-ping"></div>
            <span>Faltan reportes de inspección de contenedores</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Detectado por BASC AI</p>
        </div>
      </div>

      {/* Main split section: Folders & Findings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 columns: BASC Folders & Docs */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">Estructura Documental SGCS</h3>
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Norma BASC V6</span>
          </div>

          <div className="space-y-4">
            {Object.entries(tree || {}).map(([folderName, files]: any) => {
              const fileCount = files.length;
              const syncedCount = files.filter((f: any) => f.status === 'SYNCHRONIZED').length;
              const errorCount = files.filter((f: any) => f.status === 'ERROR').length;
              
              // Map display names for folders
              const displayNames: Record<string, string> = {
                '01_Normativa_y_Manuales': '01. Normativas y Manuales BASC',
                '02_Analisis_de_Riesgos': '02. Matrices y Análisis de Riesgos',
                '03_Asociados_de_Negocio': '03. Control de Asociados de Negocio',
                '04_Seguridad_Fisica_y_Personal': '04. Seguridad Física y del Personal',
                '05_Auditorias_e_Informes': '05. Auditorías, Informes y PAC'
              };

              return (
                <div key={folderName} className="p-4 bg-slate-950/60 hover:bg-slate-950 border border-slate-900 rounded-2xl flex items-center justify-between transition-all duration-300 group">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-900 rounded-xl text-slate-400 group-hover:text-emerald-400 group-hover:bg-slate-850 transition-colors">
                      <Icons.Category className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-200 group-hover:text-white transition-colors">{displayNames[folderName] || folderName}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{fileCount} archivos indexados en total</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Progress indicators */}
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded">
                        {syncedCount} Sinc
                      </span>
                      {errorCount > 0 && (
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded">
                          {errorCount} Err
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => onNavigate('PAG-71')}
                      className="p-1 text-slate-500 hover:text-white transition-colors"
                    >
                      <Icons.ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: System status / auditor insights */}
        <div className="flex flex-col gap-6">
          {/* AI Auditor Insights Card */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 relative overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl">
                <Icons.Brain className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white uppercase tracking-wider text-sm">OrbitM7 BASC Insights</h3>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              "Basado en el escaneo documental diario, he notado una brecha en la carpeta <span className="text-amber-400 font-bold">04_Seguridad_Fisica_y_Personal</span>. Faltan las actas mensuales de inspección de contenedores de los últimos dos periodos. Esto podría comprometer la recertificación de fin de año."
            </p>

            <button
              onClick={() => onNavigate('PAG-72')}
              className="w-full flex items-center justify-center gap-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border border-purple-500/30 transition-all active:scale-95"
            >
              <Icons.Chat className="w-4 h-4" />
              Preguntar al Auditor IA
            </button>
          </div>

          {/* Download Report Card */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between flex-1">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
                  <Icons.Award className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white uppercase tracking-wider text-sm">Certificación Activa</h3>
              </div>
              
              <h4 className="text-white font-black text-xl mb-1">SGCS BASC COL-0982-2026</h4>
              <p className="text-xs text-slate-500">Vigencia: Diciembre 2026</p>
              
              <div className="mt-4 p-3 bg-slate-900/40 rounded-xl border border-slate-900 flex justify-between items-center">
                <span className="text-xs text-slate-400">Próxima Auditoría Externa:</span>
                <span className="text-xs text-emerald-400 font-bold uppercase">Noviembre 2026</span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('PAG-73')}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
            >
              <Icons.Download className="w-4 h-4" />
              Descargar Reporte Completo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
