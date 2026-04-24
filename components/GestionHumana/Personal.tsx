import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { User } from '../../types';
import { Icons } from '../../constants';
import SearchableSelect from '../common/SearchableSelect';

interface PersonalRecord {
  id: number;
  nombre: string;
  cedula: string;
  cargo: string;
  eps: string;
  afp: string;
  celular_personal: string;
  correo_personal: string;
  celular_corporativo: string;
  correo_corporativo: string;
  jefe_inmediato_id: number | null;
  area_trabajo_id: number | null;
  es_jefe: boolean;
  fecha_ingreso: string;
  estado: string;
  jefe_nombre?: string;
  area_nombre?: string;
}

interface EncuestaRecord {
  id: number;
  cedula: string;
  fecha_activacion: string;
  estado: string;
  usuario_control: string;
}

interface MiscRecord {
  id: number;
  nombre: string;
}

interface Props {
  user: User;
}

type TabKey = 'personal' | 'encuestas' | 'consultar';

const Personal: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('personal');
  const [personal, setPersonal] = useState<PersonalRecord[]>([]);
  const [encuestas, setEncuestas] = useState<EncuestaRecord[]>([]);
  const [resultados, setResultados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  // Maestros para selects
  const [areas, setAreas] = useState<MiscRecord[]>([]);
  const [jefes, setJefes] = useState<MiscRecord[]>([]);
  const [cargos, setCargos] = useState<MiscRecord[]>([]);
  const [epsList, setEpsList] = useState<MiscRecord[]>([]);
  const [afpList, setAfpList] = useState<MiscRecord[]>([]);
  const [estados, setEstados] = useState<{id: string, name: string}[]>([]);
  const [confirmDeactivate, setConfirmDeactivate] = useState<number | null>(null);

  // Filtros Consultar
  const [filterDates, setFilterDates] = useState({ from: '', to: '' });
  const [filterSearch, setFilterSearch] = useState('');
  const [filterArea, setFilterArea] = useState<number | null>(null);

  // Modal Detalle Encuesta
  const [showDetail, setShowDetail] = useState<any | null>(null);

  // Modal Personal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalRecord | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState<Partial<PersonalRecord>>({
    nombre: '', cedula: '', cargo: '', eps: '', afp: '',
    celular_personal: '', correo_personal: '', celular_corporativo: '',
    correo_corporativo: '', jefe_inmediato_id: null, area_trabajo_id: null,
    es_jefe: false, fecha_ingreso: new Date().toISOString().slice(0, 10),
    estado: 'EST-01'
  });

  const fetchEncuestas = useCallback(async () => {
    try {
      const data = await api.getPersonalEncuestas();
      setEncuestas(data);
    } catch {
      toast.error('Error al cargar encuestas');
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'personal') {
        const data = await api.getPersonal();
        setPersonal(data);
      } else if (activeTab === 'encuestas') {
        await fetchEncuestas();
      } else if (activeTab === 'consultar') {
        const data = await api.getEncuestasResultados({
          from: filterDates.from,
          to: filterDates.to,
          search: filterSearch,
          areaId: filterArea || undefined
        });
        setResultados(data);
      }
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchEncuestas, filterDates, filterSearch, filterArea]);

  useEffect(() => {
    fetchData();
    api.getGhMiscelaneos('areas').then(setAreas).catch(() => {});
    api.getGhMiscelaneos('jefes-inmediatos').then(setJefes).catch(() => {});
    api.getGhMiscelaneos('cargos').then(setCargos).catch(() => {});
    api.getGhMiscelaneos('eps').then(setEpsList).catch(() => {});
    api.getGhMiscelaneos('afp').then(setAfpList).catch(() => {});
    api.getEstados().then(setEstados).catch(() => {});
  }, [fetchData]);

  const filteredPersonal = useMemo(() => 
    personal.filter(p => 
      p.nombre.toLowerCase().includes(search.toLowerCase()) || 
      p.cedula.includes(search)
    ), [personal, search]
  );

  const handleSave = async () => {
    if (!form.nombre || !form.cedula) {
      toast.error('Nombre y Cédula son obligatorios');
      return;
    }
    if (!form.es_jefe && !form.jefe_inmediato_id) {
      toast.error('El Jefe Inmediato es obligatorio si no es jefe');
      return;
    }
    setSaving(true);
    try {
      await api.savePersonal({ ...form, usuarioControl: user.name });
      toast.success(form.id ? 'Personal actualizado' : 'Personal creado');
      setIsModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    setConfirmDeactivate(null);
    setLoading(true);
    try {
      await api.deactivateEncuesta(id);
      toast.success('Encuesta inactivada');
      fetchEncuestas();
    } catch (e: any) {
      toast.error(e.message || 'Error al inactivar');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateNew = async () => {
    if (!form.cedula) {
      toast.error('La cédula es obligatoria');
      return;
    }
    setSaving(true);
    try {
      await api.activatePersonalEncuesta({ cedula: form.cedula, usuarioControl: user.name });
      toast.success('Encuesta activada exitosamente');
      setIsModalOpen(false);
      fetchEncuestas();
    } catch (e: any) {
      toast.error(e.message || 'Error al activar encuesta');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (p: PersonalRecord) => {
    setEditing(p);
    setForm({ ...p, fecha_ingreso: p.fecha_ingreso ? p.fecha_ingreso.slice(0, 10) : '' });
    setIsModalOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      nombre: '', cedula: '', cargo: '', eps: '', afp: '',
      celular_personal: '', correo_personal: '', celular_corporativo: '',
      correo_corporativo: '', jefe_inmediato_id: null, area_trabajo_id: null,
      es_jefe: false, fecha_ingreso: new Date().toISOString().slice(0, 10),
      estado: 'EST-01'
    });
    setIsModalOpen(true);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 min-h-full bg-slate-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Icons.UserCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Gestión Humana</p>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Personal & Encuestas</h1>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex gap-0">
            <button onClick={() => setActiveTab('personal')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'personal' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              Personal
            </button>
            <button onClick={() => setActiveTab('encuestas')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'encuestas' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              Asignar Encuesta Sociodemográfica
            </button>
            <button onClick={() => setActiveTab('consultar')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'consultar' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              Consultar Encuestas Sociodemográficas
            </button>
          </div>
          
          {activeTab !== 'consultar' && (
            <button onClick={openCreate} className="h-9 px-4 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-2">
              <Icons.Plus className="w-3.5 h-3.5" /> {activeTab === 'personal' ? 'Agregar Personal' : 'Activar Encuesta'}
            </button>
          )}
        </div>

        <div className="p-6">
          {activeTab === 'personal' ? (
            <div className="space-y-4">
              <div className="bg-slate-50 h-10 px-4 rounded-xl flex items-center gap-3 w-full sm:w-72 border border-slate-100">
                <Icons.Search className="w-3.5 h-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="BUSCAR POR NOMBRE O CÉDULA..." className="bg-transparent border-none outline-none font-bold text-[11px] uppercase text-slate-700 w-full" />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="px-4 py-3">Nombre / Cédula</th>
                      <th className="px-4 py-3">Cargo / Área</th>
                      <th className="px-4 py-3">Contacto</th>
                      <th className="px-4 py-3">Fecha Ingreso</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] font-bold text-slate-600">
                    {filteredPersonal.map(p => (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-black text-slate-900 uppercase">{p.nombre}</p>
                          <p className="text-[9px] text-slate-400">CC: {p.cedula}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="uppercase">{p.cargo || '—'}</p>
                          <p className="text-[9px] text-indigo-400 uppercase font-black">{p.area_nombre || 'Sin Área'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{p.celular_personal || '—'}</p>
                          <p className="text-[9px] text-slate-400 lowercase font-medium">{p.correo_personal || ''}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {p.fecha_ingreso ? new Date(p.fecha_ingreso).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${p.estado === 'EST-01' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                            {estados.find(e => e.id === p.estado)?.name || p.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => openEdit(p)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
                              <Icons.Edit className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'encuestas' ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-3">Cédula</th>
                    <th className="px-4 py-3">Fecha Activación</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Activado por</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] font-bold text-slate-600">
                  {encuestas.map(e => (
                    <tr key={e.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-black text-slate-900">{e.cedula}</td>
                      <td className="px-4 py-3">{new Date(e.fecha_activacion).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${e.estado === 'EST-05' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : e.estado === 'EST-01' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                          {estados.find(est => est.id === e.estado)?.name || e.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 uppercase">{e.usuario_control}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {e.estado === 'EST-01' && (
                            <button onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/publico/encuesta?id=${e.id}`);
                              toast.success('Link copiado');
                            }} className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200" title="Copiar Link">
                              <Icons.Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {e.estado === 'EST-01' && (
                            <button onClick={() => setConfirmDeactivate(e.id)} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100" title="Inactivar Encuesta">
                              <Icons.X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          ) : activeTab === 'consultar' && (
            <div className="space-y-4">
              {/* Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Colaborador / Cédula</label>
                  <div className="relative">
                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input 
                      value={filterSearch} 
                      onChange={e => setFilterSearch(e.target.value)}
                      placeholder="Buscar..." 
                      className="w-full h-10 pl-9 pr-4 rounded-xl bg-white border border-slate-200 text-[11px] outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Desde</label>
                  <input 
                    type="date"
                    value={filterDates.from}
                    onChange={e => setFilterDates({...filterDates, from: e.target.value})}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-[11px] outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Hasta</label>
                  <input 
                    type="date"
                    value={filterDates.to}
                    onChange={e => setFilterDates({...filterDates, to: e.target.value})}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-[11px] outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Área</label>
                    <select 
                      value={filterArea || ''} 
                      onChange={e => setFilterArea(e.target.value ? Number(e.target.value) : null)}
                      className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-[11px] font-bold uppercase outline-none focus:border-indigo-500"
                    >
                      <option value="">TODAS LAS ÁREAS</option>
                      {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </div>
                  <button 
                    onClick={() => api.exportEncuestasExcel({ from: filterDates.from, to: filterDates.to, search: filterSearch, areaId: filterArea || undefined })}
                    className="h-10 px-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm"
                    title="Exportar a Excel"
                  >
                    <Icons.Download className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase">Excel</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-slate-100 shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Colaborador / Cedula</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Cargo</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Área</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Fecha Realización</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Reporte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultados.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-all">
                        <td className="px-4 py-4">
                          <p className="text-[11px] font-black text-slate-900 uppercase leading-none">{r.nombre}</p>
                          <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">CC: {r.cedula}</p>
                        </td>
                        <td className="px-4 py-4 uppercase text-[10px] font-bold text-slate-600">{r.cargo || '—'}</td>
                        <td className="px-4 py-4 uppercase text-[10px] font-bold text-slate-600">{r.area_nombre || '—'}</td>
                        <td className="px-4 py-4 text-[10px] text-slate-500 font-medium">{new Date(r.fecha_realizacion).toLocaleString()}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={async () => {
                                try {
                                  const detail = await api.getEncuestaDetail(r.id);
                                  setShowDetail(detail);
                                } catch {
                                  toast.error('Error al cargar detalle');
                                }
                              }}
                              className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-2"
                            >
                              <Icons.Eye className="w-4 h-4" />
                              <span className="text-[9px] font-black uppercase">Ver Detalle</span>
                            </button>
                            <button onClick={() => api.downloadSurveyPDF(r.id)} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-all flex items-center gap-2">
                              <Icons.FileText className="w-4 h-4" />
                              <span className="text-[9px] font-black uppercase">PDF</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {resultados.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-16 text-center">
                          <Icons.Search className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                          <p className="text-slate-300 uppercase font-black text-[10px]">No se encontraron encuestas con estos filtros</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl my-8">
            <div className="flex items-center justify-between p-8 border-b border-slate-100">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 mb-1">
                  {activeTab === 'personal' ? 'Maestro de Personal' : 'Activación de Encuesta'}
                </p>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {activeTab === 'personal' ? (editing ? 'Editar Colaborador' : 'Nuevo Colaborador') : 'Nueva Activación'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all">
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {activeTab === 'personal' ? (
                <>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Nombre Completo *</label>
                    <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value.toUpperCase()})} className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Cédula *</label>
                    <input value={form.cedula} onChange={e => setForm({...form, cedula: e.target.value})} className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1.5">
                    <SearchableSelect label="Cargo" options={cargos.map(c => ({ id: c.nombre, nombre: c.nombre }))} value={form.cargo || ''} onChange={val => setForm({ ...form, cargo: String(val) })} placeholder="Seleccione..." />
                  </div>
                  <div className="space-y-1.5">
                    <SearchableSelect label="EPS" options={epsList.map(e => ({ id: e.nombre, nombre: e.nombre }))} value={form.eps || ''} onChange={val => setForm({ ...form, eps: String(val) })} placeholder="Seleccione..." />
                  </div>
                  <div className="space-y-1.5">
                    <SearchableSelect label="AFP" options={afpList.map(a => ({ id: a.nombre, nombre: a.nombre }))} value={form.afp || ''} onChange={val => setForm({ ...form, afp: String(val) })} placeholder="Seleccione..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Celular Personal</label>
                    <input value={form.celular_personal} onChange={e => setForm({...form, celular_personal: e.target.value})} className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Correo Personal</label>
                    <input value={form.correo_personal} onChange={e => setForm({...form, correo_personal: e.target.value.toLowerCase()})} className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1.5">
                    <SearchableSelect label="Area de Trabajo" options={areas} value={form.area_trabajo_id || ''} onChange={val => setForm({ ...form, area_trabajo_id: val ? Number(val) : null })} placeholder="Seleccione Área..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">¿Es Jefe?</label>
                    <div className="flex gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-200">
                      <button onClick={() => setForm({...form, es_jefe: true, jefe_inmediato_id: null})} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${form.es_jefe ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-100'}`}>Sí</button>
                      <button onClick={() => setForm({...form, es_jefe: false})} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${!form.es_jefe ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-100'}`}>No</button>
                    </div>
                  </div>
                  {!form.es_jefe && (
                    <div className="space-y-1.5">
                      <SearchableSelect label="Jefe Inmediato *" options={jefes} value={form.jefe_inmediato_id || ''} onChange={val => setForm({ ...form, jefe_inmediato_id: val ? Number(val) : null })} placeholder="Seleccione..." />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Estado</label>
                    <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase outline-none focus:border-indigo-500">
                      {estados.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div className="col-span-3 space-y-1.5">
                  <SearchableSelect
                    label="Seleccionar Colaborador *"
                    options={personal.map(p => ({ id: p.cedula, nombre: `${p.nombre} (${p.cedula})` }))}
                    value={form.cedula || ''}
                    onChange={val => setForm({ ...form, cedula: String(val) })}
                    placeholder="Busque por nombre o cédula..."
                  />
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-100 flex gap-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 h-14 rounded-[1.5rem] border-2 border-slate-100 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:bg-slate-50 transition-all">Cancelar</button>
              <button onClick={activeTab === 'personal' ? handleSave : handleActivateNew} disabled={saving} className="flex-[2] h-14 rounded-[1.5rem] bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-60 flex items-center justify-center gap-3">
                {saving ? <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" /> : <Icons.Check className="w-5 h-5" />}
                {activeTab === 'personal' ? (editing ? 'Actualizar Colaborador' : 'Guardar Colaborador') : 'Activar Encuesta'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Confirmación Inactivar */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
                <Icons.AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Confirmar Inactivación</h3>
                <p className="text-xs font-medium text-slate-500 mt-2">¿Está seguro que desea inactivar esta encuesta? Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="p-6 bg-slate-50 flex gap-3">
              <button onClick={() => setConfirmDeactivate(null)} className="flex-1 h-12 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">Cancelar</button>
              <button onClick={() => handleDeactivate(confirmDeactivate)} className="flex-1 h-12 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-500/20 active:scale-95">Inactivar</button>
            </div>
          </div>
        </div>
      )}
      {showDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl my-8 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-8 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                  <Icons.User className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 mb-0.5">Detalle de Encuesta</p>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">{showDetail.colaborador_nombre}</h3>
                  <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase">Cédula: {showDetail.cedula} · Área: {showDetail.area_nombre || '—'}</p>
                </div>
              </div>
              <button onClick={() => setShowDetail(null)} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-400 hover:bg-slate-50 transition-all">
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Perfil Corporativo */}
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                    1. Perfil Corporativo
                  </h4>
                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-3">
                    <DetailItem label="Cargo" value={showDetail.cargo_enc_nombre || showDetail.cargo_actual} />
                    <DetailItem label="Fecha Ingreso" value={showDetail.fecha_ingreso ? new Date(showDetail.fecha_ingreso).toLocaleDateString() : 'N/A'} />
                    <DetailItem label="Tipo Contrato" value={showDetail.contrato_nombre} />
                    <DetailItem label="Ingresos" value={showDetail.ingresos_nombre} />
                    <DetailItem label="AFP / EPS" value={`${showDetail.afp_nombre} / ${showDetail.eps_nombre}`} />
                  </div>
                </div>

                {/* Residencia */}
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                    2. Datos Personales
                  </h4>
                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-3">
                    <DetailItem label="Nacimiento" value={`${showDetail.mun_nac_nombre}, ${showDetail.dep_nac_nombre}`} />
                    <DetailItem label="Sangre / Civil" value={`${showDetail.sangre_nombre} · ${showDetail.civil_nombre}`} />
                    <DetailItem label="Nivel Educativo" value={showDetail.edu_nombre} />
                    <DetailItem label="Residencia" value={`${showDetail.mun_res_nombre}, ${showDetail.dep_res_nombre}`} />
                    <DetailItem label="Dirección" value={`${showDetail.direccion} (${showDetail.barrio})`} />
                  </div>
                </div>

                {/* Familiar */}
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                    3. Entorno Familiar
                  </h4>
                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-3">
                    <DetailItem label="Personas Hogar" value={showDetail.viven_conmigo} />
                    <DetailItem label="Sustentador" value={showDetail.principal_sustentador} />
                    <DetailItem label="Personas a Cargo" value={showDetail.pcargo_nombre} />
                    <DetailItem label="Vive con" value={showDetail.conviviente_nombre} />
                    <DetailItem label="Hijos" value={showDetail.cuantos_hijos} />
                  </div>
                </div>

                {/* Salud */}
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                    4. Salud y Estilo de Vida
                  </h4>
                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-3">
                    <DetailItem label="Enfermedad Crónica" value={showDetail.sufre_enfermedad} />
                    <DetailItem label="Alcohol / Fuma" value={`${showDetail.bebe_alcohol} · ${showDetail.fuma}`} />
                    <DetailItem label="Deporte" value={`${showDetail.practica_deporte} (${showDetail.tipo_deporte || 'N/A'})`} />
                    <DetailItem label="Tiempo Libre" value={showDetail.tiempo_libre_nombre || showDetail.uso_tiempo_libre_otros} />
                    <DetailItem label="Emergencia" value={`${showDetail.contacto_emergencia_nombre} (${showDetail.contacto_emergencia_telefono})`} />
                  </div>
                </div>

                {/* Hijos */}
                {showDetail.familia && showDetail.familia.length > 0 && (
                  <div className="col-span-1 lg:col-span-2 space-y-4">
                    <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                      5. Composición Familiar (Hijos / Otros)
                    </h4>
                    <div className="bg-slate-50 rounded-3xl overflow-hidden border border-slate-100">
                      <table className="w-full text-[10px]">
                        <thead className="bg-slate-200/50">
                          <tr>
                            <th className="px-6 py-3 font-black uppercase text-slate-500">Nombre</th>
                            <th className="px-6 py-3 font-black uppercase text-slate-500 text-center">Fecha Nacimiento</th>
                            <th className="px-6 py-3 font-black uppercase text-slate-500 text-right">Ocupación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {showDetail.familia.map((f: any, idx: number) => (
                            <tr key={idx} className="hover:bg-white transition-all">
                              <td className="px-6 py-3 font-black text-slate-900 uppercase">{f.nombre}</td>
                              <td className="px-6 py-3 text-center text-slate-600">{f.fecha_nacimiento ? new Date(f.fecha_nacimiento).toLocaleDateString() : '—'}</td>
                              <td className="px-6 py-3 text-right text-slate-600 uppercase font-bold">{f.ocupacion || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowDetail(null)} className="px-8 h-12 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DetailItem: React.FC<{ label: string, value: any }> = ({ label, value }) => (
  <div className="flex justify-between items-center group">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    <span className="text-[10px] font-black text-slate-700 uppercase group-hover:text-indigo-600 transition-colors">{value || '—'}</span>
  </div>
);

export default Personal;
