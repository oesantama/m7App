/**
 * PublicDocForm.tsx
 * Formulario público multi-paso para carga de documentos de Hojas de Vida.
 * Acceso sin auth, token en URL: /documentacion/:token
 * Mobile-first, Tailwind CSS.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

const API = `${import.meta.env.VITE_API_URL || '/api'}/public/hv`;

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface CampoFormulario {
    id: number;
    nombre_campo: string;
    label: string;
    tipo_input: string;
    obligatorio: boolean;
    placeholder?: string;
    opciones?: string[] | null;
    orden: number;
    seccion?: string;
}

interface TipoDocumento {
    id: number;
    nombre: string;
    nombre_archivo: string;
    descripcion?: string;
    obligatorio: boolean;
    acepta_vencimiento: boolean;
    orden: number;
    formato_plantilla_path?: string | null;
    formato_nombre_archivo?: string | null;
}

interface DocumentoSubido {
    id?: number;
    tipo_doc_req_id: number;
    nombre_archivo: string;
    estado: 'pendiente' | 'aprobado' | 'rechazado' | 'vencido';
    obs_rechazo?: string;
    fecha_vencimiento?: string;
}

interface SolicitudPublica {
    id: string;
    tipo_entidad: string;
    tipo_tercero: string;
    tipo_tercero_codigo: string;
    nombre_entidad: string;
    estado: string;
    datos_json: Record<string, any>;
    token_expira_at: string;
}

// ─── PASOS ────────────────────────────────────────────────────────────────────

const PASOS = ['Bienvenida', 'Datos', 'Documentos', 'Enviar'];

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const PublicDocForm: React.FC = () => {
    const token = window.location.pathname.split('/').pop() || '';

    const [loading, setLoading] = useState(true);
    const [expired, setExpired] = useState(false);
    const [completada, setCompletada] = useState(false);
    const [error, setError] = useState('');
    const [paso, setPaso] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const [solicitud, setSolicitud] = useState<SolicitudPublica | null>(null);
    const [campos, setCampos] = useState<CampoFormulario[]>([]);
    const [tiposDocs, setTiposDocs] = useState<TipoDocumento[]>([]);
    const [docsSubidos, setDocsSubidos] = useState<DocumentoSubido[]>([]);
    const [accesoId, setAccesoId] = useState<number | null>(null);

    const [formData, setFormData] = useState<Record<string, string>>({});
    const [archivos, setArchivos] = useState<Record<number, { file: File; vencimiento?: string }>>({});
    const [subiendoDoc, setSubiendoDoc] = useState<number | null>(null);
    const [guardandoDatos, setGuardandoDatos] = useState(false);
    const [catalogos, setCatalogos] = useState<Record<string, string[]>>({});
    const [campoErrors, setCampoErrors] = useState<Set<string>>(new Set());
    const [docErrors, setDocErrors] = useState<Record<number, 'falta_documento' | 'falta_fecha'>>({});

    // Auto-guardado de datos del formulario
    const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        cargarSolicitud();
        fetch(`${API}/catalogos`)
            .then(r => r.json())
            .then(d => setCatalogos(d))
            .catch(() => {});
    }, [token]);

    const cargarSolicitud = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/${token}`);
            const data = await res.json();

            if (res.status === 410) { setExpired(true); return; }
            if (res.status === 409) { setCompletada(true); return; }
            if (!res.ok) { setError(data.error || 'Error al cargar el formulario'); return; }

            setSolicitud(data.solicitud);
            setCampos(data.campos_formulario);
            setTiposDocs(data.documentos_requeridos);
            setDocsSubidos(data.documentos_subidos || []);
            setAccesoId(data.acceso_id);
            // Pre-llenar con datos ya conocidos de la solicitud, luego sobrescribir con guardados
            const prefill: Record<string, string> = {};
            if (data.solicitud.nombre_entidad) prefill['nombre_completo'] = data.solicitud.nombre_entidad;
            if (data.solicitud.entidad_id) prefill['documento_numero'] = data.solicitud.entidad_id;
            const guardados = (data.solicitud.datos_json && Object.keys(data.solicitud.datos_json).length > 0)
                ? data.solicitud.datos_json
                : {};
            setFormData({ ...prefill, ...guardados });
        } catch {
            setError('Error de conexión. Verifique su internet e intente nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    const autoGuardarDatos = useCallback((datos: Record<string, string>) => {
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        autoSaveRef.current = setTimeout(async () => {
            setGuardandoDatos(true);
            try {
                await fetch(`${API}/${token}/datos`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ datos, acceso_id: accesoId }),
                });
            } catch { /* silencioso */ }
            finally { setGuardandoDatos(false); }
        }, 1500);
    }, [token, accesoId]);

    const handleCampoChange = (clave: string, valor: string) => {
        const nuevos = { ...formData, [clave]: valor };
        setFormData(nuevos);
        autoGuardarDatos(nuevos);
        if (campoErrors.has(clave)) {
            setCampoErrors(prev => { const s = new Set(prev); s.delete(clave); return s; });
        }
    };

    const validarPaso1 = () => {
        const errors = new Set<string>();
        for (const c of campos.filter(c => c.obligatorio)) {
            if (!formData[c.nombre_campo]?.trim()) errors.add(c.nombre_campo);
        }
        if (errors.size > 0) {
            setCampoErrors(errors);
            const primero = campos.find(c => errors.has(c.nombre_campo));
            if (primero) {
                setTimeout(() => {
                    const el = document.getElementById(`campo-${primero.nombre_campo}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (el as HTMLInputElement | null)?.focus();
                }, 80);
            }
            toast.error(`${errors.size} campo${errors.size > 1 ? 's' : ''} obligatorio${errors.size > 1 ? 's' : ''} sin completar`);
            return false;
        }
        setCampoErrors(new Set());
        return true;
    };

    const subirArchivo = async (tipoDocId: number, file: File, vencimiento?: string) => {
        setSubiendoDoc(tipoDocId);
        const fd = new FormData();
        fd.append('archivo', file);
        fd.append('tipo_doc_req_id', String(tipoDocId));
        const tipoDoc = tiposDocs.find(d => d.id === tipoDocId);
        fd.append('nombre_doc', tipoDoc?.nombre || file.name);
        fd.append('nombre_archivo', tipoDoc?.nombre_archivo || file.name);
        if (vencimiento) fd.append('fecha_vencimiento', vencimiento);

        try {
            const res = await fetch(`${API}/${token}/documento`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Error al subir documento'); return; }

            toast.success(`${tipoDoc?.nombre || 'Documento'} subido correctamente`);
            setDocsSubidos(prev => {
                const filtered = prev.filter(d => d.tipo_doc_req_id !== tipoDocId);
                return [...filtered, {
                    id: data.documento_id,
                    tipo_doc_req_id: tipoDocId,
                    nombre_archivo: data.nombre_archivo,
                    estado: 'pendiente',
                    fecha_vencimiento: vencimiento || undefined,
                }];
            });
        } catch {
            toast.error('Error de conexión al subir el archivo');
        } finally {
            setSubiendoDoc(null);
        }
    };

    const handleArchivoChange = async (tipoDocId: number, file: File, vencimiento?: string) => {
        setArchivos(prev => ({ ...prev, [tipoDocId]: { file, vencimiento } }));
        await subirArchivo(tipoDocId, file, vencimiento);
    };

    const handleFechaVencimientoChange = async (docId: number, fecha: string) => {
        try {
            await fetch(`${API}/${token}/documento/${docId}/vencimiento`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fecha_vencimiento: fecha }),
            });
            setDocsSubidos(prev => prev.map(d => d.id === docId ? { ...d, fecha_vencimiento: fecha } : d));
        } catch { /* silencioso */ }
    };

    const validarPaso2 = () => {
        const errors: Record<number, 'falta_documento' | 'falta_fecha'> = {};
        for (const d of tiposDocs.filter(t => t.obligatorio)) {
            const subido = docsSubidos.find(s => s.tipo_doc_req_id === d.id);
            if (!subido) errors[d.id] = 'falta_documento';
            else if (d.acepta_vencimiento && !subido.fecha_vencimiento) errors[d.id] = 'falta_fecha';
        }
        if (Object.keys(errors).length > 0) {
            setDocErrors(errors);
            const primerId = Number(Object.keys(errors)[0]);
            setTimeout(() => {
                document.getElementById(`doc-${primerId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
            const n = Object.keys(errors).length;
            toast.error(`${n} documento${n > 1 ? 's' : ''} pendiente${n > 1 ? 's' : ''} — revise los marcados en rojo`);
            return false;
        }
        setDocErrors({});
        return true;
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const res = await fetch(`${API}/${token}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acceso_id: accesoId }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || 'Error al enviar'); return; }
            setSuccess(true);
        } catch {
            toast.error('Error de conexión. Intente nuevamente.');
        } finally {
            setSubmitting(false);
        }
    };

    // ─── PANTALLAS ESPECIALES ──────────────────────────────────────────────────

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Cargando formulario...</p>
            </div>
        </div>
    );

    if (expired) return (
        <PantallaInfo
            tipo="expired"
            titulo="Link expirado"
            mensaje="Este enlace ya no es válido. Comuníquese con el área de operaciones para solicitar un nuevo link."
        />
    );

    if (completada) return (
        <PantallaInfo
            tipo="success"
            titulo="Solicitud ya completada"
            mensaje="Esta solicitud ya fue enviada y está siendo revisada por nuestro equipo."
        />
    );

    if (error) return (
        <PantallaInfo
            tipo="error"
            titulo="Error"
            mensaje={error}
        />
    );

    if (success) return (
        <PantallaInfo
            tipo="success"
            titulo="¡Información enviada!"
            mensaje="Sus documentos fueron enviados correctamente. Un funcionario de Milla 7 revisará su información y le notificará el resultado."
        />
    );

    const esVehiculo = solicitud?.tipo_entidad === 'vehiculo';

    // ─── RENDER PRINCIPAL ──────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b shadow-sm sticky top-0 z-10">
                <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
                    <img src="/logo-encuesta.png" alt="Milla 7" className="h-8 object-contain" />
                    <div>
                        <div className="text-sm font-semibold text-gray-800">Documentación</div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">
                            {solicitud?.nombre_entidad}
                        </div>
                    </div>
                    {guardandoDatos && (
                        <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse inline-block" />
                            Guardando...
                        </span>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="bg-white border-b">
                <div className="max-w-lg mx-auto px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                        {PASOS.map((p, i) => (
                            <div key={p} className="flex items-center gap-1">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                                    ${i < paso ? 'bg-green-500 text-white'
                                    : i === paso ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-500'}`}>
                                    {i < paso ? '✓' : i + 1}
                                </div>
                                {i < PASOS.length - 1 && (
                                    <div className={`h-0.5 w-8 sm:w-16 ${i < paso ? 'bg-green-500' : 'bg-gray-200'}`} />
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-center text-gray-500">
                        Paso {paso + 1} de {PASOS.length}: <strong>{PASOS[paso]}</strong>
                    </p>
                </div>
            </div>

            {/* Contenido */}
            <div className="max-w-lg mx-auto px-4 py-6 pb-32">

                {/* PASO 0: Bienvenida */}
                {paso === 0 && (
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 mb-2">
                            Bienvenido al proceso de documentación
                        </h1>
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                            <p className="text-sm text-blue-800 font-medium mb-1">
                                {esVehiculo ? '🚗 Vehículo' : `👤 ${solicitud?.tipo_tercero || 'Tercero'}`}
                            </p>
                            <p className="text-base font-bold text-blue-900">{solicitud?.nombre_entidad}</p>
                        </div>
                        <div className="space-y-3 mb-6">
                            <InfoItem icon="📋" texto="Complete sus datos personales en el siguiente paso." />
                            <InfoItem icon="📎" texto="Suba los documentos requeridos en formato PDF, JPG o PNG." />
                            <InfoItem icon="💡" texto="Puede cerrar y volver a este link cuando quiera. Su información se guarda automáticamente." />
                            <InfoItem icon="⏰" texto={`Este link expira el ${new Date(solicitud?.token_expira_at || '').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}.`} />
                        </div>
                        {tiposDocs.some(d => d.formato_plantilla_path) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                                <p className="text-sm font-semibold text-amber-800 mb-2">📄 Formatos para diligenciar</p>
                                <p className="text-xs text-amber-700 mb-3">
                                    Algunos documentos requieren que descargue un formato, lo imprima, firme, ponga su huella y lo escanée para subir.
                                </p>
                                <div className="space-y-2">
                                    {tiposDocs.filter(d => d.formato_plantilla_path).map(d => (
                                        <a
                                            key={d.id}
                                            href={`${API}/formato/${d.id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-2 text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 text-amber-900 hover:bg-amber-100 transition-colors"
                                        >
                                            <span className="text-base">⬇️</span>
                                            <span className="font-medium">{d.nombre}</span>
                                            <span className="ml-auto text-amber-600">Descargar</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setPaso(1)}
                            className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg"
                        >
                            Comenzar →
                        </button>
                    </div>
                )}

                {/* PASO 1: Datos del formulario */}
                {paso === 1 && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Datos</h2>
                        {campos.length === 0 ? (
                            <div className="bg-gray-100 rounded-xl p-6 text-center text-gray-500">
                                <p>No hay campos de formulario configurados para este tipo.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {campos.map(campo => (
                                    <CampoInput
                                        key={campo.id}
                                        campo={campo}
                                        valor={formData[campo.nombre_campo] || ''}
                                        onChange={val => handleCampoChange(campo.nombre_campo, val)}
                                        opciones={catalogos[CAMPO_CATALOGO[campo.nombre_campo] || '']}
                                        error={campoErrors.has(campo.nombre_campo)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* PASO 2: Documentos */}
                {paso === 2 && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-1">Documentos</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Suba cada documento en PDF, JPG o PNG (máx. 15MB).
                        </p>
                        <div className="space-y-4">
                            {tiposDocs.map(doc => {
                                const subido = docsSubidos.find(d => d.tipo_doc_req_id === doc.id);
                                const subiendo = subiendoDoc === doc.id;
                                return (
                                    <DocUploadCard
                                        key={doc.id}
                                        doc={doc}
                                        subido={subido}
                                        subiendo={subiendo}
                                        onChange={(file, venc) => {
                                            setDocErrors(prev => { const e = { ...prev }; delete e[doc.id]; return e; });
                                            handleArchivoChange(doc.id, file, venc);
                                        }}
                                        onFechaChange={(docId, fecha) => {
                                            setDocErrors(prev => { const e = { ...prev }; delete e[doc.id]; return e; });
                                            handleFechaVencimientoChange(docId, fecha);
                                        }}
                                        error={docErrors[doc.id]}
                                    />
                                );
                            })}
                            {tiposDocs.length === 0 && (
                                <div className="bg-gray-100 rounded-xl p-6 text-center text-gray-500">
                                    No hay documentos configurados para este tipo.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* PASO 3: Confirmación */}
                {paso === 3 && (
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Resumen</h2>

                        {/* Resumen datos */}
                        {campos.length > 0 && (
                            <div className="bg-white border rounded-xl p-4 mb-4">
                                <h3 className="font-semibold text-gray-700 mb-3">📋 Datos ingresados</h3>
                                <div className="space-y-2">
                                    {campos.map(c => (
                                        <div key={c.id} className="flex justify-between text-sm">
                                            <span className="text-gray-500">{c.label}</span>
                                            <span className="font-medium text-gray-800 text-right max-w-[55%] break-words">
                                                {formData[c.nombre_campo] || <span className="text-gray-300 italic">—</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Resumen documentos */}
                        <div className="bg-white border rounded-xl p-4 mb-6">
                            <h3 className="font-semibold text-gray-700 mb-3">📎 Documentos</h3>
                            <div className="space-y-2">
                                {tiposDocs.map(d => {
                                    const sub = docsSubidos.find(s => s.tipo_doc_req_id === d.id);
                                    return (
                                        <div key={d.id} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{d.nombre}</span>
                                            {sub
                                                ? <span className="text-green-600 font-medium">✓ Subido</span>
                                                : d.obligatorio
                                                    ? <span className="text-red-500 font-medium">⚠ Pendiente</span>
                                                    : <span className="text-gray-400">Opcional</span>
                                            }
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                            <p className="text-sm text-yellow-800">
                                Al enviar, su información será revisada por el equipo de Milla 7 S.A.S.
                                Le notificaremos si hay alguna corrección pendiente.
                            </p>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full bg-green-600 text-white py-4 rounded-xl font-semibold text-lg disabled:opacity-60"
                        >
                            {submitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Enviando...
                                </span>
                            ) : 'Enviar documentación ✓'}
                        </button>
                    </div>
                )}
            </div>

            {/* Footer navegación */}
            {paso > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
                    <div className="max-w-lg mx-auto px-4 py-4 flex gap-3">
                        <button
                            onClick={() => setPaso(p => p - 1)}
                            className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl font-medium"
                        >
                            ← Atrás
                        </button>
                        {paso < 3 && (
                            <button
                                onClick={() => {
                                    if (paso === 1 && !validarPaso1()) return;
                                    if (paso === 2 && !validarPaso2()) return;
                                    setPaso(p => p + 1);
                                }}
                                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold"
                            >
                                {paso === 2 ? 'Revisar →' : 'Siguiente →'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── SUBCOMPONENTES ───────────────────────────────────────────────────────────

const PantallaInfo: React.FC<{ tipo: 'success' | 'expired' | 'error'; titulo: string; mensaje: string }> = ({ tipo, titulo, mensaje }) => {
    const icon = tipo === 'success' ? '✅' : tipo === 'expired' ? '⏰' : '❌';
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
                <div className="text-5xl mb-4">{icon}</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{titulo}</h2>
                <p className="text-gray-600 text-sm">{mensaje}</p>
                <div className="mt-6">
                    <img src="/logo-encuesta.png" alt="Milla 7" className="h-8 mx-auto opacity-50 object-contain" />
                </div>
            </div>
        </div>
    );
};

const InfoItem: React.FC<{ icon: string; texto: string }> = ({ icon, texto }) => (
    <div className="flex gap-3 text-sm text-gray-700">
        <span className="text-lg leading-none mt-0.5">{icon}</span>
        <span>{texto}</span>
    </div>
);

const SearchableSelect: React.FC<{
    opciones: string[];
    valor: string;
    onChange: (v: string) => void;
    placeholder?: string;
}> = ({ opciones, valor, onChange, placeholder }) => {
    const [query, setQuery] = useState('');
    const [abierto, setAbierto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const filtradas = query.length > 0
        ? opciones.filter(o => o.toLowerCase().includes(query.toLowerCase()))
        : opciones;

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <input
                type="text"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={abierto ? query : valor}
                placeholder={valor || placeholder || 'Buscar...'}
                onFocus={() => { setAbierto(true); setQuery(''); }}
                onChange={e => setQuery(e.target.value)}
            />
            {abierto && filtradas.length > 0 && (
                <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl mt-1 max-h-48 overflow-y-auto shadow-lg">
                    {filtradas.slice(0, 50).map(op => (
                        <li
                            key={op}
                            className="px-4 py-2.5 text-sm hover:bg-blue-50 cursor-pointer"
                            onMouseDown={() => { onChange(op); setAbierto(false); setQuery(''); }}
                        >
                            {op}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const CAMPO_CATALOGO: Record<string, string> = {
    eps_nombre: 'eps',
    arl_nombre: 'arl',
    ciudad: 'ciudades',
    ciudad_residencia: 'ciudades',
    afp_nombre: 'afp',
    pension_nombre: 'afp',
};

const CampoInput: React.FC<{
    campo: CampoFormulario;
    valor: string;
    onChange: (v: string) => void;
    opciones?: string[];
    error?: boolean;
}> = ({ campo, valor, onChange, opciones, error }) => {
    const base = `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
        error ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'
    }`;
    const tieneCatalogo = opciones && opciones.length > 0;
    return (
        <div id={`campo-${campo.nombre_campo}`}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                {campo.label}
                {campo.obligatorio && <span className="text-red-500 ml-1">*</span>}
            </label>
            {tieneCatalogo ? (
                <SearchableSelect
                    opciones={opciones!}
                    valor={valor}
                    onChange={onChange}
                    placeholder={campo.placeholder}
                />
            ) : campo.tipo_input === 'select' && campo.opciones ? (
                <select className={base} value={valor} onChange={e => onChange(e.target.value)}>
                    <option value="">Seleccione...</option>
                    {campo.opciones.map(op => (
                        <option key={op} value={op}>{op}</option>
                    ))}
                </select>
            ) : campo.tipo_input === 'textarea' ? (
                <textarea
                    className={base}
                    rows={3}
                    placeholder={campo.placeholder}
                    value={valor}
                    onChange={e => onChange(e.target.value)}
                />
            ) : (
                <input
                    className={base}
                    type={campo.tipo_input || 'text'}
                    placeholder={campo.placeholder}
                    value={valor}
                    onChange={e => onChange(e.target.value)}
                />
            )}
            {error && (
                <p className="mt-1 text-xs text-red-600 font-medium">⚠ Este campo es obligatorio</p>
            )}
        </div>
    );
};

const DocUploadCard: React.FC<{
    doc: TipoDocumento;
    subido?: DocumentoSubido;
    subiendo: boolean;
    onChange: (file: File, vencimiento?: string) => void;
    onFechaChange?: (docId: number, fecha: string) => void;
    error?: 'falta_documento' | 'falta_fecha';
}> = ({ doc, subido, subiendo, onChange, onFechaChange, error }) => {
    const [vencimiento, setVencimiento] = useState(
        subido?.fecha_vencimiento ? subido.fecha_vencimiento.split('T')[0] : ''
    );
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (subido?.fecha_vencimiento) {
            setVencimiento(subido.fecha_vencimiento.split('T')[0]);
        }
    }, [subido?.fecha_vencimiento]);

    const estadoColor = error ? 'border-red-500 bg-red-50'
        : !subido ? 'border-gray-300 bg-white'
        : subido.estado === 'aprobado' ? 'border-green-400 bg-green-50'
        : subido.estado === 'rechazado' ? 'border-red-400 bg-red-50'
        : 'border-blue-400 bg-blue-50';

    return (
        <div id={`doc-${doc.id}`} className={`border-2 rounded-xl p-4 transition-colors ${estadoColor}`}>
            {doc.formato_plantilla_path && (
                <a
                    href={`${API}/formato/${doc.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800 hover:bg-amber-100 transition-colors"
                >
                    <span>⬇️</span>
                    <span className="font-medium flex-1">Descargar formato — imprima, firme, ponga huella y escanée</span>
                    <span className="text-amber-600 font-semibold whitespace-nowrap">Descargar →</span>
                </a>
            )}
            <div className="flex justify-between items-start mb-2">
                <div>
                    <p className="font-medium text-gray-800 text-sm">
                        {doc.nombre}
                        {doc.obligatorio && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    {doc.descripcion && (
                        <p className="text-xs text-gray-500 mt-0.5">{doc.descripcion}</p>
                    )}
                </div>
                {subido && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                        ${subido.estado === 'aprobado' ? 'bg-green-100 text-green-700'
                        : subido.estado === 'rechazado' ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'}`}>
                        {subido.estado === 'aprobado' ? 'Aprobado'
                         : subido.estado === 'rechazado' ? 'Rechazado'
                         : 'En revisión'}
                    </span>
                )}
            </div>

            {error && (
                <div className="bg-red-100 border border-red-300 rounded-lg px-3 py-2 mb-3 text-xs text-red-700 font-medium flex items-center gap-2">
                    <span>⚠</span>
                    <span>{error === 'falta_documento' ? 'Debe subir este documento' : 'Ingrese la fecha de vencimiento'}</span>
                </div>
            )}
            {subido?.obs_rechazo && (
                <div className="bg-red-100 rounded-lg px-3 py-2 mb-3 text-xs text-red-700">
                    <strong>Motivo de rechazo:</strong> {subido.obs_rechazo}
                </div>
            )}

            {subido && subido.estado !== 'rechazado' ? (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 truncate">{subido.nombre_archivo}</p>
                    <button
                        onClick={() => inputRef.current?.click()}
                        className="text-xs text-blue-600 ml-2 underline whitespace-nowrap"
                    >
                        Reemplazar
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={subiendo}
                    className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50 flex flex-col items-center gap-1"
                >
                    {subiendo ? (
                        <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            Subiendo...
                        </span>
                    ) : (
                        <>
                            <span className="text-2xl">📎</span>
                            <span>Toca para seleccionar archivo</span>
                            <span className="text-xs text-gray-400">PDF, JPG, PNG — máx. 15MB</span>
                        </>
                    )}
                </button>
            )}

            {doc.acepta_vencimiento && (
                <div className="mt-3">
                    <label className={`text-xs font-medium ${error === 'falta_fecha' ? 'text-red-600' : 'text-gray-600'}`}>
                        Fecha de vencimiento del documento{doc.obligatorio ? ' *' : ''}
                    </label>
                    <input
                        type="date"
                        className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${
                            error === 'falta_fecha' ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-300'
                        } focus:outline-none focus:ring-2`}
                        value={vencimiento}
                        onChange={e => {
                            setVencimiento(e.target.value);
                            if (subido?.id && e.target.value) {
                                onFechaChange?.(subido.id, e.target.value);
                            }
                        }}
                    />
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp"
                className="hidden"
                onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) onChange(file, vencimiento || undefined);
                    e.target.value = '';
                }}
            />
        </div>
    );
};

export default PublicDocForm;
