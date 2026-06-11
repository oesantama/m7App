import React, { useState, useEffect } from 'react';
import { API_URL } from '../../services/api';

type Phase = 'entering' | 'smoking' | 'content' | 'closing' | 'done';

// ── Ruedas ────────────────────────────────────────────────────────────────────
const W = (cx: number, cy: number) =>
  [0,45,90,135,180,225,270,315].map((a, i) => (
    <line key={i}
      x1={cx + 9 * Math.cos(a * Math.PI/180)} y1={cy + 9 * Math.sin(a * Math.PI/180)}
      x2={cx + 17 * Math.cos(a * Math.PI/180)} y2={cy + 17 * Math.sin(a * Math.PI/180)}
      stroke="#475569" strokeWidth="2.5"/>
  ));

// ── Furgón Hino-style (igual al modal autenticado) ────────────────────────────
const TruckSVG = () => (
  <svg viewBox="0 0 960 210" width="100%" style={{display:'block'}} fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="480" cy="206" rx="445" ry="6" fill="rgba(0,0,0,0.28)"/>

    {/* ── CAJA DE CARGA ── */}
    <rect x="188" y="16" width="762" height="154" rx="5" fill="#0f172a"/>
    <rect x="188" y="16" width="762" height="13" rx="5" fill="#059669"/>
    <rect x="188" y="23" width="762" height="6" fill="#059669"/>
    <rect x="188" y="157" width="762" height="13" rx="3" fill="#059669"/>
    <line x1="188" y1="58"  x2="950" y2="58"  stroke="#1e293b" strokeWidth="2"/>
    <line x1="188" y1="122" x2="950" y2="122" stroke="#1e293b" strokeWidth="2"/>
    <line x1="924" y1="24" x2="924" y2="157" stroke="#1e293b" strokeWidth="3"/>
    <line x1="938" y1="24" x2="938" y2="157" stroke="#1e293b" strokeWidth="1.5"/>
    <rect x="919" y="82" width="8" height="10" rx="4" fill="#334155"/>
    {/* Unidad refrigeración */}
    <rect x="245" y="2"  width="230" height="17" rx="4" fill="#1e293b"/>
    <rect x="249" y="5"  width="222" height="11" rx="3" fill="#293548"/>
    {[...Array(14)].map((_, i) => (
      <rect key={i} x={253 + i*15} y={6} width="11" height="9" rx="1" fill="#374151"/>
    ))}
    {/* M7 + MILLA 7 */}
    <text x="569" y="120" textAnchor="middle" fill="white" fontSize="84" fontWeight="900"
      fontFamily="Arial Black,sans-serif" letterSpacing="-4">M7</text>
    <text x="569" y="152" textAnchor="middle" fill="#10b981" fontSize="13" fontWeight="800"
      fontFamily="Arial,sans-serif" letterSpacing="6">MILLA 7</text>
    <rect x="182" y="30" width="8" height="136" rx="3" fill="#334155"/>

    {/* ── CABINA ── */}
    <path d="M28 170 L28 72 Q28 40 56 34 L190 28 L190 170 Z" fill="#1e293b"/>
    <path d="M6 170 L6 112 Q6 96 26 94 L190 88 L190 170 Z" fill="#0f172a"/>
    <line x1="8" y1="102" x2="190" y2="94" stroke="#243347" strokeWidth="2.5"/>
    <path d="M42 42 Q42 32 58 30 L186 28 L186 84 L30 92 Q26 92 26 86 L26 65 Q26 42 42 42 Z"
      fill="#38bdf8" opacity="0.72"/>
    <line x1="36" y1="46" x2="60" y2="90" stroke="white" strokeWidth="4" opacity="0.13" strokeLinecap="round"/>
    <line x1="70" y1="34" x2="84" y2="88" stroke="white" strokeWidth="2" opacity="0.07" strokeLinecap="round"/>
    <rect x="28" y="94"  width="158" height="76" rx="3" fill="#152033"/>
    <rect x="34" y="100" width="146" height="64" rx="2" fill="#1c2d44"/>
    <rect x="150" y="132" width="24" height="6" rx="3" fill="#475569"/>
    <rect x="152" y="130" width="20" height="4" rx="2" fill="#64748b"/>
    <rect x="160" y="160" width="34" height="7" rx="2" fill="#334155"/>
    <rect x="160" y="152" width="34" height="6" rx="2" fill="#2d3f52"/>
    <path d="M12 170 Q12 142 38 136 L100 134 Q122 134 126 152 L126 170 Z" fill="#0f172a"/>
    <path d="M16 140 Q40 132 100 132 Q124 132 128 148" stroke="#1e293b" strokeWidth="3" fill="none"/>
    <rect x="4" y="50" width="26" height="16" rx="3" fill="#334155"/>
    <rect x="2" y="52" width="5" height="12" rx="2.5" fill="#3d4f63"/>
    <rect x="6" y="108" width="22" height="14" rx="3.5" fill="#fef08a" opacity="0.95"/>
    <rect x="8" y="110" width="18" height="10" rx="2" fill="white" opacity="0.9"/>
    <ellipse cx="4" cy="115" rx="7" ry="5" fill="#fef9c3" opacity="0.3"/>
    <rect x="6" y="125" width="15" height="9" rx="2" fill="#fb923c" opacity="0.95"/>
    <rect x="6" y="134" width="24" height="28" rx="3" fill="#0a1120"/>
    {[0,1,2,3,4,5].map(i => (
      <line key={i} x1="6" y1={138+i*4} x2="30" y2={138+i*4} stroke="#1e293b" strokeWidth="1.5"/>
    ))}
    <line x1="18" y1="134" x2="18" y2="162" stroke="#1e293b" strokeWidth="1.5"/>
    <rect x="4" y="160" width="30" height="12" rx="4" fill="#334155"/>
    <rect x="6" y="162" width="26" height="5" rx="2.5" fill="#475569"/>

    {/* ── ESCAPE ── */}
    <rect x="90" y="0" width="14" height="40" rx="7" fill="#4b5563"/>
    <rect x="91" y="0" width="12" height="40" rx="6" fill="#374151"/>
    <ellipse cx="97" cy="0" rx="8" ry="4.5" fill="#1e293b"/>
    <ellipse cx="97" cy="0" rx="4.5" ry="2.5" fill="#0f172a"/>
    <rect x="87" y="32" width="20" height="6" rx="3" fill="#4b5563"/>
    <rect x="110" y="10" width="11" height="28" rx="5.5" fill="#374151"/>
    <ellipse cx="115.5" cy="10" rx="7" ry="4" fill="#1e293b"/>

    {/* ── RUEDAS ── */}
    <circle cx="104" cy="182" r="24" fill="#1e293b"/>
    <circle cx="104" cy="182" r="20" fill="#0f172a" stroke="#334155" strokeWidth="2.5"/>
    <circle cx="104" cy="182" r="9" fill="#475569"/>
    <circle cx="104" cy="182" r="4" fill="#64748b"/>
    {W(104, 182)}
    <circle cx="718" cy="182" r="24" fill="#1e293b"/>
    <circle cx="718" cy="182" r="20" fill="#0f172a" stroke="#334155" strokeWidth="2.5"/>
    <circle cx="718" cy="182" r="9" fill="#475569"/>
    <circle cx="718" cy="182" r="4" fill="#64748b"/>
    {W(718, 182)}
    <circle cx="792" cy="182" r="24" fill="#1e293b"/>
    <circle cx="792" cy="182" r="20" fill="#0f172a" stroke="#334155" strokeWidth="2.5"/>
    <circle cx="792" cy="182" r="9" fill="#475569"/>
    <circle cx="792" cy="182" r="4" fill="#64748b"/>
    {W(792, 182)}
  </svg>
);

