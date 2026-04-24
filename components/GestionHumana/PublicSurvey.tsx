import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Toaster, toast } from 'sonner';
import { Check, Search, User, FileText, Heart, Home, Users, Activity, ShieldCheck, ClipboardCheck, Plus, Trash2 } from 'lucide-react';

const PublicSurvey: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [cedula, setCedula] = useState('');
  const [personInfo, setPersonInfo] = useState<any>(null);

  // Datos de la encuesta
  const [form, setForm] = useState<any>({
    lugar_nacimiento: '',
    fecha_nacimiento: '',
    tipo_sangre_id: '',
    estado_civil_id: '',
    nivel_educativo_id: '',
    estrato: '',
    tipo_vivienda_id: '',
    departamento_id: '',
    municipio_id: '',
    direccion: '',
    fuma: 'NO',
    bebe_alcohol: 'No nunca',
    practica_deporte: 'No practico deporte',
    frecuencia_deporte: '',
    uso_tiempo_libre_id: '',
    uso_tiempo_libre_otros: '',
    contacto_emergencia_nombre: '',
    contacto_emergencia_telefono: '',
    parentesco_emergencia_id: '',
    viven_conmigo: 0,
    personas_a_cargo_id: '',
    discapacidad_familia: 'NO',
    con_quien_vive_id: '',
    cuantos_hijos: 0,
    consentimiento: false
  });

  const [familia, setFamilia] = useState<any[]>([]);

  // Maestros
  const [maestros, setMaestros] = useState<any>({
    sangre: [],
    civil: [],
    educativo: [],
    vivienda: [],
    parentescos: [],
    tiemposLibres: [],
    departamentos: [],
    municipios: [],
    personasCargo: [],
    convivientes: []
  });

  useEffect(() => {
    const loadMaestros = async () => {
      try {
        const [sangre, civil, edu, viv, par, tl, deptos, pc, conv] = await Promise.all([
          api.getGhMiscelaneos('tipos-sangre'),
          api.getGhMiscelaneos('estados-civiles'),
          api.getGhMiscelaneos('niveles-educativos'),
          api.getGhMiscelaneos('tipos-vivienda'),
          api.getGhMiscelaneos('parentescos'),
          api.getGhMiscelaneos('tiempos-libres'),
          api.getDepartamentos(),
          api.getGhMiscelaneos('personas-a-cargo'),
          api.getGhMiscelaneos('convivientes')
        ]);
        setMaestros({ 
          sangre, civil, educativo: edu, vivienda: viv, 
          parentescos: par, tiemposLibres: tl, departamentos: deptos,
          municipios: [], personasCargo: pc, convivientes: conv
        });
      } catch (e) {}
    };

    const params = new URLSearchParams(window.location.search);
    const c = params.get('cedula');
    if (c) setCedula(c);

    loadMaestros();
  }, []);

  // Cargar municipios cuando cambia depto
  useEffect(() => {
    if (form.departamento_id) {
      api.getCiudades(form.departamento_id).then(res => {
        setMaestros(prev => ({ ...prev, municipios: res }));
      });
    } else {
      setMaestros(prev => ({ ...prev, municipios: [] }));
    }
  }, [form.departamento_id]);

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

  const addFamiliar = () => {
    setFamilia([...familia, { nombre: '', parentesco_id: '', fecha_nacimiento: '', ocupacion: '' }]);
  };

  const removeFamiliar = (index: number) => {
    setFamilia(familia.filter((_, i) => i !== index));
  };

  const updateFamiliar = (index: number, field: string, value: any) => {
    const newFam = [...familia];
    newFam[index] = { ...newFam[index], [field]: value };
    setFamilia(newFam);
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

  const Input = ({ label, name, type = 'text', placeholder = '' }: any) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
      <input
        type={type}
        value={form[name]}
        onChange={e => setForm({ ...form, [name]: e.target.value })}
        placeholder={placeholder}
        className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all"
      />
    </div>
  );

  const Select = ({ label, name, options, labelField = 'nombre', valueField = 'id' }: any) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
      <select
        value={form[name]}
        onChange={e => setForm({ ...form, [name]: e.target.value })}
        className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all"
      >
        <option value="">Seleccione...</option>
        {options.map((o: any) => (
          <option key={o[valueField] || o} value={o[valueField] || o}>{o[labelField] || o}</option>
        ))}
      </select>
    </div>
  );

  if (!isValidated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans text-slate-900">
        <Toaster position="top-center" richColors />
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 text-center">
          <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <ClipboardCheck className="text-indigo-600" size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Encuesta Sociodemográfica</h2>
          <p className="text-slate-500 text-sm font-medium mb-10">Ingrese su cédula para validar su autorización</p>
          <div className="space-y-6">
            <input
              value={cedula}
              onChange={e => setCedula(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleValidate()}
              placeholder="Número de Cédula"
              className="w-full h-16 px-6 rounded-3xl bg-slate-50 border-2 border-slate-100 text-lg font-black text-slate-800 placeholder:text-slate-300 outline-none focus:border-indigo-500 transition-all text-center"
            />
            <button
              onClick={handleValidate}
              disabled={validating}
              className="w-full h-16 rounded-3xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest shadow-xl shadow-indigo-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
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

        {/* Content */}
        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-8 md:p-12">
          
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Información Personal</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Identidad y Nacimiento</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input label="Lugar de Nacimiento" name="lugar_nacimiento" placeholder="Ciudad, Depto" />
                <Input label="Fecha de Nacimiento" name="fecha_nacimiento" type="date" />
                <Select label="Tipo de Sangre" name="tipo_sangre_id" options={maestros.sangre} />
                <Select label="Estado Civil" name="estado_civil_id" options={maestros.civil} />
                <Select label="Nivel Educativo" name="nivel_educativo_id" options={maestros.educativo} />
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
                <Select label="Tipo de Vivienda" name="tipo_vivienda_id" options={maestros.vivienda} />
                <Select label="Departamento" name="departamento_id" options={maestros.departamentos} />
                <Select label="Ciudad / Municipio" name="municipio_id" options={maestros.municipios} />
                <Select label="Estrato" name="estrato" options={['1', '2', '3', '4', '5', '6']} />
                <div className="md:col-span-2">
                  <Input label="Dirección Exacta" name="direccion" placeholder="Calle, Número, Apto" />
                </div>
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
                <Input label="¿Cuántas personas viven con usted?" name="viven_conmigo" type="number" />
                <Select label="Personas a cargo" name="personas_a_cargo_id" options={maestros.personasCargo} />
                <Select label="¿Alguien con discapacidad en familia?" name="discapacidad_familia" options={['SI', 'NO']} />
                <Select label="¿Con quién vive actualmente?" name="con_quien_vive_id" options={maestros.convivientes} />
              </div>
              <div className="space-y-4 pt-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Hijos y Familiares</h4>
                  <button onClick={addFamiliar} className="h-9 px-4 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 hover:bg-indigo-100 transition-all">
                    <Plus size={14} /> Agregar Familiar / Hijo
                  </button>
                </div>
                <div className="space-y-4">
                  {familia.map((fam, idx) => (
                    <div key={idx} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end animate-in zoom-in-95 duration-300">
                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Nombre Completo</label>
                        <input value={fam.nombre} onChange={e => updateFamiliar(idx, 'nombre', e.target.value)} className="w-full h-10 px-4 rounded-xl bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500" />
                      </div>
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Parentesco</label>
                        <select value={fam.parentesco_id} onChange={e => updateFamiliar(idx, 'parentesco_id', e.target.value)} className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500">
                          <option value="">Seleccione...</option>
                          {maestros.parentescos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Fecha Nacimiento</label>
                        <input type="date" value={fam.fecha_nacimiento} onChange={e => updateFamiliar(idx, 'fecha_nacimiento', e.target.value)} className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500" />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <button onClick={() => removeFamiliar(idx)} className="h-10 w-10 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {familia.length === 0 && (
                    <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-[2rem]">
                      <p className="text-slate-300 text-[10px] font-black uppercase tracking-widest">No hay familiares registrados</p>
                    </div>
                  )}
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
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Hábitos y Salud</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Estilo de vida</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Select label="Consumo de Alcohol" name="bebe_alcohol" options={['Si con frecuencia', 'Si ocasionalmente', 'No nunca']} />
                <Select label="¿Fuma actualmente?" name="fuma" options={['SI', 'NO']} />
                <Select label="¿Practica algún deporte?" name="practica_deporte" options={['Si varias veces a la semana', 'Si una vez a la semana', 'Si ocasionalmente', 'No practico deporte']} />
                <Input label="¿Qué deporte o frecuencia?" name="frecuencia_deporte" placeholder="Especifique..." />
                
                <Select label="Uso del tiempo libre" name="uso_tiempo_libre_id" options={maestros.tiemposLibres} />
                {form.uso_tiempo_libre_id === maestros.tiemposLibres.find((t:any) => t.nombre.toLowerCase().includes('otro'))?.id?.toString() && (
                  <Input label="Especifique otro uso" name="uso_tiempo_libre_otros" placeholder="Indique su actividad..." />
                )}
                
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-indigo-50/30 rounded-3xl border border-indigo-100">
                  <div className="md:col-span-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">Contacto de Emergencia</h4>
                  </div>
                  <Input label="Nombre Completo" name="contacto_emergencia_nombre" placeholder="Nombre del contacto..." />
                  <Input label="Teléfono / Celular" name="contacto_emergencia_telefono" placeholder="300 000 0000" />
                  <div className="md:col-span-2">
                    <Select label="Parentesco Emergencia" name="parentesco_emergencia_id" options={maestros.parentescos} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Finalizar</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Consentimiento y Envío</p>
                </div>
              </div>
              <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Consentimiento Informado</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed text-justify mb-6">
                  Ley 1581 de 2012: de protección de datos personales, es una ley que complementa la regulación vigente para la protección del derecho fundamental que tienen todas las personas naturales a autorizar la información personal que es almacenada en bases de datos o archivos, así como su posterior actualización y rectificación. Autorizo el tratamiento de mis datos para fines relacionados con el sistema de gestión de seguridad y salud en el trabajo.
                </p>
                <label className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 cursor-pointer group hover:border-indigo-500 transition-all">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${form.consentimiento ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 group-hover:border-indigo-400'}`}>
                    {form.consentimiento && <Check size={14} className="text-white" strokeWidth={4} />}
                  </div>
                  <input
                    type="checkbox"
                    checked={form.consentimiento}
                    onChange={e => setForm({ ...form, consentimiento: e.target.checked })}
                    className="hidden"
                  />
                  <span className="text-[11px] font-black uppercase text-slate-600 group-hover:text-indigo-600 transition-colors">He leído y acepto los términos</span>
                </label>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-12 pt-12 border-t border-slate-50">
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="h-14 px-10 rounded-2xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
              >
                Anterior
              </button>
            ) : <div />}

            {step < 5 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="h-14 px-12 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
              >
                Siguiente
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={loading}
                className="h-14 px-12 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3"
              >
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
