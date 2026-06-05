
import { User } from '../types';

/**
 * Mapa Maestro de Seguridad para Milla 7
 * Vincula nombres de módulos descriptivos con sus IDs de página técnicos (PAG-XX)
 */
export const ID_MAP: Record<string, string> = {
  'ARTICULOS': 'PAG-01',
  'CLIENTES': 'PAG-03',
  'VEHICULOS': 'PAG-14',
  'CONDUCTORES': 'PAG-14', // Ambos caen en Gestión de Flotas
  'USUARIOS': 'PAG-21',
  'ROLES': 'PAG-22',
  'ASIGNACIONES': 'PAG-12',
  'DESPACHO_L': 'PAG-13',
  'DOCUMENTOS_L': 'PAG-16',
  'RECIBIDO_MATERIAL': 'PAG-17', // [M7-FIX] Mapeo crítico para visibilidad multi-usuario
  'RECIBIDO_MANUAL': 'PAG-30',
  'RUTAS': 'PAG-15',
  'DASHBOARD': 'PAG-25',
  'NOTIFICACIONES': 'PAG-07',
  'WHATSAPP': 'PAG-18',
  'MATRIZ_ROLES': 'PAG-23',
  'MATRIZ_PERMISOS': 'PAG-24',
  'PERSONAL_GH': 'PAG-43',
  'VISITAS_GH': 'PAG-44',
  'MISCELANEOS_GH': 'PAG-41',
  'ENTREGAS_SALIDAS_GH': 'PAG-52',
  'ASIGNACION_DEVOLUCION_GH': 'PAG-53',
  'CONSULTA_INVENTARIO_GH': 'PAG-54',
  'MASTER_INVENTARIO_GH': 'PAG-55',
  'INVENTARIO_FISICO_GH': 'PAG-56',
  'CONSULTA_FACTURAS': 'PAG-37',
  'CONCILIACION': 'PAG-40',
  'CAPACITACIONES': 'CAPACITACIONES' // Nombre directo por ahora
};

/**
 * Valida si un usuario tiene un permiso específico.
 * Soporta validación por nombre de módulo o por ID técnico.
 * Es extremadamente robusto contra diferentes formas de datos (Array vs Object).
 */
export const hasPermission = (user: User | null | any, moduleName: string, action: string = 'view'): boolean => {
  if (!user) return false;

  // Los Super Administradores tienen acceso total
  const isSuper = user.roleId === 'ROL-01' || user.role_id === 'ROL-01' || user.email === 'admin@millasiete.com';
  if (isSuper) return true;

  const pageId = ID_MAP[moduleName];
  
  // Normalizar permisos a un array de objetos { module, actions }
  let userPerms: any[] = [];
  if (Array.isArray(user.permissions)) {
    userPerms = user.permissions;
  } else if (user.permissions && typeof user.permissions === 'object') {
    userPerms = Object.entries(user.permissions).map(([mod, pacts]) => ({
      module: mod,
      actions: Array.isArray(pacts) ? pacts : []
    }));
  }

  const targetMod = String(moduleName).toUpperCase();
  const targetPage = pageId ? String(pageId).toUpperCase() : null;

  return userPerms.some((p: any) => {
    if (!p || !p.module) return false;
    const mod = String(p.module).toUpperCase();
    const actions = Array.isArray(p.actions) ? p.actions : [];

    return (mod === targetMod || (targetPage && mod === targetPage)) && 
           actions.includes(action);
  });
};

