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
    const rawId = req.params.trackingId;
    const trackingId = String(Array.isArray(rawId) ? rawId[0] : (rawId || '')).trim();
    
    if (!trackingId) {
        return res.status(400).json({ error: "Debe ingresar un número de guía o pedido." });
    }
    
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
            CASE WHEN d.status IN ('EST-11', 'EN RUTA') THEN
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
            // Buscar en exito_msj_guias (soporte para guías y pedidos de Éxito)
            const exitoQuery = `
              SELECT 
                g.numero_guia,
                g.numero_pedido,
                g.contenedor,
                g.estado_operativo,
                g.nombre_destinatario,
                g.direccion_destinatario,
                g.ciudad_destinatario_nombre,
                g.created_at,
                g.fecha_recogida_tienda,
                g.fecha_ingreso_almacen,
                g.fecha_salida_ruta,
                g.fecha_entrega_real,
                g.vehiculo_entrega_id,
                g.foto_entrega_url,
                g.firma_entrega_url,
                g.cant_cajas,
                g.peso_kg,
                g.contenido,
                (
                  SELECT json_agg(json_build_object(
                    'id', h.id,
                    'estado_anterior', h.estado_anterior,
                    'estado_nuevo', h.estado_nuevo,
                    'observacion', h.observacion,
                    'created_at', h.created_at
                  ) ORDER BY h.created_at ASC)
                  FROM exito_msj_guia_historial h
                  WHERE h.guia_id = g.id
                ) as timeline,
                (
                  SELECT json_agg(json_build_object(
                    'sku', p.codigo_barra_paquete,
                    'qty', 1,
                    'desc', COALESCE(p.descripcion, 'Paquete ' || p.numero_paquete)
                  ))
                  FROM exito_msj_guia_paquetes p
                  WHERE p.guia_id = g.id
                ) as items
              FROM exito_msj_guias g
              WHERE (UPPER(g.numero_guia) = UPPER($1) OR UPPER(g.numero_pedido) = UPPER($1) OR UPPER(COALESCE(g.contenedor, '')) = UPPER($1))
              LIMIT 1
            `;
            const exitoRes = await pool.query(exitoQuery, [trackingId]);
            if (exitoRes.rows.length === 0) {
                return res.status(404).json({ error: "Pedido o guía no encontrado" });
            }

            const eg = exitoRes.rows[0];
            return res.json({
                external_doc_id: eg.numero_guia,
                numero_pedido: eg.numero_pedido,
                status: eg.estado_operativo,
                created_at: eg.created_at,
                picking_date: eg.fecha_ingreso_almacen || eg.fecha_recogida_tienda,
                delivery_date: eg.fecha_entrega_real,
                vehicle_plate: ['EN_REPARTO', 'EN RUTA', 'ASIGNADO_REPARTO'].includes(eg.estado_operativo) ? eg.vehiculo_entrega_id : undefined,
                items: eg.items && eg.items.length > 0 ? eg.items : [{ sku: eg.numero_guia, qty: eg.cant_cajas || 1, desc: eg.contenido || 'Mercancía Éxito' }],
                timeline: eg.timeline || [],
                destination: {
                    recipient: eg.nombre_destinatario,
                    address: eg.direccion_destinatario,
                    city: eg.ciudad_destinatario_nombre,
                },
                label_url: `/api/exito-mensajeria/guias/por-numero/${encodeURIComponent(eg.numero_guia)}/rotulo.pdf`,
                foto_entrega_url: eg.foto_entrega_url,
                firma_entrega_url: eg.firma_entrega_url,
                is_exito: true,
            });
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
