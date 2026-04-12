
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

const UNIVERSAL_SCHEMA: Record<string, string[]> = {
  'roles': ['name', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'categories': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'modules': ['name', 'icon_class', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'pages': ['name', 'route', 'module_id', 'parent_id', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'clients': ['name', 'logo_url', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'users': ['email', 'password', 'name', 'role_id', 'document_type', 'document_number', 'phone', 'avatar', 'client_ids', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at', 'permissions', 'two_factor_enabled', 'two_factor_secret'],
  'drivers': ['name', 'document_type', 'document_number', 'phone', 'client_id', 'license_expiry', 'license_pdf', 'status_id', 'license_side_a', 'license_side_b', 'license_category', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'vehicles': ['plate', 'brand', 'owner', 'capacity_m3', 'client_id', 'soat_expiry', 'techno_expiry', 'soat_pdf', 'techno_pdf', 'status_id', 'model_year', 'color', 'vehicle_type', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'master_records': ['category', 'name', 'description', 'parent_id', 'notification_email', 'icon_class', 'status_id', 'created_at', 'created_by', 'updated_at', 'tipo_notificacion_id'],
  'articles': ['name', 'client_id', 'uom_std', 'factor_std', 'status_id', 'barcode', 'category_articulo_id', 'factor_inter', 'uom_general_id', 'uom_inter_id', 'image_url', 'created_by', 'updated_by', 'created_at', 'updated_at', 'sku', 'auto_created'],
  'documents_l': ['external_doc_id', 'client_id', 'vehicle_plate', 'codplan', 'delivery_date', 'city', 'status', 'inventory_date', 'inventory_start', 'inventory_user', 'created_at', 'inventory_observation', 'plan_type', 'inventory_notes', 'tracking_token', 'picking_date', 'receiving_date', 'picker_user', 'deliverer_user', 'receiver_user', 'created_by', 'updated_by', 'updated_at'],
  'document_items': ['document_id', 'article_id', 'expected_qty', 'count_1', 'count_2', 'order_number', 'unit', 'notes', 'item_status', 'un_code', 'client_ref', 'peso', 'invoice', 'volume', 'city', 'address', 'batch', 'observation', 'received_qty', 'unit_volume', 'neighborhood', 'customer_name'],
  'user_permissions': ['user_id', 'permissions', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'role_permissions': ['role_id', 'permissions', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'assignments': ['vehicle_id', 'driver_id', 'client_id', 'is_active', 'created_at', 'updated_at'],
  'whatsapp_logs': ['user_id', 'phone_number', 'message_body', 'status', 'direction', 'sent_at', 'external_message_id', 'error_message'],
  'digital_signatures': ['idusuario', 'pasword', 'firma', 'aceptapolitica', 'usuariocreacion', 'estado', 'aprobada', 'usuarioaprobo', 'fechaparobacion', 'fecha_creacion', 'usaurioactualizacion', 'fecha_actualizacion'],
  'tipos_documento': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'marcas': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'tipos_vehiculo': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'unidades_medida': ['name', 'description', 'abbreviation', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'estados': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'notificaciones': ['name', 'description', 'notification_email', 'tipo_notificacion_id', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'tipos_notificacion': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'routes': ['name', 'description', 'vehicle_id', 'driver_id', 'client_id', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'picking_assignments': ['invoice_id', 'leader_id', 'helper_ids', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at'],
  'picking_signatures': ['picking_id', 'user_id', 'signed', 'signed_at'],
  'route_invoices': ['route_id', 'invoice_id', 'created_at'],
  'route_modifications_log': ['route_id', 'invoice_id', 'action', 'user_id', 'previous_plate', 'new_plate', 'details', 'timestamp'],
  'dispatch_assignments': ['invoice_id', 'driver_id', 'helper_ids', 'scanned_items', 'is_accompanied', 'helper_count', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at', 'created_at'],
  'dispatch_signatures_pending': ['dispatch_id', 'user_id', 'role_type', 'signed', 'signed_at'],
  'delivery_confirmations': ['dispatch_id', 'invoice_id', 'driver_id', 'vehicle_id', 'delivery_type', 'delivered_items', 'notes', 'delivered_at', 'created_at'],
  'delivery_returns': ['confirmation_id', 'invoice_id', 'driver_id', 'vehicle_id', 'return_reason', 'notes', 'status', 'created_at'],
  'delivery_return_items': ['return_id', 'sku', 'article_name', 'quantity_returned', 'quantity_delivered', 'unit', 'notes'],
  'routing_patterns': ['city', 'vehicle_id', 'neighborhood', 'strength', 'last_used'],
  'deletion_logs': ['table_name', 'record_id', 'record_data', 'deleted_by', 'deleted_at'],
  'vehicle_locations': ['vehicle_id', 'driver_id', 'latitude', 'longitude', 'accuracy', 'speed', 'heading', 'updated_at', 'timestamp'],
  'document_consolidated_items': ['document_id', 'article_id', 'count_1', 'count_2', 'inventory_user', 'inventory_observation', 'expected_qty', 'picked_qty', 'dispatched_qty'],
  'inventario_clientes': ['client_id', 'article_id', 'batch', 'quantity', 'last_user', 'last_updated'],
  'training_categories': ['name', 'description', 'created_at'],
  'training_courses': ['category_id', 'title', 'description', 'cover_image', 'level', 'status_id', 'created_at'],
  'training_lessons': ['course_id', 'title', 'content', 'video_url', 'resource_url', 'order', 'created_at'],
  'user_training_progress': ['user_id', 'lesson_id', 'status', 'finished_at', 'updated_at'],
  'grupo_inter_reajustes': ['pedido_id', 'numero_documento', 'valor', 'notas', 'fecha', 'usuario'],
  'document_l_payments': ['document_id', 'invoice', 'client_ref', 'un_code', 'metodo_pago', 'vmetodo', 'user_id', 'processed_at'],
  'training_sessions': ['topic', 'content', 'instructor', 'location_type', 'scheduled_at', 'duration_minutes', 'expires_at', 'screenshots', 'tracking_token', 'created_by', 'created_at', 'updated_at'],
  'training_attendance': ['session_id', 'full_name', 'document_number', 'job_title', 'signature_b64', 'registered_at'],
  'geocoding_cache': ['address_key', 'address', 'city', 'lat', 'lng', 'created_at'],
  'payment_vouchers': ['invoice_id', 'dispatch_id', 'file_hash', 'file_name', 'file_type', 'file_data', 'payment_type', 'amount', 'bank_name', 'notes', 'uploaded_by', 'verified', 'verified_by', 'verified_at', 'created_at'],
  'invoice_conciliations': ['document_id', 'invoice_number', 'banco', 'valor', 'comprobante', 'fecha_pago', 'forma_pago', 'numero_cheque', 'es_devolucion', 'conciliado_por', 'vehicle_plate', 'conductor_id', 'conductor_name', 'created_at', 'updated_at'],

  // ─── INVENTARIO DE VEHÍCULO ────────────────────────────────────────────────
  // Stock actual por vehículo/conductor tras despacho. Se suma al cargar y se resta al entregar/devolver.
  'vehicle_inventory': [
    'vehicle_plate',    // placa del vehículo
    'driver_id',        // conductor activo
    'driver_name',      // nombre conductor (desnorm. para consultas rápidas)
    'article_id',       // SKU del artículo
    'article_name',     // nombre artículo (desnorm.)
    'batch',            // lote
    'client_id',        // cliente al que pertenece la mercancía
    'quantity',         // cantidad actual en el vehículo
    'route_id',         // ruta activa de referencia
    'last_updated',     // última modificación
    'last_user'         // quién hizo el último movimiento
  ],

  // ─── HISTÓRICO DE ASIGNACIÓN A RUTA (por artículo) ────────────────────────
  // Registro inmutable de qué artículos/facturas se cargaron en cada ruta.
  // Permite auditar lo que salió de bodega hacia cada vehículo.
  'route_assignment_items': [
    'route_id',         // ruta (FK routes)
    'document_id',      // documento L de origen
    'invoice',          // factura/remisión
    'article_id',       // SKU
    'article_name',     // nombre artículo (desnorm.)
    'batch',            // lote
    'client_id',        // cliente
    'vehicle_plate',    // placa
    'driver_id',        // conductor
    'driver_name',      // nombre conductor
    'assigned_qty',     // cantidad asignada al vehículo
    'unit',             // unidad de medida
    'customer_name',    // destinatario
    'city',             // ciudad destino
    'address',          // dirección destino
    'assigned_by',      // usuario que confirmó despacho
    'assigned_at',      // fecha/hora de asignación
    'notes'             // observaciones
  ],

  // ─── DEVOLUCIONES A PROVEEDOR ─────────────────────────────────────────────
  // Cabecera: cuando bodega devuelve mercancía al proveedor/origen.
  // Descuenta de inventario_clientes.
  'supplier_returns': [
    'client_id',         // cliente dueño del inventario
    'vehicle_plate',     // vehículo desde donde viene (si aplica)
    'reference',         // referencia/remisión del proveedor
    'return_reason',     // motivo de devolución
    'total_items',       // número de artículos distintos
    'total_qty',         // cantidad total devuelta
    'status',            // borrador | confirmada | anulada
    'notes',             // observaciones generales
    'created_by',        // usuario que registró
    'confirmed_by',      // usuario que confirmó
    'created_at',        // fecha creación
    'confirmed_at'       // fecha confirmación
  ],

  // ─── DETALLE DE DEVOLUCIONES A PROVEEDOR ──────────────────────────────────
  'supplier_return_items': [
    'return_id',         // FK supplier_returns
    'article_id',        // SKU
    'article_name',      // nombre artículo
    'batch',             // lote
    'quantity',          // cantidad devuelta
    'unit',              // unidad
    'notes'              // observación por ítem
  ],

  // ─── CABECERA DE CONCILIACIÓN ─────────────────────────────────────────────
  // Una conciliación por conductor/vehículo/fecha. Agrupa todas las facturas del día.
  // Valida: lo entregado vs lo recaudado vs lo devuelto vs lo en repique.
  'conciliation_headers': [
    'route_id',              // ruta de referencia
    'vehicle_plate',         // placa
    'driver_id',             // conductor
    'driver_name',           // nombre conductor
    'conciliation_date',     // fecha de cierre
    'total_invoices',        // total facturas asignadas
    'total_delivered',       // facturas entregadas (FULL)
    'total_partial',         // facturas con entrega parcial
    'total_returned',        // facturas devueltas totalmente
    'total_repique',         // facturas en repique
    'total_collected',       // valor total recaudado ($)
    'total_pending_collect', // valor pendiente por recaudar ($)
    'total_to_return',       // valor mercancía devuelta a bodega ($)
    'status',                // borrador | cerrada | aprobada
    'notes',                 // observaciones generales
    'created_by',            // quien hizo la conciliación
    'approved_by',           // quien aprobó
    'created_at',
    'updated_at',
    'approved_at'
  ],

  // ─── TRANSACCIONES DE CONCILIACIÓN ────────────────────────────────────────
  // Detalle por factura dentro de una conciliación: qué pasó con cada una.
  'conciliation_transactions': [
    'conciliation_id',      // FK conciliation_headers
    'document_id',          // documento L
    'invoice',              // factura/remisión
    'article_id',           // artículo (si aplica desglose por ítem)
    'customer_name',        // destinatario
    'city',                 // ciudad
    'transaction_type',     // entrega | devolucion | repique | parcial | pago
    'delivery_qty',         // cantidad entregada
    'returned_qty',         // cantidad devuelta
    'repique_qty',          // cantidad en repique
    'invoice_value',        // valor de la factura ($)
    'collected_value',      // valor recaudado ($)
    'payment_method',       // forma de pago
    'payment_ref',          // referencia de pago
    'banco',                // banco (si transferencia/cheque)
    'comprobante',          // número de comprobante
    'return_reason',        // motivo de devolución
    'notes',                // observaciones
    'created_at'
  ]
};

const healSchema = async (client: any) => {
  console.log('[M7-DB] Iniciando Curación Nuclear de Esquema (REPLICA EXACTA)...');
  const serialTables = ['assignments', 'dispatch_assignments', 'picking_assignments', 'routes', 'route_invoices', 'route_modifications_log', 'delivery_confirmations', 'delivery_returns', 'delivery_return_items', 'vehicle_locations', 'deletion_logs', 'user_training_progress', 'digital_signatures', 'document_consolidated_items', 'document_items', 'inventario_clientes', 'grupo_inter_pedidos', 'document_l_payments', 'grupo_inter_novedades', 'grupo_inter_reajustes', 'training_attendance', 'payment_vouchers', 'invoice_conciliations', 'vehicle_inventory', 'route_assignment_items', 'supplier_returns', 'supplier_return_items', 'conciliation_headers', 'conciliation_transactions'];
  
  const nuclearTables = Object.keys(UNIVERSAL_SCHEMA);
  for (const table of nuclearTables) {
    try {
        const checkCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`);
        const currentCols = checkCols.rows.map((r: any) => r.column_name);
        if (currentCols.length > 0) {
            const expectedCols = ['id', ...UNIVERSAL_SCHEMA[table]];
            const hasExtraCols = currentCols.some((c: string) => !expectedCols.includes(c));
            if (hasExtraCols) {
                console.warn(`[M7-DB-NUCLEAR] Discrepancia detectada en ${table}. Limpiando tabla para réplica exacta...`);
                await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            }
        }
    } catch (e) {}
  }

  // FASE 2: CURACIÓN ATÓMICA POR TABLA (BATCHING)
  for (const [table, columns] of Object.entries(UNIVERSAL_SCHEMA)) {
    try {
      const idType = serialTables.includes(table) ? 'SERIAL' : 'TEXT';
      await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id ${idType} PRIMARY KEY)`);

      // Consultar columnas existentes una sola vez
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      const existingCols = new Set(colCheck.rows.map((r: any) => r.column_name));

      const alterStatements: string[] = [];
      for (const col of columns) {
        if (!existingCols.has(col)) {
          let type = 'TEXT';
          if (col.includes('_at') || col.includes('_date') || col.endsWith('_expiry') || col === 'fechaparobacion' || col === 'fecha_creacion' || col === 'fecha_actualizacion' || col === 'timestamp' || col === 'last_used' || col === 'updated_at' || col === 'created_at' || col === 'f_ultimo_corte' || col === 'fecha_carge' || col === 'fecha_entregado' || col === 'create_at' || col === 'update_at') type = 'TIMESTAMP WITH TIME ZONE';
          if (col === 'permissions' || col.endsWith('_ids') || col.includes('items') || col === 'scanned_items' || col === 'helper_ids' || col === 'recent_assignments' || col === 'record_data' || col === 'history') type = 'JSONB';
          if (col.includes('qty') || col.includes('count_') || col.includes('capacity') || col.includes('factor') || col === 'peso' || col === 'volume' || col === 'strength' || col === 'latitude' || col === 'longitude' || col === 'latitud' || col === 'longitud' || col === 'lat' || col === 'lng' || col === 'accuracy' || col === 'speed' || col === 'heading' || col === 'level' || col === 'order' || col === 'cantidad' || col === 'valor_flete' || col === 'valor_declarado' || col === 'cantidad_total' || col === 'precio_total' || col === 'peso_total_prod' || col === 'quantity' || col === 'assigned_qty' || col === 'total_items' || col === 'total_qty' || col === 'total_invoices' || col === 'total_delivered' || col === 'total_partial' || col === 'total_returned' || col === 'total_repique' || col === 'total_collected' || col === 'total_pending_collect' || col === 'total_to_return' || col === 'delivery_qty' || col === 'returned_qty' || col === 'repique_qty' || col === 'invoice_value' || col === 'collected_value') type = 'NUMERIC DEFAULT 0';
          if (col === 'client_ids') type = 'TEXT[]';
          if (col === 'permissions' || col === 'record_data') type = 'JSONB';
          if (col.includes('enabled') || col.includes('is_active') || col.includes('policy_accepted') || col.includes('approved') || col === 'aceptapolitica' || col === 'aprobada' || col === 'signed' || col === 'es_devolucion') type = 'BOOLEAN DEFAULT FALSE';
          
          alterStatements.push(`ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
        }
      }

      if (alterStatements.length > 0) {
        console.log(`[M7-DB-HEAL] Aplicando ${alterStatements.length} cambios a ${table}...`);
        await client.query(`ALTER TABLE ${table} ${alterStatements.join(', ')}`);
      }
    } catch (err: any) {
      console.error(`[M7-DB-HEAL] Error crítico en tabla ${table}:`, err.message);
    }
  }

  try {
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS geocoding_cache_address_key_idx ON geocoding_cache (address_key)`);
  } catch (e) {}

  try {
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_conciliations_doc_inv ON invoice_conciliations (document_id, invoice_number)`);
  } catch (e) {}

  // ─── Índices de rendimiento crítico (agregados en auditoría Sprint 1) ──────────
  const performanceIndexes = [
    // document_items: join más frecuente en toda la app
    `CREATE INDEX IF NOT EXISTS idx_document_items_document_id ON document_items (document_id)`,
    `CREATE INDEX IF NOT EXISTS idx_document_items_article_id  ON document_items (article_id)`,
    // documents_l: filtros por cliente y fecha en listados
    `CREATE INDEX IF NOT EXISTS idx_documents_l_client_id   ON documents_l (client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_l_status       ON documents_l (status)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_l_created_at   ON documents_l (created_at DESC)`,
    // vehicle_locations: vista v_latest_vehicle_locations la usa constantemente
    `CREATE INDEX IF NOT EXISTS idx_vehicle_locations_vehicle_id  ON vehicle_locations (vehicle_id)`,
    `CREATE INDEX IF NOT EXISTS idx_vehicle_locations_updated_at  ON vehicle_locations (updated_at DESC)`,
    // articles: búsquedas por cliente y SKU
    `CREATE INDEX IF NOT EXISTS idx_articles_client_id ON articles (client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_articles_sku       ON articles (sku)`,
    // dispatch/picking: lookups por invoice
    `CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_invoice_id ON dispatch_assignments (invoice_id)`,
    `CREATE INDEX IF NOT EXISTS idx_picking_assignments_invoice_id  ON picking_assignments  (invoice_id)`,
    // assignments: búsqueda de vehículos por conductor
    `CREATE INDEX IF NOT EXISTS idx_assignments_driver_id  ON assignments (driver_id)`,
    `CREATE INDEX IF NOT EXISTS idx_assignments_vehicle_id ON assignments (vehicle_id)`,
    // geocoding_cache: join crítico en getInvoices (una búsqueda por cada factura)
    `CREATE INDEX IF NOT EXISTS idx_geocoding_cache_address_key ON geocoding_cache (address_key)`,
    // document_items: invoice usado en joins con payments y dispatch
    `CREATE INDEX IF NOT EXISTS idx_document_items_invoice ON document_items (invoice)`,
    // composite para el subquery de ítems agrupados
    `CREATE INDEX IF NOT EXISTS idx_document_items_doc_invoice ON document_items (document_id, invoice)`,
    // document_l_payments: lookup por invoice en join de facturas
    `CREATE INDEX IF NOT EXISTS idx_document_l_payments_invoice ON document_l_payments (invoice)`,
    // invoice_conciliations: filtros por placa y fecha
    `CREATE INDEX IF NOT EXISTS idx_invoice_conciliations_plate ON invoice_conciliations (vehicle_plate)`,
    `CREATE INDEX IF NOT EXISTS idx_invoice_conciliations_created_at ON invoice_conciliations (created_at DESC)`,
    // grupo_inter: join entre pedidos e ítems/historico (getOrders usa CTEs sobre estas)
    `CREATE INDEX IF NOT EXISTS idx_grupo_inter_items_pedido_id ON grupo_inter_pedidos_items (pedido_id)`,
    `CREATE INDEX IF NOT EXISTS idx_grupo_inter_historico_pedido_id ON grupo_inter_pedidos_historico (pedido_id)`,
    `CREATE INDEX IF NOT EXISTS idx_grupo_inter_pedidos_f_ultimo_corte ON grupo_inter_pedidos (f_ultimo_corte DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_grupo_inter_pedidos_estado ON grupo_inter_pedidos (estado)`,
    // document_items: item_status para filtro planificador (solo pendiente/repique)
    `CREATE INDEX IF NOT EXISTS idx_document_items_item_status ON document_items (item_status)`,
    // vehicle_inventory: consultas por placa y artículo
    `CREATE INDEX IF NOT EXISTS idx_vehicle_inventory_plate       ON vehicle_inventory (vehicle_plate)`,
    `CREATE INDEX IF NOT EXISTS idx_vehicle_inventory_article     ON vehicle_inventory (article_id)`,
    `CREATE INDEX IF NOT EXISTS idx_vehicle_inventory_plate_art   ON vehicle_inventory (vehicle_plate, article_id, batch)`,
    // route_assignment_items: búsquedas por ruta y factura
    `CREATE INDEX IF NOT EXISTS idx_route_assignment_items_route   ON route_assignment_items (route_id)`,
    `CREATE INDEX IF NOT EXISTS idx_route_assignment_items_invoice ON route_assignment_items (invoice)`,
    `CREATE INDEX IF NOT EXISTS idx_route_assignment_items_plate   ON route_assignment_items (vehicle_plate)`,
    // supplier_returns: filtro por cliente y fecha
    `CREATE INDEX IF NOT EXISTS idx_supplier_returns_client_id  ON supplier_returns (client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_returns_created_at ON supplier_returns (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_return_items_return_id ON supplier_return_items (return_id)`,
    // conciliation_headers: búsqueda por conductor/fecha
    `CREATE INDEX IF NOT EXISTS idx_conciliation_headers_plate      ON conciliation_headers (vehicle_plate)`,
    `CREATE INDEX IF NOT EXISTS idx_conciliation_headers_driver     ON conciliation_headers (driver_id)`,
    `CREATE INDEX IF NOT EXISTS idx_conciliation_headers_date       ON conciliation_headers (conciliation_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_conciliation_transactions_conc  ON conciliation_transactions (conciliation_id)`,
    `CREATE INDEX IF NOT EXISTS idx_conciliation_transactions_inv   ON conciliation_transactions (invoice)`,
    // unique: un inventario por vehículo/artículo/lote
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_inventory ON vehicle_inventory (vehicle_plate, article_id, batch)`,
  ];
  for (const idxSql of performanceIndexes) {
    try { await client.query(idxSql); } catch (e) {}
  }
  // ─────────────────────────────────────────────────────────────────────────────

  try {
    await client.query(`
      CREATE OR REPLACE VIEW v_latest_vehicle_locations AS
      SELECT DISTINCT ON (vehicle_id)
        vl.id, vl.vehicle_id, vl.driver_id, vl.latitude, vl.longitude, 
        vl.accuracy, vl.speed, vl.heading, vl.updated_at, v.plate, d.name as driver_name
      FROM vehicle_locations vl
      LEFT JOIN vehicles v ON vl.vehicle_id = v.id
      LEFT JOIN drivers d ON vl.driver_id = d.id
      ORDER BY vehicle_id, updated_at DESC;
    `);
  } catch (e) {}

  for (const table of serialTables) {
    try {
      const typeCheck = await client.query(`SELECT data_type FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'id'`);
      if (typeCheck.rows.length > 0 && typeCheck.rows[0].data_type === 'text') {
        console.log(`[M7-DB-HEAL] Harmonizando SERIAL para ${table}...`);
        
        if (table === 'picking_assignments') {
          await client.query('ALTER TABLE picking_signatures DROP CONSTRAINT IF EXISTS picking_signatures_picking_id_fkey');
          await client.query('ALTER TABLE picking_signatures ALTER COLUMN picking_id TYPE INTEGER USING (picking_id::INTEGER)');
        }
        if (table === 'dispatch_assignments') {
          await client.query('ALTER TABLE dispatch_signatures_pending DROP CONSTRAINT IF EXISTS dispatch_signatures_pending_dispatch_id_fkey');
        }

        await client.query(`CREATE SEQUENCE IF NOT EXISTS ${table}_id_seq`);
        await client.query(`ALTER TABLE ${table} ALTER COLUMN id TYPE INTEGER USING (CASE WHEN id ~ '^[0-9]+$' THEN id::INTEGER ELSE nextval('${table}_id_seq') END)`);
        await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('${table}_id_seq')`);
        await client.query(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1)`);

        if (table === 'picking_assignments') {
           await client.query('ALTER TABLE picking_signatures ADD CONSTRAINT picking_signatures_picking_id_fkey FOREIGN KEY (picking_id) REFERENCES picking_assignments(id) ON DELETE CASCADE');
        }
      }
    } catch (e) {}
  }

  // FASE: RESYNC DE SECUENCIAS SERIAL — evita "duplicate key value violates unique constraint pkey"
  for (const table of serialTables) {
    try {
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('${table}', 'id'),
          COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1,
          false
        )
      `);
    } catch (e) {}
  }

  // FASE ESPECIAL M7 IQ: Reparación de tipos para Capacitaciones (Solución Profesional)
  try {
    const tsCheck = await client.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'training_sessions' AND column_name = 'id'");
    if (tsCheck.rows.length > 0 && tsCheck.rows[0].data_type !== 'text') {
      console.log('[M7-DB-IQ] Detectado tipo de dato incorrecto en training_sessions.id. Corrigiendo a TEXT...');
      // 1. Quitar FKs dependientes temporalmente
      await client.query('ALTER TABLE training_attendance DROP CONSTRAINT IF EXISTS training_attendance_session_id_fkey');
      // 2. Cambiar tipo en tabla maestra
      await client.query('ALTER TABLE training_sessions ALTER COLUMN id TYPE TEXT');
      // 3. Cambiar tipo en tabla dependiente
      await client.query('ALTER TABLE training_attendance ALTER COLUMN session_id TYPE TEXT');
      // 4. Restaurar FK
      await client.query('ALTER TABLE training_attendance ADD CONSTRAINT training_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE');
      console.log('[M7-DB-IQ] Reparación de Capacitaciones completada exitosamente.');
    }
  } catch (err: any) {
    console.error('[M7-DB-IQ-ERROR] No se pudo reparar automáticamente las tablas de capacitación:', err.message);
  }

  // FASE ESPECIAL: LIMPIEZA DE DUPLICADOS PARA ON CONFLICT (ESTABILIDAD NUCLEAR)
  try {
    console.log('[M7-DB-HEAL] Limpiando duplicados para estabilidad ON CONFLICT...');
    
    // Limpiar document_consolidated_items
    await client.query(`
      DELETE FROM document_consolidated_items a USING (
        SELECT MIN(ctid) as keepid, document_id, article_id
        FROM document_consolidated_items
        GROUP BY document_id, article_id HAVING COUNT(*) > 1
      ) b
      WHERE a.document_id = b.document_id 
        AND a.article_id = b.article_id 
        AND a.ctid > b.keepid
    `);

    // Limpiar inventario_clientes
    await client.query(`
      DELETE FROM inventario_clientes a USING (
        SELECT MIN(ctid) as keepid, client_id, article_id, batch
        FROM inventario_clientes
        GROUP BY client_id, article_id, batch HAVING COUNT(*) > 1
      ) b
      WHERE a.client_id = b.client_id 
        AND a.article_id = b.article_id 
        AND a.batch = b.batch
        AND a.ctid > b.keepid
    `);

    console.log('[M7-DB-HEAL] Creando restricciones UNIQUE definitivas...');
    
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unq_doc_art_consolidated 
      ON document_consolidated_items (document_id, article_id)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unq_inv_cli_batch 
      ON inventario_clientes (client_id, article_id, batch)
    `);

    console.log('[M7-DB-IQ] Configurando restricciones de Aprendizaje Granular...');
    await client.query(`
      DROP INDEX IF EXISTS unq_routing_patterns_city_veh;
      CREATE UNIQUE INDEX IF NOT EXISTS unq_routing_patterns_granular
      ON routing_patterns (city, vehicle_id, neighborhood);
    `);

    // ── NORMALIZACIÓN document_items.item_status ─────────────────────────────
    // Los registros legacy tienen nombres descriptivos ("entregado sin verificar")
    // en lugar de los IDs EST-XX que usa el planificador/despacho.
    // Mapeamos por ILIKE para cubrir variantes de mayúsculas/minúsculas.
    const needsNorm = await client.query(`
      SELECT COUNT(*) FROM document_items
      WHERE item_status IS NULL
         OR item_status NOT LIKE 'EST-%'
         AND item_status != 'ELIMINADO'
    `);
    if (parseInt(needsNorm.rows[0].count) > 0) {
      console.log(`[M7-DB-HEAL] Normalizando item_status: ${needsNorm.rows[0].count} filas con nombres → IDs EST-XX...`);
      await client.query(`
        UPDATE document_items
        SET item_status = CASE
          WHEN item_status ILIKE '%pendiente%'                               THEN 'EST-01'
          WHEN item_status ILIKE '%auditado%'                                THEN 'EST-01'
          WHEN item_status ILIKE '%recibido%'                                THEN 'EST-01'
          WHEN item_status ILIKE '%en conteo%'                               THEN 'EST-01'
          WHEN item_status ILIKE '%activo%'                                  THEN 'EST-01'
          WHEN item_status ILIKE '%inventariado%'                            THEN 'EST-08'
          WHEN item_status ILIKE '%alistado%'                                THEN 'EST-09'
          WHEN item_status ILIKE '%asignado%'                                THEN 'EST-10'
          WHEN item_status ILIKE '%en ruta%'                                 THEN 'EST-11'
          WHEN item_status ILIKE '%entregado%'                               THEN 'EST-12'
          WHEN item_status ILIKE '%entrega%' AND item_status NOT ILIKE '%parcial%' THEN 'EST-12'
          WHEN item_status ILIKE '%devuelto%'                                THEN 'EST-13'
          WHEN item_status ILIKE '%devoluci%'                                THEN 'EST-13'
          WHEN item_status ILIKE '%parcial%'                                 THEN 'EST-14'
          WHEN item_status ILIKE '%repique%'                                 THEN 'EST-15'
          WHEN item_status ILIKE '%inactivo%'                                THEN 'EST-02'
          WHEN item_status ILIKE '%elimina%'                                 THEN 'ELIMINADO'
          ELSE item_status
        END
        WHERE item_status IS NOT NULL
          AND item_status NOT LIKE 'EST-%'
          AND item_status != 'ELIMINADO'
      `);

      await client.query(`
        UPDATE document_items di
        SET item_status = CASE
          WHEN dl.status IN ('ENTREGADO', 'COMPLETADO', 'FINALIZADO') THEN 'EST-12'
          WHEN dl.status IN ('EN RUTA')                               THEN 'EST-11'
          WHEN dl.status IN ('ELIMINADO', 'RECHAZADO')                THEN 'ELIMINADO'
          ELSE 'EST-01'
        END
        FROM documents_l dl
        WHERE di.document_id = dl.id
          AND di.item_status IS NULL
      `);

      await client.query(`
        UPDATE document_items SET item_status = 'EST-01'
        WHERE item_status IS NULL
      `);
      console.log('[M7-DB-HEAL] Normalización item_status completada.');
    }

    // ── NORMALIZACIÓN documents_l.status ─────────────────────────────────────
    // El código (frontend + backend) usa texto estándar ('PENDIENTE', 'ENTREGADO', etc.)
    // Normalizamos variantes/errores tipográficos pero MANTENEMOS texto (no convertimos a EST-XX
    // porque todo el código depende de estos nombres de texto).
    const docNorm = await client.query(`
      SELECT COUNT(*) FROM documents_l
      WHERE status IS NOT NULL
        AND status NOT IN ('PENDIENTE','AUDITADO','RECIBIDO','EN CONTEO','INVENTARIADO',
                           'EN RUTA','ENTREGADO','DEVUELTO','ENTREGA PARCIAL',
                           'ELIMINADO','RECHAZADO','COMPLETADO','FINALIZADO','ASIGNADO')
    `);
    if (parseInt(docNorm.rows[0].count) > 0) {
      console.log(`[M7-DB-HEAL] Normalizando documents_l.status: ${docNorm.rows[0].count} filas con variantes...`);
      await client.query(`
        UPDATE documents_l
        SET status = CASE
          WHEN status ILIKE '%pendiente%'                  THEN 'PENDIENTE'
          WHEN status ILIKE '%auditado%'                   THEN 'AUDITADO'
          WHEN status ILIKE '%recibido%'                   THEN 'RECIBIDO'
          WHEN status ILIKE '%en conteo%'                  THEN 'EN CONTEO'
          WHEN status ILIKE '%inventariado%'               THEN 'INVENTARIADO'
          WHEN status ILIKE '%asignado%'                   THEN 'ASIGNADO'
          WHEN status ILIKE '%en ruta%'                    THEN 'EN RUTA'
          WHEN status ILIKE '%parcial%'                    THEN 'ENTREGA PARCIAL'
          WHEN status ILIKE '%entregado%'                  THEN 'ENTREGADO'
          WHEN status ILIKE '%entrega%' AND status NOT ILIKE '%parcial%' THEN 'ENTREGADO'
          WHEN status ILIKE '%devuelto%'                   THEN 'DEVUELTO'
          WHEN status ILIKE '%devoluci%'                   THEN 'DEVUELTO'
          WHEN status ILIKE '%finalizado%'                 THEN 'COMPLETADO'
          WHEN status ILIKE '%completa%'                   THEN 'COMPLETADO'
          WHEN status ILIKE '%rechaz%'                     THEN 'RECHAZADO'
          WHEN status ILIKE '%elimina%'                    THEN 'ELIMINADO'
          ELSE status
        END
        WHERE status NOT IN ('PENDIENTE','AUDITADO','RECIBIDO','EN CONTEO','INVENTARIADO',
                             'EN RUTA','ENTREGADO','DEVUELTO','ENTREGA PARCIAL',
                             'ELIMINADO','RECHAZADO','COMPLETADO','FINALIZADO','ASIGNADO')
      `);
      console.log('[M7-DB-HEAL] Normalización documents_l.status completada.');
    }

  } catch (e: any) {
    console.error('[M7-DB-HEAL] Error en fase de estabilidad nuclear:', e.message);
  }
};

export const restoreSystem = async () => {
  const start = Date.now();
  console.log('[M7-SYSTEM] Checking Consistency... (Nuclear Mode)');
  const client = await pool.connect();
  try {
    await healSchema(client);
    const healEnd = Date.now();
    console.log(`[M7-DB-HEAL] Curación de esquema completada en ${healEnd - start}ms`);

    await client.query('BEGIN');
    
    // SEMILLAS DE DATOS LOCALHOST (Resumen de paridad)
    await client.query(`
      INSERT INTO vehicles (id, plate, brand, owner, capacity_m3, client_id, status_id, model_year, color, vehicle_type) VALUES
      ('VEH-001', 'VEJ 509', 'MAR-022', NULL, 14, 'CLI-02', 'EST-01', '2024', 'gri', 'TV-01'),
      ('VEH-002', 'SXI 118', 'MAR-022', NULL, 23, 'CLI-02', 'EST-01', '2024', 'blanco', 'TVH-001'),
      ('VEH-003', 'JYO 631', 'MAR-022', NULL, 19, 'CLI-04', 'EST-01', '2026', 'blanco', 'TV-02'),
      ('VEH-004', 'WDY 031', 'MAR-022', NULL, 22, 'CLI-01', 'EST-01', '2026', 'gris', 'TV-02'),
      ('VEH-005', 'NNN 500', 'MAR-022', NULL, 19, 'CLI-01', 'EST-01', '2026', 'gris', 'TV-02')
      ON CONFLICT (id) DO UPDATE SET plate = EXCLUDED.plate;
    `);

    await client.query(`
      INSERT INTO drivers (id, name, document_type, document_number, phone, client_id, status_id, license_category) VALUES
      ('DRV-001', 'WILLIAM GIL', 'DOC-01', '71578229', '2343234', 'CLI-02', 'EST-01', 'C1'),
      ('DRV-002', 'JAMES SALGADO', 'DOC-01', '94252356', '53324', 'CLI-02', 'EST-01', 'C2'),
      ('DRV-003', 'JAIRO ALVAREZ', 'DOC-01', '1128450159', '323333333', 'CLI-04', 'EST-01', 'C2')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    await client.query(`
      INSERT INTO estados (id, name, status_id) VALUES
      ('EST-01', 'ACTIVO',          'EST-01'),
      ('EST-02', 'INACTIVO',        'EST-01'),
      ('EST-08', 'INVENTARIADO',    'EST-01'),
      ('EST-09', 'ALISTADO',        'EST-01'),
      ('EST-10', 'ASIGNADO',        'EST-01'),
      ('EST-11', 'EN RUTA',         'EST-01'),
      ('EST-12', 'ENTREGADO',       'EST-01'),
      ('EST-13', 'DEVUELTO',        'EST-01'),
      ('EST-14', 'ENTREGA PARCIAL', 'EST-01'),
      ('EST-15', 'REPIQUE',         'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    await client.query(`
      INSERT INTO roles (id, name, status_id) VALUES
      ('ROL-01', 'Super Admin', 'EST-01'), ('ROL-02', 'ADMIN', 'EST-01'), ('ROL-03', 'CONDUCTORES', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // ── LIMPIAR Y RECONSTRUIR MÓDULOS (Pizarra Limpia = Réplica Exacta) ──────
    await client.query(`
      DELETE FROM pages WHERE id NOT IN (
        'PAG-01','PAG-03','PAG-04','PAG-05','PAG-06','PAG-07','PAG-08','PAG-09','PAG-10','PAG-11',
        'PAG-12','PAG-13','PAG-14','PAG-15','PAG-16','PAG-17',
        'PAG-18','PAG-19','PAG-20','PAG-21','PAG-22','PAG-23','PAG-24',
        'PAG-25','PAG-26','PAG-27','PAG-28','PAG-29','PAG-30','PAG-SQL', 'PAG-31', 'PAG-32', 'PAG-33', 'PAG-34', 'PAG-35', 'PAG-36'
      )
    `);
    await client.query(`
      DELETE FROM modules WHERE id NOT IN ('MOD-01','MOD-02','MOD-03','MOD-04','MOD-05','MOD-06', 'MOD-07', 'MOD-08')
    `);

    await client.query(`
      INSERT INTO modules (id, name, icon_class, status_id) VALUES
      ('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings', 'EST-01'),
      ('MOD-02', 'GESTIÓN TRANSPORTE', 'Truck', 'EST-01'),
      ('MOD-03', 'GESTIÓN AJOVER', 'Package', 'EST-01'),
      ('MOD-04', 'SEGURIDAD & ACCESO', 'Shield', 'EST-01'),
      ('MOD-05', 'M7 INTELLIGENCE', 'Sparkles', 'EST-01'),
      ('MOD-06', 'ADMINISTRACIÓN', 'Database', 'EST-01'),
      ('MOD-07', 'GESTIÓN GRUPO INTER', 'Truck', 'EST-01'),
      ('MOD-08', 'CENTRO DE FORMACIÓN', 'Award', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon_class = EXCLUDED.icon_class, status_id = EXCLUDED.status_id;
    `);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id) VALUES 
      -- Maestros (MOD-01)
      ('PAG-01', 'ARTICULOS', 'inventory/items', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-03', 'CLIENTES', 'masterClientes', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-04', 'ESTADOS GLOBALES', 'masterEstados', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-05', 'FIRMAS DIGITALES', 'firmas', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-06', 'MARCAS', 'masterMarcas', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-07', 'NOTIFICACIONES', 'masterNotificaciones', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-08', 'TIPOS DE DOCUMENTO', 'masterTipoDocumento', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-09', 'TIPOS DE VEHÍCULO', 'masterTiposVehiculo', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-10', 'UNIDADES DE MEDIDA', 'masterUnidadMedida', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-11', 'APROBAR FIRMA', 'aprobar-firma', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-28', 'CATEGORÍAS', 'masterCategorias', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-29', 'TIPOS DE NOTIFICACIÓN', 'masterTipoNotificacion', 'MOD-01', 'MOD-01', 'EST-01'),
      
      -- Logística (MOD-02 / MOD-03 RESTRUCTURE)
      ('PAG-12', 'ASIGNACIÓN FLOTA', 'vinculo', 'MOD-02', 'MOD-02', 'EST-01'),
      ('PAG-13', 'DESPACHO LOGÍSTICO', 'despacho', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-14', 'GESTIÓN DE FLOTAS', 'flotas', 'MOD-02', 'MOD-02', 'EST-01'),
      ('PAG-15', 'PLANIFICADOR DE RUTAS', 'rutas', 'MOD-03', 'MOD-03', 'EST-01'),

      -- Inventarios (MOD-03)
      ('PAG-16', 'GESTIÓN DE DOCUMENTOS', 'documentos', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-17', 'RECIBIDO DE MATERIAL', 'recibido', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-30', 'RECIBIDO MANUAL', 'recibido-manual', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-34', 'INFORME MASTERSUITE', 'informe-mastersuite', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-35', 'DASHBOARD AJOVER', 'dashboard-ajover', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-36', 'CONCILIACIÓN FACTURAS', 'conciliacion', 'MOD-03', 'MOD-03', 'EST-01'),

      -- Seguridad (MOD-04)
      ('PAG-18', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-19', 'MÓDULOS SISTEMA', 'modules', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-20', 'PÁGINAS WEB', 'pages', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-21', 'USUARIOS', 'users', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-22', 'ROLES', 'roles', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-23', 'PERMISOS POR ROL', 'masterPermisosRol', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-24', 'PERMISOS POR USUARIO', 'masterPermisosUsuario', 'MOD-04', 'MOD-04', 'EST-01'),

      -- Inteligencia (MOD-05)
      ('PAG-25', 'DASHBOARD EJECUTIVO', 'executive-dashboard', 'MOD-05', 'MOD-05', 'EST-01'),
      ('PAG-26', 'GAMIFICACIÓN (IA)', 'gamification', 'MOD-05', 'MOD-05', 'EST-01'),
      ('PAG-27', 'M7 CHATBOT', 'chatbot', 'MOD-05', 'MOD-05', 'EST-01'),

      -- Administración (MOD-06)
      ('PAG-SQL', 'Gestor DB', 'admin-db', 'MOD-06', 'MOD-06', 'EST-01'),

      -- Grupo Inter (MOD-07)
      ('PAG-31', 'GESTIÓN OPERATIVA', 'grupo-inter-ops', 'MOD-07', 'MOD-07', 'EST-01'),

      -- Centro de Formación (MOD-08)
      ('PAG-32', 'GESTIÓN ASISTENCIAS', 'training-ops', 'MOD-08', 'MOD-08', 'EST-01'),
      ('PAG-33', 'CURSOS Y TALLERES', 'capacitaciones', 'MOD-08', 'MOD-08', 'EST-01')

      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        route = EXCLUDED.route, 
        module_id = EXCLUDED.module_id, 
        parent_id = EXCLUDED.parent_id,
        status_id = EXCLUDED.status_id;
    `);


    const adminHash = await bcrypt.hash('admin123', 10);
    // Limpiar usuarios duplicados del servidor (réplica exacta local)
    // [M7-FIX] Borrar permisos primero para respetar FK user_permissions_user_id_fkey
    await client.query(`DELETE FROM user_permissions WHERE user_id IN ('USR-DEMO', 'USR-02', 'USR-03')`);
    await client.query(`DELETE FROM users WHERE id IN ('USR-DEMO', 'USR-02', 'USR-03') OR (email = 'oscar@millasiete.com' AND id != 'USR-01')`);

    await client.query(`
      INSERT INTO users (id, email, password, name, role_id, status_id, permissions)
      VALUES 
      ('USR-01', 'admin@millasiete.com', $1, 'OSCAR SANTAMARIA', 'ROL-01', 'EST-01', '[{"module": "all", "actions": ["view", "edit", "delete", "create"]}]'::jsonb)
      ON CONFLICT (id) DO UPDATE SET 
        password = $1, 
        permissions = EXCLUDED.permissions,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role_id = EXCLUDED.role_id;
    `, [adminHash]);

    await client.query('COMMIT');

    // FASE FINAL: SINCRONIZACIÓN NUCLEAR DE MENÚS (REUBICACIÓN LOGÍSTICA)
    console.log('[M7-SYNC] Forzando reubicación de módulos logísticos a Gestión Ajover...');
    await client.query(`
      UPDATE pages 
      SET module_id = 'MOD-03', parent_id = 'MOD-03' 
      WHERE id IN ('PAG-13', 'PAG-15');
    `);
    console.log(`[M7-SYNC] Módulos Logísticos Sincronizados con Éxito - ${new Date().toLocaleString()}`);

    const total = Date.now() - start;
    return { success: true, message: `Operación de Sincronización Nuclear Exitosa en ${total}ms. [TS: ${new Date().toISOString()}]` };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
