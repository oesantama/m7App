import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { period } = req.query; // 'today', 'week', 'month'
    
    // Filtro de fecha
    let dateFilter = "created_at >= CURRENT_DATE";
    if (period === 'week') dateFilter = "created_at >= CURRENT_DATE - INTERVAL '7 days'";
    if (period === 'month') dateFilter = "created_at >= CURRENT_DATE - INTERVAL '30 days'";

    // 1. KPIs Generales
    // Ingresos: Suma de 'peso' (valor declarado) de items en documentos entregados/finalizados
    // Entregas: Conteo de documentos con status entregado/finalizado
    const kpiRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'ENTREGADO' OR status = 'FINALIZADO') as completed_deliveries,
        COUNT(*) FILTER (WHERE status = 'PENDIENTE' OR status = 'EN RUTA') as pending_deliveries,
        COUNT(*) FILTER (WHERE status = 'EN RUTA') as active_routes,
        -- Aproximación de ingresos usando 'peso' como valor si no hay campo de precio explícito, o 0
        COALESCE(SUM(CASE WHEN status IN ('ENTREGADO', 'FINALIZADO') 
          THEN (SELECT SUM(COALESCE(peso, 0)) FROM document_items WHERE document_id = d.id) 
          ELSE 0 END), 0) as total_revenue
      FROM documents_l d
      WHERE ${dateFilter}
    `);

    const kpi = kpiRes.rows[0];

    // 2. OTD (On Time Delivery) - Mockeado calculando % de entregas sin incidencias (si hubiera tabla de incidencias)
    // Por ahora asumimos que 'FINALIZADO' es a tiempo.
    const totalDocs = Number(kpi.completed_deliveries) + Number(kpi.pending_deliveries);
    const otd = totalDocs > 0 ? (Number(kpi.completed_deliveries) / totalDocs) * 100 : 100;

    // 3. Top Ciudades
    const citiesRes = await pool.query(`
      SELECT 
        di.city, 
        COUNT(DISTINCT d.id) as deliveries,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'ENTREGADO') as completed
      FROM documents_l d
      JOIN document_items di ON d.id = di.document_id
      WHERE ${dateFilter} AND di.city IS NOT NULL
      GROUP BY di.city
      ORDER BY deliveries DESC
      LIMIT 4
    `);

    // 4. Ingresos vs Objetivo (Mockeado el objetivo)
    const revenue = Number(kpi.total_revenue);
    const revenueTarget = 550000000; // 550M Objetivo fijo

    const response = {
      kpis: {
        revenue: revenue,
        revenueGrowth: 12.5, // Mock
        deliveries: Number(kpi.completed_deliveries),
        activeRoutes: Number(kpi.active_routes),
        pendingDeliveries: Number(kpi.pending_deliveries),
        otd: Math.round(otd),
        satisfaction: 4.8 // Mock
      },
      revenueChart: {
        current: revenue,
        target: revenueTarget,
        percentage: Math.min((revenue / revenueTarget) * 100, 100)
      },
      topCities: citiesRes.rows.map(c => ({
        name: c.city,
        deliveries: Number(c.deliveries),
        otd: 94, // Mock per city for now
        trend: 'up'
      })),
      recentAlerts: [
        { id: 1, type: 'warning', message: 'Retraso en Ruta Norte - Tráfico pesado', time: 'Hace 10 min' },
        { id: 2, type: 'info', message: 'Mantenimiento programado para Flota #4', time: 'Hace 1h' },
        { id: 3, type: 'critical', message: 'Novedad: Sin stock en SKU-789', time: 'Hace 2h' }
      ]
    };

    res.json(response);

  } catch (err: any) {
    console.error('[M7-DASHBOARD] Error:', err.message);
    res.status(500).json({ error: "Error al obtener dashboard stats" });
  }
};

export const getAjoverStats = async (req: Request, res: Response) => {
  try {
    const [vehiclesRes, driversRes, routesRes, invoicesRes, returnsRes, topRoutesRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE LOWER(status_id) IN ('est-01','disponible','available') OR LOWER(status) IN ('disponible','available')) as available,
          COUNT(*) FILTER (WHERE LOWER(status_id) = 'est-02' OR LOWER(status) IN ('en ruta','in route','activo')) as on_route,
          COALESCE(SUM(capacity_m3), 0) as total_capacity_m3,
          COALESCE(SUM(capacity_kg), 0) as total_capacity_kg
        FROM vehicles WHERE client_id = 'CLI-01' OR client_id IS NULL
      `),
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE LOWER(status_id) = 'est-01' OR LOWER(status) IN ('activo','active')) as active
        FROM drivers WHERE client_id = 'CLI-01' OR client_id IS NULL
      `),
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE LOWER(status) IN ('activo','active','en ruta')) as active,
          COUNT(*) FILTER (WHERE LOWER(status) IN ('completado','completed','finalizado')) as completed,
          COUNT(*) FILTER (WHERE LOWER(status) IN ('pendiente','pending')) as pending
        FROM routes WHERE client_id = 'CLI-01' OR client_id IS NULL
      `),
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE LOWER(status) IN ('entregado','finalizado','delivered')) as delivered,
          COUNT(*) FILTER (WHERE LOWER(status) IN ('en ruta','in route','despachado')) as in_route,
          COUNT(*) FILTER (WHERE LOWER(status) IN ('pendiente','pending','procesando')) as pending,
          COUNT(*) FILTER (WHERE LOWER(status) IN ('devuelto','returned','retorno')) as returned,
          COALESCE(SUM(CASE WHEN LOWER(status) IN ('entregado','finalizado','delivered')
            THEN (SELECT COALESCE(SUM(COALESCE(peso,0)),0) FROM document_items WHERE document_id = d.id) ELSE 0 END), 0) as delivered_weight
        FROM documents_l d WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      `),
      pool.query(`
        SELECT
          di.city,
          COUNT(DISTINCT d.id) as total,
          COUNT(DISTINCT d.id) FILTER (WHERE LOWER(d.status) IN ('entregado','finalizado','delivered')) as delivered,
          COUNT(DISTINCT d.id) FILTER (WHERE LOWER(d.status) IN ('devuelto','returned','retorno')) as returned
        FROM documents_l d
        JOIN document_items di ON d.id = di.document_id
        WHERE di.city IS NOT NULL AND d.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY di.city ORDER BY total DESC LIMIT 10
      `),
      pool.query(`
        SELECT r.name as route_name, r.status,
          COUNT(DISTINCT r.id) FILTER (WHERE LOWER(r.status) IN ('activo','active','en ruta')) as active_count,
          v.plate, d.name as driver_name
        FROM routes r
        LEFT JOIN vehicles v ON r.vehicle_id = v.id
        LEFT JOIN drivers d ON r.driver_id = d.id
        WHERE r.client_id = 'CLI-01' OR r.client_id IS NULL
        GROUP BY r.name, r.status, v.plate, d.name
        ORDER BY active_count DESC LIMIT 10
      `)
    ]);

    const veh = vehiclesRes.rows[0];
    const drv = driversRes.rows[0];
    const rts = routesRes.rows[0];
    const inv = invoicesRes.rows[0];

    const totalDocs = Number(inv.delivered) + Number(inv.in_route) + Number(inv.pending) + Number(inv.returned);
    const effectivenessRate = totalDocs > 0 ? Math.round((Number(inv.delivered) / totalDocs) * 100) : 0;
    const returnRate = totalDocs > 0 ? Math.round((Number(inv.returned) / totalDocs) * 100) : 0;

    res.json({
      vehicles: {
        total: Number(veh.total),
        available: Number(veh.available),
        onRoute: Number(veh.on_route),
        totalCapacityM3: Number(veh.total_capacity_m3),
        totalCapacityKg: Number(veh.total_capacity_kg),
      },
      drivers: {
        total: Number(drv.total),
        active: Number(drv.active),
      },
      routes: {
        total: Number(rts.total),
        active: Number(rts.active),
        completed: Number(rts.completed),
        pending: Number(rts.pending),
      },
      invoices: {
        total: Number(inv.total),
        delivered: Number(inv.delivered),
        inRoute: Number(inv.in_route),
        pending: Number(inv.pending),
        returned: Number(inv.returned),
        deliveredWeight: Number(inv.delivered_weight),
        effectivenessRate,
        returnRate,
      },
      topCities: returnsRes.rows.map(r => ({
        city: r.city,
        total: Number(r.total),
        delivered: Number(r.delivered),
        returned: Number(r.returned),
        effectiveness: Number(r.total) > 0 ? Math.round((Number(r.delivered) / Number(r.total)) * 100) : 0,
      })),
      activeRoutes: topRoutesRes.rows.map(r => ({
        name: r.route_name,
        status: r.status,
        plate: r.plate,
        driver: r.driver_name,
      })),
    });
  } catch (err: any) {
    console.error('[M7-AJOVER-DASHBOARD] Error:', err.message);
    res.status(500).json({ error: 'Error al obtener estadísticas Ajover' });
  }
};

import { DemandService } from '../services/demand.service.js';

export const getDemandPrediction = async (req: Request, res: Response) => {
  try {
    const service = new DemandService();
    const historical = service.getHistoricalData(30);
    const prediction = service.predictNextDays(historical, 7);
    
    res.json({
      historical: historical || [],
      forecast: prediction.forecasts || [],
      trend: { m: prediction.m, b: prediction.b },
      confidence: 0.89 
    });

  } catch (err: any) {
    console.error('[M7-PREDICTION] Error:', err.message);
    res.status(500).json({ 
      error: "Error generando predicción de demanda",
      historical: [],
      forecast: []
    });
  }
};
