import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Gestión Humana (MOD-09):
 *  - Hoja de Vida de Activos (PAG-80): activos físicos de la empresa y su histórico de eventos.
 *  - Mensajería (PAG-81 admin / PAG-82 mensajero): envíos con firmas y fotos de evidencia.
 *
 * Los archivos (firmas, fotos, soportes) viven en Google Drive vía rclone; en BD solo
 * queda la ruta, el hash SHA-256 y la metadata. Las tablas *_archivos y *_eventos son
 * de solo inserción: una corrección se registra como un evento nuevo.
 */
export const migration007: Migration = {
  id: '007_gh_activos_mensajeria',
  name: 'Gestión Humana: hoja de vida de activos y control de mensajería',
  up: async (client: PoolClient) => {
    // ── MÓDULO 1: HOJA DE VIDA DE ACTIVOS ─────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_activos_tipos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        estado VARCHAR(20) NOT NULL DEFAULT 'EST-01',
        usuario_control TEXT,
        fecha_control TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      INSERT INTO gh_activos_tipos (nombre, usuario_control) VALUES
        ('CÁMARA DE SEGURIDAD', 'SYSTEM'), ('PUERTA / PORTÓN', 'SYSTEM'), ('MONTACARGAS', 'SYSTEM'),
        ('CAMA', 'SYSTEM'), ('IMPRESORA', 'SYSTEM'), ('OTRO', 'SYSTEM')
      ON CONFLICT (nombre) DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_activos (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(20) NOT NULL UNIQUE,
        tipo_id INTEGER NOT NULL REFERENCES gh_activos_tipos(id),
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        serial VARCHAR(120),
        marca VARCHAR(120),
        modelo VARCHAR(120),
        ubicacion VARCHAR(200),
        area_id INTEGER REFERENCES gh_areas(id) ON DELETE SET NULL,
        responsable_id INTEGER REFERENCES gh_personal(id) ON DELETE SET NULL,
        proveedor VARCHAR(200),
        fecha_adquisicion DATE,
        costo_inicial NUMERIC(15,2) DEFAULT 0,
        estado VARCHAR(30) NOT NULL DEFAULT 'OPERATIVO',
        criticidad VARCHAR(10) NOT NULL DEFAULT 'MEDIA',
        frecuencia_mantenimiento_dias INTEGER,
        proximo_mantenimiento DATE,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT chk_gh_activos_estado CHECK (estado IN ('OPERATIVO','EN_MANTENIMIENTO','DAÑADO','BAJA')),
        CONSTRAINT chk_gh_activos_criticidad CHECK (criticidad IN ('BAJA','MEDIA','ALTA'))
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_tipo ON gh_activos (tipo_id) WHERE deleted_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_estado ON gh_activos (estado) WHERE deleted_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_responsable ON gh_activos (responsable_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_activos_eventos (
        id SERIAL PRIMARY KEY,
        activo_id INTEGER NOT NULL REFERENCES gh_activos(id) ON DELETE CASCADE,
        tipo_evento VARCHAR(40) NOT NULL,
        fecha DATE NOT NULL,
        descripcion TEXT NOT NULL,
        costo NUMERIC(15,2) DEFAULT 0,
        proveedor VARCHAR(200),
        factura VARCHAR(100),
        estado_resultante VARCHAR(30),
        datos_cambio JSONB,
        created_by TEXT,
        created_by_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_gh_activos_evt_tipo CHECK (tipo_evento IN (
          'MANTENIMIENTO_PREVENTIVO','MANTENIMIENTO_CORRECTIVO','GASTO','INCIDENCIA',
          'CAMBIO_RESPONSABLE','CAMBIO_UBICACION','REVISION','BAJA','REGISTRO'))
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_evt_activo ON gh_activos_eventos (activo_id, fecha DESC)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_activos_archivos (
        id SERIAL PRIMARY KEY,
        activo_id INTEGER NOT NULL REFERENCES gh_activos(id) ON DELETE CASCADE,
        evento_id INTEGER REFERENCES gh_activos_eventos(id) ON DELETE CASCADE,
        nombre_original VARCHAR(255),
        mime VARCHAR(100) NOT NULL,
        tamano_bytes INTEGER NOT NULL,
        sha256 CHAR(64) NOT NULL,
        drive_path TEXT NOT NULL,
        local_path TEXT,
        estado_subida VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        reintentos INTEGER NOT NULL DEFAULT 0,
        ultimo_error TEXT,
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_arch_evento ON gh_activos_archivos (evento_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_arch_subida ON gh_activos_archivos (estado_subida) WHERE estado_subida <> 'SUBIDO'`);

    // ── MÓDULO 2: MENSAJERÍA ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_mensajeria_envios (
        id SERIAL PRIMARY KEY,
        tracking VARCHAR(30) NOT NULL UNIQUE,
        remitente_id INTEGER NOT NULL REFERENCES gh_personal(id),
        tipo VARCHAR(20) NOT NULL DEFAULT 'DOCUMENTO',
        contenido TEXT NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 1,
        peso_kg NUMERIC(10,2),
        valor_declarado NUMERIC(15,2),
        prioridad VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
        destinatario_nombre VARCHAR(200) NOT NULL,
        destinatario_documento VARCHAR(30),
        destinatario_telefono VARCHAR(30),
        destinatario_direccion VARCHAR(300) NOT NULL,
        destinatario_ciudad VARCHAR(100) NOT NULL,
        destinatario_empresa VARCHAR(200),
        mensajero_id INTEGER REFERENCES gh_personal(id),
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        intentos INTEGER NOT NULL DEFAULT 0,
        fecha_entrega_estimada TIMESTAMP WITH TIME ZONE,
        fecha_asignacion TIMESTAMP WITH TIME ZONE,
        fecha_recogida TIMESTAMP WITH TIME ZONE,
        fecha_entrega_real TIMESTAMP WITH TIME ZONE,
        receptor_nombre VARCHAR(200),
        receptor_documento VARCHAR(30),
        observaciones TEXT,
        created_by TEXT,
        created_by_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_gh_msj_tipo CHECK (tipo IN ('DOCUMENTO','PAQUETE','ENCOMIENDA')),
        CONSTRAINT chk_gh_msj_prioridad CHECK (prioridad IN ('NORMAL','URGENTE')),
        CONSTRAINT chk_gh_msj_estado CHECK (estado IN ('PENDIENTE','ASIGNADO','EN_CAMINO','ENTREGADO','FALLIDO','DEVUELTO','CANCELADO'))
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_estado ON gh_mensajeria_envios (estado)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_mensajero ON gh_mensajeria_envios (mensajero_id, estado)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_remitente ON gh_mensajeria_envios (remitente_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_created ON gh_mensajeria_envios (created_at DESC)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_mensajeria_eventos (
        id SERIAL PRIMARY KEY,
        envio_id INTEGER NOT NULL REFERENCES gh_mensajeria_envios(id) ON DELETE CASCADE,
        estado_anterior VARCHAR(20),
        estado_nuevo VARCHAR(20) NOT NULL,
        motivo TEXT,
        lat NUMERIC(10,7),
        lng NUMERIC(10,7),
        precision_m NUMERIC(10,2),
        ip VARCHAR(64),
        user_agent TEXT,
        client_uuid UUID UNIQUE,
        capturado_at TIMESTAMP WITH TIME ZONE,
        user_id TEXT,
        user_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_evt_envio ON gh_mensajeria_eventos (envio_id, created_at)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_mensajeria_archivos (
        id SERIAL PRIMARY KEY,
        envio_id INTEGER NOT NULL REFERENCES gh_mensajeria_envios(id) ON DELETE CASCADE,
        evento_id INTEGER REFERENCES gh_mensajeria_eventos(id) ON DELETE SET NULL,
        tipo VARCHAR(30) NOT NULL,
        firmante_nombre VARCHAR(200),
        firmante_documento VARCHAR(30),
        mime VARCHAR(100) NOT NULL,
        tamano_bytes INTEGER NOT NULL,
        sha256 CHAR(64) NOT NULL,
        drive_path TEXT NOT NULL,
        local_path TEXT,
        estado_subida VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        reintentos INTEGER NOT NULL DEFAULT 0,
        ultimo_error TEXT,
        lat NUMERIC(10,7),
        lng NUMERIC(10,7),
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_gh_msj_arch_tipo CHECK (tipo IN ('FIRMA_MENSAJERO','FIRMA_DESTINATARIO','FOTO_PAQUETE','FOTO_ENTREGA','FOTO_INCIDENCIA'))
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_arch_envio ON gh_mensajeria_archivos (envio_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_arch_subida ON gh_mensajeria_archivos (estado_subida) WHERE estado_subida <> 'SUBIDO'`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_mensajeria_alertas (
        id SERIAL PRIMARY KEY,
        envio_id INTEGER NOT NULL REFERENCES gh_mensajeria_envios(id) ON DELETE CASCADE,
        tipo VARCHAR(20) NOT NULL,
        detalle TEXT,
        generada_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        notificada BOOLEAN NOT NULL DEFAULT FALSE,
        resuelta BOOLEAN NOT NULL DEFAULT FALSE,
        resuelta_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT chk_gh_msj_alerta_tipo CHECK (tipo IN ('ATRASADO','SIN_ASIGNAR','FALLIDO'))
      );
    `);
    // Una sola alerta abierta por envío y tipo
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_gh_msj_alerta_abierta ON gh_mensajeria_alertas (envio_id, tipo) WHERE resuelta = FALSE`);

    // ── PÁGINAS (sidebar DB-driven) ───────────────────────────────────────────
    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id) VALUES
        ('PAG-80', 'HOJA DE VIDA ACTIVOS', 'gestion-humana-activos',    'MOD-09', 'MOD-09', 'EST-01'),
        ('PAG-81', 'MENSAJERÍA',           'gestion-humana-mensajeria', 'MOD-09', 'MOD-09', 'EST-01'),
        ('PAG-82', 'MIS ENVÍOS',           'gestion-humana-mis-envios', 'MOD-09', 'MOD-09', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    // ── PERFIL MENSAJERO ──────────────────────────────────────────────────────
    // Al crear un usuario con este rol, user.controller copia estos permisos a user_permissions.
    await client.query(`
      INSERT INTO roles (id, name, status_id) VALUES ('ROL-04', 'MENSAJERO', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);
    await client.query(`
      INSERT INTO role_permissions (id, role_id, permissions, status_id, created_by)
      VALUES ('RP-ROL-04', 'ROL-04', $1::jsonb, 'EST-01', 'SYSTEM')
      ON CONFLICT (id) DO NOTHING;
    `, [JSON.stringify({
      'page_PAG-82_view': true,
      'page_PAG-82_create': true,
      'page_PAG-82_edit': true,
    })]);
  }
};
