import { execSync } from 'child_process';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://m7_admin:m7_master_password@localhost:5433/m7_logistica',
  ssl: false,
});

// Helper to run query on SQL Server via podman and parse output
function runSqlServerQuery(query) {
  const escapedQuery = query.replace(/"/g, '\\"');
  const cmd = `podman exec mssql_temp /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Milla7_Migration2026!' -C -Q "${escapedQuery}" -s "|" -W`;
  
  try {
    const rawOutput = execSync(cmd, { maxBuffer: 1024 * 1024 * 50 }).toString();
    const lines = rawOutput.split('\n')
      .map(line => line.trim())
      .filter(line => {
        if (!line) return false;
        if (line.startsWith("Changed database context to")) return false;
        if (line.includes("rows affected)")) return false;
        if (line.includes("------")) return false;
        return true;
      });

    if (lines.length < 2) return [];

    const headers = lines[0].split('|').map(h => h.trim().toLowerCase());
    const dataRows = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('|').map(p => p.trim());
      if (parts.length < headers.length) continue;
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = parts[idx];
      });
      dataRows.push(row);
    }
    return dataRows;
  } catch (error) {
    console.error('SQL Server query execution failed for:', query, error.message);
    throw error;
  }
}

async function runMigration() {
  const pgClient = await pool.connect();
  try {
    console.log('=== STARTING DOTACIONES HISTORY MIGRATION ===');
    
    // --- STEP 1: MIGRATE/VALIDATE CARGOS ---
    console.log('Fetching distinct cargos from SQL Server...');
    const legacyCargos = runSqlServerQuery("USE Dotaciones; SELECT DISTINCT Cargo FROM Inventario_Empleados WHERE Cargo IS NOT NULL;");
    console.log(`Found ${legacyCargos.length} cargo rows in SQL Server.`);

    for (const cargoRow of legacyCargos) {
      const rawCargo = cargoRow.cargo;
      if (!rawCargo) continue;
      const cargoName = rawCargo.trim().toUpperCase();
      if (!cargoName || cargoName === 'NULL') continue;

      // Check if exists in pg
      const check = await pgClient.query('SELECT id FROM gh_cargos WHERE UPPER(nombre) = $1', [cargoName]);
      if (check.rows.length === 0) {
        await pgClient.query("INSERT INTO gh_cargos (nombre, estado, usuario_control) VALUES ($1, 'EST-01', 'Migración')", [cargoName]);
        console.log(`Inserted cargo: ${cargoName}`);
      }
    }

    // Cache cargos by name
    const pgCargosRes = await pgClient.query('SELECT id, nombre FROM gh_cargos');
    const cargosMap = new Map(); // UPPER(nombre) -> id
    pgCargosRes.rows.forEach(c => {
      cargosMap.set(c.nombre.trim().toUpperCase(), c.id);
    });

    // --- STEP 2: MIGRATE/UPDATE PERSONAL ---
    console.log('Fetching personal from SQL Server...');
    const legacyPersonal = runSqlServerQuery("USE Dotaciones; SELECT Nombre, Identificacion, Cargo, Placa, Operacion FROM Inventario_Empleados;");
    console.log(`Found ${legacyPersonal.length} personal rows in SQL Server.`);

    for (const p of legacyPersonal) {
      const nombre = p.nombre ? p.nombre.trim() : null;
      const identificacion = p.identificacion ? p.identificacion.trim() : null;
      const cargoNameRaw = p.cargo && p.cargo !== 'NULL' ? p.cargo.trim().toUpperCase() : null;
      const placa = p.placa && p.placa !== 'NULL' ? p.placa.trim() : null;
      const operacionRaw = p.operacion && p.operacion !== 'NULL' ? p.operacion.trim() : null;

      if (!identificacion || !nombre || identificacion === 'NULL') continue;

      // 1. Ensure the cargo exists in the master gh_cargos table
      if (cargoNameRaw) {
        let cargoId = cargosMap.get(cargoNameRaw);
        if (!cargoId) {
          const res = await pgClient.query("INSERT INTO gh_cargos (nombre, estado, usuario_control) VALUES ($1, 'EST-01', 'Migración') RETURNING id", [cargoNameRaw]);
          cargoId = res.rows[0].id;
          cargosMap.set(cargoNameRaw, cargoId);
        }
      }

      // Check if exists in pg
      const check = await pgClient.query('SELECT id FROM gh_personal WHERE cedula = $1', [identificacion]);
      if (check.rows.length > 0) {
        const originalId = check.rows[0].id;
        // Update person info (placa, operacion, and optionally name/cargo if null)
        await pgClient.query(`
          UPDATE gh_personal 
          SET nombre = COALESCE($1, nombre), 
              cargo = COALESCE($2, cargo), 
              placa = $3, 
              operacion = $4, 
              usuario_control = 'Migración' 
          WHERE id = $5
        `, [nombre, cargoNameRaw, placa, operacionRaw, originalId]);
      } else {
        // Insert new personal
        await pgClient.query(`
          INSERT INTO gh_personal (nombre, cedula, cargo, placa, operacion, estado, usuario_control)
          VALUES ($1, $2, $3, $4, $5, 'EST-01', 'Migración')
        `, [nombre, identificacion, cargoNameRaw, placa, operacionRaw]);
        console.log(`Inserted new personal: ${nombre} (${identificacion})`);
      }
    }

    // Cache pg personal IDs by cedula for quick lookup
    const pgPersRes = await pgClient.query('SELECT id, cedula FROM gh_personal');
    const personalMap = new Map(); // cedula -> id
    pgPersRes.rows.forEach(row => {
      personalMap.set(row.cedula.trim(), row.id);
    });

    // --- STEP 3: MIGRATE REFERENCES/ELEMENTS ---
    console.log('Fetching references from SQL Server...');
    const legacyRefs = runSqlServerQuery("USE Dotaciones; SELECT CodigoReferencia, NombreReferencia FROM Referencias;");
    console.log(`Found ${legacyRefs.length} reference rows in SQL Server.`);

    for (const ref of legacyRefs) {
      const codigo = ref.codigoreferencia ? ref.codigoreferencia.trim() : null;
      const refName = ref.nombrereferencia ? ref.nombrereferencia.trim() : null;

      if (!refName || refName === 'NULL') continue;

      // Check if exists in pg
      const check = await pgClient.query('SELECT id FROM gh_elementos WHERE nombre = $1', [refName]);
      if (check.rows.length === 0) {
        // Insert under Dotation type (id 3 is DOTACION)
        await pgClient.query("INSERT INTO gh_elementos (nombre, tipo_id, estado_id, usuario_control) VALUES ($1, 3, 'EST-01', 'Migración')", [refName]);
        console.log(`Inserted reference: ${refName}`);
      }
    }

    // Cache elements by name for quick lookup
    const pgElRes = await pgClient.query('SELECT id, nombre FROM gh_elementos');
    const elementMap = new Map(); // name -> id
    pgElRes.rows.forEach(row => {
      elementMap.set(row.nombre.toLowerCase().trim(), row.id);
    });

    // Also get reference map from legacy references (CodigoReferencia -> NombreReferencia) to resolve detail codes
    const refCodeToName = new Map();
    legacyRefs.forEach(ref => {
      const code = ref.codigoreferencia ? ref.codigoreferencia.trim().toLowerCase() : null;
      const name = ref.nombrereferencia ? ref.nombrereferencia.trim().toLowerCase() : null;
      if (code && name) {
        refCodeToName.set(code, name);
      }
    });

    // --- STEP 4: MIGRATE ENTRADAS A BODEGA ---
    console.log('Fetching legacy warehouse inputs (entradas) headers...');
    const legacyEntradasE = runSqlServerQuery("USE Dotaciones; SELECT Entrada, Bodega, Usuario, Fecha FROM Inventario_EntradasE;");
    console.log(`Found ${legacyEntradasE.length} warehouse input headers in SQL Server.`);

    console.log('Fetching legacy warehouse inputs details...');
    const legacyEntradasD = runSqlServerQuery("USE Dotaciones; SELECT Entrada, Referencia, Cantidad FROM Inventario_EntradasD;");
    console.log(`Found ${legacyEntradasD.length} warehouse input details in SQL Server.`);

    // Group details by Entrada
    const detailsByEntrada = new Map();
    legacyEntradasD.forEach(d => {
      const entradaId = d.entrada.trim();
      if (!detailsByEntrada.has(entradaId)) {
        detailsByEntrada.set(entradaId, []);
      }
      detailsByEntrada.get(entradaId).push(d);
    });

    for (const ent of legacyEntradasE) {
      const entrada = ent.entrada.trim();
      const bodega = ent.bodega ? ent.bodega.trim() : '00';
      const usuario = ent.usuario ? ent.usuario.trim() : 'ADMINISTRACIÓN';
      const fechaStr = ent.fecha ? ent.fecha.trim() : null;
      const fecha = fechaStr ? new Date(fechaStr) : new Date();

      const numFactura = `ENT-${entrada}`;

      // Check if exists
      const entCheck = await pgClient.query('SELECT id FROM gh_entradas_bodega WHERE numero_factura = $1', [numFactura]);
      let entId;

      if (entCheck.rows.length > 0) {
        entId = entCheck.rows[0].id;
      } else {
        const res = await pgClient.query(`
          INSERT INTO gh_entradas_bodega (numero_factura, fecha, observaciones, usuario_control, fecha_control, proveedor)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [
          numFactura,
          fecha,
          `Migrado de sistema legado (ID: ${entrada}, Bodega: ${bodega})`,
          usuario,
          fecha,
          'MIGRACIÓN HISTÓRICA'
        ]);
        entId = res.rows[0].id;
      }

      // Insert Details
      const details = detailsByEntrada.get(entrada) || [];
      for (const d of details) {
        const refCode = d.referencia ? d.referencia.trim().toLowerCase() : '';
        const refName = refCodeToName.get(refCode);
        const elementoId = refName ? elementMap.get(refName) : null;

        if (!elementoId) {
          console.warn(`Detail element ref ${d.referencia} not resolved or element not found for entrada ${entrada}`);
          continue;
        }

        const detCheck = await pgClient.query('SELECT id FROM gh_entradas_bodega_detalle WHERE entrada_id = $1 AND elemento_id = $2', [entId, elementoId]);
        if (detCheck.rows.length === 0) {
          await pgClient.query(`
            INSERT INTO gh_entradas_bodega_detalle (entrada_id, elemento_id, cantidad, valor_unitario)
            VALUES ($1, $2, $3, 0.00)
          `, [entId, elementoId, Number(d.cantidad)]);
        }
      }
    }

    // --- STEP 5: MIGRATE ASSIGNMENTS (SALIDAS) ---
    console.log('Fetching legacy assignment headers...');
    const legacySalidasE = runSqlServerQuery("USE Dotaciones; SELECT Salida, Empleado, Usuario, Fecha FROM Inventario_SalidasE;");
    console.log(`Found ${legacySalidasE.length} assignment headers in SQL Server.`);

    console.log('Fetching legacy assignment details...');
    const legacySalidasD = runSqlServerQuery("USE Dotaciones; SELECT Salida, Referencia, Cantidad FROM Inventario_SalidasD;");
    console.log(`Found ${legacySalidasD.length} assignment details in SQL Server.`);

    // Group details by Salida
    const detailsBySalida = new Map();
    legacySalidasD.forEach(d => {
      const salidaId = d.salida.trim();
      if (!detailsBySalida.has(salidaId)) {
        detailsBySalida.set(salidaId, []);
      }
      detailsBySalida.get(salidaId).push(d);
    });

    for (const s of legacySalidasE) {
      const salida = s.salida.trim();
      const empleado = s.empleado.trim();
      const usuario = s.usuario ? s.usuario.trim() : 'ADMINISTRACIÓN';
      const fechaStr = s.fecha ? s.fecha.trim() : null;
      const fecha = fechaStr ? new Date(fechaStr) : new Date();

      const targetPersonalId = personalMap.get(empleado);

      if (!targetPersonalId) {
        console.warn(`Skipping assignment ${salida}: personal with identification ${empleado} not found in PostgreSQL.`);
        continue;
      }

      const numAsig = `ASIG-${75376 + Number(salida) - 2}`; // matching existing pattern

      // Check if assignment exists
      const asigCheck = await pgClient.query('SELECT id FROM gh_asignaciones_personal WHERE numero_asignacion = $1', [numAsig]);
      let asigId;

      if (asigCheck.rows.length > 0) {
        asigId = asigCheck.rows[0].id;
      } else {
        // Insert assignment header
        const res = await pgClient.query(`
          INSERT INTO gh_asignaciones_personal (numero_asignacion, personal_id, autorizado_por, fecha, observaciones, usuario_control, fecha_control)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          numAsig, 
          targetPersonalId, 
          usuario, 
          fecha, 
          `Migrado de sistema legado (ID: ${salida})`, 
          usuario,
          fecha
        ]);
        asigId = res.rows[0].id;
      }

      // Insert/Verify details
      const details = detailsBySalida.get(salida) || [];
      for (const d of details) {
        const refCode = d.referencia ? d.referencia.trim().toLowerCase() : '';
        const refName = refCodeToName.get(refCode);
        const elementoId = refName ? elementMap.get(refName) : null;

        if (!elementoId) {
          console.warn(`Detail element ref ${d.referencia} not resolved or element not found in PostgreSQL for assignment ${salida}`);
          continue;
        }

        const detCheck = await pgClient.query('SELECT id FROM gh_asignaciones_personal_detalle WHERE asignacion_id = $1 AND elemento_id = $2', [asigId, elementoId]);
        if (detCheck.rows.length === 0) {
          await pgClient.query(`
            INSERT INTO gh_asignaciones_personal_detalle (asignacion_id, elemento_id, cantidad)
            VALUES ($1, $2, $3)
          `, [asigId, elementoId, Number(d.cantidad)]);
        }
      }
    }

    // --- STEP 6: MIGRATE RETURNS (DEVOLUCIONES) ---
    console.log('Fetching legacy return headers...');
    const legacyDevE = runSqlServerQuery("USE Dotaciones; SELECT Devolucion, Empleado, Usuario, Fecha, BodegaOrigen FROM Inventario_DevolucionesE;");
    console.log(`Found ${legacyDevE.length} return headers in SQL Server.`);

    console.log('Fetching legacy return details...');
    const legacyDevD = runSqlServerQuery("USE Dotaciones; SELECT Devolucion, Referencia, Cantidad FROM Inventario_DevolucionesD;");
    console.log(`Found ${legacyDevD.length} return details in SQL Server.`);

    // Group details by Devolucion
    const detailsByDevolucion = new Map();
    legacyDevD.forEach(d => {
      const devId = d.devolucion.trim();
      if (!detailsByDevolucion.has(devId)) {
        detailsByDevolucion.set(devId, []);
      }
      detailsByDevolucion.get(devId).push(d);
    });

    for (const dev of legacyDevE) {
      const devolucion = dev.devolucion.trim();
      const empleado = dev.empleado.trim();
      const usuario = dev.usuario ? dev.usuario.trim() : 'ADMINISTRACIÓN';
      const fechaStr = dev.fecha ? dev.fecha.trim() : null;
      const fecha = fechaStr ? new Date(fechaStr) : new Date();
      const bodegaorigen = dev.bodegaorigen ? dev.bodegaorigen.trim() : 'N/A';

      const targetPersonalId = personalMap.get(empleado);

      if (!targetPersonalId) {
        console.warn(`Skipping return ${devolucion}: personal with identification ${empleado} not found in PostgreSQL.`);
        continue;
      }

      const numDev = `DEV-${devolucion}`;

      // Check if return exists
      const devCheck = await pgClient.query('SELECT id FROM gh_devoluciones_personal WHERE numero_devolucion = $1', [numDev]);
      let devDbId;

      if (devCheck.rows.length > 0) {
        devDbId = devCheck.rows[0].id;
      } else {
        // Insert return header
        const res = await pgClient.query(`
          INSERT INTO gh_devoluciones_personal (numero_devolucion, personal_id, motivo, fecha, usuario_control, fecha_control)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [
          numDev, 
          targetPersonalId, 
          `Migrado de sistema legado (ID: ${devolucion}, Bodega: ${bodegaorigen})`, 
          fecha, 
          usuario,
          fecha
        ]);
        devDbId = res.rows[0].id;
      }

      // Insert/Verify details
      const details = detailsByDevolucion.get(devolucion) || [];
      for (const d of details) {
        const refCode = d.referencia ? d.referencia.trim().toLowerCase() : '';
        const refName = refCodeToName.get(refCode);
        const elementoId = refName ? elementMap.get(refName) : null;

        if (!elementoId) {
          console.warn(`Detail element ref ${d.referencia} not resolved or element not found in PostgreSQL for return ${devolucion}`);
          continue;
        }

        const detCheck = await pgClient.query('SELECT id FROM gh_devoluciones_personal_detalle WHERE devolucion_id = $1 AND elemento_id = $2', [devDbId, elementoId]);
        if (detCheck.rows.length === 0) {
          await pgClient.query(`
            INSERT INTO gh_devoluciones_personal_detalle (devolucion_id, elemento_id, cantidad)
            VALUES ($1, $2, $3)
          `, [devDbId, elementoId, Number(d.cantidad)]);
        }
      }
    }

    // --- STEP 7: REBUILD BODEGA & PERSONAL INVENTORIES ---
    console.log('Clearing old gh_inventario_elemento records...');
    await pgClient.query('TRUNCATE TABLE gh_inventario_elemento CASCADE');

    console.log('Rebuilding gh_inventario_elemento from all movement details...');
    await pgClient.query(`
      INSERT INTO gh_inventario_elemento (elemento_id, stock, fecha_actualizacion)
      SELECT elemento_id, GREATEST(0, SUM(cantidad)) AS stock, CURRENT_TIMESTAMP
      FROM (
        -- Entradas (+)
        SELECT elemento_id, cantidad FROM gh_entradas_bodega_detalle
        UNION ALL
        -- Asignaciones (-)
        SELECT elemento_id, -cantidad FROM gh_asignaciones_personal_detalle
        UNION ALL
        -- Devoluciones (+)
        SELECT elemento_id, cantidad FROM gh_devoluciones_personal_detalle
        UNION ALL
        -- Salidas Proveedor (-)
        SELECT elemento_id, -cantidad FROM gh_salidas_proveedor_detalle
      ) t
      GROUP BY elemento_id
    `);

    console.log('Clearing old gh_inventario_personal records...');
    await pgClient.query('TRUNCATE TABLE gh_inventario_personal CASCADE');

    console.log('Rebuilding gh_inventario_personal from all assignment and return details...');
    await pgClient.query(`
      INSERT INTO gh_inventario_personal (personal_id, elemento_id, stock, fecha_actualizacion)
      SELECT personal_id, elemento_id, SUM(cantidad) AS stock, CURRENT_TIMESTAMP
      FROM (
        -- Asignaciones (+)
        SELECT a.personal_id, d.elemento_id, d.cantidad
        FROM gh_asignaciones_personal_detalle d
        JOIN gh_asignaciones_personal a ON d.asignacion_id = a.id
        UNION ALL
        -- Devoluciones (-)
        SELECT r.personal_id, d.elemento_id, -d.cantidad
        FROM gh_devoluciones_personal_detalle d
        JOIN gh_devoluciones_personal r ON d.devolucion_id = r.id
      ) t
      GROUP BY personal_id, elemento_id
      HAVING SUM(cantidad) > 0
    `);

    console.log('=== MIGRATION COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    console.error('=== MIGRATION FAILED ===', error);
  } finally {
    pgClient.release();
    await pool.end();
  }
}

runMigration();
