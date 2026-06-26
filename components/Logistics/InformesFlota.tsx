import React, { useState, useCallback, useMemo } from 'react';
import { DataTable } from '../shared/DataTable';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, Sector,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface User { id: string; name: string; }
interface Props { user: User; }

const COLORS = [
  '#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6',
  '#a855f7','#3b82f6','#e11d48','#65a30d','#0891b2',
  '#d946ef','#0ea5e9','#10b981','#f43f5e','#7c3aed',
];

const TDM_COLORS = ['#f59e0b','#fbbf24','#fcd34d','#f97316','#fb923c','#fdba74','#fde68a','#d97706','#b45309','#92400e','#78350f','#451a03'];

const CITY_TO_DEPT: Record<string, string> = {
  // ANTIOQUIA
  'MEDELLIN':'ANTIOQUIA','ITAGUI':'ANTIOQUIA','ENVIGADO':'ANTIOQUIA','BELLO':'ANTIOQUIA',
  'SABANETA':'ANTIOQUIA','LA ESTRELLA':'ANTIOQUIA','COPACABANA':'ANTIOQUIA','GIRARDOTA':'ANTIOQUIA',
  'CALDAS':'ANTIOQUIA','BARBOSA':'ANTIOQUIA','RIONEGRO':'ANTIOQUIA','MARINILLA':'ANTIOQUIA',
  'GUARNE':'ANTIOQUIA','CARMEN DE VIBORAL':'ANTIOQUIA','EL CARMEN DE VIBORAL':'ANTIOQUIA',
  'CAUCASIA':'ANTIOQUIA','CAÑASGORDAS':'ANTIOQUIA','GOMEZ PLATA':'ANTIOQUIA','JARDIN':'ANTIOQUIA',
  'ARBOLETES':'ANTIOQUIA','SAN JUAN DE URABA':'ANTIOQUIA','SAN PEDRO':'ANTIOQUIA',
  'AMAGA':'ANTIOQUIA','LA CEJA':'ANTIOQUIA','SAN LUIS':'ANTIOQUIA','SONSON':'ANTIOQUIA',
  'SANTA ROSA DE OSOS':'ANTIOQUIA','APARTADO':'ANTIOQUIA','TURBO':'ANTIOQUIA',
  'CAREPA':'ANTIOQUIA','CHIGORODO':'ANTIOQUIA','DON MATIAS':'ANTIOQUIA',
  'ENTRERRIOS':'ANTIOQUIA','ENTRERRÍOS':'ANTIOQUIA','YARUMAL':'ANTIOQUIA',
  'FREDONIA':'ANTIOQUIA','AMALFI':'ANTIOQUIA','CISNEROS':'ANTIOQUIA','YALI':'ANTIOQUIA',
  'MACEO':'ANTIOQUIA','LA UNION':'ANTIOQUIA','ABEJORRAL':'ANTIOQUIA','GRANADA':'ANTIOQUIA',
  'COCORNA':'ANTIOQUIA','SAN CARLOS':'ANTIOQUIA','SAN RAFAEL':'ANTIOQUIA',
  'VENECIA':'ANTIOQUIA','MONTEBELLO':'ANTIOQUIA','LA CEJA DEL TAMBO':'ANTIOQUIA',
  'LA PINTADA':'ANTIOQUIA','VALPARAISO':'ANTIOQUIA','CIUDAD BOLIVAR':'ANTIOQUIA',
  'ANDES':'ANTIOQUIA','BETANIA':'ANTIOQUIA','CONCORDIA':'ANTIOQUIA','SALGAR':'ANTIOQUIA',
  'URRAO':'ANTIOQUIA','DABEIBA':'ANTIOQUIA','FRONTINO':'ANTIOQUIA',
  'ANGOSTURA':'ANTIOQUIA','CAMPAMENTO':'ANTIOQUIA','VALDIVIA':'ANTIOQUIA',
  'SEGOVIA':'ANTIOQUIA','REMEDIOS':'ANTIOQUIA','EL BAGRE':'ANTIOQUIA',
  'ZARAGOZA':'ANTIOQUIA','CACERES':'ANTIOQUIA','TARAZA':'ANTIOQUIA','TARAZÁ':'ANTIOQUIA',
  'NECHI':'ANTIOQUIA','NECHÍ':'ANTIOQUIA','SAN PEDRO DE URABA':'ANTIOQUIA',
  'SOPETRAN':'ANTIOQUIA','SOPETRÁN':'ANTIOQUIA','GIRALDO':'ANTIOQUIA',
  'LIBORINA':'ANTIOQUIA','SABANALARGA':'ANTIOQUIA','OLAYA':'ANTIOQUIA',
  'BELMIRA':'ANTIOQUIA','SAN JOSE DE LA MONTAÑA':'ANTIOQUIA',
  'ARMENIA ANTIOQUIA':'ANTIOQUIA','PUEBLORRICO':'ANTIOQUIA',
  // VALLE DEL CAUCA
  'CALI':'VALLE DEL CAUCA','YUMBO':'VALLE DEL CAUCA','PALMIRA':'VALLE DEL CAUCA',
  'BUENAVENTURA':'VALLE DEL CAUCA','CARTAGO':'VALLE DEL CAUCA','GINEBRA':'VALLE DEL CAUCA',
  'LA CUMBRE':'VALLE DEL CAUCA','JAMUNDI':'VALLE DEL CAUCA','TULUA':'VALLE DEL CAUCA',
  'BUGA':'VALLE DEL CAUCA','GUADALAJARA DE BUGA':'VALLE DEL CAUCA','DAGUA':'VALLE DEL CAUCA',
  'SEVILLA':'VALLE DEL CAUCA','CAICEDONIA':'VALLE DEL CAUCA','ZARZAL':'VALLE DEL CAUCA',
  'ROLDANILLO':'VALLE DEL CAUCA','TORO':'VALLE DEL CAUCA','ALCALA':'VALLE DEL CAUCA',
  'OBANDO':'VALLE DEL CAUCA','LA VICTORIA':'VALLE DEL CAUCA','ANSERMANUEVO':'VALLE DEL CAUCA',
  'EL AGUILA':'VALLE DEL CAUCA','VERSALLES':'VALLE DEL CAUCA','TRUJILLO':'VALLE DEL CAUCA',
  'BUGALAGRANDE':'VALLE DEL CAUCA','ANDALUCIA':'VALLE DEL CAUCA','RESTREPO':'VALLE DEL CAUCA',
  'CALIMA':'VALLE DEL CAUCA','EL CERRITO':'VALLE DEL CAUCA','GUACARI':'VALLE DEL CAUCA',
  'FLORIDA':'VALLE DEL CAUCA','PRADERA':'VALLE DEL CAUCA','CANDELARIA':'VALLE DEL CAUCA',
  // CORDOBA
  'MONTERIA':'CORDOBA','VALENCIA':'CORDOBA','CERETE':'CORDOBA','CHINU':'CORDOBA',
  'LORICA':'CORDOBA','PUEBLO NUEVO':'CORDOBA','PUERTO LIBERTADOR':'CORDOBA',
  'SAN BERNARDO DEL VIENTO':'CORDOBA','TIERRALTA':'CORDOBA','MONTELIBANO':'CORDOBA',
  'SAHAGUN':'CORDOBA','SAHAGÚN':'CORDOBA','PLANETA RICA':'CORDOBA',
  'COTORRA':'CORDOBA','CANALETE':'CORDOBA','SAN ANTERO':'CORDOBA',
  'PUERTO ESCONDIDO':'CORDOBA','LOS CORDOBAS':'CORDOBA',
  // CUNDINAMARCA / BOGOTA
  'BOGOTA':'CUNDINAMARCA','BOGOTÁ':'CUNDINAMARCA','BOGOTA D.C.':'CUNDINAMARCA',
  'BOGOTÁ D.C.':'CUNDINAMARCA','BOGOTA, DISTRITO CAPITAL':'CUNDINAMARCA',
  'COTA':'CUNDINAMARCA','FUNZA':'CUNDINAMARCA','MOSQUERA':'CUNDINAMARCA',
  'MADRID':'CUNDINAMARCA','FACATATIVA':'CUNDINAMARCA','FACATATIVÁ':'CUNDINAMARCA',
  'ZIPAQUIRA':'CUNDINAMARCA','ZIPAQUIRÁ':'CUNDINAMARCA','CHIA':'CUNDINAMARCA','CHÍA':'CUNDINAMARCA',
  'CAJICA':'CUNDINAMARCA','CAJICÁ':'CUNDINAMARCA','SOACHA':'CUNDINAMARCA',
  'FUSAGASUGA':'CUNDINAMARCA','FUSAGASUGÁ':'CUNDINAMARCA','GIRARDOT':'CUNDINAMARCA',
  'TOCANCIPA':'CUNDINAMARCA','TOCANCIPÁ':'CUNDINAMARCA','SOPÓ':'CUNDINAMARCA','SOPO':'CUNDINAMARCA',
  'LA CALERA':'CUNDINAMARCA','GUASCA':'CUNDINAMARCA','VILLETA':'CUNDINAMARCA',
  'TABIO':'CUNDINAMARCA','TENJO':'CUNDINAMARCA','SUBACHOQUE':'CUNDINAMARCA',
  'EL ROSAL':'CUNDINAMARCA','UBATE':'CUNDINAMARCA','UBATÉ':'CUNDINAMARCA',
  'VILLA DE SAN DIEGO DE UBATE':'CUNDINAMARCA','VILLA DE SAN DIEGO DE UBATÉ':'CUNDINAMARCA',
  // ATLANTICO
  'BARRANQUILLA':'ATLANTICO','SOLEDAD':'ATLANTICO','MALAMBO':'ATLANTICO',
  'GALAPA':'ATLANTICO','BARANOA':'ATLANTICO','PUERTO COLOMBIA':'ATLANTICO',
  // BOLIVAR
  'CARTAGENA':'BOLIVAR','MAGANGUE':'BOLIVAR','MAGANGUÉ':'BOLIVAR',
  'MARIA LA BAJA':'BOLIVAR','ARJONA':'BOLIVAR','TURBACO':'BOLIVAR',
  'EL CARMEN DE BOLIVAR':'BOLIVAR','MOMPOX':'BOLIVAR','MOMPOS':'BOLIVAR',
  'SANTA ROSA DEL SUR':'BOLIVAR','SAN PABLO BOLIVAR':'BOLIVAR',
  'MORALES BOLIVAR':'BOLIVAR','SAN JUAN NEPOMUCENO':'BOLIVAR',
  // MAGDALENA
  'SANTA MARTA':'MAGDALENA','PLATO':'MAGDALENA','FUNDACION':'MAGDALENA',
  'CIENAGA':'MAGDALENA','CIÉNAGA':'MAGDALENA','ARACATACA':'MAGDALENA',
  'EL BANCO':'MAGDALENA','PIVIJAY':'MAGDALENA',
  // SUCRE
  'SINCELEJO':'SUCRE','MAJAGUAL':'SUCRE','SAN MARCOS':'SUCRE','TOLUVIEJO':'SUCRE',
  'COROZAL':'SUCRE','SAMPUES':'SUCRE','MORROA':'SUCRE','OVEJAS':'SUCRE',
  'GUARANDA':'SUCRE','LOS PALMITOS':'SUCRE','SINCE':'SUCRE','GALERAS':'SUCRE',
  // CESAR
  'VALLEDUPAR':'CESAR','AGUACHICA':'CESAR','LA PAZ':'CESAR','BOSCONIA':'CESAR',
  'CODAZZI':'CESAR','CURUMANI':'CESAR','PAILITAS':'CESAR','CHIMICHAGUA':'CESAR',
  // LA GUAJIRA
  'HATONUEVO':'LA GUAJIRA','RIOHACHA':'LA GUAJIRA','MAICAO':'LA GUAJIRA',
  'MANAURE':'LA GUAJIRA','URIBIA':'LA GUAJIRA','FONSECA':'LA GUAJIRA',
  'SAN JUAN DEL CESAR':'LA GUAJIRA',
  // RISARALDA
  'PEREIRA':'RISARALDA','DOSQUEBRADAS':'RISARALDA','SANTA ROSA DE CABAL':'RISARALDA',
  'LA VIRGINIA':'RISARALDA','MARSELLA':'RISARALDA','QUINCHIA':'RISARALDA',
  // CALDAS (depto)
  'MANIZALES':'CALDAS','CHINCHINA':'CALDAS','VILLAMARIA':'CALDAS','RIOSUCIO':'CALDAS',
  'LA DORADA':'CALDAS','MANZANARES':'CALDAS','MARQUETALIA':'CALDAS','PENSILVANIA':'CALDAS',
  // QUINDIO
  'ARMENIA':'QUINDIO','CALARCA':'QUINDIO','LA TEBAIDA':'QUINDIO','MONTENEGRO':'QUINDIO',
  'QUIMBAYA':'QUINDIO','CIRCASIA':'QUINDIO','SALENTO':'QUINDIO',
  // TOLIMA
  'IBAGUE':'TOLIMA','ESPINAL':'TOLIMA','MELGAR':'TOLIMA','HONDA':'TOLIMA',
  'MARIQUITA':'TOLIMA','FLANDES':'TOLIMA','FRESNO':'TOLIMA','LERIDA':'TOLIMA',
  'CHAPARRAL':'TOLIMA','PURIFICACION':'TOLIMA','NATAGAIMA':'TOLIMA',
  // HUILA
  'NEIVA':'HUILA','PITALITO':'HUILA','GARZON':'HUILA','GARZÓN':'HUILA',
  'LA PLATA':'HUILA','CAMPOALEGRE':'HUILA','PALERMO':'HUILA','RIVERA':'HUILA',
  'GIGANTE':'HUILA','AGRADO':'HUILA',
  // META
  'VILLAVICENCIO':'META','ACACIAS':'META','CUMARAL':'META','RESTREPO META':'META',
  // CASANARE
  'YOPAL':'CASANARE','AGUAZUL':'CASANARE','TAURAMENA':'CASANARE','MONTERREY':'CASANARE',
  // NORTE DE SANTANDER
  'CUCUTA':'NORTE DE SANTANDER','CÚCUTA':'NORTE DE SANTANDER',
  'OCAÑA':'NORTE DE SANTANDER','OCANA':'NORTE DE SANTANDER',
  'PAMPLONA':'NORTE DE SANTANDER','VILLA DEL ROSARIO':'NORTE DE SANTANDER',
  'LOS PATIOS':'NORTE DE SANTANDER','EL ZULIA':'NORTE DE SANTANDER',
  // SANTANDER
  'BUCARAMANGA':'SANTANDER','FLORIDABLANCA':'SANTANDER','GIRON':'SANTANDER',
  'GIRÓN':'SANTANDER','PIEDECUESTA':'SANTANDER','LEBRIJA':'SANTANDER',
  'BARRANCABERMEJA':'SANTANDER','SAN GIL':'SANTANDER','SOCORRO':'SANTANDER',
  'BARBOSA SANTANDER':'SANTANDER',
  // CAUCA
  'POPAYAN':'CAUCA','POPAYÁN':'CAUCA','SANTANDER DE QUILICHAO':'CAUCA',
  'PUERTO TEJADA':'CAUCA','PADILLA':'CAUCA',
  // NARIÑO
  'PASTO':'NARIÑO','IPIALES':'NARIÑO','TUMACO':'NARIÑO','TUQUERRES':'NARIÑO',
  // BOYACA
  'TUNJA':'BOYACA','SOGAMOSO':'BOYACA','DUITAMA':'BOYACA','CHIQUINQUIRA':'BOYACA',
  'PAIPA':'BOYACA','NOBSA':'BOYACA','TIBASOSA':'BOYACA',
  // CHOCO
  'QUIBDO':'CHOCO','QUIBDÓ':'CHOCO',
  // PUTUMAYO
  'MOCOA':'PUTUMAYO','PUERTO ASIS':'PUTUMAYO','PUERTO ASÍS':'PUTUMAYO',
  // CAQUETA
  'FLORENCIA':'CAQUETA','SAN VICENTE DEL CAGUAN':'CAQUETA',
};

