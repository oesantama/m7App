/**
 * Milla 7 - Utilidades de Normalización de Datos
 * Maneja la robustez de los datos provenientes de Postgres (Docker/Coolify).
 */

export const normalizeData = (data: any) => {
  if (!Array.isArray(data)) return [];
  
  return data.map(item => {
    // Robustez absoluta para campos Postgres (mapeo de snake_case a camelCase)
    const getVal = (primary: string, secondary: string) => {
      const keys = Object.keys(item);
      const findKey = (k: string) => keys.find(key => key.toLowerCase() === k.toLowerCase());
      
      const key = findKey(primary) || findKey(secondary) || primary || secondary;
      return (item[key] !== undefined && item[key] !== null) ? item[key] : undefined;
    };

    const parseDate = (val: any) => {
      if (!val) return undefined;
      if (typeof val === 'string') {
        // Postgres format: space instead of T
        if (val.includes(' ') && !val.includes('T')) return val.replace(' ', 'T');
      }
      return val;
    };

    return {
      ...item,
      id: getVal('id', 'id'),
      statusId: getVal('statusId', 'status_id'),
      moduleId: getVal('moduleId', 'module_id'),
      iconClass: getVal('iconClass', 'icon_class'),
      roleId: getVal('roleId', 'role_id'),
      // Auditoría Normalizada
      createdAt: parseDate(getVal('createdAt', 'created_at')),
      updatedAt: parseDate(getVal('updatedAt', 'updated_at')),
      createdBy: getVal('createdBy', 'created_by'),
      updatedBy: getVal('updatedBy', 'updated_by'),
      // Sistema
      notificationEmail: getVal('notificationEmail', 'notification_email'),
      tipoNotificacionId: getVal('tipoNotificacionId', 'tipo_notificacion_id'),
      logoUrl: getVal('logoUrl', 'logo_url'),
      imageUrl: getVal('imageUrl', 'image_url')
    };
  });
};
