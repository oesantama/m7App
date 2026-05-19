import { Pool } from 'pg';
import fs from 'fs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://m7_admin:m7_master_password@postgres:5432/m7_logistica',
  ssl: false,
});

async function main() {
  const client = await pool.connect();
  let sqlContent = `-- =========================================================\n`;
  sqlContent += `-- SCRIPT DE MIGRACIÓN DE DATOS HISTÓRICOS DE DOTACIONES (PRODUCCIÓN)\n`;
  sqlContent += `-- Generado automáticamente: ${new Date().toISOString()}\n`;
  sqlContent += `-- =========================================================\n\n`;

  sqlContent += `BEGIN;\n\n`;
  
  sqlContent += `-- --- ADAPTAR ESTRUCTURA DE TABLA PERSONAL ---\n`;
  sqlContent += `ALTER TABLE gh_personal ADD COLUMN IF NOT EXISTS placa VARCHAR(50);\n`;
  sqlContent += `ALTER TABLE gh_personal ADD COLUMN IF NOT EXISTS operacion VARCHAR(255);\n\n`;

  try {
    // 1. Cargos
    console.log('Exporting cargos...');
    const cargos = await client.query("SELECT * FROM gh_cargos WHERE usuario_control = 'Migración'");
    sqlContent += `-- --- CARGOS ---\n`;
    for (const row of cargos.rows) {
      sqlContent += `INSERT INTO gh_cargos (nombre, estado, usuario_control, fecha_control) \n`;
      sqlContent += `VALUES (${escape(row.nombre)}, ${escape(row.estado)}, 'Migración', ${escapeDate(row.fecha_control)}) \n`;
      sqlContent += `ON CONFLICT (nombre) DO NOTHING;\n\n`;
    }

    // 2. Personal
    console.log('Exporting personal...');
    const personal = await client.query(`
      SELECT DISTINCT p.* FROM gh_personal p
      WHERE p.usuario_control = 'Migración'
         OR p.id IN (
           SELECT personal_id FROM gh_asignaciones_personal 
           WHERE observaciones LIKE 'Migrado%' OR observaciones LIKE 'Asignación%'
         )
         OR p.id IN (
           SELECT personal_id FROM gh_devoluciones_personal 
           WHERE motivo LIKE 'Migrado%' OR motivo LIKE 'Devolución%'
         )
    `);
    sqlContent += `-- --- PERSONAL ---\n`;
    for (const row of personal.rows) {
      const cargoExpr = escape(row.cargo);
      const operacionExpr = escape(row.operacion);
        
      const estadoExpr = row.estado?.toUpperCase() === 'ACTIVO' || row.estado === 'EST-01' ? "'EST-01'" : "'EST-02'";

      sqlContent += `INSERT INTO gh_personal (nombre, cedula, cargo, placa, operacion, estado, usuario_control, fecha_control) \n`;
      sqlContent += `VALUES (${escape(row.nombre)}, ${escape(row.cedula)}, ${cargoExpr}, ${escape(row.placa)}, ${operacionExpr}, ${estadoExpr}, 'Migración', ${escapeDate(row.fecha_control)}) \n`;
      sqlContent += `ON CONFLICT (cedula) DO UPDATE SET \n`;
      sqlContent += `  nombre = EXCLUDED.nombre,\n`;
      sqlContent += `  cargo = COALESCE(EXCLUDED.cargo, gh_personal.cargo),\n`;
      sqlContent += `  placa = COALESCE(EXCLUDED.placa, gh_personal.placa),\n`;
      sqlContent += `  operacion = COALESCE(EXCLUDED.operacion, gh_personal.operacion),\n`;
      sqlContent += `  estado = COALESCE(EXCLUDED.estado, gh_personal.estado);\n\n`;
    }

    // 3. Elementos
    console.log('Exporting elementos...');
    const elementos = await client.query(`
      SELECT DISTINCT e.* FROM gh_elementos e
      WHERE e.usuario_control = 'Migración'
         OR e.id IN (
           SELECT elemento_id FROM gh_asignaciones_personal_detalle
           WHERE asignacion_id IN (
             SELECT id FROM gh_asignaciones_personal 
             WHERE observaciones LIKE 'Migrado%' OR observaciones LIKE 'Asignación%'
           )
         )
         OR e.id IN (
           SELECT elemento_id FROM gh_devoluciones_personal_detalle
           WHERE devolucion_id IN (
             SELECT id FROM gh_devoluciones_personal 
             WHERE motivo LIKE 'Migrado%' OR motivo LIKE 'Devolución%'
           )
         )
    `);
    sqlContent += `-- --- ELEMENTOS ---\n`;
    for (const row of elementos.rows) {
      // Get the type name from gh_tipos_elementos
      const typeRes = await client.query("SELECT nombre FROM gh_tipos_elementos WHERE id = $1", [row.tipo_id]);
      const typeName = typeRes.rows[0]?.nombre || '';
      
      let tipoIdExpr = String(row.tipo_id || 'NULL');
      if (typeName) {
        tipoIdExpr = `COALESCE(
          (SELECT id FROM gh_tipos_elementos WHERE UPPER(nombre) = ${escape(typeName.toUpperCase())} LIMIT 1),
          (SELECT id FROM gh_tipos_elementos WHERE UPPER(nombre) LIKE ${escape('%' + typeName.toUpperCase() + '%')} LIMIT 1),
          ${row.tipo_id}
        )`;
      }

      sqlContent += `INSERT INTO gh_elementos (nombre, tipo_id, estado_id, usuario_control, fecha_control, es_serializado) \n`;
      sqlContent += `VALUES (${escape(row.nombre)}, ${tipoIdExpr}, ${escape(row.estado_id)}, 'Migración', ${escapeDate(row.fecha_control)}, ${row.es_serializado ? 'true' : 'false'}) \n`;
      sqlContent += `ON CONFLICT (nombre) DO NOTHING;\n\n`;
    }
 
    // 3.5 Entradas
    console.log('Exporting entradas...');
    const entradas = await client.query("SELECT * FROM gh_entradas_bodega WHERE observaciones LIKE 'Migrado%'");
    sqlContent += `-- --- ENTRADAS A BODEGA ---\n`;
    for (const row of entradas.rows) {
      sqlContent += `INSERT INTO gh_entradas_bodega (numero_factura, fecha, observaciones, usuario_control, fecha_control, proveedor) \n`;
      sqlContent += `SELECT \n`;
      sqlContent += `  ${escape(row.numero_factura)},\n`;
      sqlContent += `  ${escapeDate(row.fecha)},\n`;
      sqlContent += `  ${escape(row.observaciones)},\n`;
      sqlContent += `  ${escape(row.usuario_control)},\n`;
      sqlContent += `  ${escapeDate(row.fecha_control)},\n`;
      sqlContent += `  ${escape(row.proveedor)}\n`;
      sqlContent += `WHERE NOT EXISTS (\n`;
      sqlContent += `  SELECT 1 FROM gh_entradas_bodega WHERE numero_factura = ${escape(row.numero_factura)}\n`;
      sqlContent += `);\n\n`;

      // Details
      const details = await client.query("SELECT * FROM gh_entradas_bodega_detalle WHERE entrada_id = $1", [row.id]);
      for (const det of details.rows) {
        const elemRes = await client.query("SELECT nombre FROM gh_elementos WHERE id = $1", [det.elemento_id]);
        const elemNombre = elemRes.rows[0]?.nombre;
        if (!elemNombre) continue;

        sqlContent += `INSERT INTO gh_entradas_bodega_detalle (entrada_id, elemento_id, cantidad, valor_unitario) \n`;
        sqlContent += `SELECT \n`;
        sqlContent += `  (SELECT id FROM gh_entradas_bodega WHERE numero_factura = ${escape(row.numero_factura)}),\n`;
        sqlContent += `  (SELECT id FROM gh_elementos WHERE nombre = ${escape(elemNombre)}),\n`;
        sqlContent += `  ${det.cantidad},\n`;
        sqlContent += `  ${det.valor_unitario}\n`;
        sqlContent += `WHERE NOT EXISTS (\n`;
        sqlContent += `  SELECT 1 FROM gh_entradas_bodega_detalle \n`;
        sqlContent += `  WHERE entrada_id = (SELECT id FROM gh_entradas_bodega WHERE numero_factura = ${escape(row.numero_factura)})\n`;
        sqlContent += `    AND elemento_id = (SELECT id FROM gh_elementos WHERE nombre = ${escape(elemNombre)})\n`;
        sqlContent += `);\n\n`;
      }
    }

    // Cache maps of personal (cedula -> select subquery) and elements (nombre -> select subquery)
    // to build ID-safe detail and header insertions.
    
    // 4. Asignaciones
    console.log('Exporting asignaciones...');
    const asignaciones = await client.query("SELECT * FROM gh_asignaciones_personal WHERE observaciones LIKE 'Migrado%' OR observaciones LIKE 'Asignación%'");
    sqlContent += `-- --- ASIGNACIONES ---\n`;
    for (const row of asignaciones.rows) {
      // Get personal cedula
      const persRes = await client.query("SELECT cedula FROM gh_personal WHERE id = $1", [row.personal_id]);
      const cedula = persRes.rows[0]?.cedula;
      if (!cedula) continue;

      sqlContent += `INSERT INTO gh_asignaciones_personal (numero_asignacion, personal_id, autorizado_por, fecha, observaciones, usuario_control, fecha_control) \n`;
      sqlContent += `VALUES (\n`;
      sqlContent += `  ${escape(row.numero_asignacion)},\n`;
      sqlContent += `  (SELECT id FROM gh_personal WHERE cedula = ${escape(cedula)}),\n`;
      sqlContent += `  ${escape(row.autorizado_por)},\n`;
      sqlContent += `  ${escapeDate(row.fecha)},\n`;
      sqlContent += `  ${escape(row.observaciones)},\n`;
      sqlContent += `  'Migración',\n`;
      sqlContent += `  ${escapeDate(row.fecha_control)}\n`;
      sqlContent += `) ON CONFLICT (numero_asignacion) DO NOTHING;\n\n`;

      // Details
      const details = await client.query("SELECT * FROM gh_asignaciones_personal_detalle WHERE asignacion_id = $1", [row.id]);
      for (const det of details.rows) {
        const elemRes = await client.query("SELECT nombre FROM gh_elementos WHERE id = $1", [det.elemento_id]);
        const elemNombre = elemRes.rows[0]?.nombre;
        if (!elemNombre) continue;

        sqlContent += `INSERT INTO gh_asignaciones_personal_detalle (asignacion_id, elemento_id, cantidad) \n`;
        sqlContent += `SELECT \n`;
        sqlContent += `  (SELECT id FROM gh_asignaciones_personal WHERE numero_asignacion = ${escape(row.numero_asignacion)}),\n`;
        sqlContent += `  (SELECT id FROM gh_elementos WHERE nombre = ${escape(elemNombre)}),\n`;
        sqlContent += `  ${det.cantidad}\n`;
        sqlContent += `WHERE NOT EXISTS (\n`;
        sqlContent += `  SELECT 1 FROM gh_asignaciones_personal_detalle \n`;
        sqlContent += `  WHERE asignacion_id = (SELECT id FROM gh_asignaciones_personal WHERE numero_asignacion = ${escape(row.numero_asignacion)})\n`;
        sqlContent += `    AND elemento_id = (SELECT id FROM gh_elementos WHERE nombre = ${escape(elemNombre)})\n`;
        sqlContent += `);\n\n`;
      }
    }

    // 5. Devoluciones
    console.log('Exporting devoluciones...');
    const devoluciones = await client.query("SELECT * FROM gh_devoluciones_personal WHERE motivo LIKE 'Migrado%' OR motivo LIKE 'Devolución%'");
    sqlContent += `-- --- DEVOLUCIONES ---\n`;
    for (const row of devoluciones.rows) {
      // Get personal cedula
      const persRes = await client.query("SELECT cedula FROM gh_personal WHERE id = $1", [row.personal_id]);
      const cedula = persRes.rows[0]?.cedula;
      if (!cedula) continue;

      sqlContent += `INSERT INTO gh_devoluciones_personal (numero_devolucion, personal_id, motivo, fecha, usuario_control, fecha_control) \n`;
      sqlContent += `VALUES (\n`;
      sqlContent += `  ${escape(row.numero_devolucion)},\n`;
      sqlContent += `  (SELECT id FROM gh_personal WHERE cedula = ${escape(cedula)}),\n`;
      sqlContent += `  ${escape(row.motivo)},\n`;
      sqlContent += `  ${escapeDate(row.fecha)},\n`;
      sqlContent += `  'Migración',\n`;
      sqlContent += `  ${escapeDate(row.fecha_control)}\n`;
      sqlContent += `) ON CONFLICT (numero_devolucion) DO NOTHING;\n\n`;

      // Details
      const details = await client.query("SELECT * FROM gh_devoluciones_personal_detalle WHERE devolucion_id = $1", [row.id]);
      for (const det of details.rows) {
        const elemRes = await client.query("SELECT nombre FROM gh_elementos WHERE id = $1", [det.elemento_id]);
        const elemNombre = elemRes.rows[0]?.nombre;
        if (!elemNombre) continue;

        sqlContent += `INSERT INTO gh_devoluciones_personal_detalle (devolucion_id, elemento_id, cantidad) \n`;
        sqlContent += `SELECT \n`;
        sqlContent += `  (SELECT id FROM gh_devoluciones_personal WHERE numero_devolucion = ${escape(row.numero_devolucion)}),\n`;
        sqlContent += `  (SELECT id FROM gh_elementos WHERE nombre = ${escape(elemNombre)}),\n`;
        sqlContent += `  ${det.cantidad}\n`;
        sqlContent += `WHERE NOT EXISTS (\n`;
        sqlContent += `  SELECT 1 FROM gh_devoluciones_personal_detalle \n`;
        sqlContent += `  WHERE devolucion_id = (SELECT id FROM gh_devoluciones_personal WHERE numero_devolucion = ${escape(row.numero_devolucion)})\n`;
        sqlContent += `    AND elemento_id = (SELECT id FROM gh_elementos WHERE nombre = ${escape(elemNombre)})\n`;
        sqlContent += `);\n\n`;
      }
    }

    // 6. Recalcular gh_inventario_elemento y gh_inventario_personal al final para asegurar consistencia
    sqlContent += `-- --- RECONSTRUCCIÓN DE INVENTARIO BODEGA ---\n`;
    sqlContent += `DELETE FROM gh_inventario_elemento;\n\n`;
    sqlContent += `INSERT INTO gh_inventario_elemento (elemento_id, stock, fecha_actualizacion)\n`;
    sqlContent += `SELECT elemento_id, GREATEST(0, SUM(cantidad)) as stock, CURRENT_TIMESTAMP\n`;
    sqlContent += `FROM (\n`;
    sqlContent += `  SELECT elemento_id, cantidad FROM gh_entradas_bodega_detalle\n`;
    sqlContent += `  UNION ALL\n`;
    sqlContent += `  SELECT elemento_id, -cantidad FROM gh_asignaciones_personal_detalle\n`;
    sqlContent += `  UNION ALL\n`;
    sqlContent += `  SELECT elemento_id, cantidad FROM gh_devoluciones_personal_detalle\n`;
    sqlContent += `  UNION ALL\n`;
    sqlContent += `  SELECT elemento_id, -cantidad FROM gh_salidas_proveedor_detalle\n`;
    sqlContent += `) t\n`;
    sqlContent += `GROUP BY elemento_id;\n\n`;

    sqlContent += `-- --- RECONSTRUCCIÓN DE INVENTARIO PERSONAL ---\n`;
    sqlContent += `DELETE FROM gh_inventario_personal;\n\n`;
    sqlContent += `INSERT INTO gh_inventario_personal (personal_id, elemento_id, stock, fecha_actualizacion)\n`;
    sqlContent += `SELECT p_inv.personal_id, p_inv.elemento_id, SUM(p_inv.stock) as stock, CURRENT_TIMESTAMP\n`;
    sqlContent += `FROM (\n`;
    sqlContent += `  SELECT a.personal_id, d.elemento_id, SUM(d.cantidad) AS stock\n`;
    sqlContent += `  FROM gh_asignaciones_personal_detalle d\n`;
    sqlContent += `  JOIN gh_asignaciones_personal a ON d.asignacion_id = a.id\n`;
    sqlContent += `  GROUP BY a.personal_id, d.elemento_id\n`;
    sqlContent += `  UNION ALL\n`;
    sqlContent += `  SELECT r.personal_id, d.elemento_id, -SUM(d.cantidad) AS stock\n`;
    sqlContent += `  FROM gh_devoluciones_personal_detalle d\n`;
    sqlContent += `  JOIN gh_devoluciones_personal r ON d.devolucion_id = r.id\n`;
    sqlContent += `  GROUP BY r.personal_id, d.elemento_id\n`;
    sqlContent += `) p_inv\n`;
    sqlContent += `GROUP BY p_inv.personal_id, p_inv.elemento_id\n`;
    sqlContent += `HAVING SUM(p_inv.stock) > 0;\n\n`;

    sqlContent += `COMMIT;\n`;

    fs.writeFileSync('backend/scripts/MIGRACION_DOTACIONES_PROD.sql', sqlContent);
    console.log('SQL Migration script generated successfully!');
  } catch (err) {
    console.error('Error generating migration script:', err);
    sqlContent += `ROLLBACK;\n`;
  } finally {
    client.release();
    await pool.end();
  }
}

function escape(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escapeDate(val: any): string {
  if (val === null || val === undefined) return 'CURRENT_TIMESTAMP';
  return `'${new Date(val).toISOString()}'`;
}

main();
