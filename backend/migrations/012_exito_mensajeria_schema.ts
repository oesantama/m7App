import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Migración 012: Módulo Éxito Mensajería (MOD-11 — Operación Éxito)
 * Alineado 100% con Lineamientos Técnicos de Integración con Paqueteras Go Éxito v2.0 (2026)
 * y Operación Urbana/Misma Ciudad de Milla 7.
 *
 * REGLA ESTRICTA DE ALMACENAMIENTO:
 * - CERO columnas BLOB / BYTEA para archivos.
 * - Solo referencias VARCHAR a Google Drive (foto_url, firma_drive_id, remision_pdf_url, rotulo_pdf_url).
 */
export const migration012: Migration = {
  id: '012_exito_mensajeria_schema',
  name: 'Módulo Éxito Mensajería (MOD-11): Esquema Go Éxito v2.0, Cola DLQ, Homologación Urbana y Drive',
  up: async (client: PoolClient) => {
    // 1. Extender catálogo maestro de estados sin duplicar la tabla existente
    await client.query(`
      INSERT INTO estados (id, name, description, status_id) VALUES
        ('EST-29', 'ANULADO',              'Guía anulada antes de recogida o por contingencia', 'EST-01'),
        ('EST-30', 'ESPERA RECOGIDA',      'Guía generada en espera de solicitud/recogida',     'EST-01'),
        ('EST-31', 'DISPONIBLE RECOGIDA',  'Disponible para recoger en nodo/tienda Éxito',      'EST-01'),
        ('EST-32', 'RECOGIDA EN TIENDA',   'Paquete recogido por conductor en nodo local',      'EST-01'),
        ('EST-33', 'EN ALMACÉN',           'Recibido en bodega urbana Milla 7 (control local)', 'EST-01'),
        ('EST-34', 'EN TRÁNSITO',          'En traslado troncal (no usado en operación local)', 'EST-01'),
        ('EST-35', 'EN REPARTO',           'En ruta de entrega urbana hacia el destinatario',   'EST-01')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        status_id = EXCLUDED.status_id;
    `);

    // 2. Cliente corporativo Éxito por defecto si no existe
    await client.query(`
      INSERT INTO clients (id, name, short_name, status_id, client_type)
      VALUES ('CLI-EXITO', 'GRUPO ÉXITO CORPORATIVO (GO ÉXITO)', 'EXITO MENSAJERIA', 'EST-01', 'NACIONAL')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 3. Tabla de Homologación Oficial de Estados (Sección 16 Go Éxito v2.0 + Filtro Operación Urbana Milla 7)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_estados_homologacion (
        codigo_interno VARCHAR(40) PRIMARY KEY,
        estado_id TEXT NOT NULL REFERENCES estados(id),
        id_paquete_go_exito VARCHAR(10) NOT NULL,
        estado_go_exito VARCHAR(80) NOT NULL,
        id_guia_transportadora VARCHAR(10) NOT NULL,
        estado_transportadora VARCHAR(80) NOT NULL,
        descripcion TEXT,
        activo_operacion_local BOOLEAN NOT NULL DEFAULT TRUE,
        es_estado_final BOOLEAN NOT NULL DEFAULT FALSE,
        notificar_webhook BOOLEAN NOT NULL DEFAULT TRUE,
        orden_flujo INTEGER NOT NULL,
        color_badge VARCHAR(30) DEFAULT 'slate',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO exito_msj_estados_homologacion (
        codigo_interno, estado_id, id_paquete_go_exito, estado_go_exito,
        id_guia_transportadora, estado_transportadora, descripcion,
        activo_operacion_local, es_estado_final, notificar_webhook, orden_flujo, color_badge
      ) VALUES
        ('ESPERA_RECOGIDA',      'EST-30', '2', 'Pendiente impresión / solicitud recogida', '1', 'Guía generada',                     'Guía y rótulo generados vía API o Inhouse.',                                    TRUE,  FALSE, TRUE,  1, 'amber'),
        ('DISPONIBLE',           'EST-31', '4', 'Disponible para recoger',                  '1', 'Guía generada',                     'Solicitud de recogida confirmada y vehículo asignado al nodo local.',           TRUE,  FALSE, FALSE, 2, 'blue'),
        ('RECOGIDA_TIENDA',      'EST-32', '5', 'Envío operador',                           '2', 'En ciudad origen (Paquete recogido)','Conductor realizó Checkout en nodo/tienda Éxito con foto, firma y remisión.',  TRUE,  FALSE, TRUE,  3, 'indigo'),
        ('EN_ALMACEN',           'EST-33', '5', 'Envío operador',                           '2', 'En ciudad origen (Acopio local)',    'Punteo de recepción en bodega urbana Milla 7 (control interno sin re-disparar).',TRUE, FALSE, FALSE, 4, 'purple'),
        ('EN_TRANSITO_NACIONAL', 'EST-34', '5', 'Envío operador nacional',                  '3', 'En transporte',                     'Tránsito nacional entre ciudades (Deshabilitado: Milla 7 opera misma ciudad).', FALSE, FALSE, FALSE, 5, 'slate'),
        ('EN_CIUDAD_DESTINO',    'EST-34', '5', 'Envío operador nacional',                  '4', 'En ciudad destino',                 'Llegada a ciudad destino nacional (Deshabilitado: Milla 7 opera misma ciudad).',FALSE, FALSE, FALSE, 6, 'slate'),
        ('EN_RUTA',              'EST-35', '5', 'Envío operador',                           '5', 'En reparto',                        'En reparto urbano: camino al cliente final en la misma ciudad.',                TRUE,  FALSE, TRUE,  7, 'cyan'),
        ('ENTREGADO',            'EST-12', '6', 'Entregado',                                '6', 'Entregado',                         'Entrega confirmada al cliente con foto entrega, foto rótulo y firma en Drive.', TRUE,  TRUE,  TRUE,  8, 'emerald'),
        ('ANULADO',              'EST-29', '7', 'Cancelado',                                '7', 'Cancelado',                         'Guía anulada antes de recogida o por contingencia operativa.',                  TRUE,  TRUE,  TRUE,  9, 'rose'),
        ('DEVOLUCION',           'EST-13', '8', 'Devolución',                               '9', 'Devolución',                        'Retorno iniciado o completado hacia el nodo Éxito de origen.',                  TRUE,  FALSE, TRUE,  10,'orange')
      ON CONFLICT (codigo_interno) DO UPDATE SET
        estado_id = EXCLUDED.estado_id,
        id_paquete_go_exito = EXCLUDED.id_paquete_go_exito,
        estado_go_exito = EXCLUDED.estado_go_exito,
        id_guia_transportadora = EXCLUDED.id_guia_transportadora,
        estado_transportadora = EXCLUDED.estado_transportadora,
        descripcion = EXCLUDED.descripcion,
        activo_operacion_local = EXCLUDED.activo_operacion_local,
        es_estado_final = EXCLUDED.es_estado_final,
        notificar_webhook = EXCLUDED.notificar_webhook,
        orden_flujo = EXCLUDED.orden_flujo,
        color_badge = EXCLUDED.color_badge,
        updated_at = NOW();
    `);

    // 4. Tabla de Nodos / Tiendas / Dependencias Éxito
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_nodos (
        id SERIAL PRIMARY KEY,
        codigo_dependencia VARCHAR(50) UNIQUE NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        nit_remitente VARCHAR(40) DEFAULT '890900608-9',
        client_id TEXT DEFAULT 'CLI-EXITO' REFERENCES clients(id),
        ciudad_dane VARCHAR(20) NOT NULL DEFAULT '05001000',
        ciudad_nombre VARCHAR(100) NOT NULL DEFAULT 'MEDELLÍN',
        departamento VARCHAR(100) NOT NULL DEFAULT 'ANTIOQUIA',
        direccion VARCHAR(300) NOT NULL,
        barrio VARCHAR(150),
        latitud NUMERIC(10,7),
        longitud NUMERIC(10,7),
        contacto_nombre VARCHAR(150),
        contacto_telefono VARCHAR(50),
        contacto_celular VARCHAR(50),
        contacto_email VARCHAR(150),
        centro_costos_default VARCHAR(50) DEFAULT '723364',
        hora_corte_same_day TIME DEFAULT '11:00:00',
        vehiculo_recogida_id TEXT REFERENCES vehicles(id),
        placa_recogida VARCHAR(20),
        conductor_recogida_id TEXT REFERENCES drivers(id),
        cedula_conductor_recogida VARCHAR(40),
        nombre_conductor_recogida VARCHAR(150),
        fecha_asignacion_recogida DATE,
        estado_id TEXT DEFAULT 'EST-01' REFERENCES estados(id),
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO exito_msj_nodos (
        codigo_dependencia, nombre, nit_remitente, ciudad_dane, ciudad_nombre, departamento,
        direccion, barrio, latitud, longitud, contacto_nombre, contacto_telefono, contacto_celular,
        contacto_email, centro_costos_default, hora_corte_same_day
      ) VALUES
        ('0054', 'ÉXITO WOW ENVIGADO (NODO 0054)',     '890900608-9', '05266000', 'ENVIGADO',  'ANTIOQUIA', 'CR 48 # 34B SUR 29',  'LAS VEGAS',    6.1759100, -75.5917400, 'Coordinador Despachos Envigado', '6043394000', '3004112233', 'despachos.0054@grupo-exito.com', '723364', '11:30:00'),
        ('0011', 'ÉXITO POBLADO (NODO 0011)',          '890900608-9', '05001000', 'MEDELLÍN',  'ANTIOQUIA', 'CL 10 # 43E 135',     'EL POBLADO',   6.2105500, -75.5711200, 'Jefe Logística Poblado',         '6043115500', '3004112244', 'despachos.0011@grupo-exito.com', '723364', '11:30:00'),
        ('0021', 'ÉXITO COLOMBIA (NODO 0021)',         '890900608-9', '05001000', 'MEDELLÍN',  'ANTIOQUIA', 'CR 66 # 49 01',       'LAURELES',     6.2548200, -75.5831900, 'Líder Click & Collect Colombia', '6042608000', '3004112255', 'despachos.0021@grupo-exito.com', '723364', '11:30:00'),
        ('0035', 'ÉXITO BELLO MAYORCA / NORTE (0035)', '890900608-9', '05088000', 'BELLO',     'ANTIOQUIA', 'DG 51 # 34 120',      'NIQUÍA',       6.3389000, -75.5441000, 'Coordinador Nodo Bello',         '6044549000', '3004112266', 'despachos.0035@grupo-exito.com', '723364', '11:00:00')
      ON CONFLICT (codigo_dependencia) DO NOTHING;
    `);

    // 5. Catálogo de Novedades Homologadas (con textos amigables para Conductor Adulto Mayor)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_catalogo_novedades (
        id SERIAL PRIMARY KEY,
        codigo_novedad VARCHAR(40) UNIQUE NOT NULL,
        reason_code_exito VARCHAR(50) NOT NULL,
        id_guia_webhook VARCHAR(10) NOT NULL DEFAULT '5',
        nombre_interno VARCHAR(150) NOT NULL,
        etiqueta_conductor VARCHAR(120) NOT NULL,
        icono VARCHAR(40) DEFAULT 'AlertTriangle',
        etapa VARCHAR(30) NOT NULL CHECK (etapa IN ('RECOGIDA','ALMACEN','ENTREGA','ANULACION','TODAS')),
        requiere_foto BOOLEAN NOT NULL DEFAULT TRUE,
        es_rechazo_definitivo BOOLEAN NOT NULL DEFAULT FALSE,
        dispara_alerta BOOLEAN NOT NULL DEFAULT TRUE,
        estado_id TEXT DEFAULT 'EST-01' REFERENCES estados(id),
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO exito_msj_catalogo_novedades (
        codigo_novedad, reason_code_exito, id_guia_webhook, nombre_interno,
        etiqueta_conductor, icono, etapa, requiere_foto, es_rechazo_definitivo, dispara_alerta
      ) VALUES
        ('NOV-CLI-AUSENTE',     'FAILED_ATTEMPT_ABSENT', '5', 'Intento fallido: Cliente no está en casa',      '🏠 No hay nadie en la casa',           'Home',          'ENTREGA',   TRUE,  FALSE, TRUE),
        ('NOV-DIR-ERRADA',      'ADDRESS_ISSUE',         '5', 'Novedad de dirección: No existe o incompleta',  '📍 La dirección no existe o está mal', 'MapPinOff',     'ENTREGA',   TRUE,  FALSE, TRUE),
        ('NOV-CLI-RECHAZA',     'CUSTOMER_REJECTED',     '9', 'Rechazo: Cliente no recibe el pedido',          '✋ El cliente no quiso recibir',        'XCircle',       'ENTREGA',   TRUE,  TRUE,  TRUE),
        ('NOV-PORTERIA-NO',     'ACCESS_RESTRICTED',     '5', 'Portería / Unidad no autoriza ingreso',         '🏢 En portería no dejaron recibir',    'ShieldAlert',   'ENTREGA',   TRUE,  FALSE, TRUE),
        ('NOV-AVERIA',          'DAMAGED_PACKAGE',       '9', 'Avería: Paquete o empaque dañado',              '📦 La caja está rota o dañada',        'PackageX',      'TODAS',     TRUE,  TRUE,  TRUE),
        ('NOV-DIF-RECOGIDA',    'PICKUP_DIFFERENCE',     '2', 'Diferencia en recogida: Paquete faltante nodo', '🔍 Falta este paquete en la tienda',   'SearchX',       'RECOGIDA',  FALSE, FALSE, TRUE),
        ('NOV-PERDIDA',         'LOST_PACKAGE',          '9', 'Pérdida o extravío reportado en operación',     '⚠️ Paquete extraviado',                'AlertOctagon',  'ALMACEN',   FALSE, TRUE,  TRUE),
        ('NOV-ANUL-CLIENTE',    'CUSTOMER_REQUEST',      '7', 'Anulación solicitada por el cliente / Éxito',   '🚫 Pedido cancelado por Éxito',        'Ban',           'ANULACION', FALSE, TRUE,  FALSE)
      ON CONFLICT (codigo_novedad) DO UPDATE SET
        reason_code_exito = EXCLUDED.reason_code_exito,
        id_guia_webhook = EXCLUDED.id_guia_webhook,
        nombre_interno = EXCLUDED.nombre_interno,
        etiqueta_conductor = EXCLUDED.etiqueta_conductor,
        etapa = EXCLUDED.etapa,
        requiere_foto = EXCLUDED.requiere_foto,
        es_rechazo_definitivo = EXCLUDED.es_rechazo_definitivo,
        dispara_alerta = EXCLUDED.dispara_alerta;
    `);

    // 6. Tabla Principal de Guías (CERO BLOBs — Solo referencias VARCHAR a Google Drive)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_guias (
        id BIGSERIAL PRIMARY KEY,
        numero_guia VARCHAR(60) UNIQUE NOT NULL,
        codigo_remision VARCHAR(60) UNIQUE NOT NULL,
        numero_pedido VARCHAR(80) NOT NULL,
        contenedor VARCHAR(80),
        modalidad_pedido VARCHAR(20) NOT NULL DEFAULT 'FIRME' CHECK (modalidad_pedido IN ('FIRME','VMI','MARKETPLACE')),
        tipo_servicio VARCHAR(20) DEFAULT '0',
        tipo_operacion VARCHAR(15) NOT NULL DEFAULT 'NEXT_DAY' CHECK (tipo_operacion IN ('SAME_DAY','NEXT_DAY')),
        generador VARCHAR(100) DEFAULT 'Exito.com',
        centro_costos VARCHAR(60) DEFAULT '723364',
        cuenta_contable VARCHAR(60),
        application_id VARCHAR(100) DEFAULT 'GO_EXITO',
        transaction_id_creacion VARCHAR(100),
        correlation_id VARCHAR(100),
        ambiente VARCHAR(20) NOT NULL DEFAULT 'PROD' CHECK (ambiente IN ('PROD','QA','SANDBOX')),
        is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
        origen_creacion VARCHAR(20) NOT NULL DEFAULT 'API_EXITO' CHECK (origen_creacion IN ('API_EXITO','MANUAL_INHOUSE','SANDBOX')),

        -- Remitente / Nodo Local
        nodo_id INTEGER REFERENCES exito_msj_nodos(id) ON DELETE RESTRICT,
        codigo_dependencia VARCHAR(50),
        nombre_remitente VARCHAR(200),
        nit_remitente VARCHAR(40),
        direccion_remitente VARCHAR(300),
        barrio_remitente VARCHAR(150),
        ciudad_remitente_dane VARCHAR(20),
        ciudad_remitente_nombre VARCHAR(100),
        departamento_remitente VARCHAR(100),
        telefono_remitente VARCHAR(50),
        celular_remitente VARCHAR(50),

        -- Destinatario (Misma Ciudad)
        nombre_destinatario VARCHAR(200) NOT NULL,
        nit_destinatario VARCHAR(40),
        div_destinatario VARCHAR(10),
        direccion_destinatario VARCHAR(300) NOT NULL,
        barrio_destinatario VARCHAR(150),
        ciudad_destinatario_dane VARCHAR(20),
        ciudad_destinatario_nombre VARCHAR(100),
        departamento_destinatario VARCHAR(100),
        telefono_destinatario VARCHAR(50),
        celular_destinatario VARCHAR(50),
        correo_destinatario VARCHAR(150),
        latitud_destino NUMERIC(10,7),
        longitud_destino NUMERIC(10,7),

        -- Dimensiones, Peso y Contenido
        cant_cajas INTEGER NOT NULL DEFAULT 1,
        unidades_recogidas INTEGER,
        alto_cm NUMERIC(10,2) DEFAULT 0,
        ancho_cm NUMERIC(10,2) DEFAULT 0,
        largo_cm NUMERIC(10,2) DEFAULT 0,
        peso_kg NUMERIC(10,3) DEFAULT 0,
        peso_volumetrico NUMERIC(10,5) DEFAULT 0,
        valor_declarado NUMERIC(15,2) DEFAULT 0,
        contenido TEXT,
        observaciones TEXT,
        requiere_datafono BOOLEAN NOT NULL DEFAULT FALSE,

        -- Referencias Exclusivas a Google Drive (CERO BLOBs)
        foto_url VARCHAR(500),
        firma_drive_id VARCHAR(100),
        remision_pdf_url VARCHAR(500),
        rotulo_pdf_url VARCHAR(500),
        rotulo_drive_id VARCHAR(100),
        rotulo_expira_at TIMESTAMPTZ,
        foto_recogida_url VARCHAR(500),
        foto_recogida_drive_id VARCHAR(100),
        foto_entrega_url VARCHAR(500),
        foto_entrega_drive_id VARCHAR(100),
        foto_rotulo_entrega_url VARCHAR(500),
        foto_rotulo_entrega_drive_id VARCHAR(100),
        firma_entrega_url VARCHAR(500),

        -- Estado Operativo y Asignaciones
        estado_operativo VARCHAR(40) NOT NULL DEFAULT 'ESPERA_RECOGIDA' REFERENCES exito_msj_estados_homologacion(codigo_interno),
        estado_id TEXT NOT NULL DEFAULT 'EST-30' REFERENCES estados(id),
        id_guia_exito VARCHAR(10) NOT NULL DEFAULT '1',
        solicitud_recogida_id BIGINT,
        recogida_id BIGINT,
        ruta_actual_id BIGINT,
        vehiculo_recogida_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        conductor_recogida_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
        vehiculo_entrega_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        conductor_entrega_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
        intentos_entrega INTEGER NOT NULL DEFAULT 0,
        receptor_nombre VARCHAR(200),
        receptor_documento VARCHAR(40),
        tiene_novedad_activa BOOLEAN NOT NULL DEFAULT FALSE,
        ultima_novedad_texto TEXT,

        -- Marcas de tiempo del ciclo de vida urbano
        fecha_recogida_programada DATE,
        fecha_recogida_tienda TIMESTAMPTZ,
        fecha_ingreso_almacen TIMESTAMPTZ,
        fecha_salida_ruta TIMESTAMPTZ,
        fecha_entrega_real TIMESTAMPTZ,
        fecha_anulacion TIMESTAMPTZ,
        reason_code_anulacion VARCHAR(60),
        motivo_anulacion TEXT,
        anulado_por TEXT,

        -- Estado de Sincronización con Webhook Go Éxito
        exito_sync_status VARCHAR(20) NOT NULL DEFAULT 'SINCRONIZADO' CHECK (exito_sync_status IN ('SINCRONIZADO','PENDIENTE','REINTENTANDO','DLQ','NO_APLICA')),
        exito_last_sync_at TIMESTAMPTZ,
        exito_last_sync_error TEXT,

        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    // 7. Paquetes / Unidades por Guía
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_guia_paquetes (
        id BIGSERIAL PRIMARY KEY,
        guia_id BIGINT NOT NULL REFERENCES exito_msj_guias(id) ON DELETE CASCADE,
        numero_paquete INTEGER NOT NULL DEFAULT 1,
        codigo_barra_paquete VARCHAR(100) NOT NULL,
        descripcion VARCHAR(250),
        peso_kg NUMERIC(10,3) DEFAULT 0,
        alto_cm NUMERIC(10,2) DEFAULT 0,
        ancho_cm NUMERIC(10,2) DEFAULT 0,
        largo_cm NUMERIC(10,2) DEFAULT 0,
        verificado_recogida BOOLEAN NOT NULL DEFAULT FALSE,
        verificado_almacen BOOLEAN NOT NULL DEFAULT FALSE,
        verificado_entrega BOOLEAN NOT NULL DEFAULT FALSE,
        estado_paquete VARCHAR(30) DEFAULT 'OK',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(guia_id, numero_paquete)
      );
    `);

    // 8. Solicitudes de Recogida (Sección 7.2 POST /api/v1/pickups - COLLECT_GUIDE)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_solicitudes_recogida (
        id BIGSERIAL PRIMARY KEY,
        pickup_code VARCHAR(50) UNIQUE NOT NULL,
        referencia VARCHAR(80) NOT NULL,
        guia_inicial VARCHAR(60),
        guia_id BIGINT REFERENCES exito_msj_guias(id) ON DELETE SET NULL,
        nodo_id INTEGER REFERENCES exito_msj_nodos(id) ON DELETE SET NULL,
        modalidad INTEGER DEFAULT 1,
        producto INTEGER DEFAULT 4,
        fecha_recogida DATE NOT NULL,
        ciudad_origen_dane VARCHAR(20),
        ciudad_destino_dane VARCHAR(20),
        direccion_origen VARCHAR(300),
        direccion_destinatario VARCHAR(300),
        nombre_empresa VARCHAR(150),
        nombre_contacto VARCHAR(150),
        telefono_contacto VARCHAR(50),
        persona_autoriza VARCHAR(150),
        telefono_autoriza VARCHAR(50),
        unidades INTEGER DEFAULT 1,
        valor_declarado NUMERIC(15,2) DEFAULT 0,
        datafono BOOLEAN DEFAULT FALSE,
        destino_notificacion VARCHAR(150),
        status VARCHAR(30) NOT NULL DEFAULT 'ACCEPTED',
        transaction_id VARCHAR(100),
        idempotency_key VARCHAR(120),
        raw_payload JSONB,
        is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 8B. Programación e Histórico de Vehículos / Placas Asignadas a Recogida en Nodos
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_programacion_recogidas (
        id SERIAL PRIMARY KEY,
        codigo_programacion VARCHAR(50) UNIQUE NOT NULL,
        vehiculo_id TEXT REFERENCES vehicles(id),
        placa VARCHAR(20) NOT NULL,
        conductor_id TEXT REFERENCES drivers(id),
        conductor_nombre VARCHAR(150) NOT NULL,
        conductor_cedula VARCHAR(40),
        nodo_ids INTEGER[] NOT NULL DEFAULT '{}',
        nodos_resumen TEXT NOT NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'PROGRAMADO',
        total_guias_recogidas INTEGER DEFAULT 0,
        codigo_recogida_generado VARCHAR(60),
        observaciones TEXT,
        asignado_por VARCHAR(150),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        completado_at TIMESTAMPTZ
      );
    `);

    // 9. Lotes / Checkouts de Recogida en Tienda (con URLs de Google Drive)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_recogidas (
        id BIGSERIAL PRIMARY KEY,
        codigo_recogida VARCHAR(50) UNIQUE NOT NULL,
        nodo_id INTEGER REFERENCES exito_msj_nodos(id) ON DELETE RESTRICT,
        vehiculo_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        conductor_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
        tipo_operacion VARCHAR(15) NOT NULL DEFAULT 'NEXT_DAY' CHECK (tipo_operacion IN ('SAME_DAY','NEXT_DAY')),
        total_guias_esperadas INTEGER NOT NULL DEFAULT 0,
        total_guias_recogidas INTEGER NOT NULL DEFAULT 0,
        total_unidades_recogidas INTEGER NOT NULL DEFAULT 0,
        nombre_funcionario_tienda VARCHAR(150),
        cedula_funcionario_tienda VARCHAR(40),
        observaciones TEXT,
        foto_url VARCHAR(500),
        foto_drive_id VARCHAR(100),
        firma_drive_id VARCHAR(100),
        firma_url VARCHAR(500),
        remision_pdf_url VARCHAR(500),
        remision_drive_id VARCHAR(100),
        latitud NUMERIC(10,7),
        longitud NUMERIC(10,7),
        estado VARCHAR(30) NOT NULL DEFAULT 'COMPLETADA',
        is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 10. Rutas Urbanas de Entrega (Última Milla en la misma ciudad)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_rutas (
        id BIGSERIAL PRIMARY KEY,
        codigo_ruta VARCHAR(50) UNIQUE NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        fecha_ruta DATE NOT NULL DEFAULT CURRENT_DATE,
        tipo_operacion VARCHAR(15) NOT NULL DEFAULT 'NEXT_DAY' CHECK (tipo_operacion IN ('SAME_DAY','NEXT_DAY')),
        vehiculo_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        conductor_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
        total_guias INTEGER NOT NULL DEFAULT 0,
        guias_entregadas INTEGER NOT NULL DEFAULT 0,
        guias_novedad INTEGER NOT NULL DEFAULT 0,
        remision_ruta_pdf_url VARCHAR(500),
        remision_ruta_drive_id VARCHAR(100),
        estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('BORRADOR','ACTIVA','EN_REPARTO','CERRADA','ANULADA')),
        observaciones TEXT,
        is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_ruta_guias (
        id BIGSERIAL PRIMARY KEY,
        ruta_id BIGINT NOT NULL REFERENCES exito_msj_rutas(id) ON DELETE CASCADE,
        guia_id BIGINT NOT NULL REFERENCES exito_msj_guias(id) ON DELETE CASCADE,
        orden_parada INTEGER NOT NULL DEFAULT 1,
        estado_parada VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_parada IN ('PENDIENTE','ENTREGADA','NOVEDAD','REPROGRAMADA')),
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        UNIQUE(ruta_id, guia_id)
      );
    `);

    // 11. Intentos de Entrega (Máximo 3 intentos con URLs en Google Drive)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_intentos_entrega (
        id BIGSERIAL PRIMARY KEY,
        guia_id BIGINT NOT NULL REFERENCES exito_msj_guias(id) ON DELETE CASCADE,
        ruta_id BIGINT REFERENCES exito_msj_rutas(id) ON DELETE SET NULL,
        numero_intento INTEGER NOT NULL CHECK (numero_intento BETWEEN 1 AND 10),
        resultado VARCHAR(20) NOT NULL CHECK (resultado IN ('EXITOSO','FALLIDO','RECHAZADO')),
        conductor_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
        vehiculo_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        receptor_nombre VARCHAR(200),
        receptor_documento VARCHAR(40),
        novedad_catalogo_id INTEGER REFERENCES exito_msj_catalogo_novedades(id),
        observaciones TEXT,
        foto_url VARCHAR(500),
        foto_drive_id VARCHAR(100),
        foto_rotulo_url VARCHAR(500),
        foto_rotulo_drive_id VARCHAR(100),
        firma_drive_id VARCHAR(100),
        firma_url VARCHAR(500),
        latitud NUMERIC(10,7),
        longitud NUMERIC(10,7),
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 12. Registro de Novedades Operativas (con URLs de fotos en Google Drive)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_novedades (
        id BIGSERIAL PRIMARY KEY,
        guia_id BIGINT NOT NULL REFERENCES exito_msj_guias(id) ON DELETE CASCADE,
        catalogo_novedad_id INTEGER REFERENCES exito_msj_catalogo_novedades(id),
        codigo_novedad VARCHAR(40) NOT NULL,
        reason_code_exito VARCHAR(50) NOT NULL,
        etapa VARCHAR(30) NOT NULL,
        descripcion TEXT NOT NULL,
        foto_url VARCHAR(500),
        foto_drive_id VARCHAR(100),
        foto_adicional_url VARCHAR(500),
        latitud NUMERIC(10,7),
        longitud NUMERIC(10,7),
        alerta_enviada BOOLEAN NOT NULL DEFAULT FALSE,
        resuelta BOOLEAN NOT NULL DEFAULT FALSE,
        resolucion_comentario TEXT,
        resuelta_por TEXT,
        resuelta_at TIMESTAMPTZ,
        is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 13. Lotes de Devolución Semanal a Nodos Éxito
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_devoluciones_lotes (
        id BIGSERIAL PRIMARY KEY,
        codigo_lote VARCHAR(50) UNIQUE NOT NULL,
        nodo_id INTEGER REFERENCES exito_msj_nodos(id) ON DELETE RESTRICT,
        fecha_programada DATE NOT NULL DEFAULT CURRENT_DATE,
        vehiculo_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        conductor_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
        total_guias INTEGER NOT NULL DEFAULT 0,
        nombre_receptor_exito VARCHAR(150),
        cedula_receptor_exito VARCHAR(40),
        foto_url VARCHAR(500),
        foto_drive_id VARCHAR(100),
        firma_drive_id VARCHAR(100),
        firma_url VARCHAR(500),
        remision_pdf_url VARCHAR(500),
        remision_drive_id VARCHAR(100),
        estado VARCHAR(30) NOT NULL DEFAULT 'EN_PROCESO' CHECK (estado IN ('BORRADOR','EN_PROCESO','ENTREGADO_EXITO','ANULADO')),
        observaciones TEXT,
        is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        entregado_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_devoluciones_items (
        id BIGSERIAL PRIMARY KEY,
        lote_id BIGINT NOT NULL REFERENCES exito_msj_devoluciones_lotes(id) ON DELETE CASCADE,
        guia_id BIGINT NOT NULL REFERENCES exito_msj_guias(id) ON DELETE CASCADE,
        motivo_devolucion TEXT,
        estado_item VARCHAR(30) DEFAULT 'INCLUIDA',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(lote_id, guia_id)
      );
    `);

    // 14. Historial Inmutable de Estados por Guía
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_guia_historial (
        id BIGSERIAL PRIMARY KEY,
        guia_id BIGINT NOT NULL REFERENCES exito_msj_guias(id) ON DELETE CASCADE,
        numero_guia VARCHAR(60) NOT NULL,
        estado_anterior VARCHAR(40),
        estado_nuevo VARCHAR(40) NOT NULL,
        id_guia_exito VARCHAR(10) NOT NULL,
        origen_cambio VARCHAR(40) NOT NULL,
        observacion TEXT,
        evidencia_drive_url VARCHAR(500),
        evidencia_drive_id VARCHAR(100),
        latitud NUMERIC(10,7),
        longitud NUMERIC(10,7),
        usuario_id TEXT,
        usuario_nombre TEXT,
        ip_origen VARCHAR(60),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 15. Tabla de Idempotency-Key (Sección 6.1 y 9.3 Go Éxito v2.0 — Retención >= 24h)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_idempotency_keys (
        idempotency_key VARCHAR(150) NOT NULL,
        operation_type VARCHAR(60) NOT NULL,
        business_key VARCHAR(120) NOT NULL,
        transaction_id VARCHAR(100),
        http_status INTEGER NOT NULL,
        response_json JSONB NOT NULL,
        ambiente VARCHAR(20) NOT NULL DEFAULT 'PROD',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
        PRIMARY KEY (idempotency_key, operation_type, ambiente)
      );
    `);

    // 16. Cola Durable de Tracking Webhook + DLQ 24 Horas (Sección 7.4 y 9.2 Go Éxito v2.0)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_sync_queue (
        id BIGSERIAL PRIMARY KEY,
        guia_id BIGINT NOT NULL REFERENCES exito_msj_guias(id) ON DELETE CASCADE,
        numero_guia VARCHAR(60) NOT NULL,
        numero_pedido VARCHAR(80) NOT NULL,
        id_guia_status VARCHAR(10) NOT NULL,
        codigo_interno VARCHAR(40) NOT NULL,
        event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        natural_key VARCHAR(180) UNIQUE NOT NULL,
        transaction_id VARCHAR(100) NOT NULL,
        correlation_id VARCHAR(100) NOT NULL,
        payload_json JSONB NOT NULL,
        estado_cola VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_cola IN ('PENDIENTE','ENVIADO','REINTENTANDO','DLQ','DESCARTADO')),
        intentos INTEGER NOT NULL DEFAULT 0,
        first_attempt_at TIMESTAMPTZ,
        last_attempt_at TIMESTAMPTZ,
        proximo_intento_at TIMESTAMPTZ DEFAULT NOW(),
        dlq_entered_at TIMESTAMPTZ,
        http_status INTEGER,
        respuesta_exito TEXT,
        disparado_por VARCHAR(40) NOT NULL DEFAULT 'AUTOMATICO',
        usuario_reproceso TEXT,
        ambiente VARCHAR(20) NOT NULL DEFAULT 'PROD',
        is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 17. Observabilidad y Auditoría de APIs con PII Enmascarado (Secciones 12 y 13 Go Éxito v2.0)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_api_metrics_logs (
        id BIGSERIAL PRIMARY KEY,
        transaction_id VARCHAR(100) NOT NULL,
        correlation_id VARCHAR(100) NOT NULL,
        direction VARCHAR(15) NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
        operation VARCHAR(60) NOT NULL,
        endpoint VARCHAR(200) NOT NULL,
        method VARCHAR(10) NOT NULL,
        http_status INTEGER NOT NULL,
        result VARCHAR(10) NOT NULL CHECK (result IN ('OK','ERROR')),
        code VARCHAR(60),
        duration_ms INTEGER NOT NULL DEFAULT 0,
        guide_number VARCHAR(60),
        order_number VARCHAR(80),
        masked_summary JSONB,
        ip_source VARCHAR(60),
        ambiente VARCHAR(20) NOT NULL DEFAULT 'PROD',
        is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 18. Configuración del Módulo y Circuit Breaker
    await client.query(`
      CREATE TABLE IF NOT EXISTS exito_msj_configuracion (
        clave VARCHAR(80) PRIMARY KEY,
        valor TEXT NOT NULL,
        descripcion TEXT,
        updated_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO exito_msj_configuracion (clave, valor, descripcion) VALUES
        ('DRIVE_ROOT_FOLDER',           'exito_fulfillment',                                                       'Carpeta raíz en Google Drive (gdrive_cumplidos)'),
        ('TRACKING_WEBHOOK_URL_PROD',   'https://lzv2oui8p2.execute-api.us-east-1.amazonaws.com/prod/posteld',      'URL oficial de Webhook de Tracking Go Éxito (Producción)'),
        ('TRACKING_WEBHOOK_URL_QA',     'https://lzv2oui8p2.execute-api.us-east-1.amazonaws.com/dev/postelddev',    'URL oficial de Webhook de Tracking Go Éxito (QA / Pruebas)'),
        ('TRACKING_WEBHOOK_URL_SANDBOX','INTERNAL_SANDBOX_SIMULATOR',                                              'Modo simulador para pruebas en Sandbox sin afectar Producción'),
        ('SANDBOX_SIMULATE_WEBHOOK_503','false',                                                                   'Permite simular caída 503 de Go Éxito en Sandbox para probar DLQ y reenvío manual'),
        ('OPERACION_SOLO_MISMA_CIUDAD', 'true',                                                                    'Milla 7 opera recogidas y entregas dentro de la misma ciudad (omite estados 3 y 4)'),
        ('MAX_INTENTOS_ENTREGA',        '3',                                                                       'Número máximo de intentos antes de pasar a Devolución'),
        ('HORA_CORTE_SAME_DAY_GLOBAL',  '11:30',                                                                   'Hora límite por defecto para clasificar una guía como Same_Day')
      ON CONFLICT (clave) DO NOTHING;
    `);

    // 19. Índices de Alto Rendimiento (Escalabilidad) y Columnas de Asignación Global por Placa/Nodo
    await client.query(`
      ALTER TABLE exito_msj_nodos
        ADD COLUMN IF NOT EXISTS vehiculo_recogida_id TEXT,
        ADD COLUMN IF NOT EXISTS placa_recogida VARCHAR(20),
        ADD COLUMN IF NOT EXISTS conductor_recogida_id TEXT,
        ADD COLUMN IF NOT EXISTS cedula_conductor_recogida VARCHAR(40),
        ADD COLUMN IF NOT EXISTS nombre_conductor_recogida VARCHAR(150),
        ADD COLUMN IF NOT EXISTS fecha_asignacion_recogida DATE;

      ALTER TABLE exito_msj_recogidas
        ADD COLUMN IF NOT EXISTS placa_vehiculo VARCHAR(20),
        ADD COLUMN IF NOT EXISTS nombre_conductor VARCHAR(150),
        ADD COLUMN IF NOT EXISTS cedula_conductor VARCHAR(40),
        ADD COLUMN IF NOT EXISTS recibido_almacen BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS fecha_recepcion_almacen TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS recibido_almacen_por VARCHAR(150);

      ALTER TABLE exito_msj_rutas
        ADD COLUMN IF NOT EXISTS placa_vehiculo VARCHAR(20),
        ADD COLUMN IF NOT EXISTS nombre_conductor VARCHAR(150),
        ADD COLUMN IF NOT EXISTS cedula_conductor VARCHAR(40);

      CREATE INDEX IF NOT EXISTS idx_exito_guias_estado_op ON exito_msj_guias (estado_operativo, tipo_operacion, is_sandbox) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_exito_guias_barrio ON exito_msj_guias (ciudad_destinatario_nombre, barrio_destinatario, estado_operativo) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_exito_guias_recogida_id ON exito_msj_guias (recogida_id, estado_operativo);
      CREATE INDEX IF NOT EXISTS idx_exito_guias_ruta_id ON exito_msj_guias (ruta_actual_id, estado_operativo);
      CREATE INDEX IF NOT EXISTS idx_exito_guias_pedido ON exito_msj_guias (numero_pedido);
      CREATE INDEX IF NOT EXISTS idx_exito_guias_nodo ON exito_msj_guias (nodo_id, estado_operativo);
      CREATE INDEX IF NOT EXISTS idx_exito_guias_conductor_rec ON exito_msj_guias (conductor_recogida_id, estado_operativo);
      CREATE INDEX IF NOT EXISTS idx_exito_guias_conductor_ent ON exito_msj_guias (conductor_entrega_id, estado_operativo);
      CREATE INDEX IF NOT EXISTS idx_exito_guias_sync ON exito_msj_guias (exito_sync_status);
      CREATE INDEX IF NOT EXISTS idx_exito_sync_queue_pending ON exito_msj_sync_queue (estado_cola, proximo_intento_at) WHERE estado_cola IN ('PENDIENTE','REINTENTANDO');
      CREATE INDEX IF NOT EXISTS idx_exito_sync_queue_guia ON exito_msj_sync_queue (guia_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_exito_metrics_created ON exito_msj_api_metrics_logs (created_at DESC, operation);
      CREATE INDEX IF NOT EXISTS idx_exito_historial_guia ON exito_msj_guia_historial (guia_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_exito_idemp_exp ON exito_msj_idempotency_keys (expires_at);
    `);

    // 20. Registrar Páginas en MOD-11 (OPERACIÓN ÉXITO) y Permisos por Rol
    await client.query(`
      INSERT INTO modules (id, name, icon_class, status_id)
      VALUES ('MOD-11', 'OPERACIÓN ÉXITO', 'Star', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon_class = EXCLUDED.icon_class, status_id = EXCLUDED.status_id;
    `);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id) VALUES
        ('PAG-83', 'ÉXITO MENSAJERÍA (INHOUSE)',           'exito-mensajeria-inhouse',   'MOD-11', 'MOD-11', 'EST-01'),
        ('PAG-84', 'ÉXITO MENSAJERÍA (CONDUCTOR)',         'exito-mensajeria-conductor', 'MOD-11', 'MOD-11', 'EST-01'),
        ('PAG-85', 'ÉXITO MENSAJERÍA (RECEPCIÓN ALMACÉN)', 'exito-mensajeria-recepcion', 'MOD-11', 'MOD-11', 'EST-01'),
        ('PAG-86', 'ÉXITO MENSAJERÍA (DESPACHO REPARTO)',  'exito-mensajeria-despacho',  'MOD-11', 'MOD-11', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        route = EXCLUDED.route,
        module_id = EXCLUDED.module_id,
        parent_id = EXCLUDED.parent_id,
        status_id = EXCLUDED.status_id;
    `);

    // Otorgar permisos de vista/operación de PAG-84 al rol CONDUCTORES (ROL-03) y PAG-83/84 a ADMIN (ROL-02)
    await client.query(`
      INSERT INTO alertas_whatsapp (id, name, description, cron_expression, tipo_evento, adjunto_tipo, status_id) VALUES
        ('WA-EXITO-RECOGIDA',          'Éxito Mensajería: Recogida en Punto / Tienda',              'Alerta inmediata por correo y WhatsApp cuando el conductor recoge guías en tienda Éxito',  '0 8 * * *', 'EXITO_RECOGIDA_PUNTO',    'ninguno', 'EST-01'),
        ('WA-EXITO-RECEPCION-ALMACEN', 'Éxito Mensajería: Recepción en Almacén Milla 7',            'Alerta inmediata por correo y WhatsApp cuando las guías son recibidas/pistoleadas en M7', '0 8 * * *', 'EXITO_RECEPCION_ALMACEN', 'ninguno', 'EST-01'),
        ('WA-EXITO-NOVEDAD',           'Éxito Mensajería: Novedad Operativa',                       'Alerta inmediata cuando un conductor o bodega reporta novedad en guía Éxito',             '0 8 * * *', 'EXITO_NOVEDAD',           'ninguno', 'EST-01'),
        ('WA-EXITO-RECHAZO',           'Éxito Mensajería: Rechazo de Entrega',                      'Alerta prioritaria cuando el destinatario rechaza el pedido Éxito',                         '0 8 * * *', 'EXITO_RECHAZO',           'ninguno', 'EST-01'),
        ('WA-EXITO-DEVOLUCION',        'Éxito Mensajería: Guía en Devolución',                      'Alerta cuando una guía pasa a estado Devolución (Id guía = 9)',                            '0 8 * * *', 'EXITO_DEVOLUCION',        'ninguno', 'EST-01'),
        ('WA-EXITO-DLQ',               'Éxito Mensajería: Alerta Técnica DLQ (P1)',                 'Alerta crítica cuando un evento de tracking supera 24h y entra en DLQ',                    '0 8 * * *', 'EXITO_DLQ',               'ninguno', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        tipo_evento = EXCLUDED.tipo_evento;
    `);
  }
};

