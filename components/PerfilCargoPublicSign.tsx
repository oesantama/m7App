import React, { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { api } from '../services/api';

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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="bg-emerald-600 px-6 py-4">
          <h1 className="text-white font-bold text-lg">OrbitM7 — Milla 7 S.A.S.</h1>
          <p className="text-emerald-100 text-xs">Perfil y Funciones del Cargo — Firma digital</p>
        </div>

        <div className="p-6">
          {state === 'gate' || state === 'loading' ? (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">Para abrir tu documento, confirma los <b>últimos 4 dígitos</b> de tu número de cédula.</p>
              <input
                value={cedulaFinal}
                onChange={e => setCedulaFinal(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Ej. 5965"
                maxLength={4}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-4 py-3 text-lg tracking-widest text-center"
              />
              {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
              <button onClick={handleVerificar} disabled={state === 'loading'}
                className="w-full py-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50">
                {state === 'loading' ? 'Verificando…' : 'Continuar'}
              </button>
            </div>
          ) : null}

          {(state === 'ready' || state === 'signing') && info && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-400">Hola <b className="text-slate-100">{info.nombre}</b>, este es el perfil de funciones para tu cargo:</p>
                <p className="text-lg font-bold text-emerald-400">{info.cargo_nombre}</p>
              </div>
              <iframe
                src={api.ghPerfilesCargo.publico.documentoUrl(token, cedulaFinal.trim())}
                className="w-full h-[50vh] rounded border border-slate-800 bg-white"
                title="Perfil de cargo"
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)} className="w-4 h-4" />
                He leído y entiendo las funciones descritas en este documento
              </label>
              <div>
                <label className="text-xs text-slate-400">Firma</label>
                <div className="bg-white rounded-md border border-slate-700 h-32">
                  <SignatureCanvas ref={sigCanvas} penColor="navy" canvasProps={{ className: 'w-full h-full' }} backgroundColor="rgba(255,255,255,1)" />
                </div>
                <button onClick={() => sigCanvas.current?.clear()} className="text-xs text-slate-500 hover:text-slate-300 mt-1">Limpiar firma</button>
              </div>
              {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
              <button onClick={handleFirmar} disabled={state === 'signing'}
                className="w-full py-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50">
                {state === 'signing' ? 'Firmando…' : 'Confirmar firma'}
              </button>
            </div>
          )}

          {state === 'done' && (
            <div className="text-center py-10">
              <div className="text-emerald-400 text-4xl mb-3">✓</div>
              <p className="text-slate-100 font-semibold">Documento firmado correctamente</p>
              <p className="text-slate-400 text-sm mt-1">Ya puedes cerrar esta ventana.</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-10">
              <p className="text-red-400 font-semibold">{errorMsg || 'No se pudo cargar el documento'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerfilCargoPublicSign;
