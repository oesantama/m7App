import React, { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { api } from '../services/api';
import { Icons } from '../constants';

type PageState = 'gate' | 'loading' | 'ready' | 'signing' | 'done' | 'error';

const PerfilCargoPublicSign: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = useState<PageState>('gate');
  const [cedulaFinal, setCedulaFinal] = useState('');
  const [info, setInfo] = useState<{ nombre: string; cargo_nombre: string; firma_id: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [leido, setLeido] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);

  const handleVerificar = async () => {
    if (cedulaFinal.trim().length < 4) {
      setErrorMsg('Ingresa los últimos 4 dígitos de tu cédula');
      return;
    }
    setState('loading');
    setErrorMsg('');
    try {
      const res = await api.ghPerfilesCargo.publico.verificar(token, cedulaFinal.trim());
      setInfo(res.data);
      setState('ready');
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo verificar el enlace');
      setState('gate');
    }
  };

  const handleFirmar = async () => {
    if (!leido) { setErrorMsg('Debes confirmar que leíste el documento'); return; }
    if (sigCanvas.current?.isEmpty()) { setErrorMsg('Dibuja tu firma antes de continuar'); return; }
    setState('signing');
    setErrorMsg('');
    try {
      const firmaB64 = sigCanvas.current!.getCanvas().toDataURL('image/png');
      await api.ghPerfilesCargo.publico.firmar(token, cedulaFinal.trim(), firmaB64);
      setState('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al firmar');
      setState('ready');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="bg-slate-900 px-8 py-6">
          <h1 className="text-white font-black text-lg uppercase tracking-tight flex items-center gap-2">
            <Icons.FileText className="text-emerald-400 w-5 h-5" /> OrbitM7 — Milla 7 S.A.S.
          </h1>
          <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest mt-1">Perfil y Funciones del Cargo — Firma digital</p>
        </div>

        <div className="p-8">
          {(state === 'gate' || state === 'loading') && (
            <div className="space-y-4">
              <p className="text-slate-600 text-sm font-semibold">Para abrir tu documento, confirma los <b className="text-slate-900">últimos 4 dígitos</b> de tu número de cédula.</p>
              <input
                value={cedulaFinal}
                onChange={e => setCedulaFinal(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Ej. 5965"
                maxLength={4}
                className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all text-slate-900 text-xl font-black tracking-[0.3em] text-center"
              />
              {errorMsg && <p className="text-rose-600 text-xs font-bold">{errorMsg}</p>}
              <button onClick={handleVerificar} disabled={state === 'loading'}
                className="w-full h-12 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                {state === 'loading' && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {state === 'loading' ? 'Verificando...' : 'Continuar'}
              </button>
            </div>
          )}

          {(state === 'ready' || state === 'signing') && info && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Hola {info.nombre}, este es el perfil de funciones para tu cargo</p>
                <p className="text-xl font-black text-slate-900 uppercase mt-0.5">{info.cargo_nombre}</p>
              </div>
              <iframe
                src={api.ghPerfilesCargo.publico.documentoUrl(token, cedulaFinal.trim())}
                className="w-full h-[50vh] rounded-xl border border-slate-200 bg-white"
                title="Perfil de cargo"
              />
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 uppercase">
                <input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                He leído y entiendo las funciones descritas en este documento
              </label>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Firma</label>
                <div className="bg-slate-50 rounded-xl border border-slate-200 h-32">
                  <SignatureCanvas ref={sigCanvas} penColor="navy" canvasProps={{ className: 'w-full h-full' }} backgroundColor="rgba(255,255,255,1)" />
                </div>
                <button onClick={() => sigCanvas.current?.clear()} className="text-[10px] font-bold uppercase text-slate-400 hover:text-slate-600 mt-1.5">Limpiar firma</button>
              </div>
              {errorMsg && <p className="text-rose-600 text-xs font-bold">{errorMsg}</p>}
              <button onClick={handleFirmar} disabled={state === 'signing'}
                className="w-full h-12 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                {state === 'signing' && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {state === 'signing' ? 'Firmando...' : 'Confirmar firma'}
              </button>
            </div>
          )}

          {state === 'done' && (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Icons.CheckCircle className="text-emerald-600 w-7 h-7" />
              </div>
              <p className="text-slate-900 font-black uppercase">Documento firmado correctamente</p>
              <p className="text-slate-400 text-xs font-bold mt-1">Ya puedes cerrar esta ventana.</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-10">
              <p className="text-rose-600 font-black text-sm">{errorMsg || 'No se pudo cargar el documento'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerfilCargoPublicSign;
