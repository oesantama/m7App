import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { toast } from 'sonner';
import { Icons } from '../constants';
import { api } from '../services/api';

interface DigitalSignatureProps {
  user: {
     id: string;
     name: string;
     email: string;
     documentNumber?: string;
  };
}

const DigitalSignature: React.FC<DigitalSignatureProps> = ({ user }) => {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [statusId, setStatusId] = useState('EST-01');
  const [existingSignature, setExistingSignature] = useState<string | null>(null);

  useEffect(() => {
    const loadSignature = async () => {
      try {
        const res = await api.getSignature(user.id);
        if (res && res.found && res.data) {
          setIsApproved(res.data.aprobada || false);
          setStatusId(res.data.estado || 'EST-01');
          setExistingSignature(res.data.firma);
          setPolicyAccepted(res.data.aceptapolitica);
          // Load into canvas
          sigCanvas.current?.fromDataURL(res.data.firma);
        }
      } catch (err) {
        console.error('Error loading signature:', err);
      }
    };
    if (user.id) loadSignature();
  }, [user.id]);

  const clearSignature = () => {
    if (isApproved) return;
    sigCanvas.current?.clear();
    setExistingSignature(null);
  };

  const saveSignature = async () => {
    if (!password) {
        toast.error('La contraseña es obligatoria para confirmar cambios.');
        return;
    }

    if (!isApproved) {
        // Validation for new/unapproved signatures
        if (!policyAccepted) {
            toast.error('Debe aceptar la política de tratamiento de datos.');
            return;
        }
        if (sigCanvas.current?.isEmpty() && !existingSignature) {
            toast.error('Por favor firme en el recuadro.');
            return;
        }
    }

    setLoading(true);

    try {
      let signatureData = existingSignature;
      
      // If not approved, can update signature. Capture it.
      if (!isApproved) {
          if (!sigCanvas.current?.isEmpty()) {
              // Trim canvas to get clean data
              const canvas = sigCanvas.current?.getCanvas();
              signatureData = canvas ? canvas.toDataURL('image/png') : '';
          }
      }

      // Check against backend requirements
      if (!isApproved && !signatureData) {
          toast.error("Firma requerida");
          setLoading(false);
          return;
      }

      const payload = {
        userId: user.id,
        password,
        signature: signatureData,
        policyAccepted,
        createdBy: user.name
      };

      const response = await api.saveSignature(payload);

      if (response.success) {
        toast.success(response.message || 'Firma digital guardada correctamente.');
        if (!isApproved && signatureData) {
            setExistingSignature(signatureData);
            // Reload canvas to ensure visual sync
            sigCanvas.current?.fromDataURL(signatureData);
        }
        setPassword('');
      } else {
        toast.error(response.error || 'Error al guardar.');
      }
    } catch (error: any) {
      console.error('Signature Save Error:', error);
      toast.error('Error de conexión: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in">
      <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-slate-100">
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-slate-900 text-emerald-400 rounded-2xl flex items-center justify-center shadow-lg">
              <Icons.Key className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Firma Digital Segura</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Módulo de Autenticación Biométrica</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-[8px] font-black text-slate-300 uppercase bg-slate-50 px-3 py-1 rounded-full">Engine v4.1 Active</span>
            {isApproved ? (
                <span className="px-4 py-1 bg-emerald-100 text-emerald-600 text-[9px] font-black uppercase tracking-widest rounded-full border border-emerald-200">
                   Aprobada / Protegida
                </span>
            ) : (
                <span className="px-4 py-1 bg-amber-100 text-amber-600 text-[9px] font-black uppercase tracking-widest rounded-full border border-amber-200">
                   Pendiente Aprobación
                </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Usuario Solicitante</label>
                <div className="bg-slate-100 p-4 rounded-xl flex items-center gap-3 border border-slate-200">
                    <Icons.User className="text-slate-400" />
                    <input 
                      type="text" 
                      value={user.email}
                      readOnly
                      className="bg-transparent w-full outline-none font-black text-slate-900 text-sm uppercase cursor-not-allowed"
                    />
                </div>
            </div>
            <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
                    {isApproved ? 'Cambiar Contraseña de Firma' : 'Contraseña de Firma (Requerida)'}
                </label>
                <div className="bg-slate-50 p-4 rounded-xl flex items-center gap-3 border border-slate-200 focus-within:border-emerald-500 transition-colors">
                    <Icons.Lock className="text-slate-400" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isApproved ? "Nueva contraseña..." : "••••••••••••"}
                      autoComplete="new-password"
                      className="bg-transparent w-full outline-none font-black text-slate-900 text-sm placeholder:text-slate-300"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-emerald-500 transition-colors">
                        {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>

        <div className="space-y-4 mb-8">
            <div className="flex justify-between items-end">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Panel de Firma</label>
                {!isApproved && (
                    <button onClick={clearSignature} className="text-[9px] font-black text-red-500 uppercase hover:text-red-600 transition-colors">Limpiar Firma</button>
                )}
            </div>
            <div className={`border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden bg-white transition-colors h-64 relative group ${isApproved ? 'opacity-80' : 'hover:border-emerald-400 cursor-crosshair'}`}>
                
                {/* Visualización de firma existente o recién capturada */}
                {(existingSignature || isApproved) && (
                    <div className={`absolute inset-0 z-40 flex items-center justify-center p-8 bg-white/50 ${isApproved ? 'pointer-events-none' : 'pointer-events-none'}`}>
                        {/* Overlay image just for reference, let canvas handle the drawing/display logic mostly */}
                    </div>
                )}

                {!isApproved && !existingSignature && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 group-hover:opacity-0 transition-opacity">
                      <p className="font-black text-4xl text-slate-300 uppercase transform -rotate-12">Dibujar Firma Aquí</p>
                  </div>
                )}
                
                {isApproved && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/10 backdrop-blur-[2px]">
                      <div className="bg-emerald-500 text-white px-6 py-2 rounded-2xl shadow-2xl flex items-center gap-2">
                        <Icons.Lock className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Edición Bloqueada</span>
                      </div>
                  </div>
                )}

                <SignatureCanvas 
                    ref={sigCanvas}
                    penColor="navy"
                    canvasProps={{ className: `w-full h-full ${isApproved ? 'pointer-events-none' : ''}` }}
                    backgroundColor="rgba(255,255,255,0)"
                    clearOnResize={false}
                />
            </div>
        </div>

        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-start gap-4 mb-8">
            <div className="mt-1">
                <input 
                  type="checkbox" 
                  checked={policyAccepted}
                  onChange={(e) => setPolicyAccepted(e.target.checked)}
                  disabled={isApproved}
                  className="w-5 h-5 accent-blue-600 cursor-pointer disabled:opacity-50"
                />
            </div>
            <div>
                <h4 className="text-xs font-black text-blue-800 uppercase mb-1">Política de Tratamiento de Datos</h4>
                <p className="text-[10px] font-medium text-blue-600/80 leading-relaxed text-justify">
                    De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013, autorizo el tratamiento de mis datos personales y biométricos (firma digital) para fines de autenticación, validación de documentos y procesos logísticos internos. Declaro que la firma proporcionada es auténtica y corresponde a mi identidad.
                </p>
            </div>
        </div>

        <button 
          onClick={saveSignature} 
          disabled={loading}
          className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
           {loading ? (
             <span>Procesando...</span>
           ) : (
             <>
                <Icons.Save className="w-4 h-4" />
                <span>{isApproved ? 'Actualizar Contraseña' : 'Guardar Firma Digital'}</span>
             </>
           )}
        </button>

      </div>
    </div>
  );
};

export default DigitalSignature;
