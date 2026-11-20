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
                g.id, g.numero_guia, g.numero_pedido, g.contenedor, g.estado_operativo,
                g.tipo_operacion, g.modalidad_pedido,
                g.nombre_destinatario, g.direccion_destinatario, g.barrio_destinatario, g.ciudad_destinatario_nombre,
                COALESCE(n.nombre, g.nombre_remitente) AS tienda_origen,
                COALESCE(g.ciudad_remitente_nombre, n.ciudad_nombre) AS ciudad_origen,
                g.created_at, g.fecha_recogida_tienda, g.fecha_ingreso_almacen, g.fecha_salida_ruta,
                g.fecha_entrega_real, g.fecha_anulacion,
                g.vehiculo_entrega_id, COALESCE(g.intentos_entrega, 0) AS intentos_entrega,
                g.foto_recogida_url, g.foto_entrega_url, g.foto_rotulo_entrega_url, g.firma_entrega_url,
                g.cant_cajas, g.peso_kg, g.contenido,
                (
                  SELECT json_agg(json_build_object(
                    'estado_anterior', h.estado_anterior,
                    'estado_nuevo', h.estado_nuevo,
                    'observacion', h.observacion,
                    'created_at', h.created_at
                  ) ORDER BY h.created_at ASC, h.id ASC)
                  FROM exito_msj_guia_historial h
                  WHERE h.guia_id = g.id
                ) AS historial,
                (
                  SELECT json_agg(json_build_object(
                    'codigo', nv.codigo_novedad,
                    'etapa', nv.etapa,
                    'descripcion', nv.descripcion,
                    'foto_url', nv.foto_url,
                    'foto_adicional_url', nv.foto_adicional_url,
                    'resuelta', nv.resuelta,
                    'created_at', nv.created_at
                  ) ORDER BY nv.created_at ASC)
                  FROM exito_msj_novedades nv
                  WHERE nv.guia_id = g.id
                ) AS novedades,
                (
                  SELECT json_agg(json_build_object(
                    'sku', p.codigo_barra_paquete,
                    'qty', 1,
                    'desc', COALESCE(p.descripcion, 'Paquete ' || p.numero_paquete)
                  ))
                  FROM exito_msj_guia_paquetes p
                  WHERE p.guia_id = g.id
                ) AS items
              FROM exito_msj_guias g
              LEFT JOIN exito_msj_nodos n ON n.id = g.nodo_id
              WHERE (UPPER(g.numero_guia) = UPPER($1) OR UPPER(g.numero_pedido) = UPPER($1) OR UPPER(COALESCE(g.contenedor, '')) = UPPER($1))
              ORDER BY g.created_at DESC
              LIMIT 1
            `;
            const exitoRes = await pool.query(exitoQuery, [trackingId]);
            if (exitoRes.rows.length === 0) {
                return res.status(404).json({ error: "Pedido o guía no encontrado" });
            }

            return res.json(construirSeguimientoExito(exitoRes.rows[0]));
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

// ─────────────────────────────────────────────────────────────────────────────
// Seguimiento público de guías Éxito: etapas, eventos (más reciente primero) y evidencias.
// Las etapas se calculan con el HISTORIAL, no con el estado actual: tras un intento fallido
// la guía vuelve a EN_ALMACEN, pero ya estuvo en ruta y eso debe verse marcado.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_INTENTOS_ENTREGA = 3;

type FotoEvidencia = { url: string; label: string };
type EtapaSeguimiento = {
    key: string;
    label: string;
    estado: 'done' | 'current' | 'warning' | 'error' | 'pending';
    fecha?: string | null;
    detalle?: string | null;
};
type EventoSeguimiento = {
    tipo: string;
    titulo: string;
    detalle: string;
    fecha: string;
    fotos: FotoEvidencia[];
};

const ESTADO_PUBLICO: Record<string, string> = {
    ESPERA_RECOGIDA: 'Pendiente de recogida en tienda',
    DISPONIBLE: 'Pendiente de recogida en tienda',
    RECOGIDA_TIENDA: 'Recogido en tienda',
    EN_ALMACEN: 'En bodega Milla 7',
    EN_RUTA: 'En ruta de entrega',
    ENTREGADO: 'Entregado',
    DEVOLUCION: 'En devolución',
    ANULADO: 'Guía anulada',
};

/** Quita rutas internas de archivos ("Foto Drive: /uploads/...") de las observaciones. */
const limpiarObservacion = (txt: any): string =>
    String(txt || '')
        .replace(/\s*\.?\s*Foto(\s+Drive)?\s*:\s*\S+/gi, '')
        .replace(/\s*\/uploads\/\S+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .replace(/[.\s]+$/, '');

const esUrlFoto = (u: any): u is string => typeof u === 'string' && u.trim() !== '' && !/\.pdf($|\?)/i.test(u);

const construirSeguimientoExito = (eg: any) => {
    const historial: any[] = Array.isArray(eg.historial) ? eg.historial : [];
    const novedades: any[] = Array.isArray(eg.novedades) ? eg.novedades : [];
    const estado = String(eg.estado_operativo || '').toUpperCase();
    const ms = (d: any) => (d ? new Date(d).getTime() : 0);

    // Las novedades se registran en la misma transacción que su fila de historial: se emparejan por hora.
    const novedadesUsadas = new Set<number>();
    const novedadDe = (fecha: any) => {
        let mejor = -1;
        let mejorDiff = 10_000; // 10 s
        novedades.forEach((nv, i) => {
            if (novedadesUsadas.has(i)) return;
            const diff = Math.abs(ms(nv.created_at) - ms(fecha));
            if (diff <= mejorDiff) { mejor = i; mejorDiff = diff; }
        });
        if (mejor === -1) return null;
        novedadesUsadas.add(mejor);
        return novedades[mejor];
    };
    const fotosNovedad = (nv: any, n?: number): FotoEvidencia[] => {
        if (!nv) return [];
        const sufijo = n ? ` intento #${n}` : '';
        const out: FotoEvidencia[] = [];
        if (esUrlFoto(nv.foto_url)) out.push({ url: nv.foto_url, label: `Novedad${sufijo}` });
        if (esUrlFoto(nv.foto_adicional_url)) out.push({ url: nv.foto_adicional_url, label: `Novedad${sufijo} (adicional)` });
        return out;
    };

    const eventos: EventoSeguimiento[] = [];
    let intento = 0;
    let fechaRecogida: string | null = eg.fecha_recogida_tienda || null;
    let fechaBodega: string | null = eg.fecha_ingreso_almacen || null;
    let fechaPrimeraRuta: string | null = null;
    let fechaUltimaRuta: string | null = null;
    let fechaDevolucion: string | null = null;
    let fotoRecogidaUsada = false;

    for (const h of historial) {
        const nuevo = String(h.estado_nuevo || '').toUpperCase();
        const obs = limpiarObservacion(h.observacion);
        const fecha = h.created_at;
        const esIntento = /intento\s+fallido|no\s+entregad|rechaz/i.test(String(h.observacion || ''))
            || (String(h.estado_anterior || '').toUpperCase() === 'EN_RUTA' && nuevo === 'DEVOLUCION');

        if (esIntento) {
            intento += 1;
            const nv = novedadDe(fecha);
            const motivo = limpiarObservacion(nv?.descripcion || obs).replace(/^Intento fallido:\s*/i, '').replace(/\s*\(Intento\s*#\d+\)\s*$/i, '');
            const final = nuevo === 'DEVOLUCION';
            if (final) fechaDevolucion = fecha;
            eventos.push({
                tipo: final ? 'devolucion' : 'intento',
                titulo: final
                    ? `Intento de entrega #${intento} fallido · pasa a devolución`
                    : `Intento de entrega #${intento} fallido`,
                detalle: motivo
                    ? `Motivo: ${motivo}.${final ? '' : ' La guía regresa a bodega para un nuevo intento.'}`
                    : (final ? 'Se agotaron los intentos de entrega.' : 'La guía regresa a bodega para un nuevo intento.'),
                fecha,
                fotos: fotosNovedad(nv, intento),
            });
            continue;
        }

        switch (nuevo) {
            case 'ESPERA_RECOGIDA':
            case 'DISPONIBLE':
                eventos.push({
                    tipo: 'registro',
                    titulo: 'Guía registrada',
                    detalle: `Pendiente de recogida en ${eg.tienda_origen ? `la tienda ${eg.tienda_origen}` : 'la tienda'}.`,
                    fecha, fotos: [],
                });
                break;
            case 'RECOGIDA_TIENDA': {
                fechaRecogida = fechaRecogida || fecha;
                const fotos: FotoEvidencia[] = [];
                if (!fotoRecogidaUsada && esUrlFoto(eg.foto_recogida_url)) {
                    fotos.push({ url: eg.foto_recogida_url, label: 'Recogida en tienda' });
                    fotoRecogidaUsada = true;
                }
                eventos.push({ tipo: 'recogida', titulo: 'Recogido en tienda', detalle: obs, fecha, fotos });
                break;
            }
            case 'EN_ALMACEN':
                fechaBodega = fechaBodega || fecha;
                eventos.push({ tipo: 'bodega', titulo: 'Recibido en bodega Milla 7', detalle: obs, fecha, fotos: [] });
                break;
            case 'EN_RUTA':
                fechaPrimeraRuta = fechaPrimeraRuta || fecha;
                fechaUltimaRuta = fecha;
                eventos.push({
                    tipo: 'ruta',
                    titulo: intento > 0 ? `Sale a ruta · intento #${intento + 1}` : 'Sale a ruta de entrega',
                    detalle: obs, fecha, fotos: [],
                });
                break;
            case 'ENTREGADO': {
                const fotos: FotoEvidencia[] = [];
                if (esUrlFoto(eg.foto_entrega_url)) fotos.push({ url: eg.foto_entrega_url, label: 'Foto de entrega' });
                if (esUrlFoto(eg.foto_rotulo_entrega_url)) fotos.push({ url: eg.foto_rotulo_entrega_url, label: 'Rótulo en la entrega' });
                if (esUrlFoto(eg.firma_entrega_url)) fotos.push({ url: eg.firma_entrega_url, label: 'Firma de quien recibe' });
                eventos.push({ tipo: 'entrega', titulo: 'Entregado al destinatario', detalle: obs, fecha, fotos });
                break;
            }
            case 'DEVOLUCION':
                fechaDevolucion = fechaDevolucion || fecha;
                eventos.push({ tipo: 'devolucion', titulo: 'Guía en devolución', detalle: obs, fecha, fotos: fotosNovedad(novedadDe(fecha)) });
                break;
            case 'ANULADO':
                eventos.push({ tipo: 'anulada', titulo: 'Guía anulada', detalle: obs, fecha, fotos: [] });
                break;
            default: {
                // Novedades (estado 10) u otros registros
                const nv = novedadDe(fecha);
                eventos.push({
                    tipo: nv ? 'novedad' : 'otro',
                    titulo: nv ? 'Novedad reportada' : (ESTADO_PUBLICO[nuevo] || 'Actualización'),
                    detalle: limpiarObservacion(nv?.descripcion || obs),
                    fecha,
                    fotos: fotosNovedad(nv),
                });
            }
        }
    }

    // Novedades que no quedaron emparejadas con una fila de historial
    novedades.forEach((nv, i) => {
        if (novedadesUsadas.has(i)) return;
        eventos.push({
            tipo: 'novedad',
            titulo: nv.resuelta ? 'Novedad (resuelta)' : 'Novedad reportada',
            detalle: limpiarObservacion(nv.descripcion),
            fecha: nv.created_at,
            fotos: fotosNovedad(nv),
        });
    });

    // Foto de recogida sin fila de historial (datos antiguos)
    if (!fotoRecogidaUsada && esUrlFoto(eg.foto_recogida_url)) {
        const ev = eventos.find(e => e.tipo === 'recogida');
        if (ev) ev.fotos.push({ url: eg.foto_recogida_url, label: 'Recogida en tienda' });
    }

    eventos.sort((a, b) => ms(b.fecha) - ms(a.fecha)); // más reciente primero

    const intentos = Math.max(intento, Number(eg.intentos_entrega) || 0);
    const entregado = estado === 'ENTREGADO';
    const devolucion = estado === 'DEVOLUCION';
    const anulada = estado === 'ANULADO';
    const estuvoEnRuta = Boolean(fechaPrimeraRuta || eg.fecha_salida_ruta || intentos > 0 || entregado);
    const recogido = Boolean(fechaRecogida || fechaBodega || estuvoEnRuta);
    const enBodega = Boolean(fechaBodega || estuvoEnRuta);

    // Etapas de la línea de progreso
    const etapas: EtapaSeguimiento[] = [];
    const cerrada = entregado || devolucion || anulada;
    etapas.push({ key: 'registrado', label: 'Registrado', estado: 'done', fecha: eg.created_at });
    etapas.push({
        key: 'recogido', label: 'Recogido en tienda',
        estado: recogido ? 'done' : (cerrada ? 'pending' : 'current'),
        fecha: fechaRecogida,
    });
    etapas.push({
        key: 'bodega', label: 'En bodega',
        estado: enBodega ? (estado === 'EN_ALMACEN' && intentos === 0 ? 'current' : 'done') : 'pending',
        fecha: fechaBodega,
    });
    etapas.push({
        key: 'ruta', label: 'En ruta',
        estado: estuvoEnRuta ? (estado === 'EN_RUTA' ? 'current' : 'done') : 'pending',
        fecha: fechaUltimaRuta || eg.fecha_salida_ruta || null,
        detalle: estado === 'EN_RUTA' && intentos > 0 ? `Intento #${intentos + 1}` : null,
    });
    if (intentos > 0) {
        etapas.push({
            key: 'intentos', label: 'Intentos de entrega',
            estado: devolucion ? 'error' : 'warning',
            detalle: `${Math.min(intentos, MAX_INTENTOS_ENTREGA)} de ${MAX_INTENTOS_ENTREGA}`,
        });
    }
    if (devolucion) etapas.push({ key: 'devolucion', label: 'Devolución', estado: 'error', fecha: fechaDevolucion });
    if (anulada) etapas.push({ key: 'anulada', label: 'Anulada', estado: 'error', fecha: eg.fecha_anulacion });
    etapas.push({
        key: 'entregado', label: 'Entregado',
        estado: entregado ? 'done' : 'pending',
        fecha: entregado ? eg.fecha_entrega_real : null,
    });

    // Galería: todas las fotos, sin repetir la misma imagen
    const vistas = new Set<string>();
    const evidencias: (FotoEvidencia & { fecha: string })[] = [];
    [...eventos].reverse().forEach(ev => ev.fotos.forEach(f => {
        if (vistas.has(f.url)) return;
        vistas.add(f.url);
        evidencias.push({ ...f, fecha: ev.fecha });
    }));

    const OPERACION: Record<string, string> = { NEXT_DAY: 'Entrega al día siguiente', SAME_DAY: 'Entrega el mismo día' };

    return {
        is_exito: true,
        external_doc_id: eg.numero_guia,
        numero_pedido: eg.numero_pedido,
        status: estado,
        status_label: ESTADO_PUBLICO[estado] || estado,
        created_at: eg.created_at,
        delivery_date: eg.fecha_entrega_real,
        servicio: OPERACION[String(eg.tipo_operacion || '').toUpperCase()] || eg.tipo_operacion || null,
        vehicle_plate: estado === 'EN_RUTA' ? eg.vehiculo_entrega_id : undefined,
        intentos,
        max_intentos: MAX_INTENTOS_ENTREGA,
        origen: { tienda: eg.tienda_origen, ciudad: eg.ciudad_origen },
        destination: {
            recipient: eg.nombre_destinatario,
            address: eg.direccion_destinatario,
            barrio: eg.barrio_destinatario,
            city: eg.ciudad_destinatario_nombre,
        },
        paquete: {
            cajas: eg.cant_cajas || 1,
            peso_kg: eg.peso_kg ? Number(eg.peso_kg) : null,
            contenido: eg.contenido || null,
        },
        items: eg.items && eg.items.length > 0 ? eg.items : [{ sku: eg.numero_guia, qty: eg.cant_cajas || 1, desc: eg.contenido || 'Mercancía Éxito' }],
        etapas,
        eventos,
        evidencias,
        label_url: `/api/exito-mensajeria/guias/por-numero/${encodeURIComponent(eg.numero_guia)}/rotulo.pdf`,
    };
};
