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
    const clientId: string = (req.query.clientId as string) || 'CLI-01';
    const clientCond = `(client_id = $1 OR client_id IS NULL)`;

    const [vehiclesRes, driversRes, routesRes, invoicesRes, returnsRes, topRoutesRes, vehicleEfficiencyRes, conciliationRes, devolucionesRes, stockRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE LOWER(status_id) IN ('est-01','disponible','available') OR LOWER(status) IN ('disponible','available')) as available,
          COUNT(*) FILTER (WHERE LOWER(status_id) = 'est-02' OR LOWER(status) IN ('en ruta','in route','activo')) as on_route,
          COALESCE(SUM(capacity_m3), 0) as total_capacity_m3,
          0 as total_capacity_kg
        FROM vehicles WHERE ${clientCond}
      `, [clientId]),
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE LOWER(status_id) = 'est-01' OR LOWER(status) IN ('activo','active')) as active
        FROM drivers WHERE ${clientCond}
      `, [clientId]),
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status_id IN ('EST-11') OR LOWER(status) IN ('activo','active','en ruta')) as active,
          COUNT(*) FILTER (WHERE status_id IN ('EST-12','EST-07') OR LOWER(status) IN ('completado','completed','finalizado')) as completed,
          COUNT(*) FILTER (WHERE status_id IN ('EST-10','EST-03') OR LOWER(status) IN ('pendiente','pending')) as pending
        FROM routes WHERE ${clientCond}
      `, [clientId]),
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('EST-12','EST-14') OR LOWER(status) IN ('entregado','finalizado','delivered')) as delivered,
          COUNT(*) FILTER (WHERE status IN ('EST-11') OR LOWER(status) IN ('en ruta','in route','despachado')) as in_route,
          COUNT(*) FILTER (WHERE status IN ('EST-03','EST-04','EST-05') OR LOWER(status) IN ('pendiente','pending','procesando')) as pending,
          COUNT(*) FILTER (WHERE status IN ('EST-13') OR LOWER(status) IN ('devuelto','returned','retorno')) as returned,
          COALESCE(SUM(CASE WHEN status IN ('EST-12','EST-14') OR LOWER(status) IN ('entregado','finalizado','delivered')
            THEN (SELECT COALESCE(SUM(COALESCE(peso,0)),0) FROM document_items WHERE document_id = d.id) ELSE 0 END), 0) as delivered_weight
        FROM documents_l d WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' AND ${clientCond}
      `, [clientId]),
      pool.query(`
        SELECT
          di.city,
          COUNT(DISTINCT d.id) as total,
          COUNT(DISTINCT d.id) FILTER (WHERE LOWER(d.status) IN ('entregado','finalizado','delivered')) as delivered,
          COUNT(DISTINCT d.id) FILTER (WHERE LOWER(d.status) IN ('devuelto','returned','retorno')) as returned
        FROM documents_l d
        JOIN document_items di ON d.id = di.document_id
        WHERE di.city IS NOT NULL AND d.created_at >= CURRENT_DATE - INTERVAL '30 days' AND d.client_id = $1
        GROUP BY di.city ORDER BY total DESC LIMIT 10
      `, [clientId]),
      pool.query(`
        SELECT r.name as route_name, r.status,
          COUNT(DISTINCT r.id) FILTER (WHERE LOWER(r.status) IN ('activo','active','en ruta')) as active_count,
          v.plate, d.name as driver_name
        FROM routes r
        LEFT JOIN vehicles v ON r.vehicle_id = v.id
        LEFT JOIN drivers d ON r.driver_id = d.id
        WHERE (r.client_id = $1 OR r.client_id IS NULL)
        GROUP BY r.name, r.status, v.plate, d.name
        ORDER BY active_count DESC LIMIT 10
      `, [clientId]),
      pool.query(`
        SELECT
          v.plate,
          v.capacity_m3,
          COUNT(r.id) as total_routes,
          ROUND(AVG(COALESCE(r.utilization_pct, 0)), 1) as avg_utilization,
          ROUND(AVG(COALESCE(r.total_volume_m3, 0)), 3) as avg_volume,
          MAX(COALESCE(r.utilization_pct, 0)) as max_utilization,
          SUM(COALESCE(r.total_volume_m3, 0)) as total_volume_dispatched
        FROM routes r
        JOIN vehicles v ON r.vehicle_id = v.id
        WHERE r.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND (r.client_id = $1 OR r.client_id IS NULL)
          AND COALESCE(r.utilization_pct, 0) > 0
        GROUP BY v.plate, v.capacity_m3
        ORDER BY avg_utilization DESC
        LIMIT 20
      `, [clientId]),
      // Conciliación: pendientes vs completadas (últimos 30 días)
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE ic.estado = 'COMPLETADO') as completadas,
          COUNT(*) FILTER (WHERE ic.estado IS NULL OR ic.estado != 'COMPLETADO') as pendientes,
          COUNT(*) FILTER (WHERE ic.es_devolucion = true) as devoluciones,
          COUNT(*) FILTER (WHERE ic.es_devolucion = true AND ic.bodega_received_at IS NULL) as devoluciones_pendientes_bodega
        FROM invoice_conciliations ic
        JOIN document_items di ON di.invoice_number = ic.invoice_number
        JOIN documents_l dl ON dl.id = di.document_id
        WHERE dl.client_id = $1 AND dl.created_at >= CURRENT_DATE - INTERVAL '30 days'
      `, [clientId]),
      // Devoluciones de ruta pendientes en bodega
      pool.query(`
        SELECT COUNT(*) as pendientes_ruta
        FROM delivery_returns dr
        JOIN documents_l dl ON dl.id::text = dr.document_id::text
        WHERE dr.status = 'PENDING' AND dl.client_id = $1
      `, [clientId]),
      // Stock en bodega y vehículos
      pool.query(`
        SELECT
          COALESCE(SUM(ic.qty), 0) as bodega_qty,
          COUNT(DISTINCT ic.article_id) as bodega_skus
        FROM inventario_clientes ic
        WHERE ic.client_id = $1
      `, [clientId]),
    ]);

    const veh  = vehiclesRes.rows[0];
    const drv  = driversRes.rows[0];
    const rts  = routesRes.rows[0];
    const inv  = invoicesRes.rows[0];
    const conc = conciliationRes.rows[0];
    const devR = devolucionesRes.rows[0];
    const stk  = stockRes.rows[0];

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
      vehicleEfficiency: vehicleEfficiencyRes.rows.map(r => ({
        plate: r.plate,
        capacityM3: Number(r.capacity_m3),
        totalRoutes: Number(r.total_routes),
        avgUtilization: Number(r.avg_utilization),
        avgVolume: Number(r.avg_volume),
        maxUtilization: Number(r.max_utilization),
        totalVolumeDispatched: Number(r.total_volume_dispatched),
      })),
      conciliation: {
        total:                      Number(conc.total),
        completadas:                Number(conc.completadas),
        pendientes:                 Number(conc.pendientes),
        devoluciones:               Number(conc.devoluciones),
        devolucionesPendientesBodega: Number(conc.devoluciones_pendientes_bodega),
      },
      devolucionesPendientesRuta: Number(devR.pendientes_ruta),
      stock: {
        bodegaQty:  Number(stk.bodega_qty),
        bodegaSkus: Number(stk.bodega_skus),
      },
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
