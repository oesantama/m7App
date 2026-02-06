
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica'
});

const cleanData = async () => {
    try {
        console.log('Iniciando limpieza de tablas de logística...');
        await pool.query('TRUNCATE TABLE document_consolidated_items, document_items, documents_l CASCADE;');
        console.log('Tablas documents_l, document_items y document_consolidated_items vaciadas exitosamente.');
    } catch (error) {
        console.error('Error al limpiar tablas:', error);
    } finally {
        await pool.end();
    }
};

cleanData();
