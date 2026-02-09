import { Request, Response } from 'express';
import pool from '../config/database.js';

export const updateVehicleLocation = async (req: Request, res: Response) => {
    try {
        const { vehicleId, driverId, latitude, longitude, accuracy, speed, heading } = req.body;

        if (!vehicleId || !latitude || !longitude) {
            return res.status(400).json({ error: 'vehicleId, latitude y longitude son requeridos' });
        }

        const query = `
            INSERT INTO vehicle_locations (vehicle_id, driver_id, latitude, longitude, accuracy, speed, heading, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *
        `;

        const result = await pool.query(query, [
            vehicleId,
            driverId || null,
            latitude,
            longitude,
            accuracy || null,
            speed || null,
            heading || null
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[UPDATE-VEHICLE-LOCATION-ERROR]', error);
        res.status(500).json({ error: 'Error al actualizar ubicación del vehículo' });
    }
};

export const getLatestVehicleLocations = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT DISTINCT ON (vehicle_id)
                vl.*,
                v.plate
            FROM vehicle_locations vl
            LEFT JOIN vehicles v ON vl.vehicle_id = v.id
            ORDER BY vehicle_id, updated_at DESC
        `;

        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('[GET-LATEST-LOCATIONS-ERROR]', error);
        res.status(500).json({ error: 'Error al obtener ubicaciones' });
    }
};

export const getVehicleLocationHistory = async (req: Request, res: Response) => {
    try {
        const { vehicleId } = req.params;
        const { limit = 50 } = req.query;

        const query = `
            SELECT vl.*, v.plate
            FROM vehicle_locations vl
            LEFT JOIN vehicles v ON vl.vehicle_id = v.id
            WHERE vl.vehicle_id = $1
            ORDER BY vl.updated_at DESC
            LIMIT $2
        `;

        const result = await pool.query(query, [vehicleId, limit]);
        res.json(result.rows);
    } catch (error) {
        console.error('[GET-VEHICLE-HISTORY-ERROR]', error);
        res.status(500).json({ error: 'Error al obtener historial de ubicaciones' });
    }
};
