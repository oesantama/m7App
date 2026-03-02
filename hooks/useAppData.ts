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
    const targetClientId = forcedClientId || currentUser?.clientId || (currentUser?.clientIds && currentUser.clientIds.length > 0 ? currentUser.clientIds[0] : 'CLI-01');
    
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
        (hasPerm('VEHICULOS') || hasPerm('RUTAS') || hasPerm('ASIGNACIONES') || hasPerm('DOCUMENTOS_L') || hasPerm('RECIBIDO_MATERIAL')) ? api.getVehicles().then(normalizeData).catch(() => []) : Promise.resolve([]),
        (hasPerm('CONDUCTORES') || hasPerm('RUTAS') || hasPerm('ASIGNACIONES') || hasPerm('DOCUMENTOS_L') || hasPerm('RECIBIDO_MATERIAL')) ? api.getDrivers().then(normalizeData).catch(() => []) : Promise.resolve([]),
        hasPerm('USUARIOS') ? api.getUsers().then(normalizeData).catch(() => []) : Promise.resolve([]),


        isSuper ? api.getRoles().then(normalizeData).catch(() => []) : Promise.resolve([]),
        isSuper ? api.getPermissions().then(normalizeData).catch(() => []) : Promise.resolve([]),
        isSuper || hasPerm('MATRIZ_PERMISOS') ? api.getAllUserPermissions().then(normalizeData).catch(() => []) : Promise.resolve([]),
        (hasPerm('CLIENTES') || hasPerm('RUTAS') || hasPerm('ASIGNACIONES') || hasPerm('DOCUMENTOS_L') || hasPerm('RECIBIDO_MATERIAL')) ? api.getClients().then(normalizeData).catch(() => []) : Promise.resolve([]),
        (hasPerm('ASIGNACIONES') || hasPerm('RUTAS') || hasPerm('DOCUMENTOS_L') || hasPerm('RECIBIDO_MATERIAL')) ? api.getAssignments().then(normalizeData).catch(() => []) : Promise.resolve([]),
        (hasPerm('DOCUMENTOS_L') || hasPerm('RECIBIDO_MATERIAL')) ? api.getInvoices(targetClientId).catch(() => []) : Promise.resolve([]),
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
          ...a, 
          statusId: a.status_id || a.statusId, 
          clientId: a.client_id || a.clientId, 
          imageUrl: a.image_url || a.imageUrl,
          categoryArticuloId: a.category_articulo_id || a.categoryArticuloId,
          uomGeneralId: a.uom_general_id || a.uomGeneralId,
          uomInterId: a.uom_inter_id || a.uomInterId,
          uomStdId: a.uom_std || a.uomStdId, // Mapeo crítico para unidades estándar
          factorInter: a.factor_inter || a.factorInter,
          factorStd: a.factor_std || a.factorStd
        })) : []);

        const mappedVehicles = normalizeData(Array.isArray(vehiclesRaw) ? vehiclesRaw.map((v: any) => ({
          ...v, clientId: v.client_id, statusId: v.status_id,
          status: (String(v.status_id).toUpperCase() === 'EST-01' || String(v.status).toUpperCase() === 'DISPONIBLE') ? 'DISPONIBLE' : String(v.status || 'OCUPADO').toUpperCase(),
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
      // [M7-FIX] Cargar también para usuarios con permiso RUTAS (planificadores), RECIBIDO_MATERIAL (auditores) y RECIBIDO_MANUAL
      if (hasPerm('DOCUMENTOS_L') || hasPerm('RUTAS') || hasPerm('RECIBIDO_MATERIAL') || hasPerm('RECIBIDO_MANUAL')) {
        api.getDocuments(targetClientId).then(docs => {
          if (Array.isArray(docs)) {
            setDocuments(docs.map(d => ({
              ...d,
              externalDocId: d.external_doc_id || d.externalDocId,
              vehicleData: d.vehicle_plate || d.vehicleData,
              status: d.status || (d.status_id === 'EST-01' ? 'En Conteo' : 'Pendiente'),
              items: (d.items || []).map((it: any) => ({ 
                ...it, 
                articleId: it.article_id || it.articleId,
                expectedQty: it.expected_qty || it.expectedQty,
                countedQty: it.count_2 || it.count2 || it.count_1 || it.count1 || 0,
                receivedQty: it.received_qty || it.receivedQty || it.count_1 || it.count1 || 0,
                unCode: it.un_code || it.unCode,
                clientRef: it.client_ref || it.clientRef,
                orderNumber: it.order_number || it.orderNumber,
                invoice: it.invoice || it.invoice_number,
                driverNote: it.driver_note || it.driverNote || it.observation,
                inventoryNote: it.inventory_note || it.inventoryNote,
                count1: it.count_1 || it.count1,
                count2: it.count_2 || it.count2,
                pickedQty: it.picked_qty || it.pickedQty,
                dispatchedQty: it.dispatched_qty || it.dispatchedQty,
                itemStatus: it.status || it.itemStatus
              }))
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
