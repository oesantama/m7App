import pool from '../config/database.js';

async function migrate() {
  try {
    console.log('[MIGRACIÓN] Creando tablas dogama_despachos y dogama_citas_recogidas...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dogama_despachos (
        id                  SERIAL PRIMARY KEY,
        fecha               DATE,
        orden_cargue        VARCHAR(100),
        confeccionista_id   INTEGER REFERENCES dogama_confeccionistas(id) ON DELETE SET NULL,
        confeccionista_txt  VARCHAR(300),
        orden_servicio      VARCHAR(100),
        marca_id            INTEGER REFERENCES dogama_marcas(id) ON DELETE SET NULL,
        marca_txt           VARCHAR(200),
        referencia          VARCHAR(150),
        lote                VARCHAR(150),
        unidades            INTEGER,
        tipo_prenda_id      INTEGER REFERENCES dogama_tipos_prenda(id) ON DELETE SET NULL,
        tipo_prenda_txt     VARCHAR(200),
        estado              VARCHAR(50) NOT NULL DEFAULT 'pendiente',
        usuario_creacion    VARCHAR(200),
        fecha_creacion      TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_despacho UNIQUE (orden_cargue, orden_servicio, referencia, lote)
      );

      CREATE TABLE IF NOT EXISTS dogama_citas_recogidas (
        id                  SERIAL PRIMARY KEY,
        fecha               DATE,
        turno               VARCHAR(50),
        hora_inicio         VARCHAR(20),
        hora_fin            VARCHAR(20),
        marca_id            INTEGER REFERENCES dogama_marcas(id) ON DELETE SET NULL,
        marca_txt           VARCHAR(200),
        referencia          VARCHAR(150),
        color               VARCHAR(100),
        lote                VARCHAR(150),
        mesa                INTEGER,
        cantidad            INTEGER,
        proveedor           VARCHAR(300),
        numero_documento    VARCHAR(150),
        tipo_oc             VARCHAR(100),
        estado              VARCHAR(50) NOT NULL DEFAULT 'pendiente',
        usuario_creacion    VARCHAR(200),
        fecha_creacion      TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_cita UNIQUE (numero_documento, referencia, lote, color, mesa)
      );
    `);

    console.log('[MIGRACIÓN] Tablas creadas con éxito.');
    process.exit(0);
  } catch (err) {
    console.error('[MIGRACIÓN] Error:', err);
    process.exit(1);
  }
}

migrate();
