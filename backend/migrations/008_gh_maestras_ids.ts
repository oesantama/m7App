import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Activos y Mensajería guardan IDs de maestras en vez de texto:
 *  - estados (maestra global `estados`): gh_activos.estado_id, gh_activos_eventos.estado_resultante_id,
 *    gh_mensajeria_envios.estado_id, gh_mensajeria_eventos.estado_anterior_id / estado_nuevo_id
 *  - marcas (maestra global `marcas`): gh_activos.marca_id
 *  - proveedores (maestra `prov_cliente`, PK = NIT): gh_activos.proveedor_id, gh_activos_eventos.proveedor_id
 * Los valores de texto existentes se convierten al ID equivalente antes de borrar las columnas viejas.
 */
export const migration008: Migration = {
  id: '008_gh_maestras_ids',
  name: 'Gestión Humana: activos y mensajería referencian maestras por ID',
  up: async (client: PoolClient) => {
    // Estados nuevos en la maestra global (los de mensajería reutilizan los existentes)
    await client.query(`
      INSERT INTO estados (id, name, status_id) VALUES
        ('EST-24', 'OPERATIVO',         'EST-01'),
        ('EST-25', 'EN MANTENIMIENTO',  'EST-01'),
        ('EST-26', 'DAÑADO',            'EST-01'),
        ('EST-27', 'DADO DE BAJA',      'EST-01'),
        ('EST-28', 'FALLIDO',           'EST-01'),
        ('EST-29', 'CANCELADO',         'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    // ── Activos ──
    await client.query(`
      ALTER TABLE gh_activos
        ADD COLUMN IF NOT EXISTS marca_id TEXT REFERENCES marcas(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS proveedor_id TEXT REFERENCES prov_cliente(documento) ON UPDATE CASCADE ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS estado_id TEXT REFERENCES estados(id);
    `);
    await client.query(`
      UPDATE gh_activos a SET
        estado_id = CASE a.estado WHEN 'EN_MANTENIMIENTO' THEN 'EST-25' WHEN 'DAÑADO' THEN 'EST-26'
                                  WHEN 'BAJA' THEN 'EST-27' ELSE 'EST-24' END,
        marca_id = (SELECT m.id FROM marcas m WHERE UPPER(TRIM(m.name)) = UPPER(TRIM(a.marca)) LIMIT 1),
        proveedor_id = (SELECT p.documento FROM prov_cliente p WHERE UPPER(TRIM(p.nombre)) = UPPER(TRIM(a.proveedor)) LIMIT 1)
      WHERE a.estado_id IS NULL;
    `);
    await client.query(`ALTER TABLE gh_activos DROP CONSTRAINT IF EXISTS chk_gh_activos_estado`);
    await client.query(`ALTER TABLE gh_activos DROP COLUMN IF EXISTS estado, DROP COLUMN IF EXISTS marca, DROP COLUMN IF EXISTS proveedor`);
    await client.query(`ALTER TABLE gh_activos ALTER COLUMN estado_id SET DEFAULT 'EST-24', ALTER COLUMN estado_id SET NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_estado_id ON gh_activos (estado_id) WHERE deleted_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_created ON gh_activos (created_at)`);

    await client.query(`
      ALTER TABLE gh_activos_eventos
        ADD COLUMN IF NOT EXISTS proveedor_id TEXT REFERENCES prov_cliente(documento) ON UPDATE CASCADE ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS estado_resultante_id TEXT REFERENCES estados(id);
    `);
    await client.query(`
      UPDATE gh_activos_eventos e SET
        estado_resultante_id = CASE e.estado_resultante WHEN 'OPERATIVO' THEN 'EST-24' WHEN 'EN_MANTENIMIENTO' THEN 'EST-25'
                                     WHEN 'DAÑADO' THEN 'EST-26' WHEN 'BAJA' THEN 'EST-27' END,
        proveedor_id = (SELECT p.documento FROM prov_cliente p WHERE UPPER(TRIM(p.nombre)) = UPPER(TRIM(e.proveedor)) LIMIT 1);
    `);
    await client.query(`ALTER TABLE gh_activos_eventos DROP COLUMN IF EXISTS proveedor, DROP COLUMN IF EXISTS estado_resultante`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_activos_evt_fecha ON gh_activos_eventos (fecha)`);

    // ── Mensajería ──
    const MAP = `CASE %s WHEN 'PENDIENTE' THEN 'EST-03' WHEN 'ASIGNADO' THEN 'EST-10' WHEN 'EN_CAMINO' THEN 'EST-11'
                 WHEN 'ENTREGADO' THEN 'EST-12' WHEN 'DEVUELTO' THEN 'EST-13' WHEN 'FALLIDO' THEN 'EST-28'
                 WHEN 'CANCELADO' THEN 'EST-29' END`;

    await client.query(`ALTER TABLE gh_mensajeria_envios ADD COLUMN IF NOT EXISTS estado_id TEXT REFERENCES estados(id)`);
    await client.query(`UPDATE gh_mensajeria_envios SET estado_id = ${MAP.replace('%s', 'estado')} WHERE estado_id IS NULL`);
    await client.query(`ALTER TABLE gh_mensajeria_envios DROP CONSTRAINT IF EXISTS chk_gh_msj_estado`);
    await client.query(`ALTER TABLE gh_mensajeria_envios DROP COLUMN IF EXISTS estado`);
    await client.query(`ALTER TABLE gh_mensajeria_envios ALTER COLUMN estado_id SET DEFAULT 'EST-03', ALTER COLUMN estado_id SET NOT NULL`);
    await client.query(`
      ALTER TABLE gh_mensajeria_envios ADD CONSTRAINT chk_gh_msj_estado_id
        CHECK (estado_id IN ('EST-03','EST-10','EST-11','EST-12','EST-13','EST-28','EST-29'))
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_estado_id ON gh_mensajeria_envios (estado_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_msj_mensajero_estado ON gh_mensajeria_envios (mensajero_id, estado_id)`);

    await client.query(`
      ALTER TABLE gh_mensajeria_eventos
        ADD COLUMN IF NOT EXISTS estado_anterior_id TEXT REFERENCES estados(id),
        ADD COLUMN IF NOT EXISTS estado_nuevo_id TEXT REFERENCES estados(id);
    `);
    await client.query(`
      UPDATE gh_mensajeria_eventos SET
        estado_anterior_id = ${MAP.replace('%s', 'estado_anterior')},
        estado_nuevo_id = ${MAP.replace('%s', 'estado_nuevo')}
      WHERE estado_nuevo_id IS NULL;
    `);
    await client.query(`ALTER TABLE gh_mensajeria_eventos DROP COLUMN IF EXISTS estado_anterior, DROP COLUMN IF EXISTS estado_nuevo`);
    await client.query(`ALTER TABLE gh_mensajeria_eventos ALTER COLUMN estado_nuevo_id SET NOT NULL`);
  }
};
