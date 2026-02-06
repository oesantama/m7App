import React, { useRef, useState } from 'react';
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
  const [existingSignature, setExistingSignature] = useState<string | null>(null);

  React.useEffect(() => {
    const loadSignature = async () => {
      try {
        const res = await api.getSignature(user.email);
        if (res && res.digital_signature) {
          setIsApproved(res.approved || false);
          setExistingSignature(res.digital_signature);
          sigCanvas.current?.fromDataURL(res.digital_signature);
        }
      } catch (err) {
        console.error('Error loading signature:', err);
      }
    };
    loadSignature();
  }, [user.email]);

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setExistingSignature(null);
  };

  const saveSignature = async () => {
    if (isApproved) {
      toast.error('La firma ya ha sido aprobada y no puede modificarse.');
      return;
    }
    if (!password) {
      toast.error('La contraseña es obligatoria.');
      return;
    }
    if (!policyAccepted) {
      toast.error('Debe aceptar la política de tratamiento de datos.');
      return;
    }
    if (sigCanvas.current?.isEmpty()) {
      toast.error('Por favor firme en el recuadro.');
      return;
    }

    setLoading(true);
    console.log('[M7-SIGNATURE] CAPTURANDO V4.1 RAW...');
    
    // USAR CAPTURA DIRECTA SIN TRIM (EVITA EXCEPCIÓN ESM)
    const canvas = sigCanvas.current?.getCanvas();
    const signatureData = canvas ? canvas.toDataURL('image/png') : '';
    
    if (!signatureData || sigCanvas.current?.isEmpty()) {
      toast.error('Por favor firme en el recuadro antes de guardar.');
      setLoading(false);
      return;
    }
    try {
      const response = await api.createSignature({
        documentNumber: user.email,
        digitalSignature: signatureData,
        password,
        policyAccepted
      });

      if (response.success) {
        toast.success('Firma digital guardada correctamente.');
        setExistingSignature(signatureData);
        setPassword('');
        // Importante: No limpiar para feedback visual inmediato
      } else {
        toast.error(response.error || 'Error al guardar la firma.');
      }
    } catch (error) {
      console.error('Signature Save Error:', error);
      toast.error('Error de conexión al guardar la firma.');
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
          <span className="text-[8px] font-black text-slate-300 uppercase bg-slate-50 px-3 py-1 rounded-full">Engine v4.1 Active</span>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Contraseña de Firma</label>
                <div className="bg-slate-50 p-4 rounded-xl flex items-center gap-3 border border-slate-200 focus-within:border-emerald-500 transition-colors">
                    <Icons.Lock className="text-slate-400" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
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
            <div className={`border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden bg-white transition-colors h-64 relative group ${isApproved ? 'opacity-80 cursor-not-allowed' : 'hover:border-emerald-400 cursor-crosshair'}`}>
                
                {/* Visualización de firma existente o recién capturada */}
                {(existingSignature || isApproved) && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-white/95 pointer-events-none">
                        <img src={existingSignature || ''} alt="Firma Guardada" className="max-w-full max-h-full object-contain mix-blend-multiply opacity-100" />
                    </div>
                )}

                {!isApproved && !existingSignature && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 group-hover:opacity-0 transition-opacity">
                      <p className="font-black text-4xl text-slate-300 uppercase transform -rotate-12">Dibujar Firma Aquí</p>
                  </div>
                )}
                
                {isApproved && (
                  <div className="absolute inset-x-0 bottom-4 flex items-center justify-center z-[60] pointer-events-none">
                      <p className="px-4 py-1 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg">Firma Aprobada - Protegida</p>
                  </div>
                )}

                <SignatureCanvas 
                    ref={sigCanvas}
                    penColor="navy"
                    canvasProps={{ className: `w-full h-full ${isApproved ? 'pointer-events-none' : ''}` }}
                    backgroundColor="rgba(255,255,255,0)"
                />
            </div>
        </div>

        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-start gap-4 mb-8">
            <div className="mt-1">
                <input 
                  type="checkbox" 
                  checked={policyAccepted}
                  onChange={(e) => setPolicyAccepted(e.target.checked)}
                  className="w-5 h-5 accent-blue-600 cursor-pointer"
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
           <span>{loading ? 'Procesando...' : 'Guardar Firma Digital'}</span>
        </button>

      </div>
    </div>
  );
};

export default DigitalSignature;