const SmokeParticle = ({ delay, size, ox }: { delay: number; size: number; ox: number }) => (
  <div style={{
    position:'absolute', left:`${ox}px`, bottom:0,
    width:`${size}px`, height:`${size}px`, borderRadius:'50%',
    background:'rgba(148,163,184,0.65)',
    animation:`pubSmoke 2.6s ease-out ${delay}s infinite`,
    filter:'blur(9px)', pointerEvents:'none',
  }}/>
);

const SMOKE = [
  {delay:0,   size:24, ox:8 }, {delay:0.32,size:30, ox:-5},
  {delay:0.64,size:22, ox:14}, {delay:0.96,size:36, ox:1 },
  {delay:1.28,size:26, ox:-8}, {delay:1.6, size:32, ox:10},
  {delay:1.92,size:20, ox:-2}, {delay:2.24,size:28, ox:5 },
];

// ── Lightbox — muestra imagen/PDF/video en pantalla completa ─────────────────
const Lightbox = ({ url, tipo, nombre, onClose }: {
  url: string; tipo: string; nombre: string; onClose: () => void;
}) => {
  const [src, setSrc]     = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl = '';
    fetch(url)
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:'fixed', inset:0, zIndex:99999,
        background:'rgba(0,0,0,0.92)', backdropFilter:'blur(4px)',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      }}
    >
      <div style={{
        position:'absolute', top:0, left:0, right:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'12px 20px', background:'rgba(0,0,0,0.5)',
      }}>
        <span style={{color:'#94a3b8',fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'80%'}}>
          {nombre}
        </span>
        <button onClick={onClose} style={{
          width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.1)',
          border:'none', cursor:'pointer', color:'white', fontSize:18,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}
          onMouseOver={e=>(e.currentTarget.style.background='rgba(239,68,68,0.7)')}
          onMouseOut={e=>(e.currentTarget.style.background='rgba(255,255,255,0.1)')}>
          ✕
        </button>
      </div>

      {loading && (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
          <div style={{width:40,height:40,border:'4px solid #10b981',borderTopColor:'transparent',borderRadius:'50%',animation:'pubSpin 0.8s linear infinite'}}/>
          <style>{`@keyframes pubSpin{to{transform:rotate(360deg)}}`}</style>
          <span style={{color:'#64748b',fontSize:12,fontWeight:700}}>Cargando...</span>
        </div>
      )}
      {error && <span style={{color:'#f87171',fontSize:13}}>⚠ No se pudo cargar el archivo</span>}
      {!loading && !error && src && (
        tipo === 'IMAGEN' ? (
          <img src={src} alt={nombre} style={{
            maxWidth:'95vw', maxHeight:'85vh',
            objectFit:'contain', display:'block',
            borderRadius:8, boxShadow:'0 8px 40px rgba(0,0,0,0.6)',
          }}/>
        ) : tipo === 'VIDEO' ? (
          <video src={src} controls autoPlay style={{
            maxWidth:'95vw', maxHeight:'85vh', display:'block', borderRadius:8,
          }}/>
        ) : tipo === 'PDF' ? (
          <iframe src={src} title={nombre} style={{
            width:'92vw', height:'88vh', border:'none', borderRadius:8, display:'block',
          }}/>
        ) : null
      )}
    </div>
  );
};

