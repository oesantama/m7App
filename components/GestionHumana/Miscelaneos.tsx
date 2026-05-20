import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { User } from '../../types';
import { Icons } from '../../constants';
import * as XLSX from 'xlsx';
import { hasPermission } from '../../utils/permissions';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MiscRecord {
  id: number;
  nombre: string;
  estado: string;
  usuario_control: string;
  fecha_control: string;
  area_id?: number;
  personal_id?: number;
  area_nombre?: string;
}

interface Estado {
  id: string;
  name: string;
}

interface Props {
  user: User;
}

// ─── Configuración de tabs ────────────────────────────────────────────────────

type TabKey =
  | 'horarios-laborales'
  | 'eps'
  | 'afp'
  | 'tipos-vivienda'
  | 'tipos-contrato'
  | 'ingresos-mensuales'
  | 'cargos'
  | 'tipos-sangre'
  | 'estados-civiles'
  | 'niveles-educativos'
  | 'areas'
  | 'jefes-inmediatos'
  | 'turnos-laborales'
  | 'personas-a-cargo'
  | 'convivientes'
  | 'frecuencia-deporte'
  | 'tipos-deporte'
  | 'usos-tiempo-libre';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'horarios-laborales', label: 'Horario Laboral' },
  { key: 'eps',                label: 'EPS' },
  { key: 'afp',                label: 'AFP' },
  { key: 'tipos-vivienda',     label: 'Tipo Vivienda' },
  { key: 'tipos-contrato',     label: 'Tipo Contrato' },
  { key: 'ingresos-mensuales', label: 'Ingresos Mensuales' },
  { key: 'cargos',             label: 'Cargos' },
  { key: 'tipos-sangre',       label: 'Tipo Sangre' },
  { key: 'estados-civiles',    label: 'Estados Civiles' },
  { key: 'niveles-educativos', label: 'Niveles Educativos' },
  { key: 'areas',              label: 'Áreas' },
  { key: 'jefes-inmediatos',   label: 'Jefes Inmediatos' },
  { key: 'turnos-laborales',   label: 'Turnos Laborales' },
  { key: 'personas-a-cargo',   label: 'Personas a Cargo' },
  { key: 'convivientes',       label: 'Con Quién Vive' },
  { key: 'frecuencia-deporte', label: 'Frecuencia Deporte' },
  { key: 'tipos-deporte',      label: 'Tipos de Deporte' },
  { key: 'usos-tiempo-libre',  label: 'Usos Tiempo Libre' },
];

// ─── Sub-componente CRUD reutilizable ─────────────────────────────────────────

import SearchableSelect from '../common/SearchableSelect';

interface CrudTabProps {
  tabla: TabKey;
  user: User;
  estados: Estado[];
}

