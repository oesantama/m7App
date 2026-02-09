
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getVehicleTelemetry = async (req: Request, res: Response) => {
    const { plate } = req.params;
    try {
        const result = await pool.query(`
            SELECT * FROM vehicle_telemetry 
            WHERE vehicle_plate = $1 
            ORDER BY timestamp DESC 
            LIMIT 1
        `, [plate]);
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json({ message: 'No telemetry data' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const getFleetHealth = async (req: Request, res: Response) => {
    try {
        // Obtener la última telemetría de cada vehículo
        const result = await pool.query(`
            SELECT DISTINCT ON (vehicle_plate) 
                vehicle_plate, 
                timestamp, 
                dtc_codes, 
                fuel_level, 
                battery_voltage 
            FROM vehicle_telemetry
            ORDER BY vehicle_plate, timestamp DESC
        `);
        
        // Analizar salud
        const health = result.rows.map(r => ({
            plate: r.vehicle_plate,
            status: r.dtc_codes ? 'CRITICAL' : (r.fuel_level < 15 ? 'WARNING' : 'OK'),
            issues: r.dtc_codes ? JSON.parse(r.dtc_codes) : [],
            lastUpdate: r.timestamp
        }));
        
        res.json(health);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};
