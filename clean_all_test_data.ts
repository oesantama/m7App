
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://m7_admin:m7_master_password@postgres:5432/m7_logistica'
});

const cleanData = async () => {
    try {
        console.log('Iniciando limpieza COMPLETA de datos de prueba...');
        
        // 1. Limpiar Dependencias (Rutas y Logs)
        await pool.query('TRUNCATE TABLE route_modifications_log, routes CASCADE;');
        console.log('✔ Tabla Rutas y Logs limpiada.');

        // 2. Limpiar Documentos e Items
        await pool.query('TRUNCATE TABLE document_consolidated_items, document_items, documents_l CASCADE;');
        console.log('✔ Tablas de Documentos (Consolidado, Detalle, Header) limpiadas.');

        console.log('--- Limpieza Finalizada Exitosamente ---');
    } catch (error) {
        console.error('Error al limpiar tablas:', error);
    } finally {
        await pool.end();
    }
};

cleanData();
