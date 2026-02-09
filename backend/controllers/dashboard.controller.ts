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
