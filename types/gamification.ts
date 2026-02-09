export interface DriverLevel {
  id: string;
  name: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  minPoints: number;
  badge: string;
  color: string;
  benefits: string[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  category: 'delivery' | 'safety' | 'efficiency' | 'customer' | 'special';
  unlocked: boolean;
  unlockedAt?: Date;
  progress?: number;
  target?: number;
}

export interface DriverStats {
  driverId: string;
  driverName: string;
  level: DriverLevel['name'];
  totalPoints: number;
  currentStreak: number; // días consecutivos sin incidentes
  longestStreak: number;
  
  // Métricas
  totalDeliveries: number;
  onTimeDeliveries: number;
  perfectDeliveries: number; // sin daños ni quejas
  
  // Eficiencia
  avgFuelEfficiency: number; // km/litro
  avgDeliveryTime: number; // minutos
  routeOptimizationScore: number; // 0-100
  
  // Seguridad
  accidentFreeD days: number;
  safetyScore: number; // 0-100
  
  // Satisfacción cliente
  customerRating: number; // 0-5
  complimentsReceived: number;
  complaintsReceived: number;
  
  // Gamificación
  achievements: Achievement[];
  rank: number; // Posición en leaderboard
  pointsThisMonth: number;
  pointsThisWeek: number;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number; // puntos requeridos
  type: 'bonus' | 'day_off' | 'priority' | 'gift' | 'recognition';
  available: boolean;
  expiresAt?: Date;
}

export interface LeaderboardEntry {
  rank: number;
  driverId: string;
  driverName: string;
  level: DriverLevel['name'];
  points: number;
  achievements: number;
  trend: 'up' | 'down' | 'same';
}

// Niveles de gamificación
export const DRIVER_LEVELS: DriverLevel[] = [
  {
    id: 'bronze',
    name: 'bronze',
    minPoints: 0,
    badge: '🥉',
    color: '#CD7F32',
    benefits: ['Acceso básico a la app', 'Recompensas estándar']
  },
  {
    id: 'silver',
    name: 'silver',
    minPoints: 1000,
    badge: '🥈',
    color: '#C0C0C0',
    benefits: ['Prioridad media en rutas', 'Bonos 10% extra', 'Descuentos en tienda']
  },
  {
    id: 'gold',
    name: 'gold',
    minPoints: 5000,
    badge: '🥇',
    color: '#FFD700',
    benefits: ['Alta prioridad en rutas', 'Bonos 20% extra', 'Días libres adicionales', 'Estacionamiento VIP']
  },
  {
    id: 'platinum',
    name: 'platinum',
    minPoints: 15000,
    badge: '💎',
    color: '#E5E4E2',
    benefits: ['Máxima prioridad', 'Bonos 35% extra', 'Vehículo premium', 'Seguro médico familiar', 'Plan carrera']
  },
  {
    id: 'diamond',
    name: 'diamond',
    minPoints: 50000,
    badge: '👑',
    color: '#B9F2FF',
    benefits: ['Elite: Todas las anteriores', 'Bonos 50% extra', 'Bono anual garantizado', 'Acciones de la empresa', 'Mentor oficial']
  }
];

// Achievements predefinidos
export const ACHIEVEMENTS_CATALOG: Partial<Achievement>[] = [
  // Entregas
  { id: 'first_delivery', name: 'Primera Entrega', description: 'Completaste tu primera entrega', icon: '📦', points: 50, category: 'delivery', target: 1 },
  { id: '100_deliveries', name: 'Centenario', description: '100 entregas completadas', icon: '💯', points: 500, category: 'delivery', target: 100 },
  { id: '1000_deliveries', name: 'Millenario', description: '1,000 entregas completadas', icon: '🏆', points: 5000, category: 'delivery', target: 1000 },
  
  // Puntualidad
  { id: 'always_on_time', name: 'Puntual Perfecto', description: '30 días consecutivos al 100% on-time', icon: '⏱️', points: 1000, category: 'efficiency', target: 30 },
  { id: 'speed_demon', name: 'Rayo', description: '10 entregas en un día', icon: '⚡', points: 300, category: 'efficiency', target: 10 },
  
  // Seguridad
  { id: 'safe_30', name: 'Conductor Seguro', description: '30 días sin incidentes', icon: '🛡️', points: 500, category: 'safety', target: 30 },
  { id: 'safe_365', name: 'Año Seguro', description: '365 días sin acc identes', icon: '🏅', points: 10000, category: 'safety', target: 365 },
  
  // Cliente
  { id: '5_stars', name: 'Estrella Total', description: '50 calificaciones de 5 estrellas', icon: '⭐', points: 800, category: 'customer', target: 50 },
  { id: 'customer_hero', name: 'Héroe del Cliente', description: '10 felicitaciones de clientes', icon: '🦸', points: 1500, category: 'customer', target: 10 },
  
  // Especiales
  { id: 'night_owl', name: 'Búho Nocturno', description: '50 entregas nocturnas', icon: '🦉', points: 600, category: 'special', target: 50 },
  { id: 'rain_master', name: 'Maestro de la Lluvia', description: '20 entregas bajo lluvia', icon: '🌧️', points: 700, category: 'special', target: 20 },
  { id: 'mountain_king', name: 'Rey de la Montaña', description: '30 entregas en zonas difíciles', icon: '⛰️', points: 900, category: 'special', target: 30 },
];

/**
 * Calcula el nivel de un conductor basado en puntos
 */
export function calculateDriverLevel(points: number): DriverLevel {
  for (let i = DRIVER_LEVELS.length - 1; i >= 0; i--) {
    if (points >= DRIVER_LEVELS[i].minPoints) {
      return DRIVER_LEVELS[i];
    }
  }
  return DRIVER_LEVELS[0];
}

/**
 * Calcula puntos ganados por una entrega
 */
export function calculateDeliveryPoints(delivery: {
  onTime: boolean;
  noDamage: boolean;
  customerRating?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}): number {
  let points = 10; // Base

  if (delivery.onTime) points += 5;
  if (delivery.noDamage) points += 5;
  
  if (delivery.customerRating) {
    points += delivery.customerRating * 2; // 0-10 puntos extra
  }

  // Multiplicador por dificultad
  const multipliers = { easy: 1, medium: 1.5, hard: 2 };
  points *= multipliers[delivery.difficulty || 'medium'];

  return Math.round(points);
}

/**
 * Verifica si un achievement fue desbloqueado
 */
export function checkAchievementUnlock(
  achievement: Achievement,
  stats: DriverStats
): boolean {
  const { id, target } = achievement;

  switch (id) {
    case 'first_delivery':
      return stats.totalDeliveries >= (target || 1);
    case '100_deliveries':
      return stats.totalDeliveries >= (target || 100);
    case '1000_deliveries':
      return stats.totalDeliveries >= (target || 1000);
    case 'always_on_time':
      // Lógica más compleja: requiere 30 días consecutivos
      return stats.currentStreak >= (target || 30) && (stats.onTimeDeliveries / stats.totalDeliveries) >= 0.95;
    case 'safe_30':
      return stats.accidentFreeDays >= (target || 30);
    case 'safe_365':
      return stats.accidentFreeDays >= (target || 365);
    case '5_stars':
      return stats.complimentsReceived >= (target || 50);
    default:
      return false;
  }
}
