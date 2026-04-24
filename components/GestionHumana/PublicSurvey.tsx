import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Toaster, toast } from 'sonner';
import { Check, Search, User, FileText, Heart, Home, Users, Activity, ShieldCheck, ClipboardCheck } from 'lucide-react';

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
    tipo_sangre: '',
    estado_civil: '',
    edad_rango: '',
    nivel_educativo: '',
    tipo_contrato: '',
    ingresos_mensuales: '',
    turno_laboral: '',
    tipo_vivienda: '',
    municipio_barrio: '',
    direccion: '',
    enfermedad_cronica: 'NO',
    viven_conmigo: 0,
    estrato: '',
    celular: '',
    principal_sustentador: 'NO',
    personas_a_cargo: 'Ninguna',
    discapacidad_familia: 'NO',
    con_quien_vive: '',
    cuantos_hijos: 0,
    hijos_menores_detalle: '',
    consumo_alcohol: 'No nunca',
    fuma: 'NO',
    practica_deporte: 'No practico deporte',
    tipo_deporte: '',
    uso_tiempo_libre: '',
    contacto_emergencia: '',
    consentimiento: false
  });

  // Maestros
  const [maestros, setMaestros] = useState<any>({
    sangre: [],
    civil: [],
    educativo: [],
    contrato: [],
    ingresos: [],
    vivienda: [],
    afp: [],
    eps: []
  });

  useEffect(() => {
    // Cargar maestros necesarios (deben ser públicos en el backend)
    const loadMaestros = async () => {
      try {
        const [sangre, civil, edu, con, ing, viv, afp, eps] = await Promise.all([
          api.getGhMiscelaneos('tipos-sangre'),
          api.getGhMiscelaneos('estados-civiles'),
          api.getGhMiscelaneos('niveles-educativos'),
          api.getGhMiscelaneos('tipos-contrato'),
          api.getGhMiscelaneos('ingresos-mensuales'),
          api.getGhMiscelaneos('tipos-vivienda'),
          api.getGhMiscelaneos('afp'),
          api.getGhMiscelaneos('eps')
        ]);
        setMaestros({ sangre, civil, educativo: edu, contrato: con, ingresos: ing, vivienda: viv, afp, eps });
      } catch (e) {}
    };

    // Extraer cedula de la URL si existe
    const params = new URLSearchParams(window.location.search);
    const c = params.get('cedula');
    if (c) {
      setCedula(c);
    }

    loadMaestros();
  }, []);

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
      await api.savePublicSurvey({ cedula, datos: form });
      setStep(6); // Finalizado
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

  const Select = ({ label, name, options, labelField = 'nombre' }: any) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{label}</label>
      <select
        value={form[name]}
        onChange={e => setForm({ ...form, [name]: e.target.value })}
        className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all"
      >
        <option value="">Seleccione...</option>
        {options.map((o: any) => (
          <option key={o.id || o} value={o.nombre || o}>{o[labelField] || o}</option>
        ))}
      </select>
    </div>
  );

  if (!isValidated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <Toaster position="top-center" richColors />
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 text-center animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <ClipboardCheck className="text-indigo-600" size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Encuesta Sociodemográfica</h2>
          <p className="text-slate-500 text-sm font-medium mb-10">Ingrese su cédula para validar su autorización</p>
          
          <div className="space-y-6">
            <div className="relative">
              <input
                value={cedula}
                onChange={e => setCedula(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleValidate()}
                placeholder="Número de Cédula"
                className="w-full h-16 px-6 rounded-3xl bg-slate-50 border-2 border-slate-100 text-lg font-black text-slate-800 placeholder:text-slate-300 outline-none focus:border-indigo-500 transition-all text-center"
              />
            </div>
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
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
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans overflow-x-hidden">
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
        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-8 md:p-12 animate-in slide-in-from-bottom-8 duration-700">
          
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
                <Select label="Tipo de Sangre" name="tipo_sangre" options={maestros.sangre} />
                <Select label="Estado Civil" name="estado_civil" options={maestros.civil} />
                <Select label="Edad" name="edad_rango" options={['18 - 27 años', '28 - 37 años', '38 - 47 años', '48 años o más']} />
                <Select label="Nivel Educativo" name="nivel_educativo" options={maestros.educativo} />
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
                <Select label="Tipo de Vivienda" name="tipo_vivienda" options={maestros.vivienda} />
                <Input label="Municipio / Barrio" name="municipio_barrio" placeholder="Ej: Medellín, Belén" />
                <div className="md:col-span-2">
                  <Input label="Dirección Exacta" name="direccion" placeholder="Calle, Número, Apto" />
                </div>
                <Select label="Estrato" name="estrato" options={['1', '2', '3', '4', '5', '6']} />
                <Input label="Número de Celular" name="celular" type="tel" />
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
                <Select label="¿Es el principal sustentador?" name="principal_sustentador" options={['SI', 'NO']} />
                <Select label="Personas a cargo" name="personas_a_cargo" options={['Ninguna', 'de 1 a 3 personas', 'de 4 a 6 personas', 'Mas de 6 personas']} />
                <Select label="¿Alguien con discapacidad en familia?" name="discapacidad_familia" options={['SI', 'NO']} />
                <Select label="¿Con quién vive actualmente?" name="con_quien_vive" options={['Cónyuge o pareja', 'Padres', 'Hijos/as', 'Convivientes', 'Vivo solo']} />
                <div className="space-y-6 md:col-span-2 pt-4">
                  <Input label="¿Cuántos hijos tiene?" name="cuantos_hijos" type="number" />
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Hijos menores de 18 (Nombre y Fecha Nacimiento)</label>
                    <textarea
                      value={form.hijos_menores_detalle}
                      onChange={e => setForm({ ...form, hijos_menores_detalle: e.target.value })}
                      className="w-full h-24 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-indigo-500 transition-all resize-none"
                      placeholder="Ingrese detalles..."
                    />
                  </div>
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
                <Select label="¿Sufre enfermedad crónica?" name="enfermedad_cronica" options={['SI', 'NO']} />
                <Select label="Consumo de Alcohol" name="consumo_alcohol" options={['Si con frecuencia', 'Si ocasionalmente', 'No nunca']} />
                <Select label="¿Fuma actualmente?" name="fuma" options={['SI', 'NO']} />
                <Select label="¿Practica algún deporte?" name="practica_deporte" options={['Si varias veces a la semana', 'Si una vez a la semana', 'Si ocasionalmente', 'No practico deporte']} />
                <Input label="¿Qué deporte o actividad física?" name="tipo_deporte" />
                <Input label="Uso del tiempo libre" name="uso_tiempo_libre" placeholder="Estudio, Labores, Recreación..." />
                <div className="md:col-span-2">
                  <Input label="Contacto de Emergencia (Nombre y Teléfono)" name="contacto_emergencia" placeholder="Nombre completo - 300..." />
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
