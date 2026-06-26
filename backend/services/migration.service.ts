
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  'documents_l': ['external_doc_id', 'client_id', 'vehicle_plate', 'remesatdm', 'delivery_date', 'city', 'status', 'inventory_date', 'inventory_start', 'inventory_user', 'created_at', 'inventory_observation', 'plan_type', 'inventory_notes', 'tracking_token', 'picking_date', 'receiving_date', 'picker_user', 'deliverer_user', 'receiver_user', 'created_by', 'updated_by', 'updated_at'],
  'document_items': ['document_id', 'article_id', 'expected_qty', 'count_1', 'count_2', 'order_number', 'unit', 'notes', 'item_status', 'un_code', 'client_ref', 'peso', 'invoice', 'volume', 'city', 'address', 'batch', 'observation', 'received_qty', 'unit_volume', 'neighborhood', 'customer_name', 'latitude', 'longitude'],
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
  'routes': ['name', 'description', 'vehicle_id', 'driver_id', 'client_id', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at', 'total_volume_m3', 'vehicle_capacity_m3', 'utilization_pct', 'shift'],
  'picking_assignments': ['invoice_id', 'leader_id', 'helper_ids', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at'],
  'picking_signatures': ['picking_id', 'user_id', 'signed', 'signed_at'],
  'route_invoices': ['route_id', 'invoice_id', 'created_at', 'assigned_at'],
  'route_modifications_log': ['route_id', 'invoice_id', 'action', 'user_id', 'previous_plate', 'new_plate', 'details', 'timestamp'],
  'dispatch_assignments': ['invoice_id', 'driver_id', 'helper_ids', 'scanned_items', 'is_accompanied', 'helper_count', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at', 'created_at'],
  'dispatch_signatures_pending': ['dispatch_id', 'user_id', 'role_type', 'signed', 'signed_at'],
  'delivery_confirmations': ['dispatch_id', 'invoice_id', 'driver_id', 'vehicle_id', 'delivery_type', 'delivered_items', 'notes', 'delivered_at', 'created_at'],
  'delivery_returns': ['confirmation_id', 'invoice_id', 'driver_id', 'vehicle_id', 'return_reason', 'notes', 'status', 'created_at'],
  'delivery_return_items': ['return_id', 'sku', 'article_name', 'quantity_returned', 'quantity_delivered', 'unit', 'notes'],
  'routing_patterns': ['city', 'vehicle_id', 'neighborhood', 'strength', 'last_used'],
  'delivery_patterns': ['address_key', 'vehicle_id', 'client_id', 'strength', 'last_used'],
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
  'invoice_conciliation_reversal_logs': ['document_id', 'invoice_number', 'banco', 'valor', 'comprobante', 'fecha_pago', 'forma_pago', 'numero_cheque', 'es_devolucion', 'conciliado_por', 'vehicle_plate', 'conductor_id', 'conductor_name', 'original_created_at', 'original_updated_at', 'reversed_by', 'reversed_at', 'observations'],
  'invoice_status_history': ['document_id', 'invoice_number', 'evento', 'estado_anterior', 'estado_nuevo', 'valor_factura', 'valor_entregado', 'valor_devuelto', 'banco', 'comprobante', 'usuario_id', 'usuario_nombre', 'created_at'],
  'conciliacion_lb_archivos': ['nombre_archivo', 'mes_anio', 'total_registros', 'coincidencias', 'discrepancias', 'novedades', 'total_milla7', 'diferencia_neta', 'usuario_creacion', 'fecha_creacion'],
  'conciliacion_lb_detalles': ['archivo_id', 'fecha', 'placa', 'systram', 'viaje_pedido', 'destino', 'articulo', 'precio_archivo_base', 'precio_70_base', 'precio_conciliacion', 'diferencia', 'valor_adicional', 'total_milla7', 'estado', 'tipo_validacion', 'notas_validacion', 'notas2'],

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

  // ─── LOTES DE APROBACIÓN DE DEVOLUCIONES ─────────────────────────────────
  'return_approval_batches': [
    'batch_code',        // código legible: DEV-YYYY-MM-DD-NNN
    'client_id',         // cliente al que pertenece
    'notes',             // observaciones del lote
    'status',            // borrador | enviado | aprobado | procesado
    'created_by',        // usuario que creó el lote
    'created_at',        // fecha creación
    'sent_at'            // fecha de envío/correo
  ],
  'return_approval_batch_items': [
    'batch_id',          // FK return_approval_batches
    'return_id',         // FK delivery_returns (la devolución agrupada)
    'invoice_id',        // factura (desnormalizado para búsqueda rápida)
    'return_type',       // COMPLETA | PARCIAL
    'return_reason',     // motivo de devolución
    'approved',          // true = aprobada por proveedor
    'approval_notes'     // notas de aprobación
  ],

  // ─── CABECERA DE CONCILIACIÓN ─────────────────────────────────────────────
  // Una conciliación por conductor/vehículo/fecha. Agrupa todas las facturas del día.
  // Valida: lo entregado vs lo recaudado vs lo devuelto vs lo en repice.
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
    'total_repice',         // facturas en repice
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

  // ─── GESTIÓN HUMANA: MISCELÁNEOS ─────────────────────────────────────────
  'gh_horarios_laborales': ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_eps':                ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_afp':                ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_tipos_vivienda':     ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_tipos_contrato':     ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_ingresos_mensuales': ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_cargos':             ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_tipos_sangre':       ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_estados_civiles':    ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'gh_niveles_educativos': ['nombre', 'estado', 'usuario_control', 'fecha_control'],

  // ─── CONFIGURACIÓN: CIUDADES ──────────────────────────────────────────────
  'cfg_departamentos': ['nombre', 'estado', 'usuario_control', 'fecha_control'],
  'cfg_ciudades':      ['nombre', 'id_departamento', 'estado', 'usuario_control', 'fecha_control'],

  // ─── TRANSACCIONES DE CONCILIACIÓN ────────────────────────────────────────
  // Detalle por factura dentro de una conciliación: qué pasó con cada una.
  'conciliation_transactions': [
    'conciliation_id',      // FK conciliation_headers
    'document_id',          // documento L
    'invoice',              // factura/remisión
    'article_id',           // artículo (si aplica desglose por ítem)
    'customer_name',        // destinatario
    'city',                 // ciudad
    'transaction_type',     // entrega | devolucion | repice | parcial | pago
    'delivery_qty',         // cantidad entregada
    'returned_qty',         // cantidad devuelta
    'repice_qty',          // cantidad en repice
    'invoice_value',        // valor de la factura ($)
    'collected_value',      // valor recaudado ($)
    'payment_method',       // forma de pago
    'payment_ref',          // referencia de pago
    'banco',                // banco (si transferencia/cheque)
    'comprobante',          // número de comprobante
    'return_reason',        // motivo de devolución
    'notes',                // observaciones
    'created_at'
  ],
  'gh_visitas': [
    'fecha_entrada', 'nombre', 'cedula', 'area_dependencia', 'cuenta_arl', 'cuenta_eps',
    'contacto_emergencia', 'acuerdo_requisitos', 'contiene_equipos', 'marca_dispositivo',
    'numero_serie', 'hora_salida', 'registrado_por_id', 'registrado_por_nombre',
    'fecha_registro', 'status_id'
  ],
  'management_orders': [
    'oc_number', 'oc_status', 'oc_date', 'remesa_number', 'remission', 
    'remission_status', 'remission_date', 'manifest_number', 'client_order', 
    'manifest_observations', 'manifest_status', 'manifest_date', 'plate', 
    'client_name', 'total_value_cxc_final', 'total_value_cxp_final', 
    'invoice_cxc', 'receipt', 'invoice_date', 'total_cxc', 'egress', 
    'cxp_date', 'total_cxp', 'created_by', 'created_at', 'updated_at', 'client_document',
    'origin', 'destination'
  ]
};

const healSchema = async (client: any) => {
  console.log('[M7-DB] Iniciando Curación Nuclear de Esquema (REPLICA EXACTA)...');
  
  // Alter tables for management_orders
  try {
    await client.query(`ALTER TABLE management_orders ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
    await client.query(`ALTER TABLE management_orders ADD COLUMN IF NOT EXISTS fecha_recibo TIMESTAMP WITH TIME ZONE`);
    await client.query(`ALTER TABLE management_orders ADD COLUMN IF NOT EXISTS fecha_egreso TIMESTAMP WITH TIME ZONE`);
  } catch (err) {
    console.error('[M7-DB] Error al alterar management_orders:', err);
  }

  // Flota TDM: tabla de manifiestos cargados por Excel (clave primaria de negocio: manifiesto)
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS flota_tdm_manifiestos (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(50) NOT NULL,
        manifiesto VARCHAR(150) NOT NULL,
        fecha_operacion DATE NOT NULL,
        remesa VARCHAR(200),
        valor_cobrar NUMERIC(15,2) DEFAULT 0,
        valor_pagar NUMERIC(15,2) DEFAULT 0,
        ciudad_origen VARCHAR(100) DEFAULT 'SIN CIUDAD',
        ciudad_destino VARCHAR(100) DEFAULT 'SIN CIUDAD',
        uploaded_by VARCHAR(100),
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_flota_tdm_manifiesto UNIQUE (manifiesto)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_flota_tdm_fecha ON flota_tdm_manifiestos (fecha_operacion)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_flota_tdm_client ON flota_tdm_manifiestos (client_id)`);
  } catch (err) {
    console.error('[M7-DB] Error al crear flota_tdm_manifiestos:', err);
  }

  // GH: Inventario Físico — sesiones de toma de inventario y conciliación
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_inventarios_fisicos (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        fecha_apertura TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        fecha_cierre TIMESTAMP WITH TIME ZONE,
        created_by VARCHAR(100) NOT NULL,
        assigned_to VARCHAR(100) NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'ABIERTO'
          CHECK (estado IN ('ABIERTO','EN_CONTEO','PENDIENTE_AUTORIZACION','CERRADO','ANULADO')),
        observaciones TEXT,
        total_items INTEGER DEFAULT 0,
        items_con_diferencia INTEGER DEFAULT 0,
        usuario_control VARCHAR(100),
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_inventarios_fisicos_items (
        id SERIAL PRIMARY KEY,
        inventario_id INTEGER NOT NULL REFERENCES gh_inventarios_fisicos(id) ON DELETE CASCADE,
        elemento_id INTEGER NOT NULL REFERENCES gh_elementos(id) ON DELETE RESTRICT,
        elemento_nombre VARCHAR(255) NOT NULL,
        cantidad_sistema INTEGER NOT NULL DEFAULT 0,
        cantidad_fisica INTEGER,
        diferencia INTEGER GENERATED ALWAYS AS (COALESCE(cantidad_fisica, cantidad_sistema) - cantidad_sistema) STORED,
        tipo_diferencia VARCHAR(20) GENERATED ALWAYS AS (
          CASE
            WHEN cantidad_fisica IS NULL THEN 'PENDIENTE'
            WHEN cantidad_fisica = cantidad_sistema THEN 'OK'
            WHEN cantidad_fisica > cantidad_sistema THEN 'SOBRANTE'
            ELSE 'FALTANTE'
          END
        ) STORED,
        justificacion TEXT,
        estado_justificacion VARCHAR(30) DEFAULT 'PENDIENTE'
          CHECK (estado_justificacion IN ('PENDIENTE','JUSTIFICADO')),
        contado_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(inventario_id, elemento_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_inventarios_fisicos_auth (
        id SERIAL PRIMARY KEY,
        inventario_id INTEGER NOT NULL REFERENCES gh_inventarios_fisicos(id) ON DELETE CASCADE,
        codigo VARCHAR(20) NOT NULL,
        generado_por VARCHAR(100) NOT NULL,
        generado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expira_at TIMESTAMP WITH TIME ZONE NOT NULL,
        usado_at TIMESTAMP WITH TIME ZONE,
        usado_por VARCHAR(100),
        estado VARCHAR(20) DEFAULT 'VIGENTE'
          CHECK (estado IN ('VIGENTE','USADO','EXPIRADO'))
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_inv_fisico_estado ON gh_inventarios_fisicos (estado)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_inv_fisico_items_inv ON gh_inventarios_fisicos_items (inventario_id)`);
    await client.query(`ALTER TABLE gh_inventarios_fisicos_items ADD COLUMN IF NOT EXISTS cantidad_final INTEGER`);
    console.log('[M7-DB] Tablas gh_inventarios_fisicos creadas correctamente.');
  } catch (err) {
    console.error('[M7-DB] Error al crear tablas gh_inventarios_fisicos:', err);
  }

  // M7: Crear tabla prov_cliente de forma explícita si no existe
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS prov_cliente (
        documento TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        contacto TEXT,
        email TEXT,
        representante TEXT,
        estado TEXT DEFAULT 'EST-01',
        usuario_creacion TEXT,
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`ALTER TABLE prov_cliente ADD COLUMN IF NOT EXISTS client_mappings JSONB DEFAULT '[]'`);
  } catch (err) {
    console.error('[M7-DB] Error al crear la tabla prov_cliente:', err);
  }

  const serialTables = ['assignments', 'dispatch_assignments', 'picking_assignments', 'routes', 'route_modifications_log', 'delivery_confirmations', 'delivery_returns', 'delivery_return_items', 'vehicle_locations', 'deletion_logs', 'user_training_progress', 'digital_signatures', 'document_consolidated_items', 'document_items', 'inventario_clientes', 'grupo_inter_pedidos', 'document_l_payments', 'grupo_inter_novedades', 'grupo_inter_reajustes', 'training_attendance', 'payment_vouchers', 'invoice_conciliations', 'invoice_conciliation_reversal_logs', 'vehicle_inventory', 'route_assignment_items', 'supplier_returns', 'supplier_return_items', 'conciliation_headers', 'conciliation_transactions', 'routing_patterns', 'gh_horarios_laborales', 'gh_eps', 'gh_afp', 'gh_tipos_vivienda', 'gh_tipos_contrato', 'gh_ingresos_mensuales', 'gh_cargos', 'gh_tipos_sangre', 'gh_estados_civiles', 'gh_niveles_educativos', 'cfg_departamentos', 'cfg_ciudades', 'gh_visitas', 'management_orders', 'return_approval_batches', 'return_approval_batch_items', 'conciliacion_lb_archivos', 'conciliacion_lb_detalles'];
  const nuclearTables = Object.keys(UNIVERSAL_SCHEMA);
  for (const table of nuclearTables) {
    try {
        const checkCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`);
        const currentCols = checkCols.rows.map((r: any) => r.column_name);
        if (currentCols.length > 0) {
            const expectedCols = ['id', ...UNIVERSAL_SCHEMA[table]];
         // M7-SAFETY: Bloque de borrado automático ELIMINADO permanentemente.
         // Solo permitimos expansión de esquema, nunca destrucción.
        }
    } catch (e) {}
  }

  // FASE 2: CURACIÓN ATÓMICA POR TABLA (BATCHING)
  for (const [table, columns] of Object.entries(UNIVERSAL_SCHEMA)) {
    try {
      const idType = serialTables.includes(table) ? 'SERIAL' : 'TEXT DEFAULT (gen_random_uuid())::text';
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
          if (col.includes('_at') || col.includes('_date') || col.endsWith('_expiry') || col === 'fechaparobacion' || col === 'fecha_creacion' || col === 'fecha_actualizacion' || col === 'timestamp' || col === 'last_used' || col === 'updated_at' || col === 'created_at' || col === 'f_ultimo_corte' || col === 'fecha_carge' || col === 'fecha_entregado' || col === 'create_at' || col === 'update_at' || col === 'fecha_control') {
            type = 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP';
          } else if (col === 'shift') {
            type = 'INTEGER DEFAULT 1';
          } else if (col.includes('qty') || col.includes('count_') || col.includes('capacity') || col.includes('factor') || col.includes('total_') || col.includes('value_') || col === 'peso' || col === 'volume' || col === 'strength' || col === 'latitude' || col === 'longitude' || col === 'latitud' || col === 'longitud' || col === 'lat' || col === 'lng' || col === 'accuracy' || col === 'speed' || col === 'heading' || col === 'level' || col === 'order' || col === 'cantidad' || col === 'valor_flete' || col === 'valor_declarado' || col === 'cantidad_total' || col === 'precio_total' || col === 'peso_total_prod' || col === 'quantity' || col === 'assigned_qty' || col === 'total_items' || col === 'total_qty' || col === 'total_invoices' || col === 'total_delivered' || col === 'total_partial' || col === 'total_returned' || col === 'total_repice' || col === 'total_collected' || col === 'total_pending_collect' || col === 'total_to_return' || col === 'delivery_qty' || col === 'returned_qty' || col === 'repice_qty' || col === 'invoice_value' || col === 'collected_value' || col === 'total_volume_m3' || col === 'vehicle_capacity_m3' || col === 'utilization_pct' || col === 'id_departamento') {
            type = 'NUMERIC DEFAULT 0';
          } else if (col === 'client_ids') {
             type = 'TEXT[]';
          } else if (col === 'permissions' || col === 'record_data') {
             type = 'JSONB';
          } else if (col.includes('enabled') || col.includes('is_active') || col.includes('policy_accepted') || col.includes('approved') || col === 'aceptapolitica' || col === 'aprobada' || col === 'signed' || col === 'es_devolucion') {
             type = 'BOOLEAN DEFAULT FALSE';
          }
          
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

  for (const sql of [
    `CREATE UNIQUE INDEX IF NOT EXISTS geocoding_cache_address_key_idx ON geocoding_cache (address_key)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_conciliations_doc_inv ON invoice_conciliations (document_id, invoice_number)`,
  ]) {
    try { await client.query(sql); } catch (e) {}
  }

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
    // document_items: item_status para filtro planificador (solo pendiente/repice)
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

    // --- INDICES ADICIONALES DE RENDIMIENTO ---
    // documents_l: filtro combinado cliente+estado (pantalla principal de despacho)
    `CREATE INDEX IF NOT EXISTS idx_documents_l_client_status ON documents_l (client_id, status)`,
    // documents_l: búsqueda por external_doc_id (upload de Plan R y planificador)
    `CREATE INDEX IF NOT EXISTS idx_documents_l_ext_doc_id ON documents_l (external_doc_id)`,
    // document_items: filtro por item_status + document_id (query masivo del planificador)
    `CREATE INDEX IF NOT EXISTS idx_document_items_status_doc ON document_items (item_status, document_id)`,
    // document_items: búsqueda por ciudad + item_status (agrupación geográfica)
    `CREATE INDEX IF NOT EXISTS idx_document_items_city_status ON document_items (city, item_status)`,
    // notificaciones: lookup por tipo + estado (syncInventory, blindCount)
    `CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo_status ON notificaciones (tipo_notificacion_id, status_id)`,
    // master_records: lookup frecuente categoría + estado
    `CREATE INDEX IF NOT EXISTS idx_master_records_cat_status ON master_records (category, status_id)`,
    // routing_patterns: lookup por vehículo + ciudad (aprendizaje de territorio)
    `CREATE INDEX IF NOT EXISTS idx_routing_patterns_vehicle_city ON routing_patterns (vehicle_id, city)`,
    // delivery_patterns: lookup por dirección + cliente
    `CREATE INDEX IF NOT EXISTS idx_delivery_patterns_client ON delivery_patterns (client_id, address_key)`,
    // delivery_confirmations: historial de entregas por conductor
    `CREATE INDEX IF NOT EXISTS idx_delivery_conf_driver ON delivery_confirmations (driver_id, delivered_at DESC)`,
    // route_invoices: join ruta ↔ factura (muy frecuente en conciliación)
    `CREATE INDEX IF NOT EXISTS idx_route_invoices_route ON route_invoices (route_id)`,
    `CREATE INDEX IF NOT EXISTS idx_route_invoices_invoice ON route_invoices (invoice_id)`,
    // users: búsqueda por email (login, cada request autenticado)
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`,
    // assignments: filtro is_active (usado en CADA asignación activa)
    `CREATE INDEX IF NOT EXISTS idx_assignments_active ON assignments (client_id, is_active)`,

    // ── Índices para CTEs de conciliación (eliminan subqueries correlacionadas) ──
    // invoice_conciliations: GROUP BY document_id en CTE ic_agg
    `CREATE INDEX IF NOT EXISTS idx_invoice_concil_doc_id ON invoice_conciliations (document_id)`,
    // document_l_payments: GROUP BY document_id en CTE pay_agg
    `CREATE INDEX IF NOT EXISTS idx_doc_l_payments_doc_id ON document_l_payments (document_id)`,
    // route_surcharges: GROUP BY document_id + filtro status en CTE rs_agg
    `CREATE INDEX IF NOT EXISTS idx_route_surcharges_doc_status ON route_surcharges (document_id, status_id)`,
    // route_group_payments: GROUP BY document_id en CTE rgp_agg
    `CREATE INDEX IF NOT EXISTS idx_route_group_payments_doc ON route_group_payments (document_id)`,
    // dispatch_assignments: DISTINCT ON invoice_id para conductor en CTE cond_agg
    `CREATE INDEX IF NOT EXISTS idx_dispatch_asgn_invoice_id ON dispatch_assignments (invoice_id, id DESC)`,
    // documents_l: filtro plan_type (ILIKE '%plan r%' se beneficia con índice parcial)
    `CREATE INDEX IF NOT EXISTS idx_documents_l_plan_type ON documents_l (plan_type)`,
    // routes: filtro created_at + status_id en getRoutes
    `CREATE INDEX IF NOT EXISTS idx_routes_created_at_status ON routes (created_at DESC, status_id)`,
    // route_invoices: compound para CTE stats de getRoutes
    `CREATE INDEX IF NOT EXISTS idx_route_invoices_route_inv ON route_invoices (route_id, invoice_id)`,
  ];
  // healSchema corre en autocommit (antes del BEGIN en restoreSystem).
  // En autocommit cada statement es su propio txn: un IF NOT EXISTS fallido no
  // envenena la conexión, así que plain try/catch es suficiente.
  for (const idxSql of performanceIndexes) {
    try { await client.query(idxSql); } catch (e) {}
  }
  // ─── Tablas auxiliares de conciliación (antes vivían en el request handler) ──
  for (const ddl of [
    `CREATE TABLE IF NOT EXISTS route_surcharges (
        id SERIAL PRIMARY KEY, document_id TEXT NOT NULL, plate TEXT NOT NULL,
        valor NUMERIC(15,2) NOT NULL, referencia TEXT, fecha DATE,
        status_id TEXT DEFAULT 'PENDIENTE', user_id TEXT, observaciones TEXT,
        facturas TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS route_group_payments (
        id SERIAL PRIMARY KEY, document_id TEXT NOT NULL, plate TEXT NOT NULL,
        valor NUMERIC(15,2) NOT NULL, referencia TEXT, fecha DATE,
        metodo_pago TEXT, observacion TEXT, user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS document_payment_history (
        id SERIAL PRIMARY KEY, document_id TEXT, invoice TEXT,
        old_method TEXT, new_method TEXT, user_id TEXT, user_name TEXT,
        observations TEXT,
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS gh_tipos_elementos (
        id SERIAL PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, 
        estado_id TEXT DEFAULT 'EST-01', 
        usuario_control TEXT, 
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS gh_elementos (
        id SERIAL PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, 
        tipo_id INTEGER REFERENCES gh_tipos_elementos(id) ON DELETE CASCADE, 
        estado_id TEXT DEFAULT 'EST-01', 
        usuario_control TEXT, 
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`
  ]) { try { await client.query(ddl); } catch (e) {} }

  // New Inventario, Ordenes, Entradas, Salidas tables and columns
  try {
    await client.query(`ALTER TABLE gh_elementos ADD COLUMN IF NOT EXISTS es_serializado BOOLEAN DEFAULT FALSE;`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS gh_inventario_elemento (
        id SERIAL PRIMARY KEY,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE UNIQUE,
        stock INTEGER NOT NULL DEFAULT 0,
        fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gh_ordenes_compra (
        id SERIAL PRIMARY KEY,
        numero_orden VARCHAR(50) NOT NULL UNIQUE,
        proveedor VARCHAR(255) NOT NULL,
        fecha DATE NOT NULL,
        estado VARCHAR(50) DEFAULT 'PENDIENTE',
        usuario_control TEXT,
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gh_ordenes_compra_detalle (
        id SERIAL PRIMARY KEY,
        orden_id INTEGER REFERENCES gh_ordenes_compra(id) ON DELETE CASCADE,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL,
        valor_unitario NUMERIC(15,2) NOT NULL
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gh_entradas_bodega (
        id SERIAL PRIMARY KEY,
        numero_factura VARCHAR(50) NOT NULL,
        orden_id INTEGER REFERENCES gh_ordenes_compra(id) ON DELETE SET NULL,
        fecha DATE NOT NULL,
        observaciones TEXT,
        usuario_control TEXT,
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gh_entradas_bodega_detalle (
        id SERIAL PRIMARY KEY,
        entrada_id INTEGER REFERENCES gh_entradas_bodega(id) ON DELETE CASCADE,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL,
        valor_unitario NUMERIC(15,2) NOT NULL
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gh_inventario_serial_elemento (
        id SERIAL PRIMARY KEY,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        serial VARCHAR(100) NOT NULL UNIQUE,
        estado_serial VARCHAR(50) DEFAULT 'DISPONIBLE',
        entrada_id INTEGER REFERENCES gh_entradas_bodega(id) ON DELETE SET NULL,
        fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gh_salidas_proveedor (
        id SERIAL PRIMARY KEY,
        numero_salida VARCHAR(50) NOT NULL UNIQUE,
        proveedor VARCHAR(255) NOT NULL,
        fecha DATE NOT NULL,
        observaciones TEXT,
        usuario_control TEXT,
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gh_salidas_proveedor_detalle (
        id SERIAL PRIMARY KEY,
        salida_id INTEGER REFERENCES gh_salidas_proveedor(id) ON DELETE CASCADE,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL,
        valor_unitario NUMERIC(15,2) NOT NULL
    );`);
  } catch (err) {
    console.error('Error creating new GH inventory tables:', err);
  }

  // Add quien_recibio_id and proveedor columns to gh_entradas_bodega if not exists
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        ALTER TABLE gh_entradas_bodega 
        ADD COLUMN IF NOT EXISTS quien_recibio_id INTEGER REFERENCES gh_personal(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS proveedor VARCHAR(255);
      `);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error migrating gh_entradas_bodega columns:', e);
  }

  // Migrations for Asignaciones & Devoluciones Personal
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        ALTER TABLE gh_inventario_serial_elemento 
        ADD COLUMN IF NOT EXISTS personal_id INTEGER REFERENCES gh_personal(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMP WITH TIME ZONE;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS gh_inventario_personal (
            id SERIAL PRIMARY KEY,
            personal_id INTEGER NOT NULL REFERENCES gh_personal(id) ON DELETE CASCADE,
            elemento_id INTEGER NOT NULL REFERENCES gh_elementos(id) ON DELETE CASCADE,
            stock INTEGER NOT NULL DEFAULT 0,
            fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (personal_id, elemento_id)
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS gh_asignaciones_personal (
            id SERIAL PRIMARY KEY,
            numero_asignacion VARCHAR(50) NOT NULL UNIQUE,
            personal_id INTEGER NOT NULL REFERENCES gh_personal(id) ON DELETE CASCADE,
            autorizado_por VARCHAR(255) NOT NULL,
            fecha DATE NOT NULL,
            observaciones TEXT,
            usuario_control TEXT,
            fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS gh_asignaciones_personal_detalle (
            id SERIAL PRIMARY KEY,
            asignacion_id INTEGER REFERENCES gh_asignaciones_personal(id) ON DELETE CASCADE,
            elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
            cantidad INTEGER NOT NULL
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS gh_devoluciones_personal (
            id SERIAL PRIMARY KEY,
            numero_devolucion VARCHAR(50) NOT NULL UNIQUE,
            personal_id INTEGER NOT NULL REFERENCES gh_personal(id) ON DELETE CASCADE,
            motivo TEXT NOT NULL,
            fecha DATE NOT NULL,
            usuario_control TEXT,
            fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS gh_devoluciones_personal_detalle (
            id SERIAL PRIMARY KEY,
            devolucion_id INTEGER REFERENCES gh_devoluciones_personal(id) ON DELETE CASCADE,
            elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
            cantidad INTEGER NOT NULL
        );
      `);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error running assignments and returns migrations:', e);
  }

  // AdminCenter (Logística & Transportes: Formatos)
  try {
    const client = await pool.connect();
    try {
      // Limpieza de tablas de Inventario Ajover (eliminado a petición del usuario)
      await client.query(`
        DROP TABLE IF EXISTS ia_inventario_detalle CASCADE;
        DROP TABLE IF EXISTS ia_inventario_encabezado CASCADE;
        DROP TABLE IF EXISTS ia_eles_detalle CASCADE;
        DROP TABLE IF EXISTS ia_eles_encabezado CASCADE;
        DROP TABLE IF EXISTS ia_destinatarios CASCADE;
        DROP TABLE IF EXISTS ia_smtp_config CASCADE;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS opt_formatos (
            id VARCHAR(255) PRIMARY KEY,
            nombre VARCHAR(255) NOT NULL,
            orden INTEGER DEFAULT 0
        );
      `);

      // Seed default formats if table is empty
      await client.query(`
        INSERT INTO opt_formatos (id, nombre, orden)
        VALUES 
          ('1aF-K05Jp-9u27D0P5N3v1r6wG4x8y9z0', 'F-OPT-007 Inspección Preoperacional de Vehículos', 1),
          ('1bF-K05Jp-9u27D0P5N3v1r6wG4x8y9z1', 'F-OPT-005 Pagaré y Carta de Instrucciones', 2),
          ('1cF-K05Jp-9u27D0P5N3v1r6wG4x8y9z2', 'F-OPT-008 Control de Fatiga y Descanso', 3)
        ON CONFLICT (id) DO NOTHING;
      `);
      
      console.log('[M7-DB-ADMINCENTER] Tabla y semillas de opt_formatos creadas.');
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error running AdminCenter migrations:', e);
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

  // FASE: LIMPIAR ASIGNACIONES ACTIVAS DUPLICADAS (vehículo/conductor con >1 is_active=true)
  // Conserva solo la más reciente como activa; el resto queda como historial (is_active=false)
  try {
    await client.query(`
      UPDATE assignments a
      SET is_active = false, updated_at = NOW()
      WHERE is_active = true
        AND id NOT IN (
          SELECT DISTINCT ON (vehicle_id) id
          FROM assignments
          WHERE is_active = true
          ORDER BY vehicle_id, created_at DESC
        )
    `);
  } catch (e) {}

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

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_gh_cargos_nombre 
      ON gh_cargos (nombre)
    `);

    console.log('[M7-DB-HEAL] Limpiando duplicados de Patrones IA para estabilidad ON CONFLICT...');
    
    // Limpiar routing_patterns
    await client.query(`
      DELETE FROM routing_patterns a USING (
        SELECT MIN(ctid) as keepid, city, vehicle_id, COALESCE(neighborhood, '') as neighborhood
        FROM routing_patterns
        GROUP BY city, vehicle_id, COALESCE(neighborhood, '') HAVING COUNT(*) > 1
      ) b
      WHERE a.city = b.city 
        AND a.vehicle_id = b.vehicle_id 
        AND COALESCE(a.neighborhood, '') = b.neighborhood
        AND a.ctid > b.keepid
    `);

    // Limpiar delivery_patterns
    await client.query(`
      DELETE FROM delivery_patterns a USING (
        SELECT MIN(ctid) as keepid, address_key, vehicle_id
        FROM delivery_patterns
        GROUP BY address_key, vehicle_id HAVING COUNT(*) > 1
      ) b
      WHERE a.address_key = b.address_key 
        AND a.vehicle_id = b.vehicle_id 
        AND a.ctid > b.keepid
    `);

    console.log('[M7-DB-IQ] Configurando restricciones de Aprendizaje Granular...');
    await client.query(`
      DROP INDEX IF EXISTS unq_routing_patterns_city_veh;
      CREATE UNIQUE INDEX IF NOT EXISTS unq_routing_patterns_granular
      ON routing_patterns (city, vehicle_id, neighborhood);
    `);

    // ── delivery_patterns: memoria de clientes recurrentes ────────────────────
    // Registra qué vehículo entregó en cada dirección (address_key = address|city en lower).
    // Strength sube con cada confirmación; se usa para pre-asignar facturas de ese
    // cliente al mismo vehículo antes del clustering geográfico.
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_patterns (
        id         BIGSERIAL PRIMARY KEY,
        address_key TEXT NOT NULL,
        vehicle_id  TEXT NOT NULL,
        client_id   TEXT,
        strength    INT NOT NULL DEFAULT 1,
        last_used   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS unq_delivery_patterns
        ON delivery_patterns (address_key, vehicle_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_patterns_addr
        ON delivery_patterns (address_key);
    `);

    // ── management_orders: índices y restricciones de unicidad ─────────────────
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unq_management_orders_oc ON management_orders (oc_number);
      CREATE INDEX IF NOT EXISTS idx_management_orders_plate ON management_orders (plate);
      CREATE INDEX IF NOT EXISTS idx_management_orders_client ON management_orders (client_name);
    `).catch(() => {});

    // ── FIX: delivery_patterns.id debe tener secuencia BIGSERIAL para INSERT sin id ──
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'delivery_patterns'
            AND column_name = 'id'
            AND column_default IS NULL
        ) THEN
          CREATE SEQUENCE IF NOT EXISTS delivery_patterns_id_seq;
          ALTER TABLE delivery_patterns ALTER COLUMN id TYPE BIGINT USING (
            CASE WHEN id::text ~ '^[0-9]+$' THEN id::text::BIGINT ELSE nextval('delivery_patterns_id_seq') END
          );
          ALTER TABLE delivery_patterns ALTER COLUMN id SET DEFAULT nextval('delivery_patterns_id_seq');
          PERFORM setval('delivery_patterns_id_seq', COALESCE((SELECT MAX(id) FROM delivery_patterns), 0) + 1);
        END IF;
      END$$;
    `);

    // ── FIX: routing_patterns.id debe ser SERIAL (no TEXT) para que el INSERT sin id funcione ──
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'routing_patterns'
            AND column_name = 'id'
            AND data_type = 'text'
        ) THEN
          CREATE SEQUENCE IF NOT EXISTS routing_patterns_id_seq;
          ALTER TABLE routing_patterns ALTER COLUMN id TYPE BIGINT USING (
            CASE WHEN id ~ '^[0-9]+$' THEN id::BIGINT ELSE nextval('routing_patterns_id_seq') END
          );
          ALTER TABLE routing_patterns ALTER COLUMN id SET DEFAULT nextval('routing_patterns_id_seq');
          PERFORM setval('routing_patterns_id_seq', COALESCE((SELECT MAX(id) FROM routing_patterns), 0) + 1);
        END IF;
      END$$;
    `);

    // ── MOD-10 / PAG-45: Gestión Documental Drive ────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_drive_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        client_id VARCHAR(50),
        file_name TEXT NOT NULL,
        file_type VARCHAR(20) DEFAULT 'PDF',
        category VARCHAR(50) DEFAULT 'CUMPLIDOS',
        drive_path TEXT,
        drive_link TEXT,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'SUCCESS'
      );
    `);

    await client.query(`ALTER TABLE document_drive_logs ADD COLUMN IF NOT EXISTS folder_date DATE`).catch(() => {});
    // Fix user_id type mismatch
    await client.query(`ALTER TABLE document_drive_logs ALTER COLUMN user_id TYPE TEXT;`).catch(() => {});

    // Add deletion columns
    await client.query(`
      ALTER TABLE document_drive_logs 
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS delete_reason TEXT,
      ADD COLUMN IF NOT EXISTS deleted_by TEXT,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    `).catch(err => console.error('Error adding deletion columns to document_drive_logs:', err));

    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) DEFAULT 'MUNICIPAL';
    `);

    await client.query(`
      UPDATE master_records SET id = 'TGN-002' WHERE id = 'TGN-100' AND category = 'TIPOS_NOTIFICACION';
      UPDATE master_records SET parent_id = 'TGN-002' WHERE parent_id = 'TGN-100' AND category = 'NOTIFICACIONES';
    `);

    await client.query(`
      INSERT INTO modules (id, name, icon_class, status_id)
      SELECT 'MOD-10', 'GESTIÓN DOCUMENTOS DRIVE', 'FileText', 'EST-01'
      WHERE NOT EXISTS (SELECT 1 FROM modules WHERE id = 'MOD-10');

      INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
      VALUES ('PAG-45', 'CUMPLIDOS DRIVE', 'cumplidos', 'MOD-10', 'MOD-10', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = 'CUMPLIDOS DRIVE', route = 'cumplidos', module_id = 'MOD-10', parent_id = 'MOD-10';

      INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
      SELECT 'PAG-48', 'INFORME DASHBOARD DRIVE', 'informe-dashboard-drive', 'MOD-10', 'MOD-10', 'EST-01'
      WHERE NOT EXISTS (SELECT 1 FROM pages WHERE id = 'PAG-48');
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
          WHEN item_status ILIKE '%repice%'                                  THEN 'EST-15'
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
    // Migrar documents_l.status: texto → EST-XX IDs
    const docNorm = await client.query(`
      SELECT COUNT(*) FROM documents_l
      WHERE status IS NOT NULL AND status NOT LIKE 'EST-%'
    `);
    if (parseInt(docNorm.rows[0].count) > 0) {
      console.log(`[M7-DB-HEAL] Migrando documents_l.status a IDs EST-XX: ${docNorm.rows[0].count} filas...`);
      await client.query(`
        UPDATE documents_l
        SET status = CASE
          WHEN status ILIKE '%pendiente%'                  THEN 'EST-03'
          WHEN status ILIKE '%en conteo%'                  THEN 'EST-04'
          WHEN status ILIKE '%auditado%'                   THEN 'EST-05'
          WHEN status ILIKE '%recibido%'                   THEN 'EST-06'
          WHEN status ILIKE '%finalizado%'                 THEN 'EST-07'
          WHEN status ILIKE '%completa%'                   THEN 'EST-07'
          WHEN status ILIKE '%inventariado%'               THEN 'EST-08'
          WHEN status ILIKE '%alistado%'                   THEN 'EST-09'
          WHEN status ILIKE '%asignado%'                   THEN 'EST-10'
          WHEN status ILIKE '%en ruta%'                    THEN 'EST-11'
          WHEN status ILIKE '%parcial%'                    THEN 'EST-14'
          WHEN status ILIKE '%entregado%'                  THEN 'EST-12'
          WHEN status ILIKE '%entrega%' AND status NOT ILIKE '%parcial%' THEN 'EST-12'
          WHEN status ILIKE '%devuelto%'                   THEN 'EST-13'
          WHEN status ILIKE '%devoluci%'                   THEN 'EST-13'
          WHEN status ILIKE '%rechaz%'                     THEN 'EST-17'
          WHEN status ILIKE '%elimina%'                    THEN 'EST-16'
          ELSE 'EST-03'
        END
        WHERE status NOT LIKE 'EST-%'
      `);
      console.log('[M7-DB-HEAL] Migración documents_l.status a IDs completada.');
    }

    // Migrar item_status = 'ELIMINADO' texto a ID EST-16
    await client.query(`
      UPDATE document_items SET item_status = 'EST-16' WHERE item_status = 'ELIMINADO'
    `);

  } catch (e: any) {
    console.error('[M7-DB-HEAL] Error en fase de estabilidad nuclear:', e.message);
  }
};


const executeSqlFileInBatches = async (client: any, filePath: string) => {
  const sqlContent = fs.readFileSync(filePath, 'utf8');
  // Split by semicolon followed by a newline
  const statements = sqlContent
    .split(/;\r?\n/)
    .map(stmt => stmt.trim())
    .filter(stmt => {
      if (!stmt) return false;
      if (stmt.startsWith('--')) return false;
      const upper = stmt.toUpperCase();
      if (upper === 'BEGIN' || upper === 'COMMIT' || upper === 'ROLLBACK') return false;
      return true;
    });

  console.log(`[M7-DB-MIGRATION] Total de sentencias detectadas en ${path.basename(filePath)}: ${statements.length}`);
  
  const batchSize = 100;
  let successCount = 0;
  
  for (let i = 0; i < statements.length; i += batchSize) {
    const batch = statements.slice(i, i + batchSize);
    await client.query('BEGIN');
    try {
      for (const statement of batch) {
        await client.query(statement);
        successCount++;
      }
      await client.query('COMMIT');
      
      if (successCount % 1000 === 0 || successCount === statements.length) {
        console.log(`[M7-DB-MIGRATION] Progreso: ${successCount}/${statements.length} sentencias ejecutadas.`);
      }
      
      // Pequeña pausa para liberar CPU y permitir otras operaciones en la base de datos
      await new Promise(resolve => setTimeout(resolve, 5));
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error(`[M7-DB-MIGRATION-BATCH-ERROR] Error en lote iniciando en índice ${i}:`, error.message);
      const failedStmt = batch.find(stmt => stmt.includes(error.message)) || batch[0];
      console.error('[M7-DB-MIGRATION-BATCH-ERROR] Sentencia fallida aproximada:', failedStmt);
      throw error;
    }
  }
  console.log(`[M7-DB-MIGRATION] Ejecución por lotes completada. ${successCount} sentencias ejecutadas con éxito.`);
};

export const restoreSystem = async () => {
  const start = Date.now();
  console.log('[M7-SYSTEM] Checking Consistency... (Nuclear Mode)');
  const client = await pool.connect();
  try {
    await healSchema(client);
    const healEnd = Date.now();
    console.log(`[M7-DB-HEAL] Curación de esquema completada en ${healEnd - start}ms`);

    // Ejecutar migración de dotaciones histórica una sola vez
    try {
      const checkMig = await client.query("SELECT COUNT(*) FROM gh_asignaciones_personal WHERE usuario_control = 'Migración'");
      const count = Number(checkMig.rows[0].count);
      if (count === 0) {
        console.log('[M7-DB-MIGRATION] Detectada base de datos limpia de datos históricos. Ejecutando MIGRACION_DOTACIONES_PROD.sql por lotes...');
        const sqlPath = path.join(__dirname, '../scripts/MIGRACION_DOTACIONES_PROD.sql');
        if (fs.existsSync(sqlPath)) {
          await executeSqlFileInBatches(client, sqlPath);
          console.log('[M7-DB-MIGRATION] Datos históricos de dotaciones migrados con éxito.');
        } else {
          console.warn('[M7-DB-MIGRATION] Archivo de migración no encontrado en:', sqlPath);
        }
      } else {
        console.log(`[M7-DB-MIGRATION] Datos históricos ya migrados previamente (${count} asignaciones).`);
      }
    } catch (e: any) {
      console.error('[M7-DB-MIGRATION-ERROR] Error al aplicar migración histórica:', e.message);
    }

    await client.query('BEGIN');

    // SEMILLAS DE DATOS BOOTSTRAP — solo se ejecutan en entornos NO-producción
    // En producción, los datos maestros se gestionan desde la UI y nunca se sobreescriben aquí.
    const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production-dev';
    
    if (!isProduction) {
      console.log('[M7-SYSTEM] Entorno de desarrollo detectado. Verificando semillas de ejemplo...');
      await client.query(`
        INSERT INTO vehicles (id, plate, brand, owner, capacity_m3, client_id, status_id, model_year, color, vehicle_type) VALUES
        ('VEH-001', 'VEJ509', 'MAR-022', NULL, 14, 'CLI-02', 'EST-01', '2024', 'gri', 'TV-01'),
        ('VEH-002', 'SXI118', 'MAR-022', NULL, 23, 'CLI-02', 'EST-01', '2024', 'blanco', 'TVH-001'),
        ('VEH-003', 'JYO631', 'MAR-022', NULL, 19, 'CLI-04', 'EST-01', '2026', 'blanco', 'TV-02'),
        ('VEH-004', 'WDY031', 'MAR-022', NULL, 22, 'CLI-01', 'EST-01', '2026', 'gris', 'TV-02'),
        ('VEH-005', 'NNN500', 'MAR-022', NULL, 19, 'CLI-01', 'EST-01', '2026', 'gris', 'TV-02')
        ON CONFLICT (id) DO NOTHING;
      `);

      await client.query(`
        INSERT INTO drivers (id, name, document_type, document_number, phone, client_id, status_id, license_category) VALUES
        ('DRV-001', 'WILLIAM GIL', 'DOC-01', '71578229', '2343234', 'CLI-02', 'EST-01', 'C1'),
        ('DRV-002', 'JAMES SALGADO', 'DOC-01', '94252356', '53324', 'CLI-02', 'EST-01', 'C2'),
        ('DRV-003', 'JAIRO ALVAREZ', 'DOC-01', '1128450159', '323333333', 'CLI-04', 'EST-01', 'C2')
        ON CONFLICT (id) DO NOTHING;
      `);
    } else {
      console.log('[M7-SYSTEM] Entorno de PRODUCCIÓN: Omitiendo semillas de ejemplo (Data Protection Active).');
    }

    await client.query(`
      INSERT INTO estados (id, name, status_id) VALUES
      ('EST-01', 'ACTIVO',          'EST-01'),
      ('EST-02', 'INACTIVO',        'EST-01'),
      ('EST-03', 'PENDIENTE',       'EST-01'),
      ('EST-04', 'EN CONTEO',       'EST-01'),
      ('EST-05', 'AUDITADO',        'EST-01'),
      ('EST-06', 'RECIBIDO',        'EST-01'),
      ('EST-07', 'COMPLETADO',      'EST-01'),
      ('EST-08', 'INVENTARIADO',    'EST-01'),
      ('EST-09', 'ALISTADO',        'EST-01'),
      ('EST-10', 'ASIGNADO',        'EST-01'),
      ('EST-11', 'EN RUTA',         'EST-01'),
      ('EST-12', 'ENTREGADO',       'EST-01'),
      ('EST-13', 'DEVUELTO',        'EST-01'),
      ('EST-14', 'ENTREGA PARCIAL', 'EST-01'),
      ('EST-15', 'REPICE',         'EST-01'),
      ('EST-16', 'ELIMINADO',       'EST-01'),
      ('EST-17', 'RECHAZADO',       'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO roles (id, name, status_id) VALUES
      ('ROL-01', 'Super Admin', 'EST-01'), ('ROL-02', 'ADMIN', 'EST-01'), ('ROL-03', 'CONDUCTORES', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO clients (id, name, status_id, client_type) VALUES
      ('CLI-01', 'Milla 7 Logistics', 'EST-01', 'MUNICIPAL')
      ON CONFLICT (id) DO NOTHING;
    `);

    // ── LIMPIAR Y RECONSTRUIR MÓDULOS (Pizarra Limpia = Réplica Exacta) ──────
    /*
    await client.query(`
      DELETE FROM pages WHERE id NOT IN (
        'PAG-01','PAG-03','PAG-04','PAG-05','PAG-06','PAG-07','PAG-08','PAG-09','PAG-10','PAG-11',
        'PAG-12','PAG-13','PAG-14','PAG-15','PAG-16','PAG-17',
        'PAG-18','PAG-19','PAG-20','PAG-21','PAG-22','PAG-23','PAG-24',
        'PAG-25','PAG-26','PAG-27','PAG-28','PAG-29','PAG-30','PAG-SQL', 'PAG-31', 'PAG-32', 'PAG-33', 'PAG-34', 'PAG-35', 'PAG-36', 'PAG-37', 'PAG-38', 'PAG-39', 'PAG-40',
        'PAG-41', 'PAG-42'
      )
    `);
    await client.query(`
      DELETE FROM modules WHERE id NOT IN ('MOD-01','MOD-02','MOD-03','MOD-04','MOD-05','MOD-06', 'MOD-07', 'MOD-08', 'MOD-09')
    `);
    */

    await client.query(`
      INSERT INTO modules (id, name, icon_class, status_id) VALUES
      ('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings', 'EST-01'),
      ('MOD-02', 'GESTIÓN TRANSPORTE', 'Truck', 'EST-01'),
      ('MOD-03', 'GESTIÓN AJOVER', 'Package', 'EST-01'),
      ('MOD-04', 'SEGURIDAD & ACCESO', 'Shield', 'EST-01'),
      ('MOD-05', 'M7 INTELLIGENCE', 'Sparkles', 'EST-01'),
      ('MOD-06', 'ADMINISTRACIÓN', 'Database', 'EST-01'),
      ('MOD-07', 'GESTIÓN GRUPO INTER', 'Truck', 'EST-01'),
      ('MOD-08', 'CENTRO DE FORMACIÓN', 'Award', 'EST-01'),
      ('MOD-09', 'GESTIÓN HUMANA', 'Users', 'EST-01'),
      ('MOD-11', 'OPERACIÓN ÉXITO', 'Star', 'EST-01'),
      ('MOD-12', 'GERENCIA', 'PieChart', 'EST-01')
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
      ('PAG-60', 'FORMATOS TRANSPORTES', 'formatos-transportes', 'MOD-02', 'MOD-02', 'EST-01'),

      -- Inventarios (MOD-03)
      ('PAG-16', 'GESTIÓN DE DOCUMENTOS', 'documentos', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-17', 'RECIBIDO DE MATERIAL', 'recibido', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-30', 'RECIBIDO MANUAL', 'recibido-manual', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-34', 'INFORME MASTERSUITE', 'informe-mastersuite', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-35', 'DASHBOARD AJOVER', 'dashboard-ajover', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-36', 'CONCILIACIÓN FACTURAS', 'conciliacion', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-37', 'CONSULTA FACTURAS', 'consulta-facturas', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-38', 'DEVOLUCIONES BODEGA', 'devoluciones-bodega', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-39', 'CONSULTA INVENTARIO', 'consulta-inventario', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-40', 'SALIDA A PROVEEDOR', 'salida-proveedor', 'MOD-03', 'MOD-03', 'EST-01'),

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
      ('PAG-33', 'CURSOS Y TALLERES', 'capacitaciones', 'MOD-08', 'MOD-08', 'EST-01'),

      -- Gestión Humana (MOD-09)
      ('PAG-41', 'MISCELÁNEOS', 'gestion-humana-miscelaneos', 'MOD-09', 'MOD-09', 'EST-01'),
      ('PAG-43', 'PERSONAL', 'gestion-humana-personal', 'MOD-09', 'MOD-09', 'EST-01'),
      ('PAG-44', 'REGISTRO DE VISITAS', 'gestion-humana-visitas', 'MOD-09', 'MOD-09', 'EST-01'),
      ('PAG-52', 'ENTREGAS Y SALIDAS', 'gestion-humana-entregas-salidas', 'MOD-09', 'MOD-09', 'EST-01'),
      ('PAG-53', 'ASIGNACIÓN Y DEVOLUCIÓN', 'gestion-humana-asignacion-devolucion', 'MOD-09', 'MOD-09', 'EST-01'),
      ('PAG-54', 'CONSULTAS INVENTARIO', 'gestion-humana-consultas-inventario', 'MOD-09', 'MOD-09', 'EST-01'),
      ('PAG-55', 'MASTER INVENTARIO', 'gestion-humana-master-inventario', 'MOD-09', 'MOD-09', 'EST-01'),
      ('PAG-56', 'INVENTARIO FÍSICO', 'gestion-humana-inventario-fisico', 'MOD-09', 'MOD-09', 'EST-01'),

      -- Configuración Maestros extra (MOD-01)
      ('PAG-42', 'CIUDADES', 'cfg-ciudades', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-51', 'PROV CLIENTE', 'prov-clientes', 'MOD-01', 'MOD-01', 'EST-01'),

      -- Gestión Ajover (MOD-03)
      ('PAG-49', 'AUDITORÍA FACTURA',          'auditoria-factura',          'MOD-03', 'MOD-03', 'EST-01'),

      -- Operación Éxito (MOD-11)
      ('PAG-46', 'VALIDACIÓN CONCILIACIONES', 'validacion-conciliaciones', 'MOD-11', 'MOD-11', 'EST-01'),
      ('PAG-47', 'FLETES DE CONCILIACIÓN',    'fletes-conciliacion',        'MOD-11', 'MOD-11', 'EST-01'),

      -- Gestión Documentos Drive (MOD-10) — operaciones manuales flota
      ('PAG-62', 'OPERACIONES FLOTA MANUAL',  'operaciones-flota-manual',   'MOD-10', 'MOD-10', 'EST-01'),

      -- Gerencia (MOD-12)
      ('PAG-50', 'INFORMES GERENCIALES',      'informes-gerenciales',       'MOD-12', 'MOD-12', 'EST-01'),
      ('PAG-61', 'INFORMES FLOTA',            'informes-flota',             'MOD-12', 'MOD-12', 'EST-01')

      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, 
        route = EXCLUDED.route, 
        module_id = EXCLUDED.module_id, 
        parent_id = EXCLUDED.parent_id,
        status_id = EXCLUDED.status_id;
    `);


    const adminHash = await bcrypt.hash('admin123', 10);
    // [M7-SAFETY] Eliminados borrados automáticos de usuarios USR-02, USR-03 y USR-DEMO.
    // Esto garantiza que los registros vinculados (pagos, logs, etc) no desaparezcan en cada deploy.
    
    await client.query(`
      INSERT INTO users (id, email, password, name, role_id, status_id, permissions)
      VALUES 
      ('USR-01', 'directorti@millasiete.com', $1, 'OSCAR SANTAMARIA', 'ROL-01', 'EST-01', '[{"module": "all", "actions": ["view", "edit", "delete", "create"]}]'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `, [adminHash]);

    // ── Columna max_weight_kg en vehicles (constraint de peso por vehículo) ──
    await client.query(`
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS max_weight_kg NUMERIC(10,2);
    `);

    // ── geocoding_cache: id legacy puede ser NOT NULL sin default → hacerlo nullable ──
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE geocoding_cache ALTER COLUMN id DROP NOT NULL;
      EXCEPTION WHEN undefined_column THEN NULL;
                WHEN OTHERS THEN NULL;
      END $$;
    `);

    // ── Caché de distancias reales por red vial (OSRM) ────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS road_distance_cache (
        from_key  TEXT NOT NULL,
        to_key    TEXT NOT NULL,
        dist_km   NUMERIC(10,4) NOT NULL,
        dur_min   NUMERIC(10,2),
        cached_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (from_key, to_key)
      );
      CREATE INDEX IF NOT EXISTS idx_road_dist_from ON road_distance_cache (from_key);
    `);
    // Limpiar entradas más viejas de 90 días para evitar crecer indefinidamente
    await client.query(`
      DELETE FROM road_distance_cache WHERE cached_at < NOW() - INTERVAL '90 days';
    `);

    // ── Fase 3: shift en routes (multi-viaje) ────────────────────────
    await client.query(`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS shift INTEGER DEFAULT 1;
      UPDATE routes SET shift = 1 WHERE shift IS NULL;
    `);

    // ── Fase 4: ventanas de tiempo por día de semana ──────────────────
    // Horarios de recepción de cada cliente/destinatario por día.
    // customer_key = LOWER(customer_name|city), day_of_week 0=Dom..6=Sáb.
    // close_time: hora límite de entrega en formato "HH:MM" (24h).
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_schedules (
        id            BIGSERIAL PRIMARY KEY,
        client_id     TEXT        NOT NULL,
        customer_key  TEXT        NOT NULL,
        customer_name TEXT,
        city          TEXT,
        day_of_week   INTEGER     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        close_time    TEXT        NOT NULL,
        label         TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unq_delivery_schedule UNIQUE (client_id, customer_key, day_of_week)
      );
      CREATE INDEX IF NOT EXISTS idx_delivery_sched_client
        ON delivery_schedules (client_id, day_of_week);
    `);

    // ── MÓDULO CAPACITACIONES (cap_*) ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_capacitaciones (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        objetivo TEXT,
        categoria VARCHAR(100) DEFAULT 'GENERAL',
        portada_drive_url TEXT,
        nota_minima_aprobacion INTEGER DEFAULT 70,
        max_intentos INTEGER DEFAULT 3,
        tiempo_limite_minutos INTEGER,
        tipo_proceso VARCHAR(50) DEFAULT 'AMBOS',
        estado VARCHAR(50) DEFAULT 'BORRADOR',
        drive_folder_id TEXT,
        drive_folder_path TEXT,
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE cap_capacitaciones
        ADD COLUMN IF NOT EXISTS tipo_acceso VARCHAR(20) DEFAULT 'INTERNO' NOT NULL,
        ADD COLUMN IF NOT EXISTS formato_opciones VARCHAR(20) DEFAULT 'letras' NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_preguntas (
        id SERIAL PRIMARY KEY,
        capacitacion_id INTEGER NOT NULL REFERENCES cap_capacitaciones(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL,
        pregunta TEXT NOT NULL,
        imagen_url TEXT,
        imagen_drive_id TEXT,
        peso INTEGER DEFAULT 1,
        orden INTEGER DEFAULT 0,
        retroalimentacion_correcta TEXT,
        retroalimentacion_incorrecta TEXT,
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_cap_preguntas_cap ON cap_preguntas(capacitacion_id);
    `);

    await client.query(`
      ALTER TABLE cap_preguntas
        ADD COLUMN IF NOT EXISTS retroalimentacion_correcta TEXT,
        ADD COLUMN IF NOT EXISTS retroalimentacion_incorrecta TEXT,
        ADD COLUMN IF NOT EXISTS peso INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_opciones (
        id SERIAL PRIMARY KEY,
        pregunta_id INTEGER NOT NULL REFERENCES cap_preguntas(id) ON DELETE CASCADE,
        texto TEXT,
        imagen_url TEXT,
        imagen_drive_id TEXT,
        es_correcta BOOLEAN DEFAULT FALSE,
        orden INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_cap_opciones_preg ON cap_opciones(pregunta_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_recursos (
        id SERIAL PRIMARY KEY,
        capacitacion_id INTEGER NOT NULL REFERENCES cap_capacitaciones(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        drive_file_id TEXT,
        drive_link TEXT,
        drive_path TEXT,
        url_externa TEXT,
        tamano_bytes BIGINT,
        mime_type VARCHAR(100),
        orden INTEGER DEFAULT 0,
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_cap_recursos_cap ON cap_recursos(capacitacion_id);
    `);

    await client.query(`
      ALTER TABLE cap_recursos
        ADD COLUMN IF NOT EXISTS url_externa TEXT,
        ADD COLUMN IF NOT EXISTS usuario_control VARCHAR(255),
        ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_asignaciones (
        id SERIAL PRIMARY KEY,
        capacitacion_id INTEGER NOT NULL REFERENCES cap_capacitaciones(id) ON DELETE RESTRICT,
        cedula VARCHAR(50) NOT NULL,
        nombre_colaborador VARCHAR(255),
        cargo_id INTEGER,
        tipo_proceso VARCHAR(50),
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        max_intentos_override INTEGER,
        estado VARCHAR(50) DEFAULT 'PENDIENTE',
        intentos_realizados INTEGER DEFAULT 0,
        mejor_calificacion DECIMAL(5,2),
        fecha_ultimo_intento TIMESTAMP WITH TIME ZONE,
        fecha_completado TIMESTAMP WITH TIME ZONE,
        asignado_por VARCHAR(255),
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(capacitacion_id, cedula, tipo_proceso)
      );
      CREATE INDEX IF NOT EXISTS idx_cap_asig_cedula ON cap_asignaciones(cedula);
      CREATE INDEX IF NOT EXISTS idx_cap_asig_cap ON cap_asignaciones(capacitacion_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_intentos (
        id SERIAL PRIMARY KEY,
        asignacion_id INTEGER NOT NULL REFERENCES cap_asignaciones(id) ON DELETE CASCADE,
        cedula VARCHAR(50) NOT NULL,
        capacitacion_id INTEGER NOT NULL,
        numero_intento INTEGER NOT NULL,
        fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        fecha_fin TIMESTAMP WITH TIME ZONE,
        tiempo_empleado_segundos INTEGER,
        calificacion DECIMAL(5,2),
        aprobado BOOLEAN DEFAULT FALSE,
        estado VARCHAR(50) DEFAULT 'EN_CURSO',
        ip_address VARCHAR(50),
        device_info TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cap_intentos_asig ON cap_intentos(asignacion_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_respuestas (
        id SERIAL PRIMARY KEY,
        intento_id INTEGER NOT NULL REFERENCES cap_intentos(id) ON DELETE CASCADE,
        pregunta_id INTEGER NOT NULL REFERENCES cap_preguntas(id) ON DELETE CASCADE,
        opciones_seleccionadas INTEGER[],
        respuesta_texto TEXT,
        es_correcta BOOLEAN,
        puntos_obtenidos DECIMAL(5,2) DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_cap_respuestas_intento ON cap_respuestas(intento_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_certificados (
        id SERIAL PRIMARY KEY,
        asignacion_id INTEGER NOT NULL REFERENCES cap_asignaciones(id) ON DELETE RESTRICT,
        intento_id INTEGER NOT NULL REFERENCES cap_intentos(id) ON DELETE RESTRICT,
        cedula VARCHAR(50) NOT NULL,
        capacitacion_id INTEGER NOT NULL,
        numero_certificado VARCHAR(100) UNIQUE NOT NULL,
        fecha_emision TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        calificacion_obtenida DECIMAL(5,2),
        drive_file_id TEXT,
        drive_link TEXT,
        drive_path TEXT,
        estado VARCHAR(50) DEFAULT 'VALIDO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cap_especialistas (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        categorias TEXT[] DEFAULT '{}',
        activo BOOLEAN DEFAULT TRUE,
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_cap_especialistas_user ON cap_especialistas(user_id);
    `);
    // Migrar esquema viejo (cedula/nombre/cargo) → user_id si la columna no existe
    await client.query(`
      ALTER TABLE cap_especialistas ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);
      ALTER TABLE cap_especialistas DROP COLUMN IF EXISTS cedula;
      ALTER TABLE cap_especialistas DROP COLUMN IF EXISTS nombre;
      ALTER TABLE cap_especialistas DROP COLUMN IF EXISTS cargo;
    `);

    // Registrar página PAG-33 como CURSOS Y TALLERES con tab 'capacitaciones-v2'
    await client.query(`
      UPDATE pages SET route = 'capacitaciones' WHERE id = 'PAG-33';
    `);

    // ── MÓDULO NOTICIAS Y AVISOS ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS noticias (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        link VARCHAR(500),
        archivo_drive_id TEXT,
        archivo_drive_path TEXT,
        archivo_nombre VARCHAR(255),
        archivo_tipo VARCHAR(20),
        tipo_acceso VARCHAR(20) DEFAULT 'AMBOS',
        fecha_vencimiento DATE,
        estado VARCHAR(20) DEFAULT 'ACTIVO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
      VALUES ('PAG-63', 'NOTICIAS Y AVISOS', 'noticias-avisos', 'MOD-08', 'MOD-08', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, route = EXCLUDED.route;
    `);

    // Tabla de asistencias para Noticias y Avisos
    await client.query(`
      CREATE TABLE IF NOT EXISTS noticia_asistencia (
        id SERIAL PRIMARY KEY,
        noticia_id INTEGER NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
        nombre_completo VARCHAR(255) NOT NULL,
        cedula VARCHAR(30) NOT NULL,
        cargo VARCHAR(150),
        firma_b64 TEXT,
        fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_noticia_asistencia_noticia ON noticia_asistencia(noticia_id);
    `);

    // Columnas nuevas en noticias (permite_asistencia + ruta Drive del PDF combinado)
    await client.query(`
      ALTER TABLE noticias ADD COLUMN IF NOT EXISTS permite_asistencia BOOLEAN DEFAULT FALSE NOT NULL;
      ALTER TABLE noticias ADD COLUMN IF NOT EXISTS asistencia_drive_path TEXT;
    `);

    // Columna Drive en training_sessions para PDF de asistencia
    await client.query(`
      ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS asistencia_drive_path TEXT;
    `);

    // Columnas para flujo completo de aprobación de devoluciones por proveedor
    await client.query(`
      ALTER TABLE return_approval_batches ADD COLUMN IF NOT EXISTS email_proveedor TEXT;
      ALTER TABLE return_approval_batches ADD COLUMN IF NOT EXISTS token_confirmacion TEXT;
      ALTER TABLE return_approval_batches ADD COLUMN IF NOT EXISTS vencimiento_token TIMESTAMPTZ;
      ALTER TABLE return_approval_batches ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
      ALTER TABLE return_approval_batches ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
      ALTER TABLE return_approval_batches ADD COLUMN IF NOT EXISTS confirmed_by_name TEXT;
      ALTER TABLE return_approval_batch_items ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
      ALTER TABLE return_approval_batch_items ADD COLUMN IF NOT EXISTS approved_by_name TEXT;

      -- Campos para recepción de devoluciones bodega (rediseño flujo)
      ALTER TABLE delivery_returns ADD COLUMN IF NOT EXISTS vendedor TEXT;
      ALTER TABLE delivery_returns ADD COLUMN IF NOT EXISTS numero_planilla TEXT;
      ALTER TABLE delivery_returns ADD COLUMN IF NOT EXISTS fecha_placa DATE;
      ALTER TABLE delivery_returns ADD COLUMN IF NOT EXISTS conciliacion_confirmada_at TIMESTAMPTZ;
      ALTER TABLE delivery_returns ADD COLUMN IF NOT EXISTS conciliacion_confirmada_by TEXT;
      ALTER TABLE delivery_return_items ADD COLUMN IF NOT EXISTS article_id TEXT;
      ALTER TABLE delivery_return_items ADD COLUMN IF NOT EXISTS un_code TEXT;
      ALTER TABLE alertas_whatsapp ADD COLUMN IF NOT EXISTS client_id TEXT;
    `);

    await client.query('COMMIT');

    // FASE FINAL: SINCRONIZACIÓN NUCLEAR DE MENÚS (REUBICACIÓN LOGÍSTICA)
    console.log('[M7-SYNC] Forzando reubicación de módulos logísticos a Gestión Ajover...');
    await client.query(`
      UPDATE pages 
      SET module_id = 'MOD-03', parent_id = 'MOD-03' 
      WHERE id IN ('PAG-13', 'PAG-15');
    `);

    // LIMPIEZA DE DUPLICADOS Y UNICIDAD EN ROUTE_INVOICES
    console.log('[M7-CLEANUP] Limpiando duplicados en route_invoices...');
    await client.query(`
        DELETE FROM route_invoices a USING route_invoices b 
        WHERE a.id < b.id AND a.route_id = b.route_id AND a.invoice_id = b.invoice_id
    `);
    await client.query(`
        ALTER TABLE route_invoices DROP CONSTRAINT IF EXISTS unq_route_invoice;
        ALTER TABLE route_invoices ADD CONSTRAINT unq_route_invoice UNIQUE (route_id, invoice_id);
    `);

    // ── Firma digital en asignaciones y devoluciones de personal ──────
    await client.query(`
      ALTER TABLE gh_asignaciones_personal
        ADD COLUMN IF NOT EXISTS firma_estado VARCHAR(20) DEFAULT 'PENDIENTE',
        ADD COLUMN IF NOT EXISTS fecha_firma TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS firmado_por TEXT;
    `);
    await client.query(`
      ALTER TABLE gh_devoluciones_personal
        ADD COLUMN IF NOT EXISTS firma_estado VARCHAR(20) DEFAULT 'PENDIENTE',
        ADD COLUMN IF NOT EXISTS fecha_firma TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS firmado_por TEXT;
    `);

    // ── ALERTAS WHATSAPP ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS alertas_whatsapp (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT,
        phone_numbers   TEXT[]          DEFAULT '{}',
        message_template TEXT,
        cron_expression TEXT            DEFAULT '0 8 * * 1-5',
        tipo_evento     TEXT            DEFAULT 'MANUAL',
        adjunto_tipo    TEXT            DEFAULT 'ninguno',
        status_id       TEXT            DEFAULT 'EST-01',
        last_run        TIMESTAMPTZ,
        next_run        TIMESTAMPTZ,
        created_by      TEXT,
        updated_by      TEXT,
        created_at      TIMESTAMPTZ     DEFAULT NOW(),
        updated_at      TIMESTAMPTZ     DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_status
        ON alertas_whatsapp (status_id);
    `);
    // Página en el menú — Configuración Maestros
    await client.query(`
      INSERT INTO pages (id, name, route, parent_id, module_id, status_id)
      VALUES ('PAG-WA01', 'ALERTAS WHATSAPP', 'alertas-whatsapp', 'MOD-04', 'MOD-04', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    // ── WHATSAPP QUICK REPLIES ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
        id         SERIAL PRIMARY KEY,
        user_id    VARCHAR(100) NOT NULL,
        title      VARCHAR(255) NOT NULL,
        content    TEXT         NOT NULL,
        created_at TIMESTAMPTZ  DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wqr_user ON whatsapp_quick_replies (user_id);
    `);

    // RESCATE DE DATOS: Recupera rutas huérfanas y repara fechas nulas
    await recoverOrphanedRoutes(client);
    await seedGhMiscelaneos(client);

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

/**
 * Ejecuta optimizaciones pesadas en segundo plano para no bloquear el arranque del sistema (Evita 503)
 */
export const runBackgroundOptimizations = async () => {
    const client = await pool.connect();
    try {
        console.log('[M7-BACKGROUND] Iniciando optimizaciones de rendimiento (No bloqueante)...');
        // Índice para corregir el timeout en GPS (Lentitud en DISTINCT ON)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vehicle_locations_latest 
            ON vehicle_locations (vehicle_id, updated_at DESC)
        `);
        console.log('[M7-BACKGROUND] Optimizaciones completadas exitosamente.');
    } catch (err: any) {
        console.error('[M7-BACKGROUND-ERROR] Falló optimización de índices:', err.message);
    } finally {
        client.release();
    }
};

async function seedGhMiscelaneos(client: any) {
  const genericCategories = {
    'parentescos': ['Hijo/a', 'Padre', 'Madre', 'Cónyuge', 'Hermano/a', 'Otro'],
    'tiempos-libres': ['Estudio', 'Deporte', 'Labores del hogar', 'Recreación', 'Otro'],
    'personas-a-cargo': ['Ninguna', 'de 1 a 3 personas', 'de 4 a 6 personas', 'Mas de 6 personas'],
    'convivientes': ['Cónyuge o pareja', 'Padres', 'Hijos/as', 'Convivientes', 'Vivo solo']
  };

  for (const [cat, items] of Object.entries(genericCategories)) {
    for (const item of items) {
      await client.query(`
        INSERT INTO gh_miscelaneos (categoria, nombre)
        SELECT $1::TEXT, $2::TEXT
        WHERE NOT EXISTS (SELECT 1 FROM gh_miscelaneos WHERE categoria = $1 AND nombre = $2)
      `, [cat, item]);
    }
  }

  // Semillas para tablas específicas si están vacías
  const tableSeeds = {
    'gh_tipos_sangre': ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    'gh_estados_civiles': ['Soltero/a', 'Casado/a', 'Unión Libre', 'Divorciado/a', 'Viudo/a'],
    'gh_niveles_educativos': ['Primaria', 'Secundaria', 'Técnico', 'Tecnólogo', 'Universitario', 'Postgrado'],
    'gh_tipos_vivienda': ['Propia', 'Arrendada', 'Familiar', 'Compartida'],
    'gh_tipos_contrato': ['Término Fijo', 'Término Indefinido', 'Obra o Labor', 'Prestación de Servicios'],
    'gh_ingresos_mensuales': ['Menos de 1 SMMLV', '1 a 2 SMMLV', '2 a 4 SMMLV', 'Más de 4 SMMLV'],
    'gh_eps': ['Sura', 'Sanitas', 'Nueva EPS', 'Salud Total', 'Compensar', 'Coosalud'],
    'gh_afp': ['Protección', 'Porvenir', 'Colfondos', 'Skandia', 'Colpensiones']
  };

  for (const [table, items] of Object.entries(tableSeeds)) {
    for (const item of items) {
      await client.query(`
        INSERT INTO ${table} (nombre)
        SELECT $1::TEXT WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE nombre = $1)
      `, [item]);
    }
  }
}

/**
 * M7-RECOVERY-TOOL: Rescata rutas que fueron "borradas" por la curación nuclear
 * pero que aún tienen facturas asociadas en route_invoices, o tienen fechas nulas.
 */
async function recoverOrphanedRoutes(client: any) {
    try {
        console.log('[M7-RECOVERY] Iniciando rescate inteligente de datos...');
        
        // 1. Reparar fechas nulas
        await client.query(`UPDATE routes SET created_at = NOW() WHERE created_at IS NULL`);
        await client.query(`UPDATE route_invoices SET created_at = NOW() WHERE created_at IS NULL`);
        
        // 2. Buscar rutas huérfanas o con nombre genérico para recuperarlas
        const orphans = await client.query(`
            SELECT DISTINCT ri.route_id 
            FROM route_invoices ri 
            LEFT JOIN routes r ON r.id::text = ri.route_id::text 
            WHERE r.id IS NULL OR r.name = 'RUTA RECUPERADA'
        `);
        
        if (orphans.rows.length > 0) {
            console.log(`[M7-RECOVERY] Detectadas ${orphans.rows.length} rutas para reconstrucción inteligente.`);
            for (const row of orphans.rows) {
                const rid = row.route_id;
                
                // Deducir Placa y Cliente de los documentos originales vinculados a esta ruta
                const meta = await client.query(`
                    SELECT dl.vehicle_plate, dl.client_id 
                    FROM route_invoices ri
                    JOIN documents_l dl ON dl.id::text = SPLIT_PART(ri.invoice_id, '_', 1)
                    WHERE ri.route_id = $1
                    LIMIT 1
                `, [rid]);
                
                const plate = meta.rows[0]?.vehicle_plate || 'SIN PLACA';
                const clientId = meta.rows[0]?.client_id || 'CLIENTE-GENERICO';

                await client.query(`
                    INSERT INTO routes (id, name, description, vehicle_id, client_id, status_id, created_by, created_at)
                    VALUES ($1, $2, 'Rescatada automáticamente', $3, $4, 'EST-10', 'SYSTEM_RECOVERY', NOW())
                    ON CONFLICT (id) DO UPDATE SET 
                        vehicle_id = EXCLUDED.vehicle_id, 
                        client_id = EXCLUDED.client_id,
                        name = EXCLUDED.name
                `, [rid, `RUTA ${plate}`, plate, clientId]);
            }
        }
        console.log('[M7-RECOVERY] Reconstrucción inteligente finalizada.');
    } catch (err: any) {
        console.error('[M7-RECOVERY-ERROR]', err.message);
    }
}
