import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { api } from '../services/api';
import { normalizeData } from '../utils/normalize';

/**
 * Hook para gestionar la sincronización global de datos de la aplicación.
 * Centraliza las llamadas a la API y la actualización del store global (Zustand).
 */
export const useAppData = () => {
  const {
    user,
    setVehicles,
    setDrivers,
    setAssignments,
    setInvoices,
    setDocuments,
    setAllMasterData,
    setIsLoading
  } = useAppStore();

  const refreshAppData = useCallback(async (forcedClientId?: string) => {
    const targetClientId = forcedClientId || user?.clientId || 'CLI-01';
    
    try {
      // setIsLoading(true); // Opcional, dependiendo de si queremos mostrar loader global
      
      const [
        modulesRaw, 
        pagesRaw, 
        genericMastersRaw, 
        categoriesRaw, 
        articlesRaw, 
        vehiclesRaw, 
        driversRaw, 
        usersDataRaw, 
        rolesDataRaw, 
        permsDataRaw, 
        userPermsDataRaw, 
        clientsDataRaw, 
        assignmentsDataRaw, 
        invoicesDataRaw, 
        routesDataRaw,
        estadosRaw, 
        marcasRaw, 
        tiposDocumentoRaw, 
        unidadesMedidaRaw, 
        notificacionesConfigRaw, 
        tiposVehiculoRaw, 
        tiposNotificacionRaw
      ] = await Promise.all([
        api.getModules().then(normalizeData).catch(() => []),
        api.getPages().then(normalizeData).catch(() => []),
        api.getGenericMasters().then(normalizeData).catch(() => []),
        api.getCategories().then(normalizeData).catch(() => []), 
        api.getArticles().then(normalizeData).catch(() => []),
        api.getVehicles().then(normalizeData).catch(() => []),
        api.getDrivers().then(normalizeData).catch(() => []),
        api.getUsers().then(normalizeData).catch(() => []),
        api.getRoles().then(normalizeData).catch(() => []),
        api.getPermissions().then(normalizeData).catch(() => []),
        api.getAllUserPermissions().then(normalizeData).catch(() => []),
        api.getClients().then(normalizeData).catch(() => []),
        api.getAssignments().then(normalizeData).catch(() => []),
        api.getInvoices(targetClientId).catch(() => []),
        api.getRoutes().catch(() => []),
        api.getEstados().then(normalizeData).catch(() => []),
        api.getMarcas().then(normalizeData).catch(() => []),
        api.getTiposDocumento().then(normalizeData).catch(() => []),
        api.getUnidadesMedida().then(normalizeData).catch(() => []),
        api.getNotificacionesConfig().then(normalizeData).catch(() => []),
        api.getTiposVehiculo().then(normalizeData).catch(() => []),
        api.getTiposNotificacion().then(normalizeData).catch(() => [])
      ]);

      // 1. Grupos de Maestros Genéricos
      const groupedMasters: any = {};
      if (Array.isArray(genericMastersRaw)) {
        genericMastersRaw.forEach((m: any) => {
          if (!groupedMasters[m.category]) groupedMasters[m.category] = [];
          groupedMasters[m.category].push(m);
        });
      }

      // 2. Mappeo de Artículos con Campos Específicos
      const mappedArticles = normalizeData(Array.isArray(articlesRaw) ? articlesRaw.map((a: any) => ({
        ...a,
        statusId: a.status_id,
        clientId: a.client_id,
        imageUrl: a.image_url 
      })) : []);

      // 3. Mappeo de Vehículos
      const mappedVehicles = normalizeData(Array.isArray(vehiclesRaw) ? vehiclesRaw.map((v: any) => ({
        ...v,
        clientId: v.client_id,
        statusId: v.status_id,
        capacityM3: parseFloat(v.capacity_m3 || '0'),
        modelYear: v.model_year,
        vehicleTypeId: v.vehicle_type
      })) : []);

      // 4. Mappeo de Conductores
      const mappedDrivers = normalizeData(Array.isArray(driversRaw) ? driversRaw.map((d: any) => ({
        ...d,
        status: (d.status_id === 'EST-01' || d.status_id === '1' || d.status === 'Activo') ? 'Activo' : 'Inactivo',
        documentNumber: d.document_number,
      })) : []);

      // 5. Actualización del Store
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
        pages: pagesRaw, 
        modules: modulesRaw,
        vehicles: mappedVehicles,
        drivers: mappedDrivers,
        routes: Array.isArray(routesDataRaw) ? routesDataRaw : [],
        assignments: Array.isArray(assignmentsDataRaw) ? assignmentsDataRaw : [],
        invoices: Array.isArray(invoicesDataRaw) ? invoicesDataRaw : []
      });

      // 6. Carga de Documentos Operativos (Async independiente)
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
      });

    } catch (err) {
      console.error('[M7-DATA-HOOK] Error sync:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, setVehicles, setDrivers, setAssignments, setInvoices, setDocuments, setAllMasterData, setIsLoading]);

  return { refreshAppData };
};
