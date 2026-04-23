import React from 'react';
import { Icons } from '../../../constants';
import { PlateTotals, SurchargeStats, fmtCOP } from '../types';

interface HeaderProps {
    plate: string;
    driverName: string | null;
    plateTotals: PlateTotals;
    surchargeStats: SurchargeStats;
    onClose: () => void;
}

const ConciliacionHeader: React.FC<HeaderProps> = ({
    plate,
    driverName,
    plateTotals,
    surchargeStats,
    onClose
}) => {
    return (
        <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-b border-emerald-100 px-6 pt-5 pb-4 shrink-0">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-emerald-200">
                        <span className="text-xl">🚛</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-0.5">Conciliar Facturas</p>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">{plate || 'Sin placa'}</h3>
                        {driverName && <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">👤 {driverName}</p>}
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 flex-1 max-w-full">
                    <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-emerald-500/10 border border-emerald-100/50">
                        <p className="text-[7px] font-black text-emerald-600 uppercase tracking-widest mb-1 text-center">Legalización Individual</p>
                        <p className="text-sm font-black text-emerald-800 leading-none text-center">{fmtCOP(plateTotals.legalizedIndividual)}</p>
                        <p className="text-[7px] text-emerald-600/60 font-bold mt-1.5 text-center">{plateTotals.legalCount} Facts</p>
                    </div>
                    <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-violet-500/10 border border-violet-100/50">
                        <p className="text-[7px] font-black text-violet-600 uppercase tracking-widest mb-1 text-center">Legalización Grupal</p>
                        <p className="text-sm font-black text-violet-800 leading-none text-center">{fmtCOP(plateTotals.legalizedGrupal)}</p>
                        <p className="text-[7px] text-violet-600/60 font-bold mt-1.5 text-center">Consignado Ruta</p>
                    </div>
                    <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-blue-500/10 border border-blue-100/50">
                        <p className="text-[7px] font-black text-blue-600 uppercase tracking-widest mb-1 text-center">Total Legalizado</p>
                        <p className="text-sm font-black text-blue-800 leading-none text-center">{fmtCOP(plateTotals.legalizedVal)}</p>
                        <p className="text-[7px] text-blue-600/60 font-bold mt-1.5 text-center">Acumulado Total</p>
                    </div>
                    <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-amber-500/10 border border-amber-100/50">
                        <p className="text-[7px] font-black text-amber-600 uppercase tracking-widest mb-1 text-center">Pendiente</p>
                        <p className="text-sm font-black text-amber-800 leading-none text-center">{fmtCOP(plateTotals.pendingVal)}</p>
                        <p className="text-[7px] text-amber-600/60 font-bold mt-1.5 text-center">Falta Cobrar</p>
                    </div>
                    <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-slate-500/10 border border-slate-100">
                        <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1 text-center">Total Placa</p>
                        <p className="text-sm font-black text-slate-800 leading-none text-center">{fmtCOP(plateTotals.totalValue)}</p>
                        <p className="text-[7px] text-slate-400 font-bold mt-1.5 text-center">{plateTotals.total} Facts</p>
                    </div>
                    <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-rose-500/10 border border-rose-100/50">
                        <p className="text-[7px] font-black text-rose-600 uppercase tracking-widest mb-1 text-center font-bold">Resumen Sobrecostos</p>
                        <div className="space-y-1.5 mt-2">
                            <div className="flex justify-between items-center bg-amber-50/50 px-2 py-1 rounded-lg">
                                <p className="text-[7px] font-black text-amber-600 uppercase tracking-tight">Pendiente:</p>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-slate-700 leading-none">{fmtCOP(surchargeStats.pending)}</p>
                                    <p className="text-[6px] font-bold text-slate-400 uppercase mt-0.5">Cant: {surchargeStats.pendingCount}</p>
                                </div>
                            </div>
                            <div className="flex justify-between items-center bg-emerald-50/50 px-2 py-1 rounded-lg">
                                <p className="text-[7px] font-black text-emerald-600 uppercase tracking-tight">Aprobados:</p>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-slate-700 leading-none">{fmtCOP(surchargeStats.approved)}</p>
                                    <p className="text-[6px] font-bold text-slate-400 uppercase mt-0.5">Cant: {surchargeStats.approvedCount}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <button onClick={onClose} className="w-9 h-9 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-sm self-end lg:self-center">
                    <Icons.X className="w-4 h-4 text-slate-500 hover:text-rose-500" />
                </button>
            </div>
        </div>
    );
};

export default ConciliacionHeader;
