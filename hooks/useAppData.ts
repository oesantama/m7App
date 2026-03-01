import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { api } from '../services/api';
import { normalizeData } from '../utils/normalize';
import { hasPermission } from '../utils/permissions';

/**
 * Hook para gestionar la sincronización global de datos de la aplicación.
 * Centraliza las llamadas a la API y la actualización del store global (Zustand).
 */
export const useAppData = () => {
  const {
    setAllMasterData,
    setIsLoading,
    setDocuments
  } = useAppStore();

  const refreshAppData = useCallback(async (forcedClientId?: string) => {
    // IMPORTANTE: Obtener el usuario directamente del store para evitar cierres (closures) obsoletos
    const currentUser = useAppStore.getState().user;
    const targetClientId = forcedClientId || currentUser?.clientId || 'CLI-01';
    
    try {
      // 1. CARGA CRÍTICA (Bloqueante para pintar el Layout/Menú)
      const [modulesRaw, pagesRaw] = await Promise.all([
        api.getModules().then(normalizeData).catch(() => []),
        api.getPages().then(normalizeData).catch(() => [])
      ]);
      
      useAppStore.setState({ 
        pages: pagesRaw, 
        modules: modulesRaw
      });

      const isSuper = (currentUser as any)?.roleId === 'ROL-01' || (currentUser as any)?.role_id === 'ROL-01' || (currentUser as any)?.email === 'admin@millasiete.com';
      const hasPerm = (mod: string) => hasPermission(currentUser, mod, 'view');


      // 3. CARGA DIFERIDA CON FILTRO DE PERMISOS
      Promise.all([
        api.getGenericMasters().then(normalizeData).catch(() => []),
        api.getCategories().then(normalizeData).catch(() => []), 
        hasPerm('ARTICULOS') ? api.getArticles().then(normalizeData).catch(() => []) : Promise.resolve([]),
        hasPerm('VEHICULOS') ? api.getVehicles().then(normalizeData).catch(() => []) : Promise.resolve([]),
        hasPerm('CONDUCTORES') ? api.getDrivers().then(normalizeData).catch(() => []) : Promise.resolve([]),
        hasPerm('USUARIOS') ? api.getUsers().then(normalizeData).catch(() => []) : Promise.resolve([]),


        isSuper ? api.getRoles().then(normalizeData).catch(() => []) : Promise.resolve([]),
        isSuper ? api.getPermissions().then(normalizeData).catch(() => []) : Promise.resolve([]),
        isSuper || hasPerm('MATRIZ_PERMISOS') ? api.getAllUserPermissions().then(normalizeData).catch(() => []) : Promise.resolve([]),
        (hasPerm('CLIENTES') || hasPerm('RUTAS')) ? api.getClients().then(normalizeData).catch(() => []) : Promise.resolve([]),
        hasPerm('ASIGNACIONES') ? api.getAssignments().then(normalizeData).catch(() => []) : Promise.resolve([]),
        hasPerm('DOCUMENTOS_L') ? api.getInvoices(targetClientId).catch(() => []) : Promise.resolve([]),
        hasPerm('RUTAS') ? api.getRoutes().catch(() => []) : Promise.resolve([]),
        api.getEstados().then(normalizeData).catch(() => []), // Maestros base (Siempre cargar)
        api.getMarcas().then(normalizeData).catch(() => []),
        api.getTiposDocumento().then(normalizeData).catch(() => []),
        api.getUnidadesMedida().then(normalizeData).catch(() => []),
        hasPerm('NOTIFICACIONES') ? api.getNotificacionesConfig().then(normalizeData).catch(() => []) : Promise.resolve([]),
        api.getTiposVehiculo().then(normalizeData).catch(() => []),
        api.getTiposNotificacion().then(normalizeData).catch(() => [])
      ]).then(([
        genericMastersRaw, categoriesRaw, articlesRaw, vehiclesRaw, driversRaw, 
        usersDataRaw, rolesDataRaw, permsDataRaw, userPermsDataRaw, clientsDataRaw, 
        assignmentsDataRaw, invoicesDataRaw, routesDataRaw, estadosRaw, marcasRaw, 
        tiposDocumentoRaw, unidadesMedidaRaw, notificacionesConfigRaw, 
        tiposVehiculoRaw, tiposNotificacionRaw
      ]) => {
        const groupedMasters: any = {};
        if (Array.isArray(genericMastersRaw)) {
          genericMastersRaw.forEach((m: any) => {
            if (!groupedMasters[m.category]) groupedMasters[m.category] = [];
            groupedMasters[m.category].push(m);
          });
        }

        const mappedArticles = normalizeData(Array.isArray(articlesRaw) ? articlesRaw.map((a: any) => ({
          ...a, statusId: a.status_id, clientId: a.client_id, imageUrl: a.image_url 
        })) : []);

        const mappedVehicles = normalizeData(Array.isArray(vehiclesRaw) ? vehiclesRaw.map((v: any) => ({
          ...v, clientId: v.client_id, statusId: v.status_id,
          status: (v.status_id === 'EST-01' || v.status === 'Disponible') ? 'Disponible' : (v.status || 'Ocupado'),
          capacityM3: parseFloat(v.capacity_m3 || '0'), modelYear: v.model_year, vehicleTypeId: v.vehicle_type
        })) : []);

        const mappedDrivers = normalizeData(Array.isArray(driversRaw) ? driversRaw.map((d: any) => ({
          ...d, status: (d.status_id === 'EST-01' || d.status_id === '1' || d.status === 'Activo') ? 'Activo' : 'Inactivo',
          documentNumber: d.document_number,
        })) : []);

        setAllMasterData({
          ...groupedMasters,
          masterCategorias: categoriesRaw,
          masterEstados: estadosRaw,
          masterMarcas: marcasRaw,
          masterTipoDocumento: tiposDocumentoRaw,
          masterUnidadMedida: unidadesMedidaRaw,
          masterNotificaciones: notificacionesConfigRaw,
          masterTiposVehiculo: tiposVehiculoRaw,
          masterTipoNotificacion: tiposNotificacionRaw,
          masterUsuarios: usersDataRaw,
          masterRol: rolesDataRaw,
          masterPermisosRol: permsDataRaw,
          masterPermisosUsuario: userPermsDataRaw,
          masterClientes: clientsDataRaw,
          masterArticulo: mappedArticles,
          masterVehiculos: mappedVehicles,
          masterConductores: mappedDrivers
        });

        useAppStore.setState({ 
          vehicles: mappedVehicles,
          drivers: mappedDrivers,
          routes: Array.isArray(routesDataRaw) ? routesDataRaw : [],
          // [M7-FIX] Normalizar snake_case → camelCase para que AssignmentManager pueda filtrar correctamente
          assignments: Array.isArray(assignmentsDataRaw) ? assignmentsDataRaw.map((a: any) => ({
            ...a,
            vehicleId: a.vehicleId || a.vehicle_id,
            driverId: a.driverId || a.driver_id,
            clientId: a.clientId || a.client_id,
            isActive: a.isActive !== undefined ? a.isActive : a.is_active,
            updatedAt: a.updatedAt || a.updated_at,
            createdAt: a.createdAt || a.created_at
          })) : [],
          invoices: Array.isArray(invoicesDataRaw) ? invoicesDataRaw : []
        });
      }).catch(err => console.error('[M7-DATA-HOOK] Error deferred sync:', err));

      // 4. CARGA DE DOCUMENTOS OPERATIVOS (Condicional)
      // [M7-FIX] Cargar también para usuarios con permiso RUTAS (planificadores)
      if (hasPerm('DOCUMENTOS_L') || hasPerm('RUTAS')) {
        api.getDocuments(targetClientId).then(docs => {
          if (Array.isArray(docs)) {
            setDocuments(docs.map(d => ({
              ...d,
              externalDocId: d.external_doc_id || d.externalDocId,
              vehicleData: d.vehicle_plate || d.vehicleData,
              status: d.status || (d.status_id === 'EST-01' ? 'En Conteo' : 'Pendiente'),
              items: (d.items || []).map((it: any) => ({ ...it, articleId: it.article_id }))
            })));
          }
        }).catch(err => console.warn('[M7-DATA-HOOK] Error loading documents:', err));
      }

    } catch (err) {
      console.error('[M7-DATA-HOOK] Error sync:', err);
    } finally {
      setIsLoading(false);
    }
  }, [setAllMasterData, setIsLoading, setDocuments]);


  return { refreshAppData };
};
