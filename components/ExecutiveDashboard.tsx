import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import {
  ExecutiveDashboardData,
  KPI,
  CityPerformance,
  AlertItem,
  TimeSeriesData
} from '../types/dashboard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ExecutiveDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<ExecutiveDashboardData | null>(null);
  const [cityPerformance, setCityPerformance] = useState<CityPerformance[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [predictionData, setPredictionData] = useState<any>(null);

  useEffect(() => {
    loadDashboardData();
    loadPrediction();
    const interval = setInterval(() => {
        loadDashboardData();
        loadPrediction();
    }, 30000); 
    return () => clearInterval(interval);
  }, [timeRange]);

  const loadPrediction = async () => {
      try {
          const data = await api.getDemandPrediction();
          if (data) {
              const historical = data.historical || [];
              const forecast = data.forecast || [];
              
              const chartData = [
                  ...historical.map((d: any) => ({ ...d, type: 'Real' })),
                  ...forecast.map((d: any) => ({ ...d, type: 'Proyección' }))
              ];
              setPredictionData({ ...data, historical, forecast, chartData });
          }
      } catch (e) {
          console.error("Error loading prediction", e);
      }
  };

  const loadDashboardData = async () => {
    try {
        const data = await api.getDashboardStats(timeRange);
        if (data) {
            
            // Map API response to Frontend Interface (Backend returns subset, fill rest with mocks/defaults)
            const mappedData: ExecutiveDashboardData = {
                otd: data.kpis.otd || 0,
                fillRate: 85, // Mock
                activeRoutes: data.kpis.activeRoutes || 0,
                completedToday: data.kpis.deliveries || 0,
                pendingDeliveries: data.kpis.pendingDeliveries || 0,
                costPerDelivery: 8500, // Mock
                avgDeliveryTime: 45, // KB
                fuelEfficiency: 10.5, // Mock
                routeOptimizationRate: 92, // Mock
                customerSatisfaction: data.kpis.satisfaction || 5.0,
                complaintRate: 0.5,
                damageRate: 0.2,
                perfectDeliveryRate: 98,
                vehiclesActive: 15, // Should come from vehicle API
                vehiclesTotal: 20,
                vehicleUtilization: 75,
                maintenancePending: 1,
                driversActive: 15,
                driversTotal: 18,
                driverProductivity: 90,
                driverSafetyScore: 98,
                revenueToday: data.revenueChart?.current || 0, // Using total for now
                revenueMonth: data.revenueChart?.current || 0,
                revenueTarget: data.revenueChart?.target || 550000000,
                costSavings: 1200000
            };

            setDashboardData(mappedData);
            
            if (data.topCities) {
                setCityPerformance(data.topCities.map((c: any) => ({
                    city: c.name,
                    deliveries: c.deliveries,
                    onTime: Math.round(c.deliveries * 0.95),
                    revenue: c.deliveries * 85000, // Mock avg ticket
                    trend: c.trend || 'neutral'
                })));
            }

            if (data.recentAlerts) {
                setAlerts(data.recentAlerts.map((a: any) => ({
                    ...a,
                    timestamp: new Date() // Refresh timestamp
                })));
            }
        } else {
             console.error("Error fetching dashboard data");
             // Fallback to mock if API fails
             loadMockData();
        }
    } catch (e) {
        console.error("Network error fetching dashboard", e);
        loadMockData();
    }
  };

  const loadMockData = () => {
    const mockData: ExecutiveDashboardData = {
      otd: 94.5,
      fillRate: 87.2,
      activeRoutes: 24,
      completedToday: 156,
      pendingDeliveries: 89,
      costPerDelivery: 8500,
      avgDeliveryTime: 28,
      fuelEfficiency: 11.8,
      routeOptimizationRate: 91.5,
      customerSatisfaction: 4.6,
      complaintRate: 1.2,
      damageRate: 0.8,
      perfectDeliveryRate: 92.3,
      vehiclesActive: 32,
      vehiclesTotal: 40,
      vehicleUtilization: 80,
      maintenancePending: 3,
      driversActive: 38,
      driversTotal: 45,
      driverProductivity: 8.5,
      driverSafetyScore: 94,
      revenueToday: 12850000,
      revenueMonth: 485600000,
      revenueTarget: 550000000,
      costSavings: 8500000
    };

    const mockCities: CityPerformance[] = [
      { city: 'Bogotá', deliveries: 450, onTime: 425, revenue: 38250000, trend: 'up' },
      { city: 'Medellín', deliveries: 320, onTime: 305, revenue: 27200000, trend: 'up' },
      { city: 'Cali', deliveries: 280, onTime: 260, revenue: 23800000, trend: 'neutral' },
      { city: 'Barranquilla', deliveries: 180, onTime: 165, revenue: 15300000, trend: 'down' },
    ];

    const mockAlerts: AlertItem[] = [
      { id: '1', type: 'warning', message: '3 vehículos requieren mantenimiento urgente', timestamp: new Date(), actionRequired: true },
      { id: '2', type: 'info', message: 'Nuevo récord: 97% OTD ayer', timestamp: new Date() },
      { id: '3', type: 'critical', message: 'Retraso en ruta #245 (>2 horas)', timestamp: new Date(), actionRequired: true },
    ];

    setDashboardData(mockData);
    setCityPerformance(mockCities);
    setAlerts(mockAlerts);
  };

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const kpis: KPI[] = [
    {
      id: 'otd',
      name: 'On-Time Delivery',
      value: dashboardData.otd,
      unit: '%',
      trend: dashboardData.otd >= 95 ? 'up' : 'down',
      trendValue: 2.3,
      target: 95,
      status: dashboardData.otd >= 95 ? 'good' : dashboardData.otd >= 90 ? 'warning' : 'critical'
    },
    {
      id: 'fillRate',
      name: 'Utilización de Flota',
      value: dashboardData.fillRate,
      unit: '%',
      trend: 'up',
      trendValue: 5.1,
      target: 85,
      status: dashboardData.fillRate >= 85 ? 'good' : 'warning'
    },
    {
      id: 'customerSat',
      name: 'Satisfacción Cliente',
      value: (Number(dashboardData.customerSatisfaction) || 0).toFixed(1),
      unit: '/5.0',
      trend: 'up',
      trendValue: 0.2,
      status: dashboardData.customerSatisfaction >= 4.5 ? 'good' : 'warning'
    },
    {
      id: 'costPerDelivery',
      name: 'Costo por Entrega',
      value: `$${((Number(dashboardData.costPerDelivery) || 0) / 1000).toFixed(1)}K`,
      trend: 'down',
      trendValue: 8.0,
      status: 'good'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-slate-800">Dashboard Ejecutivo</h1>
            <p className="text-slate-500 mt-1">M7 Logistics Intelligence • Actualizado en tiempo real</p>
          </div>
          <div className="flex gap-2">
            {['today', 'week', 'month'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range as any)}
                className={`px-6 py-2.5 rounded-xl font-bold capitalize transition-all ${
                  timeRange === range
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {range === 'today' && 'Hoy'}
                {range === 'week' && 'Semana'}
                {range === 'month' && 'Mes'}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs Principales */}
        <div className="grid grid-cols-4 gap-6">
          {kpis.map((kpi) => (
            <KPICard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        {/* Métricas Operacionales */}
        <div className="grid grid-cols-3 gap-6">
          <MetricCard
            title="Rutas Activas"
            value={dashboardData.activeRoutes}
            icon="🚚"
            subtitle={`${dashboardData.completedToday} completadas hoy`}
            color="emerald"
          />
          <MetricCard
            title="Entregas Pendientes"
            value={dashboardData.pendingDeliveries}
            icon="📦"
            subtitle="En tránsito actualmente"
            color="blue"
          />
          <MetricCard
            title="Conductores Activos"
            value={`${dashboardData.driversActive}/${dashboardData.driversTotal}`}
            icon="👤"
            subtitle={`${dashboardData.driverProductivity}/día productividad`}
            color="purple"
          />
        </div>

        {/* Área Principal: Gráficos y Top Cities */}
        <div className="grid grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <div className="col-span-2 bg-white rounded-3xl p-6 shadow-lg border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-800">Ingresos del Mes</h3>
                <p className="text-sm text-slate-500">vs objetivo: ${((Number(dashboardData.revenueTarget) || 0) / 1000000).toFixed(0)}M</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-emerald-600">
                  ${((Number(dashboardData.revenueMonth) || 0) / 1000000).toFixed(1)}M
                </p>
                <p className="text-sm text-slate-500">
                  {(((Number(dashboardData.revenueMonth) || 0) / (Number(dashboardData.revenueTarget) || 1)) * 100).toFixed(1)}% del objetivo
                </p>
              </div>
            </div>
            
            {/* Simple progress bar */}
            <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${(dashboardData.revenueMonth / dashboardData.revenueTarget) * 100}%` }}
              />
            </div>

            <div className="mt-6 flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                <span className="text-slate-600">Ingresos actuales</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-slate-200 rounded-full"></div>
                <span className="text-slate-600">Objetivo restante</span>
              </div>
            </div>
          </div>

          {/* Top Cities */}
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-200">
            <h3 className="text-xl font-black text-slate-800 mb-4">Top Ciudades</h3>
            <div className="space-y-3">
              {cityPerformance.map((city, idx) => (
                <div key={city.city} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold ${
                    idx === 0 ? 'bg-yellow-500' :
                    idx === 1 ? 'bg-slate-400' :
                    idx === 2 ? 'bg-orange-500' :
                    'bg-slate-300'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{city.city}</p>
                    <p className="text-xs text-slate-500">{city.deliveries} entregas • {Math.round((city.onTime / city.deliveries) * 100)}% OTD</p>
                  </div>
                  <div className={`text-xl ${
                    city.trend === 'up' ? 'text-emerald-500' :
                    city.trend === 'down' ? 'text-red-500' :
                    'text-slate-400'
                  }`}>
                    {city.trend === 'up' && '↗️'}
                    {city.trend === 'down' && '↘️'}
                    {city.trend === 'neutral' && '➡️'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECCIÓN DE INTELIGENCIA PREDICTIVA (AI) */}
        {predictionData && (
            <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-indigo-50 overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Icons.Sparkles className="w-40 h-40 text-indigo-600" />
                </div>
                
                <div className="flex justify-between items-start mb-8 relative z-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                             <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                                 <Icons.Sparkles className="w-6 h-6" />
                             </div>
                             <h3 className="text-2xl font-black text-slate-900">Proyección de Demanda (IA)</h3>
                        </div>
                        <p className="text-slate-500 max-w-xl">
                            Nuestro modelo de <span className="font-bold text-indigo-600">Regresión Lineal</span> ha analizado los últimos 30 días y proyecta un crecimiento del 
                            <span className="font-black text-slate-800"> {predictionData.trend?.m > 0 ? '+' : ''}{(predictionData.trend?.m * 7).toFixed(1)} pedidos</span> para la próxima semana.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Confianza del Modelo</p>
                        <div className="text-4xl font-black text-emerald-500">{(Number(predictionData.confidence) * 100).toFixed(0)}%</div>
                    </div>
                </div>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={predictionData.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#64748b" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorProj" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="date" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} 
                                tickFormatter={(val) => new Date(val).toLocaleDateString('es-CO', {day: '2-digit', month: 'short'})}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} 
                            />
                            <Tooltip 
                                contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.2)'}}
                                itemStyle={{color: '#1e293b', fontWeight: 'bold'}}
                                labelStyle={{color: '#94a3b8', marginBottom: '5px', fontSize: '10px', textTransform: 'uppercase'}}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="value" 
                                stroke="#64748b" 
                                strokeWidth={3}
                                fillOpacity={1} 
                                fill="url(#colorReal)" 
                                name="Pedidos (Histórico)"
                            />
                            <Area 
                                type="monotone" 
                                dataKey="value" 
                                data={predictionData.chartData.filter((d: any) => d.type === 'Proyección')}
                                stroke="#6366f1" 
                                strokeWidth={3}
                                strokeDasharray="5 5"
                                fillOpacity={1} 
                                fill="url(#colorProj)" 
                                name="Proyección IA"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}

        {/* Alertas y Eficiencia */}
        <div className="grid grid-cols-2 gap-6">
          {/* Alertas */}
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-200">
            <h3 className="text-xl font-black text-slate-800 mb-4">Alertas Recientes</h3>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border-2 ${
                    alert.type === 'critical' ? 'bg-red-50 border-red-200' :
                    alert.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">
                      {alert.type === 'critical' && '🚨'}
                      {alert.type === 'warning' && '⚠️'}
                      {alert.type === 'info' && 'ℹ️'}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-800">{alert.message}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {alert.timestamp.toLocaleTimeString('es-CO')}
                        {alert.actionRequired && ' • Acción requerida'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Métricas de Eficiencia */}
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-200">
            <h3 className="text-xl font-black text-slate-800 mb-4">Eficiencia Operativa</h3>
            <div className="space-y-4">
              <ProgressMetric
                label="Optimización de Rutas"
                value={dashboardData.routeOptimizationRate}
                target={90}
                icon="🗺️"
              />
              <ProgressMetric
                label="Entregas Perfectas"
                value={dashboardData.perfectDeliveryRate}
                target={95}
                icon="✨"
              />
              <ProgressMetric
                label="Seguridad Conductores"
                value={dashboardData.driverSafetyScore}
                target={95}
                icon="🛡️"
              />
              <ProgressMetric
                label="Utilización Vehículos"
                value={dashboardData.vehicleUtilization}
                target={85}
                icon="🚛"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-componentes
const KPICard: React.FC<{ kpi: KPI }> = ({ kpi }) => (
  <div className={`bg-white rounded-3xl p-6 shadow-lg border-2 transition-all hover:scale-105 ${
    kpi.status === 'good' ? 'border-emerald-200' :
    kpi.status === 'warning' ? 'border-yellow-200' :
    'border-red-200'
  }`}>
    <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">{kpi.name}</p>
    <p className="text-4xl font-black text-slate-800 mt-2">
      {kpi.value}<span className="text-2xl text-slate-400">{kpi.unit}</span>
    </p>
    <div className="flex items-center gap-2 mt-3">
      <div className={`px-2 py-1 rounded-lg text-xs font-bold ${
        kpi.trend === 'up' ? 'bg-emerald-100 text-emerald-700' :
        kpi.trend === 'down' ? 'bg-red-100 text-red-700' :
        'bg-slate-100 text-slate-700'
      }`}>
        {kpi.trend === 'up' && '↗'} {kpi.trend === 'down' && '↘'}
        {kpi.trendValue && ` ${kpi.trendValue}%`}
      </div>
      {kpi.target && (
        <p className="text-xs text-slate-400">objetivo: {kpi.target}{kpi.unit}</p>
      )}
    </div>
  </div>
);

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  subtitle: string;
  color: string;
}> = ({ title, value, icon, subtitle, color }) => (
  <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-200">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">{title}</p>
        <p className="text-3xl font-black text-slate-800 mt-2">{value}</p>
        <p className="text-xs text-slate-400 mt-2">{subtitle}</p>
      </div>
      <div className="text-4xl">{icon}</div>
    </div>
  </div>
);

const ProgressMetric: React.FC<{
  label: string;
  value: number;
  target: number;
  icon: string;
}> = ({ label, value, target, icon }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
        <span>{icon}</span>
        {label}
      </span>
      <span className="text-sm font-black text-slate-800">{(Number(value) || 0).toFixed(1)}%</span>
    </div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          value >= target ? 'bg-emerald-500' :
          value >= target * 0.9 ? 'bg-yellow-500' :
          'bg-red-500'
        }`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  </div>
);

export default ExecutiveDashboard;
