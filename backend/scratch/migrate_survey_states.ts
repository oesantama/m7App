
import pool from '../config/database';

async function migrate() {
  try {
    console.log('Iniciando migración de estados de encuestas...');
    
    const resActivas = await pool.query(`
      UPDATE gh_encuestas_activas 
      SET estado = 'EST-01' 
      WHERE estado = 'ACTIVO'
    `);
    console.log(`Actualizadas ${resActivas.rowCount} encuestas a EST-01 (ACTIVO)`);

    const resCompletas = await pool.query(`
      UPDATE gh_encuestas_activas 
      SET estado = 'EST-05' 
      WHERE estado = 'COMPLETADO'
    `);
    console.log(`Actualizadas ${resCompletas.rowCount} encuestas a EST-05 (COMPLETADO)`);

    const resInactivas = await pool.query(`
      UPDATE gh_encuestas_activas 
      SET estado = 'EST-02' 
      WHERE estado = 'INACTIVO'
    `);
    console.log(`Actualizadas ${resInactivas.rowCount} encuestas a EST-02 (INACTIVO)`);

    process.exit(0);
  } catch (err) {
    console.error('Error en migración:', err);
    process.exit(1);
  }
}

migrate();
