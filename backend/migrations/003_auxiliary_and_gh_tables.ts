import { PoolClient } from 'pg';
import { Migration } from './types.js';

export const migration003: Migration = {
  id: '003_auxiliary_and_gh_tables',
  name: 'Tablas de gestión humana, inventarios de dotación, eventos WhatsApp y auditoría',
  up: async (client: PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS flota_tdm_manifiestos (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(50) NOT NULL,
        manifiesto VARCHAR(150) NOT NULL UNIQUE,
        fecha_operacion DATE NOT NULL,
        remesa VARCHAR(200),
        valor_cobrar NUMERIC(15,2) DEFAULT 0,
        valor_pagar NUMERIC(15,2) DEFAULT 0,
        ciudad_origen VARCHAR(100) DEFAULT 'SIN CIUDAD',
        ciudad_destino VARCHAR(100) DEFAULT 'SIN CIUDAD',
        uploaded_by VARCHAR(100),
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS whatsapp_delivery_events (
        id SERIAL PRIMARY KEY,
        instance_name TEXT,
        external_message_id TEXT,
        event_type TEXT,
        status TEXT,
        raw_payload JSONB,
        received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS validation_sources (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        url VARCHAR(500) NOT NULL,
        entity_type VARCHAR(20) NOT NULL DEFAULT 'tercero',
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        requires_auth BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS validation_records (
        id SERIAL PRIMARY KEY,
        tipo_documento VARCHAR(20) NOT NULL,
        numero_documento VARCHAR(50) NOT NULL,
        nombre_completo VARCHAR(255) NOT NULL,
        placa_vehiculo VARCHAR(20),
        estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
        resultado_json JSONB,
        total_fuentes_consultadas INTEGER DEFAULT 0,
        total_coincidencias INTEGER DEFAULT 0,
        pdf_path TEXT,
        validado_por VARCHAR(100),
        validado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cyber_phishing_campaigns (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        objetivo TEXT,
        plantilla_tipo VARCHAR(50) DEFAULT 'credenciales',
        total_enviados INTEGER DEFAULT 0,
        total_abiertos INTEGER DEFAULT 0,
        total_clics INTEGER DEFAULT 0,
        total_reportados INTEGER DEFAULT 0,
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        created_by VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cyber_phishing_events (
        id SERIAL PRIMARY KEY,
        campana_id INTEGER REFERENCES cyber_phishing_campaigns(id) ON DELETE CASCADE,
        usuario_id VARCHAR(100),
        usuario_email VARCHAR(255),
        tipo_evento VARCHAR(50) NOT NULL,
        ip_origen VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cyber_training_plans (
        id SERIAL PRIMARY KEY,
        usuario_id VARCHAR(100) NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        url_material TEXT,
        estado VARCHAR(50) DEFAULT 'ASIGNADO',
        fecha_asignacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        fecha_completado TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS gh_perfiles_cargo (
        id SERIAL PRIMARY KEY,
        cargo_id INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        mision TEXT,
        responsabilidades TEXT,
        requisitos_educacion TEXT,
        requisitos_experiencia TEXT,
        competencias TEXT,
        estado VARCHAR(20) NOT NULL DEFAULT 'activo',
        creado_por VARCHAR(100),
        creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        actualizado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS gh_perfiles_cargo_firmas (
        id SERIAL PRIMARY KEY,
        perfil_id INTEGER NOT NULL REFERENCES gh_perfiles_cargo(id) ON DELETE CASCADE,
        perfil_version INTEGER NOT NULL,
        personal_id INTEGER,
        cedula VARCHAR(50) NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        token VARCHAR(64) UNIQUE,
        token_expira_at TIMESTAMP WITH TIME ZONE,
        firma_b64 TEXT,
        firmado_ip VARCHAR(64),
        firmado_user_agent TEXT,
        firmado_at TIMESTAMP WITH TIME ZONE,
        drive_path TEXT,
        drive_link TEXT,
        creado_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(perfil_id, personal_id)
      );

      CREATE TABLE IF NOT EXISTS route_surcharges (
        id SERIAL PRIMARY KEY, 
        document_id TEXT NOT NULL, 
        plate TEXT NOT NULL,
        valor NUMERIC(15,2) NOT NULL, 
        referencia TEXT, 
        fecha DATE,
        status_id TEXT DEFAULT 'PENDIENTE', 
        user_id TEXT, 
        observaciones TEXT,
        facturas TEXT, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS route_group_payments (
        id SERIAL PRIMARY KEY, 
        document_id TEXT NOT NULL, 
        plate TEXT NOT NULL,
        valor NUMERIC(15,2) NOT NULL, 
        referencia TEXT, 
        fecha DATE,
        metodo_pago TEXT, 
        observacion TEXT, 
        user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS document_payment_history (
        id SERIAL PRIMARY KEY, 
        document_id TEXT, 
        invoice TEXT,
        old_method TEXT, 
        new_method TEXT, 
        user_id TEXT, 
        user_name TEXT,
        observations TEXT,
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS document_l_status_history (
        id SERIAL PRIMARY KEY, 
        document_id TEXT NOT NULL,
        old_status TEXT, 
        new_status TEXT NOT NULL, 
        observacion TEXT,
        user_name TEXT,
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_tipos_elementos (
        id SERIAL PRIMARY KEY, 
        nombre TEXT NOT NULL UNIQUE, 
        estado_id TEXT DEFAULT 'EST-01', 
        usuario_control TEXT, 
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_elementos (
        id SERIAL PRIMARY KEY, 
        nombre TEXT NOT NULL UNIQUE, 
        tipo_id INTEGER REFERENCES gh_tipos_elementos(id) ON DELETE CASCADE, 
        estado_id TEXT DEFAULT 'EST-01', 
        usuario_control TEXT, 
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        es_serializado BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS gh_inventario_elemento (
        id SERIAL PRIMARY KEY,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE UNIQUE,
        stock INTEGER NOT NULL DEFAULT 0,
        fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_ordenes_compra (
        id SERIAL PRIMARY KEY,
        numero_orden VARCHAR(50) NOT NULL UNIQUE,
        proveedor VARCHAR(255) NOT NULL,
        fecha DATE NOT NULL,
        estado VARCHAR(50) DEFAULT 'PENDIENTE',
        usuario_control TEXT,
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_ordenes_compra_detalle (
        id SERIAL PRIMARY KEY,
        orden_id INTEGER REFERENCES gh_ordenes_compra(id) ON DELETE CASCADE,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL,
        valor_unitario NUMERIC(15,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gh_entradas_bodega (
        id SERIAL PRIMARY KEY,
        numero_factura VARCHAR(50) NOT NULL,
        orden_id INTEGER REFERENCES gh_ordenes_compra(id) ON DELETE SET NULL,
        fecha DATE NOT NULL,
        observaciones TEXT,
        usuario_control TEXT,
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_entradas_bodega_detalle (
        id SERIAL PRIMARY KEY,
        entrada_id INTEGER REFERENCES gh_entradas_bodega(id) ON DELETE CASCADE,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL,
        valor_unitario NUMERIC(15,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gh_inventario_serial_elemento (
        id SERIAL PRIMARY KEY,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        serial VARCHAR(100) NOT NULL UNIQUE,
        estado VARCHAR(50) DEFAULT 'DISPONIBLE',
        fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_salidas_proveedor (
        id SERIAL PRIMARY KEY,
        numero_salida VARCHAR(50) NOT NULL,
        proveedor VARCHAR(255) NOT NULL,
        fecha DATE NOT NULL,
        motivo TEXT,
        usuario_control TEXT,
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_salidas_proveedor_detalle (
        id SERIAL PRIMARY KEY,
        salida_id INTEGER REFERENCES gh_salidas_proveedor(id) ON DELETE CASCADE,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gh_asignaciones_personal (
        id SERIAL PRIMARY KEY,
        personal_id INTEGER,
        fecha DATE NOT NULL,
        usuario_control TEXT,
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_asignaciones_personal_detalle (
        id SERIAL PRIMARY KEY,
        asignacion_id INTEGER REFERENCES gh_asignaciones_personal(id) ON DELETE CASCADE,
        elemento_id INTEGER REFERENCES gh_elementos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS opt_formatos (
        id VARCHAR(255) PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        orden INTEGER DEFAULT 0
      );
    `);
  }
};
