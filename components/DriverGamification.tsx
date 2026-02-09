import React, { useState, useEffect } from 'react';
import { Driver } from '../types';
import {
  DriverStats,
  Achievement,
  Reward,
  LeaderboardEntry,
  DRIVER_LEVELS,
  ACHIEVEMENTS_CATALOG,
  calculateDriverLevel,
  calculateDeliveryPoints
} from '../types/gamification';

interface DriverGamificationProps {
  driver: Driver;
  onClose?: () => void;
}

const DriverGamification: React.FC<DriverGamificationProps> = ({ driver, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'leaderboard' | 'rewards'>('overview');
  const [driverStats, setDriverStats] = useState<DriverStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    // Cargar stats del conductor
    loadDriverStats();
    loadLeaderboard();
  }, [driver.id]);

  const loadDriverStats = async () => {
    // TODO: Integrar con API real
    const mockStats: DriverStats = {
      driverId: driver.id,
      driverName: driver.name,
      level: 'gold',
      totalPoints: 7500,
      currentStreak: 15,
      longestStreak: 45,
      totalDeliveries: 342,
      onTimeDeliveries: 320,
      perfectDeliveries: 295,
      avgFuelEfficiency: 12.5,
      avgDeliveryTime: 25,
      routeOptimizationScore: 88,
      accidentFreeDays: 180,
      safetyScore: 95,
      customerRating: 4.8,
      complimentsReceived: 28,
      complaintsReceived: 2,
      achievements: [],
      rank: 12,
      pointsThisMonth: 850,
      pointsThisWeek: 210
    };
    setDriverStats(mockStats);
  };

  const loadLeaderboard = async () => {
    // TODO: Integrar con API
    const mockLeaderboard: LeaderboardEntry[] = [
      { rank: 1, driverId: '1', driverName: 'Carlos Pérez', level: 'platinum', points: 18500, achievements: 45, trend: 'up' },
      { rank: 2, driverId: '2', driverName: 'Ana Rodríguez', level: 'gold', points: 16200, achievements: 38, trend: 'same' },
      { rank: 3, driverId: '3', driverName: 'Diego Martínez', level: 'gold', points: 15800, achievements: 42, trend: 'up' },
    ];
    setLeaderboard(mockLeaderboard);
  };

  if (!driverStats) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
    </div>;
  }

  const currentLevel = calculateDriverLevel(driverStats.totalPoints);
  const nextLevel = DRIVER_LEVELS [DRIVER_LEVELS.findIndex(l => l.name === currentLevel.name) + 1];
  const progressToNext = nextLevel 
    ? ((driverStats.totalPoints - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100
    : 100;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header con nivel y puntos */}
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-3xl p-8 text-white shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-black">{driverStats.driverName}</h2>
            <p className="text-emerald-100 text-sm mt-1">Conductor Profesional M7</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="text-5xl">{currentLevel.badge}</div>
              <div>
                <p className="text-xs text-emerald-100">Nivel Actual</p>
                <p className="text-2xl font-black capitalize">{currentLevel.name}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <p className="text-xs text-emerald-100">Puntos Totales</p>
            <p className="text-3xl font-black">{driverStats.totalPoints.toLocaleString()}</p>
            <p className="text-xs text-emerald-200 mt-1">+{driverStats.pointsThisWeek} esta semana</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <p className="text-xs text-emerald-100">Ranking</p>
            <p className="text-3xl font-black">#{driverStats.rank}</p>
            <p className="text-xs text-emerald-200 mt-1">de {leaderboard.length} conductores</p>
          </div>
        </div>

        {nextLevel && (
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span>Próximo nivel: {nextLevel.badge} {nextLevel.name}</span>
              <span>{nextLevel.minPoints - driverStats.totalPoints} puntos faltantes</span>
            </div>
            <div className="h-3 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-yellow-400 to-yellow-300 rounded-full transition-all duration-500"
                style={{ width: `${progressToNext}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {['overview', 'achievements', 'leaderboard', 'rewards'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-6 py-3 font-bold capitalize transition-colors ${
              activeTab === tab
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'overview' && '📊 Resumen'}
            {tab === 'achievements' && '🏆 Logros'}
            {tab === 'leaderboard' && '📈 Ranking'}
            {tab === 'rewards' && '🎁 Recompensas'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Stats cards */}
            <StatCard icon="📦" title="Entregas" value={driverStats.totalDeliveries} subtitle={`${Math.round((driverStats.onTimeDeliveries / driverStats.totalDeliveries) * 100)}% a tiempo`} />
            <StatCard icon="⏱️" title="Racha Actual" value={`${driverStats.currentStreak} días`} subtitle={`Máximo: ${driverStats.longestStreak} días`} />
            <StatCard icon="⭐" title="Rating" value={driverStats.customerRating.toFixed(1)} subtitle={`${driverStats.complimentsReceived} felicitaciones`} />
            <StatCard icon="🛡️" title="Seguridad" value={`${driverStats.safetyScore}%`} subtitle={`${driverStats.accidentFreeDays} días sin accidentes`} />
            <StatCard icon="⚡" title="Eficiencia" value={`${driverStats.routeOptimizationScore}%`} subtitle={`${driverStats.avgFuelEfficiency} km/L`} />
            <StatCard icon="💎" title="Perfectas" value={driverStats.perfectDeliveries} subtitle={`${Math.round((driverStats.perfectDeliveries / driverStats.totalDeliveries) * 100)}% sin incidentes`} />
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="grid grid-cols-3 gap-4">
            {ACHIEVEMENTS_CATALOG.map((ach, idx) => (
              <div key={idx} className="bg-white border-2 border-slate-200 rounded-2xl p-4 hover:border-emerald-500 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="text-4xl">{ach.icon}</div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800">{ach.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">{ach.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-600">+{ach.points} pts</span>
                      <span className="text-xs text-slate-400">• {ach.category}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="space-y-3">
            {leaderboard.map((entry) => (
              <div key={entry.driverId} className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${
                entry.driverId === driver.id 
                  ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-500'
                  : 'bg-white border border-slate-200 hover:border-slate-300'
              }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg ${
                  entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                  entry.rank === 2 ? 'bg-slate-300 text-slate-700' :
                  entry.rank === 3 ? 'bg-orange-400 text-orange-900' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  #{entry.rank}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold">{entry.driverName}</h4>
                  <p className="text-sm text-slate-500">
                    {DRIVER_LEVELS.find(l => l.name === entry.level)?.badge} {entry.level} • {entry.achievements} logros
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-emerald-600">{entry.points.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">puntos</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'rewards' && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">🎁</p>
            <h3 className="text-xl font-bold text-slate-700">Tienda de Recompensas</h3>
            <p className="text-slate-500 mt-2">Próximamente: Canjea tus puntos por premios increíbles</p>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: string; title: string; value: string | number; subtitle: string }> = ({ icon, title, value, subtitle }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-shadow">
    <div className="text-4xl mb-3">{icon}</div>
    <p className="text-sm text-slate-500 font-bold uppercase tracking-wide">{title}</p>
    <p className="text-3xl font-black text-slate-800 mt-1">{value}</p>
    <p className="text-xs text-slate-400 mt-2">{subtitle}</p>
  </div>
);

export default DriverGamification;
