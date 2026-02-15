import { MasterCategory } from '../types';

/**
 * Mapea rutas de páginas a categorías maestras
 * Este mapeo reemplaza la columna module_id eliminada
 */
export const ROUTE_TO_MASTER_CATEGORY: Record<string, MasterCategory> = {
  // Estados y maestros básicos
  // Mapeo por ID de Página (Normalizados en m7app Docker)
  // Mapeo por ID de Página (Normalizados en m7app Docker - PAG-XX)
  // Mapeo dinámico por Ruta (Configurado en la DB)
  'masterArticulo': 'masterArticulo',
  'masterCategorias': 'masterCategorias',
  'masterClientes': 'masterClientes',
  'masterMarcas': 'masterMarcas',
  'masterUsuarios': 'masterUsuarios',
  'masterRol': 'masterRol',
  'masterEstados': 'masterEstados',
  'masterPermisosRol': 'masterPermisosRol',
  'masterPermisosUsuario': 'masterPermisosUsuario',
  'masterNotificaciones': 'masterNotificaciones',
  'masterTiposVehiculo': 'masterTiposVehiculo',
  'masterUnidadMedida': 'masterUnidadMedida',
  'masterTipoDocumento': 'masterTipoDocumento',
  'masterTipoNotificacion': 'masterTipoNotificacion',
  'modules': 'modules',
  'pages': 'pages',
  'masterPaginas': 'pages',
};

/**
 * Obtiene la categoría maestra basada en el ID o ruta de la página
 */
export const getMasterCategoryFromRoute = (route: string | undefined, id?: string): MasterCategory | '' => {
  // Intentar primero por ID para evitar colisiones
  if (id && ROUTE_TO_MASTER_CATEGORY[id]) return ROUTE_TO_MASTER_CATEGORY[id];
  
  // Intentar por ruta
  if (route && ROUTE_TO_MASTER_CATEGORY[route]) return ROUTE_TO_MASTER_CATEGORY[route];
  
  return '';
};
