export interface KPI {
  id: string;
  name: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: number;
  target?: number;
  status?: 'good' | 'warning' | 'critical';
}

export interface ExecutiveDashboardData {
  // Métricas Operacionales
  otd: number; // On-Time Delivery %
  fillRate: number; // % capacidad utilizada
  activeRoutes: number;
  completedToday: number;
  pendingDeliveries: number;
  
  // Eficiencia
  costPerDelivery: number;
  avgDeliveryTime: number; // minutos
  fuelEfficiency: number; // km/litro promedio
  routeOptimizationRate: number; // %
  
  // Calidad y Satisfacción
  customerSatisfaction: number; // 0-5
  complaintRate: number; // %
  damageRate: number; // %
  perfectDeliveryRate: number; // %
  
  // Flota
  vehiclesActive: number;
  vehiclesTotal: number;
  vehicleUtilization: number; // %
  maintenancePending: number;
  
  // Conductores
  driversActive: number;
  driversTotal: number;
  driverProductivity: number; // entregas/día promedio
  driverSafetyScore: number; // 0-100
  
  // Financiero
  revenueToday: number;
  revenueMonth: number;
  revenueTarget: number;
  costSavings: number; // vs mes anterior
}

export interface TimeSeriesData {
  date: string;
  value: number;
}

export interface CityPerformance {
  city: string;
  deliveries: number;
  onTime: number;
  revenue: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface AlertItem {
  id: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  actionRequired?: boolean;
}
