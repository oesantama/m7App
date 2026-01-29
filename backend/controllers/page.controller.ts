
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getPages = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, route, 
        module_id AS "moduleId", 
        parent_id AS "parentId", 
        status_id AS "statusId" 
      FROM pages 
      ORDER BY name ASC
    `);
    console.log(`[DEBUG-PAGES] Query returned ${result.rows.length} rows`);
    if (result.rows.length > 0) {
        res.json(result.rows);
        return;
    }
    
    console.warn('[M7-PAGES] Sembrando datos mock (DB vacía)');
    res.json([
        // Configuración Maestros (MOD-01)
        { id: 'PAG-01', name: 'ARTÍCULOS', route: 'master', moduleId: 'masterArticulo', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-02', name: 'CATEGORÍAS ARTÍCULOS', route: 'master', moduleId: 'masterCategorias', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-03', name: 'CLIENTES', route: 'master', moduleId: 'masterClientes', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-04', name: 'ESTADOS GLOBALES', route: 'master', moduleId: 'masterEstados', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-05', name: 'MARCAS', route: 'master', moduleId: 'masterMarcas', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-06', name: 'NOTIFICACIONES', route: 'master', moduleId: 'masterNotificaciones', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-07', name: 'TIPOS DOCUMENTO', route: 'master', moduleId: 'masterTipoDocumento', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-08', name: 'TIPOS NOTIFICACIÓN', route: 'master', moduleId: 'masterTIpoNotificacion', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-09', name: 'TIPOS VEHÍCULO', route: 'master', moduleId: 'masterTiposVehiculo', parentId: 'MOD-01', statusId: 'EST-01' },
        { id: 'PAG-10', name: 'UNIDADES MEDIDA', route: 'master', moduleId: 'masterUnidadMedida', parentId: 'MOD-01', statusId: 'EST-01' },
        
        // Gestión Ajover (MOD-02)
        { id: 'PAG-11', name: 'GESTIÓN DOCUMENTOS L', route: 'documentos', moduleId: 'gestionDocumentos', parentId: 'MOD-02', statusId: 'EST-01' },
        { id: 'PAG-12', name: 'PLANEAR RUTAS', route: 'rutas', moduleId: 'planearRutas', parentId: 'MOD-02', statusId: 'EST-01' },
        { id: 'PAG-13', name: 'RECIBIDO MATERIAL', route: 'recibido', moduleId: 'recibidoMaterial', parentId: 'MOD-02', statusId: 'EST-01' },
        
        // Gestión Transporte (MOD-03)
        { id: 'PAG-14', name: 'FLOTAS & CONDUCTORES', route: 'flotas', moduleId: 'flotasConductores', parentId: 'MOD-03', statusId: 'EST-01' },
        { id: 'PAG-15', name: 'VÍNCULO OPERATIVO', route: 'vinculo', moduleId: 'vinculoOperativo', parentId: 'MOD-03', statusId: 'EST-01' },
        
        // Seguridad & Acceso (MOD-04)
        { id: 'PAG-16', name: 'MÓDULOS SISTEMA', route: 'master', moduleId: 'masterModulos', parentId: 'MOD-04', statusId: 'EST-01' },
        { id: 'PAG-17', name: 'PÁGINAS WEB', route: 'master', moduleId: 'masterPaginas', parentId: 'MOD-04', statusId: 'EST-01' },
        { id: 'PAG-18', name: 'PERMISOS POR ROL', route: 'master', moduleId: 'masterPermisosRol', parentId: 'MOD-04', statusId: 'EST-01' },
        { id: 'PAG-19', name: 'PERMISOS POR USUARIO', route: 'master', moduleId: 'masterPermisosUsuario', parentId: 'MOD-04', statusId: 'EST-01' },
        { id: 'PAG-20', name: 'ROLES DE SISTEMA', route: 'master', moduleId: 'masterRol', parentId: 'MOD-04', statusId: 'EST-01' },
        { id: 'PAG-21', name: 'USUARIOS', route: 'master', moduleId: 'masterUsuarios', parentId: 'MOD-04', statusId: 'EST-01' },
        { id: 'PAG-22', name: 'CONEXIÓN WHATSAPP', route: 'whatsapp-status', moduleId: 'masterWhatsApp', parentId: 'MOD-04', statusId: 'EST-01' }
    ]); 
  } catch (err: any) {
    console.error('[PAGES-ERROR]', err);
    res.status(500).json({ error: "Error fatal en controlador", details: err.message });
  }
};

export const savePage = async (req: Request, res: Response) => {
  const p = req.body;
  try {
    await pool.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, route = $3, module_id = $4, parent_id = $5, status_id = $6
    `, [p.id, p.name, p.route, p.moduleId, p.parentId, p.statusId]);
    res.json({ success: true, message: 'Página guardada' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar la página" });
  }
};
