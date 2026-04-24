import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Toaster, toast } from 'sonner';
import { Check, Search, User, FileText, Heart, Home, Users, Activity, ShieldCheck, ClipboardCheck, Plus, Trash2, Briefcase } from 'lucide-react';

const Input = ({ label, name, value, onChange, type = 'text', placeholder = '' }: any) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500 transition-all"
    />
  </div>
);

const Select = ({ label, name, value, onChange, options, labelField = 'nombre', valueField = 'id' }: any) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500 transition-all"
    >
      <option value="">Seleccione...</option>
      {options.map((o: any) => (
        <option key={o[valueField] || o} value={o[valueField] || o}>{o[labelField] || o}</option>
      ))}
    </select>
  </div>
);

const PublicSurvey: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [cedula, setCedula] = useState('');
  const [personInfo, setPersonInfo] = useState<any>(null);

  // Datos de la encuesta
  const [form, setForm] = useState<any>({
    fecha_ingreso: '',
    cargo_id: '',
    municipio_nacimiento_id: '',
    fecha_nacimiento: '',
    tipo_sangre_id: '',
    estado_civil_id: '',
    nivel_educativo_id: '',
    tipo_contrato_id: '',
    ingresos_mensuales_id: '',
    afp_id: '',
    eps_id: '',
    turno_laboral_id: '',
    tipo_vivienda_id: '',
    estrato: '',
    departamento_res_id: '', // Auxiliar para filtrar municipios
    municipio_residencia_id: '',
    barrio: '',
    direccion: '',
    sufre_enfermedad: 'NO',
    viven_conmigo: 0,
    principal_sustentador: 'NO',
    personas_a_cargo_id: '',
    discapacidad_familia: 'NO',
    con_quien_vive_id: '',
    cuantos_hijos: 0,
    frecuencia_deporte_id: '',
    tipo_deporte_id: '',
    uso_tiempo_libre_id: '',
    uso_tiempo_libre_otros: '',
    contacto_emergencia_nombre: '',
    contacto_emergencia_telefono: '',
    consentimiento: false
  });

  const [familia, setFamilia] = useState<any[]>([]);

  // Maestros
  const [maestros, setMaestros] = useState<any>({
    sangre: [],
    civil: [],
    educativo: [],
    vivienda: [],
    departamentos: [],
    municipiosNac: [],
    municipiosRes: [],
    cargos: [],
    contratos: [],
    ingresos: [],
    afp: [],
    eps: [],
    personasCargo: [],
    convivientes: [],
    tiemposLibres: [],
    tiposDeporte: [],
    frecuenciaDeporte: [],
    turnos: []
  });

  useEffect(() => {
    const loadMaestros = async () => {
      try {
        const [sangre, civil, edu, viv, deptos, cargos, contratos, ingresos, afp, eps, pc, conv, tl, turnos, td, fd] = await Promise.all([
          api.getGhMiscelaneos('tipos-sangre'),
          api.getGhMiscelaneos('estados-civiles'),
          api.getGhMiscelaneos('niveles-educativos'),
          api.getGhMiscelaneos('tipos-vivienda'),
          api.getDepartamentos(),
          api.getGhMiscelaneos('cargos'),
          api.getGhMiscelaneos('tipos-contrato'),
          api.getGhMiscelaneos('ingresos-mensuales'),
          api.getGhMiscelaneos('afp'),
          api.getGhMiscelaneos('eps'),
          api.getGhMiscelaneos('personas-a-cargo'),
          api.getGhMiscelaneos('convivientes'),
          api.getGhMiscelaneos('usos-tiempo-libre'),
          api.getGhMiscelaneos('turnos-laborales'),
          api.getGhMiscelaneos('tipos-deporte'),
          api.getGhMiscelaneos('frecuencia-deporte')
        ]);
        setMaestros(prev => ({ 
          ...prev, sangre, civil, educativo: edu, vivienda: viv, departamentos: deptos,
          cargos, contratos, ingresos, afp, eps, personasCargo: pc, convivientes: conv,
          tiemposLibres: tl, turnos, tiposDeporte: td, frecuenciaDeporte: fd
        }));
      } catch (e) {}
    };

    const params = new URLSearchParams(window.location.search);
    const c = params.get('cedula');
    if (c) setCedula(c);
    loadMaestros();
  }, []);

  // Cargar municipios de residencia cuando cambia depto
  useEffect(() => {
    if (form.departamento_res_id) {
      api.getCiudades(form.departamento_res_id).then(res => setMaestros(prev => ({ ...prev, municipiosRes: res })));
    }
  }, [form.departamento_res_id]);

  // Para el lugar de nacimiento, cargaremos todos los municipios o dejaremos que busquen (simplificado por ahora con una carga inicial si se desea)
  // O podemos añadir un select de depto para nacimiento también
  const [depNacId, setDepNacId] = useState('');
  useEffect(() => {
    if (depNacId) {
      api.getCiudades(depNacId).then(res => setMaestros(prev => ({ ...prev, municipiosNac: res })));
    }
  }, [depNacId]);

  // Manejar cambio en número de hijos para agregar/quitar filas automáticamente
  useEffect(() => {
    const numHijos = parseInt(form.cuantos_hijos) || 0;
    setFamilia(prev => {
      const current = [...prev];
      if (current.length < numHijos) {
        // Agregar faltantes
        for (let i = current.length; i < numHijos; i++) {
          current.push({ nombre: '', fecha_nacimiento: '' });
        }
      } else if (current.length > numHijos) {
        // Quitar excedentes
        return current.slice(0, numHijos);
      }
      return current;
    });
  }, [form.cuantos_hijos]);

  const handleValidate = async () => {
    if (!cedula) return toast.error('Ingrese su número de cédula');
    setValidating(true);
    try {
      const res = await api.validateSurveyAccess(cedula);
      setPersonInfo(res);
      setIsValidated(true);
      toast.success(`Hola ${res.nombre}, puedes iniciar la encuesta.`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'No autorizado para realizar la encuesta');
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!form.consentimiento) return toast.error('Debe aceptar el consentimiento informado');
    setLoading(true);
    try {
      await api.savePublicSurvey({ cedula, data: form, familia });
      setStep(6);
      toast.success('Encuesta enviada exitosamente');
    } catch (e) {
      toast.error('Error al guardar la encuesta');
    } finally {
      setLoading(false);
    }
  };


  if (!isValidated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans text-slate-900">
        <Toaster position="top-center" richColors />
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 text-center animate-in zoom-in duration-500">
          <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <ClipboardCheck className="text-indigo-600" size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Encuesta Sociodemográfica</h2>
          <p className="text-slate-500 text-sm font-medium mb-10">Ingrese su cédula para validar su autorización</p>
          <div className="space-y-6">
            <input value={cedula} onChange={e => setCedula(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleValidate()} placeholder="Número de Cédula" className="w-full h-16 px-6 rounded-3xl bg-slate-50 border-2 border-slate-100 text-lg font-black text-slate-800 placeholder:text-slate-300 outline-none focus:border-indigo-500 transition-all text-center" />
            <button onClick={handleValidate} disabled={validating} className="w-full h-16 rounded-3xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest shadow-xl shadow-indigo-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3">
              {validating ? <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={20} strokeWidth={3} />}
              Validar Acceso
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-900">
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-12 text-center">
          <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <Check className="text-emerald-500" size={48} strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-4">¡Muchas Gracias!</h2>
          <p className="text-slate-500 font-medium">Tu encuesta sociodemográfica ha sido registrada exitosamente en el núcleo OrbitM7.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans overflow-x-hidden text-slate-900">
      <Toaster position="top-center" richColors />
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg mb-3">
              <Activity size={14} className="animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-widest">Módulo Gestión Humana</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">Encuesta Sociodemográfica</h1>
            <p className="text-slate-500 font-bold mt-2 flex items-center gap-2">
              Colaborador: <span className="text-indigo-600">{personInfo?.nombre}</span>
            </p>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${step >= s ? 'w-8 bg-indigo-600' : 'w-4 bg-slate-200'}`} />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-8 md:p-12">
          
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                  <Briefcase size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Perfil Laboral y Personal</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Datos básicos y vinculación</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input label="Fecha Ingreso" name="fecha_ingreso" type="date" value={form.fecha_ingreso} onChange={(v:any) => setForm((p:any) => ({...p, fecha_ingreso: v}))} />
                <Select label="Cargo" name="cargo_id" options={maestros.cargos} value={form.cargo_id} onChange={(v:any) => setForm((p:any) => ({...p, cargo_id: v}))} />
                <Select label="Tipo Contrato" name="tipo_contrato_id" options={maestros.contratos} value={form.tipo_contrato_id} onChange={(v:any) => setForm((p:any) => ({...p, tipo_contrato_id: v}))} />
                <Select label="Turno Laboral" name="turno_laboral_id" options={maestros.turnos} value={form.turno_laboral_id} onChange={(v:any) => setForm((p:any) => ({...p, turno_laboral_id: v}))} />
                <Select label="Ingresos Mensuales" name="ingresos_mensuales_id" options={maestros.ingresos} value={form.ingresos_mensuales_id} onChange={(v:any) => setForm((p:any) => ({...p, ingresos_mensuales_id: v}))} />
                <Select label="AFP" name="afp_id" options={maestros.afp} value={form.afp_id} onChange={(v:any) => setForm((p:any) => ({...p, afp_id: v}))} />
                <Select label="EPS" name="eps_id" options={maestros.eps} value={form.eps_id} onChange={(v:any) => setForm((p:any) => ({...p, eps_id: v}))} />
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <Select label="Depto Nacimiento" name="dep_nac" options={maestros.departamentos} value={form.dep_nac} onChange={(v:any) => {
                    setDepNacId(v);
                    setForm((prev:any) => ({ ...prev, dep_nac: v, municipio_nacimiento_id: '' }));
                  }} />
                  <div className={!depNacId ? 'opacity-50 pointer-events-none' : ''}>
                    <Select label="Ciudad Nacimiento" name="municipio_nacimiento_id" options={maestros.municipiosNac} value={form.municipio_nacimiento_id} onChange={(v:any) => setForm((p:any) => ({...p, municipio_nacimiento_id: v}))} />
                  </div>
                  <Input label="Fecha de Nacimiento" name="fecha_nacimiento" type="date" value={form.fecha_nacimiento} onChange={(v:any) => setForm((p:any) => ({...p, fecha_nacimiento: v}))} />
                  <Select label="Tipo de Sangre" name="tipo_sangre_id" options={maestros.sangre} value={form.tipo_sangre_id} onChange={(v:any) => setForm((p:any) => ({...p, tipo_sangre_id: v}))} />
                  <Select label="Estado Civil" name="estado_civil_id" options={maestros.civil} value={form.estado_civil_id} onChange={(v:any) => setForm((p:any) => ({...p, estado_civil_id: v}))} />
                  <Select label="Nivel Educativo" name="nivel_educativo_id" options={maestros.educativo} value={form.nivel_educativo_id} onChange={(v:any) => setForm((p:any) => ({...p, nivel_educativo_id: v}))} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-inner">
                  <Home size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Vivienda y Ubicación</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Residencia actual</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Select label="Tipo de Vivienda" name="tipo_vivienda_id" options={maestros.vivienda} value={form.tipo_vivienda_id} onChange={(v:any) => setForm((p:any) => ({...p, tipo_vivienda_id: v}))} />
                <Select label="Estrato" name="estrato" options={['1', '2', '3', '4', '5', '6']} value={form.estrato} onChange={(v:any) => setForm((p:any) => ({...p, estrato: v}))} />
                <Select label="Departamento Residencia" name="departamento_res_id" options={maestros.departamentos} value={form.departamento_res_id} onChange={(v:any) => setForm((prev:any) => ({ ...prev, departamento_res_id: v, municipio_residencia_id: '' }))} />
                <div className={!form.departamento_res_id ? 'opacity-50 pointer-events-none' : ''}>
                  <Select label="Ciudad / Municipio" name="municipio_residencia_id" options={maestros.municipiosRes} value={form.municipio_residencia_id} onChange={(v:any) => setForm((p:any) => ({...p, municipio_residencia_id: v}))} />
                </div>
                <Input label="Barrio" name="barrio" value={form.barrio} onChange={(v:any) => setForm((p:any) => ({...p, barrio: v}))} />
                <Input label="Dirección Exacta" name="direccion" value={form.direccion} onChange={(v:any) => setForm((p:any) => ({...p, direccion: v}))} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shadow-inner">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Círculo Familiar</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Composición del hogar</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input label="Total personas en su hogar" name="viven_conmigo" type="number" value={form.viven_conmigo} onChange={(v:any) => setForm((p:any) => ({...p, viven_conmigo: v}))} />
                <Select label="¿Es el principal sustentador?" name="principal_sustentador" options={['SI', 'NO']} value={form.principal_sustentador} onChange={(v:any) => setForm((p:any) => ({...p, principal_sustentador: v}))} />
                <Select label="Personas a cargo" name="personas_a_cargo_id" options={maestros.personasCargo} value={form.personas_a_cargo_id} onChange={(v:any) => setForm((p:any) => ({...p, personas_a_cargo_id: v}))} />
                <Select label="¿Hay personas con discapacidad en su familia?" name="discapacidad_familia" options={['SI', 'NO']} value={form.discapacidad_familia} onChange={(v:any) => setForm((p:any) => ({...p, discapacidad_familia: v}))} />
                <Select label="¿Con quién vive actualmente?" name="con_quien_vive_id" options={maestros.convivientes} value={form.con_quien_vive_id} onChange={(v:any) => setForm((p:any) => ({...p, con_quien_vive_id: v}))} />
                <Input label="¿Cuántos hijos tiene?" name="cuantos_hijos" type="number" value={form.cuantos_hijos} onChange={(v:any) => setForm((p:any) => ({...p, cuantos_hijos: v}))} />
              </div>
              <div className="space-y-4 pt-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Información de los Hijos</h4>
                </div>
                <div className="space-y-3">
                  {familia.map((fam, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-8 space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Nombre Completo del Hijo/a</label>
                        <input value={fam.nombre} onChange={e => { const n = [...familia]; n[idx].nombre = e.target.value; setFamilia(n); }} className="w-full h-10 px-4 rounded-xl bg-white border border-slate-200 text-[11px] font-bold outline-none" />
                      </div>
                      <div className="md:col-span-4 space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Fecha Nacimiento</label>
                        <input type="date" value={fam.fecha_nacimiento} onChange={e => { const n = [...familia]; n[idx].fecha_nacimiento = e.target.value; setFamilia(n); }} className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-[11px] font-bold outline-none" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 shadow-inner">
                  <Heart size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Salud y Estilo de Vida</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Bienestar y hábitos</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Select label="¿Sufre alguna enfermedad?" name="sufre_enfermedad" options={['SI', 'NO']} value={form.sufre_enfermedad} onChange={(v:any) => setForm((p:any) => ({...p, sufre_enfermedad: v}))} />
                <Select label="Consume bebidas alcohólicas" name="bebe_alcohol" options={['Si con frecuencia', 'Si ocasionalmente', 'No nunca']} value={form.bebe_alcohol} onChange={(v:any) => setForm((p:any) => ({...p, bebe_alcohol: v}))} />
                <Select label="Fuma actualmente" name="fuma" options={['SI', 'NO']} value={form.fuma} onChange={(v:any) => setForm((p:any) => ({...p, fuma: v}))} />
                <Select label="Practica algún deporte" name="frecuencia_deporte_id" options={maestros.frecuenciaDeporte} value={form.frecuencia_deporte_id} onChange={(v:any) => setForm((p:any) => ({...p, frecuencia_deporte_id: v}))} />
                <Select label="Tipo de deporte que realiza" name="tipo_deporte_id" options={maestros.tiposDeporte} value={form.tipo_deporte_id} onChange={(v:any) => setForm((p:any) => ({...p, tipo_deporte_id: v}))} />
                <Select label="Uso del tiempo libre" name="uso_tiempo_libre_id" options={maestros.tiemposLibres} value={form.uso_tiempo_libre_id} onChange={(v:any) => setForm((p:any) => ({...p, uso_tiempo_libre_id: v}))} />
                {form.uso_tiempo_libre_id === maestros.tiemposLibres.find((t:any) => t.nombre.toLowerCase().includes('otro'))?.id?.toString() && (
                  <Input label="Especifique otro uso" name="uso_tiempo_libre_otros" value={form.uso_tiempo_libre_otros} onChange={(v:any) => setForm((p:any) => ({...p, uso_tiempo_libre_otros: v}))} />
                )}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-indigo-50/30 rounded-3xl border border-indigo-100">
                  <div className="md:col-span-2"><h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">Contacto de Emergencia</h4></div>
                  <Input label="Nombre del contacto" name="contacto_emergencia_nombre" value={form.contacto_emergencia_nombre} onChange={(v:any) => setForm((p:any) => ({...p, contacto_emergencia_nombre: v}))} />
                  <Input label="Teléfono / Celular" name="contacto_emergencia_telefono" value={form.contacto_emergencia_telefono} onChange={(v:any) => setForm((p:any) => ({...p, contacto_emergencia_telefono: v}))} />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-2"><div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner"><ShieldCheck size={24} /></div>
              <div><h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Finalizar</h3><p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Consentimiento</p></div></div>
              <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Consentimiento Informado</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed text-justify mb-6">Ley 1581 de 2012: de protección de datos personales, autorizo el tratamiento de mis datos para fines relacionados con el sistema de gestión de seguridad y salud en el trabajo.</p>
                <label className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 cursor-pointer group hover:border-indigo-500 transition-all">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${form.consentimiento ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 group-hover:border-indigo-400'}`}>
                    {form.consentimiento && <Check size={14} className="text-white" strokeWidth={4} />}
                  </div>
                  <input type="checkbox" checked={form.consentimiento} onChange={e => setForm({ ...form, consentimiento: e.target.checked })} className="hidden" />
                  <span className="text-[11px] font-black uppercase text-slate-600 group-hover:text-indigo-600 transition-colors">He leído y acepto los términos</span>
                </label>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mt-12 pt-12 border-t border-slate-50">
            {step > 1 ? <button onClick={() => setStep(step - 1)} className="h-14 px-10 rounded-2xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Anterior</button> : <div />}
            {step < 5 ? (
              <button onClick={() => setStep(step + 1)} className="h-14 px-12 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Siguiente</button>
            ) : (
              <button onClick={handleSave} disabled={loading} className="h-14 px-12 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-3">
                {loading ? <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" /> : <ClipboardCheck size={18} />}
                Finalizar Encuesta
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicSurvey;