const downloadPublic = async (url: string, filename: string) => {
  try {
    const blob = await fetch(url).then(r => r.blob());
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = filename; a.click();
    URL.revokeObjectURL(objUrl);
  } catch { /* silencioso */ }
};

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────
export default function PublicNoticiaPage() {
  const params    = new URLSearchParams(window.location.search);
  const noticiaId = params.get('id');

  const [noticia, setNoticia] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [phase, setPhase]       = useState<Phase>('entering');
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!noticiaId) { setError('ID de noticia no especificado'); setLoading(false); return; }
    fetch(`${API_URL}/noticias/public/${noticiaId}`)
      .then(r => r.ok ? r.json() : Promise.reject('No disponible'))
      .then(d => { setNoticia(d); setLoading(false); })
      .catch(e => { setError(typeof e === 'string' ? e : 'Noticia no encontrada'); setLoading(false); });
  }, [noticiaId]);

  useEffect(() => {
    if (!noticia) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === 'entering') t = setTimeout(() => setPhase('smoking'), 1400);
    if (phase === 'smoking')  t = setTimeout(() => setPhase('content'), 2200);
    return () => clearTimeout(t);
  }, [phase, noticia]);

  const handleClose = () => {
    setLightbox(false);
    setPhase('closing');
    setTimeout(() => setPhase('done'), 1300);
  };

  // URL de stream pública (whitelisteada en server.ts → no requiere JWT)
  const streamUrl = `${API_URL}/noticias/public/${noticiaId}/stream`;

  // ── ESTADOS ESPECIALES ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#020617'}}>
      <div style={{width:40,height:40,border:'4px solid #10b981',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error || !noticia) return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#020617',gap:16}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{color:'#10b981',fontWeight:900,fontSize:48,letterSpacing:-2}}>M7</div>
      <p style={{color:'#475569',fontSize:13}}>{error || 'Noticia no encontrada'}</p>
    </div>
  );

  if (phase === 'done') return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#020617',gap:12,animation:'pubFadeIn 0.6s ease-out'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pubFadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
      `}</style>
      <div style={{color:'#10b981',fontWeight:900,fontSize:64,letterSpacing:-3}}>M7</div>
      <p style={{color:'#334155',fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:5}}>Milla 7 · Logística Inteligente</p>
    </div>
  );

  const smoking  = phase === 'smoking' || phase === 'content';
  const showCard = phase === 'content';
  const truckAnim =
    phase === 'entering' ? 'pubEnter 1.35s cubic-bezier(0.22,1,0.36,1) forwards'
  : phase === 'closing'  ? 'pubExit  1.15s cubic-bezier(0.55,0,1,0.45) forwards'
  : smoking              ? 'pubIdle  0.7s ease-in-out infinite'
  : 'none';

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pubEnter{from{transform:translateX(112%)}to{transform:translateX(0)}}
        @keyframes pubExit {from{transform:translateX(0)}   to{transform:translateX(-115%)}}
        @keyframes pubIdle {0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes pubSmoke{
          0%  {transform:translateY(0) scale(0.4);opacity:.85}
          60% {opacity:.4}
          100%{transform:translateY(-320px) scale(6);opacity:0}
        }
        @keyframes pubCard{
          0%  {opacity:0;transform:scale(0.6) translateY(70px)}
          65% {transform:scale(1.025) translateY(-5px)}
          100%{opacity:1;transform:scale(1) translateY(0)}
        }
        @keyframes pubFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{
        position:'fixed', inset:0, zIndex:9999,
        display:'flex', flexDirection:'column',
        background:'linear-gradient(170deg,#020617 0%,#0a1628 100%)',
        opacity: phase === 'closing' ? 0 : 1,
        transition: phase === 'closing' ? 'opacity 1s ease-out 0.2s' : 'none',
        pointerEvents: phase === 'closing' ? 'none' : 'auto',
        overflow:'hidden',
      }}>

        {/* Logo M7 arriba */}
        <div style={{
          position:'absolute', top:16, left:'50%', transform:'translateX(-50%)',
          display:'flex', alignItems:'center', gap:8, zIndex:10,
        }}>
          <div style={{width:28,height:28,background:'#059669',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 12px rgba(5,150,105,0.4)'}}>
            <span style={{color:'white',fontWeight:900,fontSize:10,letterSpacing:-0.5}}>M7</span>
          </div>
          <span style={{color:'#475569',fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:4}}>Milla 7</span>
        </div>

        {/* ── TARJETA ── */}
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'12px 5% 0'}}>
          {showCard && (
            <div style={{
              width:'90%', maxWidth:'1100px',
              background:'white', borderRadius:28,
              boxShadow:'0 40px 100px rgba(0,0,0,0.7)',
              overflow:'hidden', maxHeight:'82vh',
              display:'flex', flexDirection:'column',
              animation:'pubCard 0.65s cubic-bezier(0.34,1.56,0.64,1) forwards',
              transformOrigin:'10% bottom',
            }}>
              {/* Header */}
              <div style={{
                background:'linear-gradient(135deg,#0f172a 0%,#064e3b 60%,#0f172a 100%)',
                padding:'28px 28px 22px', position:'relative', flexShrink:0,
              }}>
                <button onClick={handleClose} style={{
                  position:'absolute', top:14, right:14,
                  width:40, height:40, borderRadius:'50%',
                  background:'rgba(255,255,255,0.1)', border:'none', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:18,
                }}
                  onMouseOver={e=>(e.currentTarget.style.background='rgba(239,68,68,0.6)')}
                  onMouseOut={e=>(e.currentTarget.style.background='rgba(255,255,255,0.1)')}>
                  ✕
                </button>

                <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:14,animation:'pubFade .4s ease-out .1s both'}}>
                  <div style={{width:30,height:30,background:'#059669',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 18px rgba(5,150,105,0.55)'}}>
                    <span style={{color:'white',fontSize:14}}>🔔</span>
                  </div>
                  <span style={{color:'#6ee7b7',fontSize:11,fontWeight:800,letterSpacing:3,textTransform:'uppercase'}}>Aviso · Milla 7</span>
                </div>

                <h2 style={{color:'white',fontSize:30,fontWeight:900,textTransform:'uppercase',letterSpacing:-0.5,lineHeight:1.2,margin:0,paddingRight:52,animation:'pubFade .4s ease-out .2s both'}}>
                  {noticia.titulo}
                </h2>
              </div>

              {/* Body */}
              <div style={{flex:1,overflowY:'auto',padding:'24px 28px',display:'flex',flexDirection:'column',gap:18}}>
                {noticia.descripcion && (
                  <p style={{color:'#475569',fontSize:15,lineHeight:1.75,margin:0,animation:'pubFade .4s ease-out .3s both'}}>
                    {noticia.descripcion}
                  </p>
                )}

                {noticia.link && (
                  <a href={noticia.link} target="_blank" rel="noreferrer" style={{
                    display:'flex',alignItems:'center',gap:10,padding:'14px 18px',
                    background:'#eff6ff',borderRadius:14,textDecoration:'none',
                    color:'#2563eb',fontSize:13,fontWeight:700,
                    animation:'pubFade .4s ease-out .35s both',
                  }}>
                    🔗 Abrir enlace
                  </a>
                )}

                {noticia.archivo_nombre && (
                  <div style={{border:'1px solid #e2e8f0',borderRadius:14,overflow:'hidden',animation:'pubFade .4s ease-out .4s both'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#f8fafc'}}>
                      <span style={{fontSize:16}}>
                        {noticia.archivo_tipo === 'PDF' ? '📄' : noticia.archivo_tipo === 'VIDEO' ? '▶️' : '🖼️'}
                      </span>
                      <span style={{flex:1,fontSize:12,fontWeight:700,color:'#334155',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {noticia.archivo_nombre}
                      </span>
                      <button onClick={()=>downloadPublic(streamUrl, noticia.archivo_nombre)} style={{
                        display:'flex',alignItems:'center',gap:5,padding:'7px 14px',
                        borderRadius:10,background:'#0f172a',color:'white',border:'none',cursor:'pointer',
                        fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:.5,
                      }}>
                        ↓ Descargar
                      </button>
                      <button onClick={()=>setLightbox(true)} style={{
                        display:'flex',alignItems:'center',gap:5,padding:'7px 14px',
                        borderRadius:10,background:'#f0fdf4',
                        color:'#059669',border:'none',cursor:'pointer',
                        fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:.5,
                      }}>
                        👁 Ver
                      </button>
                    </div>
                  </div>
                )}

                <div style={{display:'flex',justifyContent:'flex-end',paddingTop:4,animation:'pubFade .4s ease-out .5s both'}}>
                  <button onClick={handleClose}
                    style={{display:'flex',alignItems:'center',gap:8,padding:'12px 36px',borderRadius:14,background:'#0f172a',color:'white',border:'none',cursor:'pointer',fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:1}}
                    onMouseOver={e=>(e.currentTarget.style.background='#059669')}
                    onMouseOut={e=>(e.currentTarget.style.background='#0f172a')}>
                    Cerrar →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── CAMIÓN ── */}
        <div style={{flexShrink:0,width:'100%',position:'relative',animation:truckAnim}}>
          {smoking && (
            <div style={{position:'absolute',left:'10.1%',bottom:'100%',width:70,height:340,pointerEvents:'none',zIndex:10}}>
              {SMOKE.map((p,i)=><SmokeParticle key={i} {...p}/>)}
            </div>
          )}
          <TruckSVG/>
        </div>

        {/* ── CARRETERA ── */}
        <div style={{flexShrink:0,height:6,background:'#1e293b',width:'100%'}}/>
        <div style={{flexShrink:0,height:42,background:'#0a0f1a',display:'flex',alignItems:'center',padding:'0 28px',gap:20}}>
          {Array.from({length:26}).map((_,i)=>(
            <div key={i} style={{flex:1,height:2,background:'#1e293b',borderRadius:9999}}/>
          ))}
        </div>
      </div>

      {/* ── LIGHTBOX ── */}
      {lightbox && noticia?.archivo_nombre && (
        <Lightbox
          url={streamUrl}
          tipo={noticia.archivo_tipo}
          nombre={noticia.archivo_nombre}
          onClose={()=>setLightbox(false)}
        />
      )}
    </>
  );
}
