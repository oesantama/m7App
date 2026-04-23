
import sys

path = '/home/oscars_it/Documentos/oscar/m7App/components/Logistics/ConciliacionRouteModal.tsx'
with open(path, 'r') as f:
    lines = f.readlines()

start_marker = '{sobrecostos.map((s, idx) => {'
end_marker = 'return ('
# We need to find the block between line 914 and 980 (approx)

start_idx = -1
for i, line in enumerate(lines):
    if start_marker in line and i > 900:
        start_idx = i
        break

if start_idx == -1:
    print("Start marker not found")
    sys.exit(1)

# Find the end of the map (where it returns and closes divs)
# Let's just find where the 'grupal' tab starts
grupal_marker = "{tab === 'grupal' && ("
end_idx = -1
for i in range(start_idx, len(lines)):
    if grupal_marker in lines[i]:
        end_idx = i - 3 # Back up a bit to just before the next tab starts
        break

if end_idx == -1:
    print("End marker not found")
    sys.exit(1)

new_block = """                                    {sobrecostos.map((s, idx) => {
                                        const isApproved = s.statusId === 'APROBADO' || s.statusId === 'EST-02';
                                        const isPending  = !isApproved;

                                        return (
                                            <div key={s.id} className={`grid grid-cols-12 gap-3 p-3 rounded-2xl border-2 shadow-sm relative group transition-all
                                                ${isApproved ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                                                
                                                <div className="col-span-3">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Valor</p>
                                                    <input type="text" value={s.valor} disabled={isApproved}
                                                        onChange={e => {
                                                            const val = e.target.value.replace(/\D/g, '');
                                                            const fmt = val ? new Intl.NumberFormat('es-CO').format(Number(val)) : '';
                                                            const next = [...sobrecostos];
                                                            next[idx].valor = fmt;
                                                            setSobrecostos(next);
                                                        }}
                                                        placeholder="$ 0.00" className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                            ${isApproved ? 'bg-transparent text-blue-900' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                </div>
                                                <div className="col-span-3">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Referencia / NIT</p>
                                                    <input type="text" value={s.nroAprobacion} disabled={isApproved}
                                                        onChange={e => {
                                                            const next = [...sobrecostos];
                                                            next[idx].nroAprobacion = e.target.value;
                                                            setSobrecostos(next);
                                                        }}
                                                        placeholder="Obligatorio" className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                            ${isApproved ? 'bg-transparent text-blue-900' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                </div>
                                                <div className="col-span-3">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Fecha</p>
                                                    <input type="date" value={s.fecha} disabled={isApproved}
                                                        onChange={e => {
                                                            const next = [...sobrecostos];
                                                            next[idx].fecha = e.target.value;
                                                            setSobrecostos(next);
                                                        }}
                                                        className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                            ${isApproved ? 'bg-transparent text-blue-900' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                </div>
                                                <div className="col-span-3 flex flex-col justify-end">
                                                    {isApproved ? (
                                                        <span className="bg-blue-600 text-white text-[7px] font-black px-2 py-2 rounded-xl text-center uppercase tracking-widest">Aprobado</span>
                                                    ) : (
                                                        <button onClick={() => handleApproveSurcharge(s.id)}
                                                            className="bg-emerald-500 hover:bg-emerald-600 text-white text-[7px] font-black px-2 py-2 rounded-xl text-center uppercase tracking-widest shadow-sm shadow-emerald-200">
                                                            ✅ Aprobar
                                                        </button>
                                                    )}
                                                </div>

                                                {isPending && (
                                                    <button onClick={() => setSobrecostos(sobrecostos.filter(x => x.id !== s.id))}
                                                        className="absolute -right-2 -top-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all scale-75 hover:scale-100">
                                                        <Icons.X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
"""

with open(path, 'w') as f:
    f.writelines(lines[:start_idx])
    f.write(new_block)
    f.writelines(lines[end_idx:])
