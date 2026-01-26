
import dotenv from 'dotenv';

dotenv.config();

console.log('[M7-SYSTEM] Modo Tiempo Real Activo (Sin Persistencia DB)');

// Mock del pool para que los controladores no rompan pero no conecten a nada
const pool = {
  query: async (...args: any[]) => ({ rows: [] }),
  connect: async () => ({ 
    query: async (...args: any[]) => {}, 
    release: () => {} 
  })
};

export default pool;
