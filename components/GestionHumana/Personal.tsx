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

type TabKey = 'personal' | 'encuestas' | 'consultar' | 'maestros';

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
        const data = await api.getEncuestasResultados();
        setResultados(data);
      }
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchEncuestas]);

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
            <button onClick={() => setActiveTab('maestros')}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'maestros' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              Configuración Maestros
            </button>
          </div>
          
          {activeTab !== 'consultar' && activeTab !== 'maestros' && (
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
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${e.estado === 'COMPLETADO' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {e.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 uppercase">{e.usuario_control}</td>
                      <td className="px-4 py-3 text-right">
                        {e.estado !== 'COMPLETADO' && (
                          <button onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/publico/encuesta?cedula=${e.cedula}`);
                            toast.success('Link copiado');
                          }} className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                            <Icons.Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeTab === 'maestros' ? (
            <MaestrosCRUD />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-3">Colaborador / Cédula</th>
                    <th className="px-4 py-3">Cargo</th>
                    <th className="px-4 py-3">Fecha Realización</th>
                    <th className="px-4 py-3 text-right">Reporte</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] font-bold text-slate-600">
                  {resultados.map(r => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-black text-slate-900 uppercase">{r.nombre}</p>
                        <p className="text-[9px] text-slate-400">CC: {r.cedula}</p>
                      </td>
                      <td className="px-4 py-3 uppercase text-slate-500">{r.cargo || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(r.fecha_realizacion).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => api.downloadSurveyPDF(r.id)} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-all flex items-center gap-2 ml-auto">
                          <Icons.FileText className="w-4 h-4" />
                          <span className="text-[9px] font-black uppercase">Generar PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {resultados.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-slate-300 uppercase font-black text-[10px]">No hay encuestas completadas aún</td>
                    </tr>
                  )}
                </tbody>
              </table>
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
    </div>
  );
};

const MaestrosCRUD: React.FC = () => {
  const [activeTable, setActiveTable] = useState('turnos-laborales');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ id: null as any, nombre: '', estado: 'ACTIVO' });

  const tables = [
    { id: 'turnos-laborales', name: 'Turnos Laborales' },
    { id: 'personas-a-cargo', name: 'Personas a Cargo' },
    { id: 'convivientes', name: 'Con Quién Vive' },
    { id: 'frecuencia-deporte', name: 'Frecuencia Deporte' },
    { id: 'tipos-deporte', name: 'Tipos de Deporte' },
    { id: 'usos-tiempo-libre', name: 'Usos Tiempo Libre' },
    { id: 'eps', name: 'EPS' },
    { id: 'afp', name: 'AFP' },
    { id: 'cargos', name: 'Cargos' },
    { id: 'tipos-contrato', name: 'Tipos de Contrato' },
    { id: 'ingresos-mensuales', name: 'Niveles Salariales' },
    { id: 'tipos-sangre', name: 'Tipos de Sangre' },
    { id: 'estados-civiles', name: 'Estados Civiles' },
    { id: 'niveles-educativos', name: 'Niveles Educativos' }
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getGhMiscelaneos(activeTable);
      setData(res);
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [activeTable]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!form.nombre) return toast.error('El nombre es obligatorio');
    try {
      await api.saveGhMiscelaneo(activeTable, { ...form, estado: form.estado || 'ACTIVO' });
      toast.success('Guardado correctamente');
      setIsModalOpen(false);
      fetchData();
    } catch {
      toast.error('Error al guardar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tables.map(t => (
          <button key={t.id} onClick={() => setActiveTable(t.id)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTable === t.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
            {t.name}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Gestión de {tables.find(t => t.id === activeTable)?.name}</h3>
          <button onClick={() => { setForm({ id: null, nombre: '', estado: 'ACTIVO' }); setIsModalOpen(true); }} className="h-9 px-4 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-2">
            <Icons.Plus className="w-3.5 h-3.5" /> Agregar Nuevo
          </button>
        </div>

        <div className="p-6">
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-[11px] font-bold text-slate-600">
                {data.map((item: any) => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 uppercase">{item.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${item.estado === 'ACTIVO' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {item.estado || 'ACTIVO'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setForm(item); setIsModalOpen(true); }} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
                        <Icons.Edit className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 space-y-6">
            <h3 className="text-lg font-black text-slate-900 uppercase">Editar {tables.find(t => t.id === activeTable)?.name}</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Nombre</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value.toUpperCase() })} className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none">
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-xl border border-slate-100 text-[10px] font-black uppercase text-slate-400">Cancelar</button>
              <button onClick={handleSave} className="flex-[2] h-12 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase hover:bg-indigo-700 shadow-lg shadow-indigo-600/20">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Personal;
