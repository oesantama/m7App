import { Request, Response } from 'express';
import pool from '../config/database.js';

// const JWT_SECRET = process.env.JWT_SECRET || 'secret_key'; // Unused

// 1. Client Login
export const clientLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM client_users WHERE email = $1', [email.toLowerCase()]); // Ensure lowercase check
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = result.rows[0];

    // Simple password check for prototype
    if (user.password_hash !== password) {
       return res.status(401).json({ error: "Credenciales inválidas" });
    }

    if (user.status !== 'ACTIVO') {
        return res.status(403).json({ error: "Cuenta inactiva" });
    }

    // Update last login
    await pool.query('UPDATE client_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    
    // Return user info directly (No JWT in prototype)
    res.json({ 
        success: true,
        token: 'mock-token-' + user.id, // Mock token for frontend compat
        user: { name: user.name, email: user.email, clientId: user.client_id } 
    });

  } catch (err: any) {
    console.error('[PORTAL-LOGIN] Error:', err.message);
    res.status(500).json({ error: "Error en login de cliente" });
  }
};

// 2. Track Order (Public or Private)
export const trackOrder = async (req: Request, res: Response) => {
    const { trackingId } = req.params; // Can be external_doc_id OR tracking_token
    
    try {
        // Buscamos por ID externo (factura) o token
        // JOIN con client info para validar si es requerido
        const query = `
          SELECT 
            d.external_doc_id,
            d.status,
            d.delivery_date,
            d.created_at,
            d.plan_type,
            d.vehicle_plate, -- Solo mostrar si está en ruta
            (SELECT json_agg(json_build_object(
                'sku', di.article_id,
                'qty', di.expected_qty,
                'desc', ar.name
             )) 
             FROM document_items di 
             LEFT JOIN articles ar ON di.article_id = ar.id
             WHERE di.document_id = d.id
            ) as items,
            -- Timeline events (Mocked logic based on dates)
            d.created_at as time_received,
            d.picking_date as time_picked,
            d.receiving_date as time_delivered,
            -- Ubicación (Solo si EN RUTA)
            CASE WHEN d.status = 'EN RUTA' THEN 
                (SELECT json_build_object('lat', l.latitude, 'lng', l.longitude) 
                 FROM vehicle_locations l 
                 WHERE l.vehicle_id = d.vehicle_plate 
                 ORDER BY l.updated_at DESC LIMIT 1)
            ELSE NULL END as location
          FROM documents_l d
          WHERE d.external_doc_id = $1 OR d.tracking_token = $1
        `;

        const result = await pool.query(query, [trackingId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }

        const order = result.rows[0];
        
        // Sanitizar datos del vehículo si no está en ruta
        if (order.status !== 'EN RUTA') {
            delete order.vehicle_plate;
            delete order.location;
        }

        res.json(order);

    } catch (err: any) {
        console.error('[PORTAL-TRACK] Error:', err.message);
        res.status(500).json({ error: "Error al rastrear pedido" });
    }
};

// 3. Get Client Orders (Authenticated)
export const getClientOrders = async (req: Request, res: Response) => {
    // @ts-ignore
    const clientId = req.user?.clientId; // From middleware
    
    if (!clientId) return res.status(403).json({ error: "Acceso denegado" });

    try {
        const result = await pool.query(`
            SELECT id, external_doc_id, status, delivery_date, created_at, plan_type
            FROM documents_l
            WHERE client_id = $1
            ORDER BY created_at DESC
            LIMIT 50
        `, [clientId]);

        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: "Error al obtener pedidos" });
    }
};
