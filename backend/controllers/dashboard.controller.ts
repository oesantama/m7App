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
  const p = [clientId]; // Each query has its own .catch() so a single failure never kills the whole response
  const [
    vehiclesRes, driversRes, routesRes, invoicesRes,
    topCitiesRes, activeRoutesRes, vehicleEffRes,
    concRow, devRow, stkRow,
  ] = await Promise.all([
    // Vehicles associated to the client via assignments
    pool.query(`
      SELECT COUNT(DISTINCT v.id) as total,
        COUNT(DISTINCT v.id) FILTER (WHERE LOWER(v.status_id) IN ('est-01','disponible','available')) as available,
        COUNT(DISTINCT v.id) FILTER (WHERE LOWER(v.status_id) = 'est-02') as on_route,
        COALESCE(SUM(DISTINCT v.capacity_m3), 0) as total_capacity_m3, 0 as total_capacity_kg
      FROM assignments a
      JOIN vehicles v ON v.id::text = a.vehicle_id::text
      WHERE a.client_id = $1
    `, p).catch(() => ({ rows: [{ total:0, available:0, on_route:0, total_capacity_m3:0, total_capacity_kg:0 }] })),

    // Drivers associated to the client via assignments
    pool.query(`
      SELECT COUNT(DISTINCT d.id) as total,
        COUNT(DISTINCT d.id) FILTER (WHERE LOWER(d.status_id) = 'est-01') as active
      FROM assignments a
      JOIN drivers d ON d.id::text = a.driver_id::text
      WHERE a.client_id = $1
    `, p).catch(() => ({ rows: [{ total:0, active:0 }] })),

    pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status_id = 'EST-11') as active,
        COUNT(*) FILTER (WHERE status_id IN ('EST-12','EST-07')) as completed,
        COUNT(*) FILTER (WHERE status_id IN ('EST-10','EST-03')) as pending
      FROM routes WHERE (client_id=$1 OR client_id IS NULL)
    `, p).catch(() => ({ rows: [{ total:0, active:0, completed:0, pending:0 }] })),

    pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('EST-12','EST-14')) as delivered,
        COUNT(*) FILTER (WHERE status = 'EST-11') as in_route,
        COUNT(*) FILTER (WHERE status IN ('EST-03','EST-04','EST-05')) as pending,
        COUNT(*) FILTER (WHERE status = 'EST-13') as returned,
        0 as delivered_weight
      FROM documents_l WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND (client_id=$1 OR client_id IS NULL)
    `, p).catch(() => ({ rows: [{ total:0, delivered:0, in_route:0, pending:0, returned:0, delivered_weight:0 }] })),

    pool.query(`
      SELECT di.city,
        COUNT(DISTINCT d.id) as total,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status IN ('EST-12','EST-14')) as delivered,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'EST-13') as returned
      FROM documents_l d
      JOIN document_items di ON d.id = di.document_id
      WHERE di.city IS NOT NULL AND d.created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND d.client_id = $1
      GROUP BY di.city ORDER BY total DESC LIMIT 10
    `, p).catch(() => ({ rows: [] })),

    pool.query(`
      SELECT r.name as route_name, r.status_id as status, v.plate, d.name as driver_name
      FROM routes r
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      WHERE (r.client_id=$1 OR r.client_id IS NULL)
        AND r.status_id = 'EST-11'
      ORDER BY r.created_at DESC LIMIT 10
    `, p).catch(() => ({ rows: [] })),

    pool.query(`
      SELECT v.plate, COALESCE(v.capacity_m3,0) as capacity_m3,
        COUNT(r.id) as total_routes,
        ROUND(AVG(COALESCE(r.utilization_pct,0)),1) as avg_utilization,
        ROUND(AVG(COALESCE(r.total_volume_m3,0)),3) as avg_volume,
        MAX(COALESCE(r.utilization_pct,0)) as max_utilization,
        SUM(COALESCE(r.total_volume_m3,0)) as total_volume_dispatched
      FROM routes r
      JOIN vehicles v ON r.vehicle_id = v.id
      WHERE r.created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND (r.client_id=$1 OR r.client_id IS NULL)
        AND COALESCE(r.utilization_pct,0) > 0
      GROUP BY v.plate, v.capacity_m3
      ORDER BY avg_utilization DESC LIMIT 20
    `, p).catch(() => ({ rows: [] })),

    pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE ic.estado = 'COMPLETADO') as completadas,
        COUNT(*) FILTER (WHERE ic.estado IS NULL OR ic.estado != 'COMPLETADO') as pendientes,
        COUNT(*) FILTER (WHERE ic.es_devolucion = true) as devoluciones,
        0 as devoluciones_pendientes_bodega
      FROM invoice_conciliations ic
      JOIN documents_l dl ON dl.id = ic.document_id
      WHERE dl.client_id=$1 AND dl.created_at >= CURRENT_DATE - INTERVAL '30 days'
    `, p).catch(() => ({ rows: [{ total:0, completadas:0, pendientes:0, devoluciones:0, devoluciones_pendientes_bodega:0 }] })),

    pool.query(`
      SELECT COUNT(*) as pendientes_ruta
      FROM delivery_returns dr
      JOIN document_items di ON di.invoice = dr.invoice_id
      JOIN documents_l dl ON dl.id = di.document_id
      WHERE dr.status = 'PENDING' AND dl.client_id=$1
    `, p).catch(() => ({ rows: [{ pendientes_ruta:0 }] })),

    pool.query(`
      SELECT COALESCE(SUM(qty),0) as bodega_qty, COUNT(DISTINCT article_id) as bodega_skus
      FROM inventario_clientes WHERE client_id=$1
    `, p).catch(() => ({ rows: [{ bodega_qty:0, bodega_skus:0 }] })),
  ]);

  try {
    const veh  = vehiclesRes?.rows?.[0] || { total:0, available:0, on_route:0, total_capacity_m3:0, total_capacity_kg:0 };
    const drv  = driversRes?.rows?.[0] || { total:0, active:0 };
    const rts  = routesRes?.rows?.[0] || { total:0, active:0, completed:0, pending:0 };
    const inv  = invoicesRes?.rows?.[0] || { total:0, delivered:0, in_route:0, pending:0, returned:0, delivered_weight:0 };
    const conc = concRow?.rows?.[0] || { total:0, completadas:0, pendientes:0, devoluciones:0, devoluciones_pendientes_bodega:0 };
    const devR = devRow?.rows?.[0] || { pendientes_ruta:0 };
    const stk  = stkRow?.rows?.[0] || { bodega_qty:0, bodega_skus:0 };

    const totalDocs = Number(inv.delivered || 0) + Number(inv.in_route || 0) + Number(inv.pending || 0) + Number(inv.returned || 0);
    const effectivenessRate = totalDocs > 0 ? Math.round((Number(inv.delivered || 0) / totalDocs) * 100) : 0;
    const returnRate        = totalDocs > 0 ? Math.round((Number(inv.returned || 0)  / totalDocs) * 100) : 0;

    res.json({
      vehicles: { total: Number(veh.total || 0), available: Number(veh.available || 0), onRoute: Number(veh.on_route || 0), totalCapacityM3: Number(veh.total_capacity_m3 || 0), totalCapacityKg: Number(veh.total_capacity_kg || 0) },
      drivers:  { total: Number(drv.total || 0), active: Number(drv.active || 0) },
      routes:   { total: Number(rts.total || 0), active: Number(rts.active || 0), completed: Number(rts.completed || 0), pending: Number(rts.pending || 0) },
      invoices: { total: Number(inv.total || 0), delivered: Number(inv.delivered || 0), inRoute: Number(inv.in_route || 0), pending: Number(inv.pending || 0), returned: Number(inv.returned || 0), deliveredWeight: Number(inv.delivered_weight || 0), effectivenessRate, returnRate },
      topCities: (topCitiesRes?.rows || []).map((r: any) => ({
        city: r.city || 'Desconocida', total: Number(r.total || 0), delivered: Number(r.delivered || 0), returned: Number(r.returned || 0),
        effectiveness: Number(r.total || 0) > 0 ? Math.round((Number(r.delivered || 0) / Number(r.total || 0)) * 100) : 0,
      })),
      activeRoutes: (activeRoutesRes?.rows || []).map((r: any) => ({ name: r.route_name || 'Sin ruta', status: r.status || 'Desconocido', plate: r.plate || 'N/A', driver: r.driver_name || 'N/A' })),
      vehicleEfficiency: (vehicleEffRes?.rows || []).map((r: any) => ({
        plate: r.plate || 'N/A', capacityM3: Number(r.capacity_m3 || 0), totalRoutes: Number(r.total_routes || 0),
        avgUtilization: Number(r.avg_utilization || 0), avgVolume: Number(r.avg_volume || 0),
        maxUtilization: Number(r.max_utilization || 0), totalVolumeDispatched: Number(r.total_volume_dispatched || 0),
      })),
      conciliation: { total: Number(conc.total || 0), completadas: Number(conc.completadas || 0), pendientes: Number(conc.pendientes || 0), devoluciones: Number(conc.devoluciones || 0), devolucionesPendientesBodega: Number(conc.devoluciones_pendientes_bodega || 0) },
      devolucionesPendientesRuta: Number(devR.pendientes_ruta || 0),
      stock: { bodegaQty: Number(stk.bodega_qty || 0), bodegaSkus: Number(stk.bodega_skus || 0) },
    });
  } catch (err: any) {
    console.error('[M7-AJOVER-DASHBOARD] Error building response:', err.message);
    res.status(500).json({ error: 'Error al obtener estadísticas Ajover' });
  }
  } catch (err: any) {
    console.error('[M7-AJOVER-DASHBOARD] Error inesperado:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno al obtener estadísticas' });
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
