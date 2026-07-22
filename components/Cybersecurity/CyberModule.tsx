import React, { useState } from 'react';
import { Icons } from '../../constants';
import CyberDashboard from './CyberDashboard';
import PhishingSimulator from './PhishingSimulator';
import TrainingPlans from './TrainingPlans';

const CyberModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-6 md:p-10 border-b border-slate-800 bg-slate-900/50">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500">
              <Icons.Shield className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">Ciberseguridad</h1>
          </div>
          <p className="text-slate-400 text-sm">Capacitación tecnológica y prevención de Phishing corporativo.</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'dashboard' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Icons.Activity className="w-4 h-4" />
            Métricas
          </button>
          <button
            onClick={() => setActiveTab('phishing')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'phishing' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Icons.Mail className="w-4 h-4" />
            Phishing
          </button>
          <button
            onClick={() => setActiveTab('training')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'training' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Icons.BookOpen className="w-4 h-4" />
            Capacitaciones
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto">
          {activeTab === 'dashboard' && <CyberDashboard />}
          {activeTab === 'phishing' && <PhishingSimulator />}
          {activeTab === 'training' && <TrainingPlans />}
        </div>
      </div>
    </div>
  );
};

export default CyberModule;
