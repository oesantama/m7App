import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  DollarSign, 
  Building2, 
  Calendar, 
  User, 
  Eye, 
  Edit3, 
  Trash2,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
  FileCheck
} from 'lucide-react';
import { User as UserType } from '../../types';

interface LegalizacionesDicorpProps {
  user: UserType;
}

interface LegalizacionRecord {
  id: string;
  codigo: string;
  solicitante: string;
  concepto: string;
  centroCosto: string;
  montoTotal: number;
  fecha: string;
  estado: 'Aprobado' | 'Pendiente' | 'Revision' | 'Rechazado';
  soportesCount: number;
}

const INITIAL_RECORDS: LegalizacionRecord[] = [
  {
    id: 'LEG-2026-001',
    codigo: 'LEG-DIC-001',
    solicitante: 'Carlos Mendoza',
    concepto: 'Viáticos Operación Ruta Bogotá - Medellín',
    centroCosto: 'CC-DICORP-101',
    montoTotal: 450000,
    fecha: '2026-08-20',
    estado: 'Aprobado',
    soportesCount: 4
  },
  {
    id: 'LEG-2026-002',
    codigo: 'LEG-DIC-002',
    solicitante: 'Andrea Gutiérrez',
    concepto: 'Peajes y Combustible Flota DICORP',
    centroCosto: 'CC-DICORP-102',
    montoTotal: 1280000,
    fecha: '2026-08-22',
    estado: 'Pendiente',
    soportesCount: 6
  },
  {
    id: 'LEG-2026-003',
    codigo: 'LEG-DIC-003',
    solicitante: 'Julian Restrepo',
    concepto: 'Mantenimiento Preventivo Unidad 402',
    centroCosto: 'CC-DICORP-101',
    montoTotal: 890000,
    fecha: '2026-08-23',
    estado: 'Revision',
    soportesCount: 3
  },
  {
    id: 'LEG-2026-004',
    codigo: 'LEG-DIC-004',
    solicitante: 'Mariana Silva',
    concepto: 'Gastos de Representación Cliente Dicorp',
    centroCosto: 'CC-DICORP-103',
    montoTotal: 320000,
    fecha: '2026-08-24',
    estado: 'Aprobado',
    soportesCount: 2
  }
];