const CrudTab: React.FC<CrudTabProps> = ({ tabla, user, estados }) => {
  const canCreate = hasPermission(user, 'MISCELANEOS_GH', 'create');
  const canEdit = hasPermission(user, 'MISCELANEOS_GH', 'edit');

  const [records, setRecords]   = useState<MiscRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(20);

  // Modal
  const [isOpen, setIsOpen]     = useState(false);
  const [editing, setEditing]   = useState<MiscRecord | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formEstado, setFormEstado] = useState('EST-01');
  const [formAreaId, setFormAreaId] = useState<number | null>(null);
  const [formPersonalId, setFormPersonalId] = useState<number | null>(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Maestros para selects especiales
  const [personal, setPersonal] = useState<any[]>([]);
  const [areas, setAreas]       = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getGhMiscelaneos(tabla);
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar registros');
    } finally {
      setLoading(false);
    }
  }, [tabla]);

  useEffect(() => { 
    fetchData(); 
    if (tabla === 'jefes-inmediatos') {
      api.getPersonal().then(data => setPersonal(data.filter((p: any) => p.es_jefe))).catch(() => {});
      api.getGhMiscelaneos('areas').then(setAreas).catch(() => {});
    }
  }, [fetchData, tabla]);

  const filtered = useMemo(() =>
    records.filter(r => r.nombre?.toLowerCase().includes(search.toLowerCase())),
    [records, search]
  );

  const totalPages = limit === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / limit));
  const paginated  = limit === 0 ? filtered : filtered.slice((page - 1) * limit, page * limit);

  const openCreate = () => {
    setEditing(null);
    setFormNombre('');
    setFormEstado('EST-01');
    setFormAreaId(null);
    setFormPersonalId(null);
    setIsOpen(true);
  };

  const openEdit = (r: MiscRecord) => {
    setEditing(r);
    setFormNombre(r.nombre);
    setFormEstado(r.estado || 'EST-01');
    setFormAreaId(r.area_id || null);
    setFormPersonalId(r.personal_id || null);
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!formNombre.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      await api.saveGhMiscelaneo(tabla, {
        id: editing?.id ?? undefined,
        nombre: formNombre.trim(),
        estado: formEstado,
        usuarioControl: user.name,
        area_id: formAreaId,
        personal_id: formPersonalId
      });
      toast.success(editing ? 'Registro actualizado' : 'Registro creado');
      setIsOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.deleteGhMiscelaneo(tabla, id);
      toast.success('Registro eliminado');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    } finally {
      setDeleting(null);
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        const newNames = data.slice(1).map(row => row[0]?.toString().trim()).filter(Boolean);
        if (newNames.length === 0) {
          toast.error('No se encontraron registros en el archivo');
          return;
        }

        setLoading(true);
        let imported = 0;
        let skipped = 0;

        for (const nombre of newNames) {
          const exists = records.some(r => r.nombre.toLowerCase() === nombre.toLowerCase());
          if (!exists) {
            await api.saveGhMiscelaneo(tabla, {
              nombre,
              estado: 'EST-01',
              usuarioControl: user.name
            });
            imported++;
          } else {
            skipped++;
          }
        }

        toast.success(`Importación finalizada: ${imported} creados, ${skipped} omitidos por duplicado`);
        fetchData();
      } catch (error) {
        console.error(error);
        toast.error('Error al procesar el archivo Excel');
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const estadoLabel = (id: string) =>
    estados.find(e => e.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="bg-slate-50 h-10 px-4 rounded-xl flex items-center gap-3 w-full sm:w-72 border border-slate-100 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10">
          <Icons.Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar..."
            className="bg-transparent border-none outline-none font-bold text-[11px] uppercase text-slate-700 placeholder:text-slate-300 w-full"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canCreate && (tabla === 'eps' || tabla === 'afp') && (
            <>
              <input 
                type="file" 
                id="excel-import" 
                className="hidden" 
                accept=".xlsx, .xls"
                onChange={handleImportExcel}
              />
              <button
                onClick={() => document.getElementById('excel-import')?.click()}
                className="flex items-center gap-2 h-10 px-6 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95 shrink-0"
              >
                <Icons.FileText className="w-3.5 h-3.5" />
                Importar Excel
              </button>
            </>
          )}
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 h-10 px-6 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 shrink-0"
            >
              <Icons.Plus className="w-3.5 h-3.5" />
              Nuevo Registro
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">ID</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre</th>
                {tabla === 'jefes-inmediatos' && <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Área</th>}
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Usuario Control</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha Control</th>
                <th className="text-right px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Cargando...</p>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Icons.ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Sin registros</p>
                  </td>
                </tr>
              ) : paginated.map((r, i) => (
                <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-5 py-3.5 text-[11px] font-black text-slate-400">{r.id}</td>
                  <td className="px-5 py-3.5 text-[11px] font-bold text-slate-700 uppercase">{r.nombre}</td>
                  {tabla === 'jefes-inmediatos' && <td className="px-5 py-3.5 text-[11px] font-bold text-indigo-600 uppercase">{r.area_nombre || '—'}</td>}
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      r.estado === 'EST-01'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${r.estado === 'EST-01' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {estadoLabel(r.estado)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-500">{r.usuario_control}</td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-500">
                    {r.fecha_control ? new Date(r.fecha_control).toLocaleDateString('es-CO') : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    {canEdit && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(r)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Editar"
                        >
                          <Icons.Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deleting === r.id}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40"
                          title="Eliminar"
                        >
                          {deleting === r.id
                            ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            : <Icons.Trash className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="px-5 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-slate-400">Mostrar</span>
              <select 
                value={limit} 
                onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                className="h-8 px-2 rounded-lg bg-slate-100 border-none text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value={5}>5</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={0}>TODOS</option>
              </select>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
              Total: <span className="text-emerald-600">{filtered.length}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-all shadow-sm"
            >
              <Icons.ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-4 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
              <span className="text-[10px] font-black text-slate-600 uppercase">
                Página <span className="text-emerald-600">{page}</span> de {totalPages}
              </span>
            </div>
            <button 
              disabled={page === totalPages || limit === 0}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-all shadow-sm"
            >
              <Icons.ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal crear / editar */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
            {/* Encabezado */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">
                  {editing ? 'Editar' : 'Nuevo'} Registro
                </p>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  {TABS.find(t => t.key === tabla)?.label}
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            {/* Formulario */}
            <div className="p-6 space-y-4">
              {tabla === 'jefes-inmediatos' ? (
                <>
                  <div className="space-y-1.5">
                    <SearchableSelect
                      label="Personal (Jefes) *"
                      options={personal}
                      value={formPersonalId || ''}
                      onChange={val => {
                        const p = personal.find(x => x.id === Number(val));
                        setFormPersonalId(val ? Number(val) : null);
                        if (p) setFormNombre(p.nombre);
                      }}
                      placeholder="Seleccione Jefe de Personal..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <SearchableSelect
                      label="Área *"
                      options={areas}
                      value={formAreaId || ''}
                      onChange={val => setFormAreaId(val ? Number(val) : null)}
                      placeholder="Seleccione Área..."
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nombre *</label>
                  <input
                    value={formNombre}
                    onChange={e => setFormNombre(e.target.value)}
                    placeholder="Ingrese el nombre..."
                    className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estado</label>
                <select
                  value={formEstado}
                  onChange={e => setFormEstado(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                >
                  {estados.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Acciones */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Guardando...</>
                  : <><Icons.Check className="w-3.5 h-3.5" />{editing ? 'Actualizar' : 'Guardar'}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const Miscelaneos: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('horarios-laborales');
  const [estados, setEstados]     = useState<Estado[]>([]);

  useEffect(() => {
    api.getEstados()
      .then((data: any[]) => setEstados(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <div className="p-6 md:p-8 space-y-6 min-h-full bg-slate-50">
      {/* Encabezado de módulo */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Icons.Users className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Gestión Humana</p>
          <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Misceláneos</h1>
        </div>
      </div>

      {/* Panel con tabs */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="px-6 border-b border-slate-100 overflow-x-auto">
          <div className="flex gap-0 min-w-max">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido del tab activo */}
        <div className="p-6">
          <CrudTab key={activeTab} tabla={activeTab} user={user} estados={estados} />
        </div>
      </div>
    </div>
  );
};

export default Miscelaneos;