const getDepartment = (city: string, learned: Record<string, string> = {}) => {
  const cleanCity = (city || '').toUpperCase().trim();
  return CITY_TO_DEPT[cleanCity] || learned[cleanCity] || cleanCity || 'SIN DEPTO.';
};

const EmptyChart = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center h-64 text-slate-300">
    <p className="text-4xl mb-2">📊</p>
    <p className="text-xs font-bold uppercase tracking-widest">{label}</p>
    <p className="text-[10px] mt-1">Sin datos en el rango seleccionado</p>
  </div>
);

const truncateName = (str: string, maxLen: number = 18) => {
  return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
};

const InteractiveBarCard = ({
  title, data, colors, rawRows, primaryGroup, secondaryGroup, dateRange, dualColumns, learnedDepts, grandTotal
}: {
  title: string;
  data: any[];
  colors: string[];
  rawRows: any[];
  primaryGroup: 'client' | 'department';
  secondaryGroup: 'client' | 'department';
  dateRange: string;
  dualColumns?: boolean;
  learnedDepts?: Record<string, string>;
  grandTotal?: number;
}) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const baseTotal = grandTotal ?? total;

  const selected = activeIdx !== null ? data[activeIdx] : null;

  const getPrimaryName = (r: any) => primaryGroup === 'client' ? r.client_name : getDepartment(r.department || r.city, learnedDepts);
  const getSecondaryName = (r: any) => secondaryGroup === 'client' ? r.client_name : getDepartment(r.department || r.city, learnedDepts);

  // Filter rows based on selection
  const filteredRows = selected 
    ? rawRows.filter(r => getPrimaryName(r) === selected.name)
    : rawRows; 

  // Group breakdown
  const detailBreakdown = selected
    ? Object.entries(
        filteredRows.reduce((acc: Record<string, number>, r) => {
          const key = dualColumns
            ? `${r.client_name}|||${getDepartment(r.department || r.city, learnedDepts)}`
            : getSecondaryName(r);
          acc[key] = (acc[key] || 0) + r.quantity;
          return acc;
        }, {})
      ).map(([key, qty]) => {
         if (dualColumns) {
           const [client, dept] = key.split('|||');
           return { client, dept, qty: qty as number };
         }
         return { label: key, qty: qty as number };
      }).sort((a, b) => b.qty - a.qty)
    : Object.entries(
        filteredRows.reduce((acc: Record<string, number>, r) => {
          const key = dualColumns
            ? `${r.client_name}|||${getDepartment(r.department || r.city, learnedDepts)}`
            : getPrimaryName(r);
          acc[key] = (acc[key] || 0) + r.quantity;
          return acc;
        }, {})
      ).map(([key, qty]) => {
         if (dualColumns) {
           const [client, dept] = key.split('|||');
           return { client, dept, qty: qty as number };
         }
         return { label: key, qty: qty as number };
      }).sort((a, b) => b.qty - a.qty);

  const primaryLabel = primaryGroup === 'client' ? 'Cliente' : 'Departamento';
  const secondaryLabel = secondaryGroup === 'client' ? 'Cliente' : 'Departamento';

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">{title}</h3>
        <span className="px-3 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-500">{total} viajes</span>
      </div>

      {data.length === 0 ? (
        <EmptyChart label="Sin operaciones" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={460}>
            <BarChart data={data} margin={{ top: 30, right: 20, bottom: 120, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tickFormatter={(v) => truncateName(v)} angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 9, fontWeight: 600, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                formatter={(v: any, name: string) => [
                  `${v} viajes (${((v / baseTotal) * 100).toFixed(1)}%)`, 'Viajes'
                ]}
              />
              <Bar dataKey="value" onClick={(e, idx) => setActiveIdx(prev => prev === idx ? null : idx)} cursor="pointer">
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]}
                    opacity={activeIdx === null || activeIdx === i ? 1 : 0.45} />
                ))}
                <LabelList dataKey="value" position="top"
                  formatter={(v: number) => `${v} (${baseTotal > 0 ? ((v / baseTotal) * 100).toFixed(1) : 0}%)`}
                  style={{ fontSize: 9, fontWeight: 'bold', fill: '#475569' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Detail panel */}
          <div className={`mt-4 rounded-2xl border-2 p-4 transition-all`}
            style={{ 
              borderColor: selected ? colors[activeIdx! % colors.length] + '55' : '#e2e8f0', 
              background: selected ? colors[activeIdx! % colors.length] + '0d' : '#f8fafc' 
            }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                {selected ? (
                  <>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colors[activeIdx! % colors.length] }} />
                    <span className="font-black text-slate-800 text-sm leading-tight">
                      {selected.name} <span className="text-slate-400 font-bold ml-1">({dateRange}) — {selected.value.toLocaleString('es-CO')} Viajes</span>
                    </span>
                  </>
                ) : (
                  <span className="font-black text-slate-800 text-sm flex items-center gap-2">
                    <span className="text-lg">📋</span> TODA LA INFORMACIÓN 
                    <span className="text-slate-400 font-bold ml-1">({dateRange}) — {total.toLocaleString('es-CO')} Viajes</span>
                  </span>
                )}
              </div>
              {selected && (
                <button onClick={() => setActiveIdx(null)}
                  className="text-slate-500 hover:text-slate-800 text-xs font-black px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-all flex-shrink-0 border border-slate-200 bg-white shadow-sm">
                  ✕ Mostrar Todos
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Viajes</p>
                <p className="text-xl font-black" style={{ color: selected ? colors[activeIdx! % colors.length] : '#475569' }}>
                  {(selected ? selected.value : total).toLocaleString('es-CO')}
                </p>
              </div>
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">% del Total</p>
                <p className="text-xl font-black text-slate-700">
                  {selected ? ((selected.value / baseTotal) * 100).toFixed(1) : ((total / baseTotal) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  {dualColumns ? 'Registros' : (selected ? secondaryLabel : primaryLabel) + '(s)'}
                </p>
                <p className="text-xl font-black text-slate-700">{detailBreakdown.length}</p>
              </div>
            </div>

            {detailBreakdown.length > 0 && (() => {
              const tableData = detailBreakdown.map((row: any) => ({
                ...row,
                pct: parseFloat(((row.qty / baseTotal) * 100).toFixed(1)),
              }));
              const colLabel = selected ? secondaryLabel : primaryLabel;
              const columns = dualColumns
                ? [
                    { header: 'Cliente',       key: 'client', sortable: true, render: (r: any) => <span className="font-bold text-slate-800">{r.client}</span> },
                    { header: 'Departamento',  key: 'dept',   sortable: true, render: (r: any) => <span className="font-semibold text-slate-500">{r.dept}</span> },
                    { header: 'Viajes',        key: 'qty',    sortable: true, render: (r: any) => <span className="font-black text-slate-900">{r.qty}</span> },
                    { header: '%',             key: 'pct',    sortable: true, render: (r: any) => <span className="font-bold text-slate-500">{r.pct}%</span> },
                  ]
                : [
                    { header: colLabel, key: 'label', sortable: true, render: (r: any) => <span className="font-bold text-slate-800">{r.label}</span> },
                    { header: 'Viajes', key: 'qty',   sortable: true, render: (r: any) => <span className="font-black text-slate-900">{r.qty}</span> },
                    { header: '%',      key: 'pct',   sortable: true, render: (r: any) => <span className="font-bold text-slate-500">{r.pct}%</span> },
                  ];
              return (
                <DataTable
                  data={tableData}
                  columns={columns}
                  searchPlaceholder="Buscar..."
                  excelFileName={`flota_detalle_${title.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`}
                />
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
};

export default function InformesFlota({ user: _user }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState<any[]>([]);
  const [tdmFinancial, setTdmFinancial] = useState<{ totalCobrar: number; totalPagar: number; totalManif: number }>({ totalCobrar: 0, totalPagar: 0, totalManif: 0 });
  const [tdmDetailRows, setTdmDetailRows] = useState<any[]>([]);
  const [tdmOpenSection, setTdmOpenSection] = useState<'cliente' | 'ruta' | 'placa' | null>('cliente');
  const [searched, setSearched] = useState(false);
  const [learnedDepts, setLearnedDepts] = useState<Record<string, string>>({});

  const handleSearch = useCallback(async () => {
    if (!from || !to) { toast.error('Seleccione rango de fechas'); return; }
    setLoading(true);
    try {
      const [res, tdmSummaryRes, tdmDetailRes] = await Promise.all([
        api.getFlotaReport({ from, to }),
        api.getTdmManifiestos({ from, to, view: 'summary' }).catch(() => ({ success: false, data: [] })),
        api.getTdmManifiestos({ from, to, view: 'detail' }).catch(() => ({ success: false, data: [] })),
      ]);
      if (res.success) {
        setRawData(res.data || []);
        setSearched(true);
      } else {
        toast.error(res.error || 'Error al cargar datos');
      }
      if (tdmSummaryRes.success) {
        const rows = tdmSummaryRes.data || [];
        setTdmFinancial({
          totalCobrar: rows.reduce((s: number, r: any) => s + Number(r.total_cobrar || 0), 0),
          totalPagar:  rows.reduce((s: number, r: any) => s + Number(r.total_pagar  || 0), 0),
          totalManif:  rows.reduce((s: number, r: any) => s + Number(r.total_manifiestos || 0), 0),
        });
      }
      if (tdmDetailRes.success) {
        setTdmDetailRows(tdmDetailRes.data || []);
      }
      // Lookup asíncrono de ciudades desconocidas
      if (res.success) {
        const allCities = [...new Set((res.data || []).map((r: any) => ((r.department || r.city) || '').toUpperCase().trim()))].filter(Boolean) as string[];
        const unknown = allCities.filter(c => !CITY_TO_DEPT[c]);
        if (unknown.length > 0) {
          api.lookupCities(unknown).then(lr => {
            if (lr?.mapping) setLearnedDepts(prev => ({ ...prev, ...lr.mapping }));
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const groupRows = (rows: any[], keyFn: (r: any) => string) => {
    const map = new Map<string, number>();
    rows.forEach(r => {
      const key = keyFn(r);
      map.set(key, (map.get(key) || 0) + r.quantity);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const m7Rows  = rawData.filter(r => r.operator === 'M7');
  const tdmRows = rawData.filter(r => r.operator === 'TDM');

  const m7Data  = groupRows(m7Rows, r => r.client_name);
  const tdmData = groupRows(tdmRows, r => r.client_name);

  // Data grouped by Department
  const m7DeptData  = groupRows(m7Rows, r => getDepartment(r.department || r.city, learnedDepts));
  const tdmDeptData = groupRows(tdmRows, r => getDepartment(r.department || r.city, learnedDepts));

  const CITY_COLORS = [
    '#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6',
    '#a855f7','#3b82f6',
  ];

  const m7Clients  = new Set(m7Rows.map(r => r.client_name)).size;
  const tdmClients = new Set(tdmRows.map(r => r.client_name)).size;
  const totalClients = m7Clients + tdmClients || 1;

  const barData = [
    { name: 'Milla 7', clientes: m7Clients, viajes: m7Rows.reduce((s, r) => s + r.quantity, 0), pct: Math.round((m7Clients / totalClients) * 100), fill: '#6366f1' },
    { name: 'TDM',     clientes: tdmClients, viajes: tdmRows.reduce((s, r) => s + r.quantity, 0), pct: Math.round((tdmClients / totalClients) * 100), fill: '#f59e0b' },
  ];

  const totalViajes = rawData.reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Módulo Gerencia • PAG-61</p>
          <h1 className="text-2xl font-black text-slate-900 mt-0.5">Informes Flota</h1>
          <p className="text-sm text-slate-500 mt-0.5">Distribución de operaciones por cliente, operador y ciudad</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-400 transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-400 transition-all" />
          </div>
          <button onClick={handleSearch} disabled={loading}
            className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50">
            {loading ? 'Cargando...' : '📊 Generar Informe'}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {searched && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Viajes', value: totalViajes.toLocaleString('es-CO'), color: 'bg-indigo-600', icon: '🚛' },
              { label: 'Viajes M7', value: m7Rows.reduce((s, r) => s + r.quantity, 0).toLocaleString('es-CO'), color: 'bg-violet-600', icon: '🏢' },
              { label: 'Viajes TDM', value: tdmRows.reduce((s, r) => s + r.quantity, 0).toLocaleString('es-CO'), color: 'bg-amber-500', icon: '⭐' },
              { label: 'Clientes', value: new Set(rawData.map(r => r.client_name)).size.toLocaleString('es-CO'), color: 'bg-emerald-600', icon: '👥' },
            ].map(k => (
              <div key={k.label} className={`${k.color} text-white rounded-3xl p-5 shadow-sm`}>
                <p className="text-2xl">{k.icon}</p>
                <p className="text-2xl font-black mt-1">{k.value}</p>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
          {tdmFinancial.totalManif > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Manifiestos TDM', value: tdmFinancial.totalManif.toLocaleString('es-CO'), color: 'bg-amber-700', icon: '📋' },
                { label: 'TDM — Total Cobrar', value: `$${tdmFinancial.totalCobrar.toLocaleString('es-CO')}`, color: 'bg-emerald-700', icon: '💰' },
                { label: 'TDM — Total Pagar',  value: `$${tdmFinancial.totalPagar.toLocaleString('es-CO')}`,  color: 'bg-rose-700',    icon: '📤' },
              ].map(k => (
                <div key={k.label} className={`${k.color} text-white rounded-3xl p-5 shadow-sm`}>
                  <p className="text-2xl">{k.icon}</p>
                  <p className="text-xl font-black mt-1">{k.value}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gráficas interactivas — ancho completo */}
      {searched && (
        <>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            Haz clic en una tajada para ver detalle del cliente
          </p>

          <InteractiveBarCard title="🏢 Flota M7 — Por Cliente" data={m7Data} colors={COLORS} rawRows={m7Rows} primaryGroup="client" secondaryGroup="department" dateRange={`${from} a ${to}`} learnedDepts={learnedDepts} grandTotal={totalViajes} />
          <InteractiveBarCard title="⭐ Flota TDM — Por Cliente" data={tdmData} colors={TDM_COLORS} rawRows={tdmRows} primaryGroup="client" secondaryGroup="department" dateRange={`${from} a ${to}`} learnedDepts={learnedDepts} grandTotal={totalViajes} />

          <div className="grid grid-cols-1 gap-6">
            <InteractiveBarCard title="🏙️ Flota M7 — Por Departamento" data={m7DeptData} colors={CITY_COLORS} rawRows={m7Rows} primaryGroup="department" secondaryGroup="client" dateRange={`${from} a ${to}`} dualColumns learnedDepts={learnedDepts} grandTotal={totalViajes} />
            <InteractiveBarCard title="🗺️ Flota TDM — Por Departamento" data={tdmDeptData} colors={TDM_COLORS.slice().reverse()} rawRows={tdmRows} primaryGroup="department" secondaryGroup="client" dateRange={`${from} a ${to}`} dualColumns learnedDepts={learnedDepts} grandTotal={totalViajes} />
          </div>

          {/* Gráfica comparativa */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">📊 Comparativo M7 vs TDM — Clientes y Viajes</h3>
            </div>
            {(m7Clients === 0 && tdmClients === 0) ? (
              <EmptyChart label="Sin datos para comparativo" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Cantidad de Clientes</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip formatter={(v: any) => [`${v} clientes`, 'Clientes']} />
                      <Bar dataKey="clientes" radius={[8, 8, 0, 0]}>
                        {barData.map((b, i) => <Cell key={i} fill={b.fill} />)}
                        <LabelList dataKey="pct" position="top" formatter={(v: any) => `${v}%`} style={{ fontSize: 11, fontWeight: 'bold' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Cantidad de Viajes</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip formatter={(v: any) => [`${v} viajes`, 'Viajes']} />
                      <Bar dataKey="viajes" radius={[8, 8, 0, 0]}>
                        {barData.map((b, i) => <Cell key={i} fill={b.fill} />)}
                        <LabelList dataKey="viajes" position="top" style={{ fontSize: 11, fontWeight: 'bold' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="lg:col-span-2 border-t border-slate-100 pt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="text-left pb-3">Operador</th>
                        <th className="text-right pb-3">Clientes</th>
                        <th className="text-right pb-3">% Clientes</th>
                        <th className="text-right pb-3">Viajes</th>
                        <th className="text-right pb-3">% Viajes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barData.map(b => (
                        <tr key={b.name} className="border-t border-slate-50">
                          <td className="py-2.5 font-black" style={{ color: b.fill }}>{b.name}</td>
                          <td className="text-right font-bold text-slate-700">{b.clientes}</td>
                          <td className="text-right font-bold text-slate-500">{b.pct}%</td>
                          <td className="text-right font-bold text-slate-700">{b.viajes.toLocaleString('es-CO')}</td>
                          <td className="text-right font-bold text-slate-500">
                            {totalViajes > 0 ? Math.round((b.viajes / totalViajes) * 100) : 0}%
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 font-black text-slate-900">
                        <td className="py-2.5">TOTAL</td>
                        <td className="text-right">{m7Clients + tdmClients}</td>
                        <td className="text-right">100%</td>
                        <td className="text-right">{totalViajes.toLocaleString('es-CO')}</td>
                        <td className="text-right">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Detalle Financiero TDM Flota ──────────────────────────────── */}
      {searched && tdmDetailRows.length > 0 && (() => {
        const fmt = (n: number) => `$${Number(n || 0).toLocaleString('es-CO')}`;

        // Agrupar por cliente
        const byClient = new Map<string, { manifiestos: number; cobrar: number; pagar: number }>();
        tdmDetailRows.forEach((r: any) => {
          const k = `TDM ${r.client_name || 'Sin cliente'}`;
          const cur = byClient.get(k) || { manifiestos: 0, cobrar: 0, pagar: 0 };
          cur.manifiestos++; cur.cobrar += Number(r.valor_cobrar || 0); cur.pagar += Number(r.valor_pagar || 0);
          byClient.set(k, cur);
        });
        const clientRows = Array.from(byClient.entries()).map(([cliente, d]) => ({ cliente, ...d, margen: d.cobrar - d.pagar })).sort((a, b) => b.cobrar - a.cobrar);

        // Agrupar por ruta
        const byRoute = new Map<string, { manifiestos: number; cobrar: number; pagar: number }>();
        tdmDetailRows.forEach((r: any) => {
          const k = `${r.ciudad_origen || 'S/O'} → ${r.ciudad_destino || 'S/D'}`;
          const cur = byRoute.get(k) || { manifiestos: 0, cobrar: 0, pagar: 0 };
          cur.manifiestos++; cur.cobrar += Number(r.valor_cobrar || 0); cur.pagar += Number(r.valor_pagar || 0);
          byRoute.set(k, cur);
        });
        const routeRows = Array.from(byRoute.entries()).map(([ruta, d]) => ({ ruta, ...d })).sort((a, b) => b.manifiestos - a.manifiestos);

        // Agrupar por placa
        const byPlaca = new Map<string, { manifiestos: number; cobrar: number; pagar: number }>();
        tdmDetailRows.forEach((r: any) => {
          const k = r.placa || 'Sin placa';
          const cur = byPlaca.get(k) || { manifiestos: 0, cobrar: 0, pagar: 0 };
          cur.manifiestos++; cur.cobrar += Number(r.valor_cobrar || 0); cur.pagar += Number(r.valor_pagar || 0);
          byPlaca.set(k, cur);
        });
        const placaRows = Array.from(byPlaca.entries()).map(([placa, d]) => ({ placa, ...d })).sort((a, b) => b.manifiestos - a.manifiestos);

        const totalCobrar = tdmDetailRows.reduce((s: number, r: any) => s + Number(r.valor_cobrar || 0), 0);
        const totalPagar  = tdmDetailRows.reduce((s: number, r: any) => s + Number(r.valor_pagar  || 0), 0);

        const sections: { key: 'cliente' | 'ruta' | 'placa'; label: string; icon: string }[] = [
          { key: 'cliente', label: 'Por Cliente', icon: '🏢' },
          { key: 'ruta',    label: 'Por Ruta',    icon: '📍' },
          { key: 'placa',   label: 'Por Placa',   icon: '🚛' },
        ];

        return (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Operaciones Flota Manual</p>
                <h3 className="text-base font-black text-slate-900">Detalle Financiero TDM</h3>
              </div>
              <div className="flex gap-3">
                <div className="text-center">
                  <p className="text-lg font-black text-emerald-700">{fmt(totalCobrar)}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Total Cobrar</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-rose-600">{fmt(totalPagar)}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Total Pagar</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-indigo-700">{fmt(totalCobrar - totalPagar)}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Margen</p>
                </div>
              </div>
            </div>

            {/* Tabs de sección */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
              {sections.map(s => (
                <button key={s.key} onClick={() => setTdmOpenSection(prev => prev === s.key ? null : s.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                    ${tdmOpenSection === s.key ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>

            {tdmOpenSection === 'cliente' && (
              <DataTable
                data={clientRows}
                searchPlaceholder="Buscar cliente..."
                excelFileName="tdm_por_cliente.xlsx"
                columns={[
                  { header: 'Cliente', key: 'cliente', sortable: true, render: r => <span className="font-black text-amber-700">{r.cliente}</span> },
                  { header: 'Manifiestos', key: 'manifiestos', sortable: true, render: r => <span className="font-black">{r.manifiestos}</span> },
                  { header: 'V. Cobrar', key: 'cobrar', sortable: true, render: r => <span className="font-bold text-emerald-700">{fmt(r.cobrar)}</span>, exportRender: r => r.cobrar },
                  { header: 'V. Pagar',  key: 'pagar',  sortable: true, render: r => <span className="font-bold text-rose-600">{fmt(r.pagar)}</span>,   exportRender: r => r.pagar },
                  { header: 'Margen',    key: 'margen', sortable: true, render: r => <span className={`font-black ${r.margen >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>{fmt(r.margen)}</span>, exportRender: r => r.margen },
                ]}
              />
            )}

            {tdmOpenSection === 'ruta' && (
              <DataTable
                data={routeRows}
                searchPlaceholder="Buscar ruta..."
                excelFileName="tdm_por_ruta.xlsx"
                columns={[
                  { header: 'Ruta', key: 'ruta', sortable: true, render: r => <span className="font-black text-slate-800">{r.ruta}</span> },
                  { header: 'Manifiestos', key: 'manifiestos', sortable: true, render: r => <span className="font-black">{r.manifiestos}</span> },
                  { header: 'V. Cobrar', key: 'cobrar', sortable: true, render: r => <span className="font-bold text-emerald-700">{fmt(r.cobrar)}</span>, exportRender: r => r.cobrar },
                  { header: 'V. Pagar',  key: 'pagar',  sortable: true, render: r => <span className="font-bold text-rose-600">{fmt(r.pagar)}</span>,   exportRender: r => r.pagar },
                ]}
              />
            )}

            {tdmOpenSection === 'placa' && (
              <DataTable
                data={placaRows}
                searchPlaceholder="Buscar placa..."
                excelFileName="tdm_por_placa.xlsx"
                columns={[
                  { header: 'Placa', key: 'placa', sortable: true, render: r => <span className="font-black text-indigo-700 tracking-widest">{r.placa}</span> },
                  { header: 'Manifiestos', key: 'manifiestos', sortable: true, render: r => <span className="font-black">{r.manifiestos}</span> },
                  { header: 'V. Cobrar', key: 'cobrar', sortable: true, render: r => <span className="font-bold text-emerald-700">{fmt(r.cobrar)}</span>, exportRender: r => r.cobrar },
                  { header: 'V. Pagar',  key: 'pagar',  sortable: true, render: r => <span className="font-bold text-rose-600">{fmt(r.pagar)}</span>,   exportRender: r => r.pagar },
                ]}
              />
            )}
          </div>
        );
      })()}

      {!searched && !loading && (
        <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-slate-100 shadow-sm">
          <p className="text-5xl mb-4">📊</p>
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Selecciona un rango de fechas y genera el informe</p>
        </div>
      )}
    </div>
  );
}
