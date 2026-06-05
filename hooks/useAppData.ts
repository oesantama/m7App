import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { api } from '../services/api';
import { normalizeData } from '../utils/normalize';
import { hasPermission } from '../utils/permissions';
import { MasterCategory } from '../types';

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

      const isSuper = (currentUser as any)?.roleId === 'ROL-01' || (currentUser as any)?.role_id === 'ROL-01' || (currentUser as any)?.email === 'directorti@millasiete.com';
      const hasPerm = (mod: string) => hasPermission(currentUser, mod, 'view');


      // 3. CARGA DIFERIDA E INCREMENTAL (Optimización de Rendimiento M7)
      // No esperamos a un Promise.all gigante para no bloquear la UI
      
      const updateCat = (cat: MasterCategory, data: any) => {
          useAppStore.getState().updateMasterCategory(cat, normalizeData(data));
      };

      // Grupo A: Maestros Base (Rápido)
      api.getGenericMasters().then(res => {
          const grouped: any = {};
          if (Array.isArray(res)) {
            res.forEach((m: any) => {
              if (!grouped[m.category]) grouped[m.category] = [];
              grouped[m.category].push(m);
            });
            useAppStore.getState().updateMasterData(grouped);
          }
      }).catch(() => []);

      api.getEstados().then(res => updateCat('masterEstados', res)).catch(() => []);
      api.getMarcas().then(res => updateCat('masterMarcas', res)).catch(() => []);
      api.getTiposDocumento().then(res => updateCat('masterTipoDocumento', res)).catch(() => []);
      api.getUnidadesMedida().then(res => updateCat('masterUnidadMedida', res)).catch(() => []);
      api.getTiposVehiculo().then(res => updateCat('masterTiposVehiculo', res)).catch(() => []);
      api.getTiposNotificacion().then(res => updateCat('masterTipoNotificacion', res)).catch(() => []);
      api.getCategories().then(res => updateCat('masterCategorias', res)).catch(() => []);

      // Grupo B: Gestión de Usuarios (Crítico para Matrices)
      if (isSuper || hasPerm('USUARIOS')) {
          api.getUsers().then(res => updateCat('masterUsuarios', res)).catch(() => []);
      }
      if (isSuper || hasPerm('ROLES') || hasPerm('MATRIZ_ROLES')) {
          api.getRoles().then(res => updateCat('masterRol', res)).catch(() => []);
          api.getPermissions().then(res => updateCat('masterPermisosRol', res)).catch(() => []);
      }
      if (isSuper || hasPerm('MATRIZ_PERMISOS')) {
          api.getAllUserPermissions().then(res => updateCat('masterPermisosUsuario', res)).catch(() => []);
      }

      // Grupo C: Operación de Flota
      if (hasPerm('ARTICULOS')) {
          api.getArticles().then(res => {
              const mapped = Array.isArray(res) ? res.map((a: any) => ({
                ...a, 
                statusId: a.status_id || a.statusId, 
                clientId: a.client_id || a.clientId, 
                imageUrl: a.image_url || a.imageUrl,
                categoryArticuloId: a.category_articulo_id || a.categoryArticuloId,
                uomGeneralId: a.uom_general_id || a.uomGeneralId,
                uomInterId: a.uom_inter_id || a.uomInterId,
                uomStdId: a.uom_std || a.uomStdId,
                factorInter: a.factor_inter || a.factorInter,
                factorStd: a.factor_std || a.factorStd
              })) : [];
              updateCat('masterArticulo', mapped);
          }).catch(() => []);
      }

      if (hasPerm('VEHICULOS') || hasPerm('RUTAS') || hasPerm('ASIGNACIONES') || hasPerm('DOCUMENTOS_L')) {
          api.getVehicles().then(res => {
              const mapped = normalizeData(Array.isArray(res) ? res.map((v: any) => ({
                ...v, clientId: v.client_id, statusId: v.status_id,
                status: (String(v.status_id).toUpperCase() === 'EST-01' || String(v.status).toUpperCase() === 'DISPONIBLE') ? 'DISPONIBLE' : String(v.status || 'OCUPADO').toUpperCase(),
                capacityM3: parseFloat(v.capacity_m3 || '0'), modelYear: v.model_year, vehicleTypeId: v.vehicle_type
              })) : []);
              useAppStore.setState({ vehicles: mapped });
              updateCat('masterVehiculos', mapped);
          }).catch(() => []);
      }

      if (hasPerm('CONDUCTORES') || hasPerm('RUTAS') || hasPerm('ASIGNACIONES') || hasPerm('DOCUMENTOS_L')) {
          api.getDrivers().then(res => {
              const mapped = normalizeData(Array.isArray(res) ? res.map((d: any) => ({
                ...d, status: (d.status_id === 'EST-01' || d.status_id === '1' || d.status === 'Activo') ? 'Activo' : 'Inactivo',
                documentNumber: d.document_number,
              })) : []);
              useAppStore.setState({ drivers: mapped });
              updateCat('masterConductores', mapped);
          }).catch(() => []);
      }

      // Clientes: siempre cargar — el backend filtra por client_ids para no-superadmin
      api.getClients().then(res => updateCat('masterClientes', res)).catch(() => []);

      if (hasPerm('ASIGNACIONES') || hasPerm('RUTAS') || hasPerm('DOCUMENTOS_L')) {
          api.getAssignments().then(res => {
              const mapped = Array.isArray(res) ? res.map((a: any) => ({
                ...a,
                id: a.id || a.assignment_id || a._id,
                vehicleId: a.vehicleId || a.vehicle_id,
                driverId: a.driverId || a.driver_id,
                clientId: a.clientId || a.client_id,
                isActive: a.isActive !== undefined ? a.isActive : a.is_active,
                updatedAt: a.updatedAt || a.updated_at,
                createdAt: a.createdAt || a.created_at
              })) : [];
              useAppStore.setState({ assignments: mapped });
          }).catch(() => []);
      }

      if (hasPerm('RUTAS')) {
          api.getRoutes().then(res => useAppStore.setState({ routes: Array.isArray(res) ? res : [] })).catch(() => []);
      }

      if (hasPerm('DOCUMENTOS_L') || hasPerm('RECIBIDO_MATERIAL') || hasPerm('DESPACHO_L') || hasPerm('RUTAS')) {
          api.getInvoices(targetClientId).then(res => useAppStore.setState({ invoices: Array.isArray(res) ? res : [] })).catch(() => []);
      }

      if (hasPerm('NOTIFICACIONES')) {
          api.getNotificacionesConfig().then(res => updateCat('masterNotificaciones', res)).catch(() => []);
      }

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