export const LegalizacionesDicorp: React.FC<LegalizacionesDicorpProps> = ({ user }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [records, setRecords] = useState<LegalizacionRecord[]>(INITIAL_RECORDS);
  const [showModal, setShowModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<LegalizacionRecord | null>(null);

  // Form state para nueva legalización
  const [formData, setFormData] = useState({
    solicitante: user?.name || '',
    concepto: '',
    centroCosto: 'CC-DICORP-101',
    montoTotal: '',
  });

  const filteredRecords = records.filter(rec => {
    const matchesSearch = rec.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          rec.solicitante.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          rec.concepto.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEstado = filterEstado === 'todos' || rec.estado.toLowerCase() === filterEstado.toLowerCase();
    return matchesSearch && matchesEstado;
  });

  const totalMonto = records.reduce((acc, curr) => acc + curr.montoTotal, 0);
  const aprobadosCount = records.filter(r => r.estado === 'Aprobado').length;
  const pendientesCount = records.filter(r => r.estado === 'Pendiente' || r.estado === 'Revision').length;

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.concepto || !formData.montoTotal) return;

    const newRecord: LegalizacionRecord = {
      id: `LEG-2026-00${records.length + 1}`,
      codigo: `LEG-DIC-00${records.length + 1}`,
      solicitante: formData.solicitante || 'Usuario Sistema',
      concepto: formData.concepto,
      centroCosto: formData.centroCosto,
      montoTotal: parseFloat(formData.montoTotal) || 0,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'Pendiente',
      soportesCount: 1
    };

    setRecords([newRecord, ...records]);
    setShowModal(false);
    setFormData({ solicitante: user?.name || '', concepto: '', centroCosto: 'CC-DICORP-101', montoTotal: '' });
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'Aprobado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3.5 h-3.5" />
            Aprobado
          </span>
        );
      case 'Pendiente':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" />
            Pendiente
          </span>
        );
      case 'Revision':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <RefreshCw className="w-3.5 h-3.5" />
            En Revisión
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            Rechazado
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {/* Header Sección */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20 text-white">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">GESTIÓN DICORP • MOD-15</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">PAG-58</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">Legalizaciones Dicorp</h1>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-2">
            Gestión, trazabilidad y control financiero de legalizaciones y viáticos de la división DICORP.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-cyan-500/25 transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nueva Legalización
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-slate-700 group-hover:text-cyan-500/30 transition-colors">
            <DollarSign className="w-12 h-12" />
          </div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Monto Total Legalizado</p>
          <h3 className="text-2xl font-bold text-white mt-2">
            ${totalMonto.toLocaleString('es-CO')}
          </h3>
          <p className="text-xs text-cyan-400 mt-2 flex items-center gap-1 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            Consolidado periodo activo
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-slate-700 group-hover:text-emerald-500/30 transition-colors">
            <CheckCircle className="w-12 h-12" />
          </div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Legalizaciones Aprobadas</p>
          <h3 className="text-2xl font-bold text-emerald-400 mt-2">{aprobadosCount}</h3>
          <p className="text-xs text-slate-400 mt-2">Verificadas y conciliadas</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-slate-700 group-hover:text-amber-500/30 transition-colors">
            <Clock className="w-12 h-12" />
          </div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pendientes de Aprobación</p>
          <h3 className="text-2xl font-bold text-amber-400 mt-2">{pendientesCount}</h3>
          <p className="text-xs text-slate-400 mt-2">En cola de auditoría</p>
        </div>
      </div>

      {/* Tabla y Filtros */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl">
        {/* Controles de Filtros */}
        <div className="p-4 border-b border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por código, concepto o solicitante..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">Estado:</span>
              <select
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-slate-900">Todos</option>
                <option value="aprobado" className="bg-slate-900">Aprobados</option>
                <option value="pendiente" className="bg-slate-900">Pendientes</option>
                <option value="revision" className="bg-slate-900">En Revisión</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800/80">
              <tr>
                <th className="px-6 py-4">Código / ID</th>
                <th className="px-6 py-4">Solicitante</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4">Centro Costo</th>
                <th className="px-6 py-4">Monto Total</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4 font-mono font-semibold text-cyan-400">{rec.codigo}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                          {rec.solicitante.charAt(0)}
                        </div>
                        <span className="font-medium text-white">{rec.solicitante}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate text-slate-300">{rec.concepto}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {rec.centroCosto}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">
                      ${rec.montoTotal.toLocaleString('es-CO')}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">{rec.fecha}</td>
                    <td className="px-6 py-4">{getStatusBadge(rec.estado)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setSelectedRecord(rec)}
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    No se encontraron registros de legalización DICORP.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nueva Legalización */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Nueva Legalización DICORP</h3>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNew} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Solicitante</label>
                <input
                  type="text"
                  value={formData.solicitante}
                  onChange={(e) => setFormData({ ...formData, solicitante: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Centro de Costo</label>
                <select
                  value={formData.centroCosto}
                  onChange={(e) => setFormData({ ...formData, centroCosto: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="CC-DICORP-101">CC-DICORP-101 (Operación Nacional)</option>
                  <option value="CC-DICORP-102">CC-DICORP-102 (Flota & Transporte)</option>
                  <option value="CC-DICORP-103">CC-DICORP-103 (Administrativo)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Concepto / Descripción</label>
                <textarea
                  value={formData.concepto}
                  onChange={(e) => setFormData({ ...formData, concepto: e.target.value })}
                  placeholder="Detalle el motivo de los gastos a legalizar..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Monto Total ($ COP)</label>
                <input
                  type="number"
                  value={formData.montoTotal}
                  onChange={(e) => setFormData({ ...formData, montoTotal: e.target.value })}
                  placeholder="Ej: 500000"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-cyan-500/20"
                >
                  Guardar Legalización
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LegalizacionesDicorp;
