import React, { useState, useEffect } from 'react';
import { getMasterCategoryFromRoute } from './constants/routes';
import { User, PageModule, MasterCategory, MasterRecord } from './types';
import Login from './components/Login';
import Layout from './components/Layout';
import MasterModule from './components/MasterModule';
import WhatsAppConnect from './components/WhatsAppConnect';
import GestionDocumentosL from './components/GestionDocumentosL';
import RoutePlanner from './components/RoutePlanner';
import LogisticsDispatch from './components/LogisticsDispatch';
import RecibidoMaterial from './components/RecibidoMaterial';
import FleetManager from './components/FleetManager';
import AssignmentManager from './components/AssignmentManager';
import AIChat from './components/AIChat';
import DigitalSignature from './components/DigitalSignature';
import ApprovalManager from './components/ApprovalManager';
import ChatbotWidget from './components/ChatbotWidget';
import DriverGamification from './components/DriverGamification';
import ExecutiveDashboard from './components/ExecutiveDashboard';
import { api } from './services/api';
import { Icons, INITIAL_VEHICLES, INITIAL_DRIVERS, INITIAL_ARTICLES } from './constants';
import { Toaster, toast } from 'sonner';
import { useAppStore } from './stores/useAppStore';
import PortalLayout from './components/portal/PortalLayout';
import ClientLogin from './components/portal/ClientLogin';
import { useAppData } from './hooks/useAppData';
import { normalizeData } from './utils/normalize';
import OrderTracking from './components/portal/OrderTracking';

// Import Admin Module
const AdminDBManager = React.lazy(() => import('./pages/AdminDBManager'));

const App: React.FC = () => {
  // ============ ZUSTAND STORE ============
  const {
    // Estado
    isAuthenticated,
    user,
    activeTab,
    activeMasterCategory,
    activePageId,
    allMasterData,
    documents,
    invoices,
    vehicles,
    drivers,
    assignments,
    routes,
    waStatus,
    isRestoring,
    isLoading,
    showTimeoutWarning,
    timeLeft,
    modules,
    pages,

    // Acciones
    setUser,
    setIsAuthenticated,
    setActiveTab,
    setActiveMasterCategory,
    setActivePageId,
    setAllMasterData,
    setDocuments,
    setInvoices,
    setVehicles,
    setDrivers,
    setAssignments,
    setRoutes,
    setWaStatus,
    setIsRestoring,
    setIsLoading,
    setShowTimeoutWarning,
    setTimeLeft,
    decrementTimeLeft,

    // Helpers
    updateMasterData,

    // Acciones de mutación
    addVehicle,
    updateVehicle,
    deleteVehicle,
    addDriver,
    updateDriver,
    deleteDriver,
    addAssignment,
    endAssignment,

    // Getters
    getAvailableVehicles,

    // Utilidades
    logout
  } = useAppStore();

  const { refreshAppData } = useAppData();

  // Timeout - 10 Minutos (600,000 ms)
  const TIMEOUT_MS = 10 * 60 * 1000;
  const WARNING_MS = 1 * 60 * 1000; // Aviso 1 minuto antes
  let inactivityTimer: any;
  let warningTimer: any;
  let countdownInterval: any;

  const resetInactivityTimer = () => {
    setShowTimeoutWarning(false);
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (warningTimer) clearTimeout(warningTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    if (isAuthenticated) {
      // Timer principal de 10 minutos
      inactivityTimer = setTimeout(() => {
        handleLogout(true);
      }, TIMEOUT_MS);

      // Timer de aviso a los 9 minutos
      warningTimer = setTimeout(() => {
        setShowTimeoutWarning(true);
        setTimeLeft(60);
        countdownInterval = setInterval(() => {
          decrementTimeLeft(); // Usa helper del store
        }, 1000);
      }, TIMEOUT_MS - WARNING_MS);
    }
  };

  // ============ PORTAL ROUTING ============
  const [activeRoutes, setActiveRoutes] = useState<any[]>([]); // Estado para rutas activas
  const [isPortalMode, setIsPortalMode] = useState(false);
  const [portalRoute, setPortalRoute] = useState<'login' | 'tracking'>('login');

  // Detectar modo portal por Hash (Simple Router)
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/portal')) {
        setIsPortalMode(true);
        if (hash.includes('tracking')) {
          setPortalRoute('tracking');
        } else {
          setPortalRoute('login');
        }
      } else {
        setIsPortalMode(false);
      }
    };

    window.addEventListener('hashchange', checkHash);
    checkHash(); // Initial check
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Import dynamic components locally or use lazy? No, direct import above to keep it simple

  useEffect(() => {
    // Eventos de actividad
    window.addEventListener('mousemove', resetInactivityTimer);
    //...

    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);

    resetInactivityTimer(); // Iniciar timer

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      window.removeEventListener('mousemove', resetInactivityTimer);
      window.removeEventListener('keydown', resetInactivityTimer);
      window.removeEventListener('click', resetInactivityTimer);
    };
  }, [isAuthenticated]);

  useEffect(() => {

    const restoreSession = async () => {
      const savedUser = localStorage.getItem('m7_user_session');

      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          if (parsedUser && parsedUser.id) {
            // SOLUCIÓN REAL: Forzar refresco de permisos para Admin en cada restauración
            if (parsedUser.roleId === 'ROL-01' || parsedUser.id === 'USR-01') {
              const freshPerms = await api.getUserPermissions(parsedUser.id).catch(() => null);
              if (freshPerms && Array.isArray(freshPerms)) {
                parsedUser.permissions = freshPerms;
              }
            }

            setUser({
              ...parsedUser,
              documentNumber: parsedUser.documentNumber || parsedUser.document_number
            });
            setIsAuthenticated(true);

            // CARGAR DATOS MAESTROS FRESCOS CON EL CLIENTE RESTAURADO
            refreshAppData(parsedUser.clientId);

            // RESTAURAR CATEGORÍA ACTIVA DE MAESTROS SI EXISTE
            const savedCategory = localStorage.getItem('m7_active_master_category');
            if (savedCategory) {
              setActiveTab('master');
              setActiveMasterCategory(savedCategory as any);
              localStorage.removeItem('m7_active_master_category'); // Limpiar después de usar
            }
          }
        } catch (e: any) {
          console.error('[SESSION-RESTORE] Error:', e);
          localStorage.removeItem('m7_user_session');
        }
      }
      setIsRestoring(false);
    };

    restoreSession();
  }, []);



  // Efecto para persistir pestaña activa
  useEffect(() => {
    localStorage.setItem('m7_active_tab', activeTab);
  }, [activeTab]);



  // Polling global para indicador
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const checkWa = async () => {
      try {
        const res = await api.getWhatsAppStatus(user.id);
        setWaStatus(res.status === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED');
      } catch { }
    };
    checkWa();
    const timer = setInterval(checkWa, 30000);
    return () => clearInterval(timer);
  }, [isAuthenticated, user?.id]);

  const handleLogin = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      // 1. Autenticación Real
      const authRes = await api.login(email, pass);
      if (!authRes.success) {
        return { success: false, error: authRes.error || 'Credenciales no válidas' };
      }

      const userData = authRes.user;
      // ... (rest of the logic remains the same)

      // Simulo el resto para no repetir todo el bloque si es idéntico, 
      // pero necesito asegurar que retorno {success: true} al final.
      // (Volveré a pegar el bloque completo para evitar errores de contexto incompleto)

      // 2. Cargar permisos del usuario
      const userPermissions = await api.getUserPermissions(userData.id).catch(() => null);

      // 3. Carga de Datos Iniciales
      const [clients, users, roles, modules, pages, permissions, userPermissionsAll, genericMasters, articData] = await Promise.all([
        api.getClients().catch(() => []),
        api.getUsers().catch(() => []),
        api.getRoles().catch(() => []),
        api.getModules().then(normalizeData).catch(() => []),
        api.getPages().then(normalizeData).catch(() => []),
        api.getPermissions().catch(() => []),
        api.getAllUserPermissions().catch(() => []),
        api.getGenericMasters().catch(() => []),
        api.getArticles().catch(() => [])
      ]);

      const groupedMasters: any = {};
      if (Array.isArray(genericMasters)) {
        genericMasters.forEach((m: any) => {
          if (!groupedMasters[m.category]) groupedMasters[m.category] = [];
          groupedMasters[m.category].push(m);
        });
      }

      let mappedPermissions: any[] = userData.permissions || [];
      
      // LOGIC FIX: Handle both Array (Admin mock) and Object (DB flat) formats
      if (userPermissions) {
        if (Array.isArray(userPermissions) && userPermissions.length > 0) {
           mappedPermissions = userPermissions;
        } else if (typeof userPermissions === 'object' && !Array.isArray(userPermissions)) {
           // Transform flat object (page_PAG-01_view: true) to Array format for Layout
           const permMap = new Map<string, Set<string>>();
           Object.keys(userPermissions).forEach(key => {
               if (userPermissions[key] === true) {
                   const parts = key.toLowerCase().split('_');
                   if (parts.length >= 3 && parts[0] === 'page') {
                       const action = parts.pop();
                       const pageId = parts.slice(1).join('_').toUpperCase();
                       if (pageId && action) {
                           if (!permMap.has(pageId)) permMap.set(pageId, new Set());
                           permMap.get(pageId)?.add(action);
                       }
                   }
               }
           });
           const transformed = Array.from(permMap.entries()).map(([module, actions]) => ({ 
               module, 
               actions: Array.from(actions) 
           }));
           
           if (transformed.length > 0) mappedPermissions = transformed;
        }
      }

      setAllMasterData({
        ...allMasterData,
        ...groupedMasters,
        masterClientes: Array.isArray(clients) ? clients : [],
        masterUsuarios: Array.isArray(users) ? users : [],
        masterRol: Array.isArray(roles) ? roles : [],
        masterPermisosRol: Array.isArray(permissions) ? permissions : [],
        masterPermisosUsuario: Array.isArray(userPermissionsAll) ? userPermissionsAll : [],
        masterArticulo: Array.isArray(articData) ? articData.map((a: any) => ({
          ...a,
          statusId: a.status_id,
          clientId: a.client_id,
          factorInter: a.factor_inter,
          factorStd: a.factor_std,
          uomGeneralId: a.uom_general_id,
          uomInterId: a.uom_inter_id,
          uomStdId: a.uom_std_id,
          categoryArticuloId: a.category_articulo_id
        })) : []
      });

      const [docsData, vehData, driversData] = await Promise.all([
        api.getDocuments(userData.client_id || 'CLI-01').catch(() => []),
        api.getVehicles().catch(() => []),
        api.getDrivers().catch(() => [])
      ]);

      setDocuments(Array.isArray(docsData) ? docsData.map((d: any) => ({
        ...d,
        externalDocId: d.external_doc_id,
        vehicleData: d.vehicle_plate,
        createdAt: d.created_at,
        items: (d.items || []).map((it: any) => ({ ...it, articleId: it.article_id }))
      })) : []);
      setVehicles(Array.isArray(vehData) ? vehData : []);
      setDrivers(Array.isArray(driversData) ? driversData : []);

      const firstClientId = (userData.client_ids && userData.client_ids.length > 0) 
        ? userData.client_ids[0] 
        : (userData.client_id || 'CLI-01');

      const finalUser = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        roleId: userData.role_id,
        documentNumber: userData.document_number || userData.documentNumber,
        permissions: mappedPermissions,
        clientId: firstClientId,
        clientIds: userData.client_ids || [firstClientId]
      } as any;

      // Update store with dedicated tables
      useAppStore.setState({ pages, modules });

      setUser(finalUser);
      localStorage.setItem('m7_user_session', JSON.stringify(finalUser));
      setIsAuthenticated(true);

      toast.success(`Bienvenido, ${userData.name}`);
      return { success: true };

    } catch (error: any) {
      console.error("[M7-LOGIN] Login Error:", error);
      return { success: false, error: 'Error de conexión con el núcleo M7' };
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = (expired = false) => {
    logout(); // Usa la acción del store
    if (expired) {
      toast.error("Sesión expirada por inactividad");
    } else {
      toast.info("Sesión finalizada");
    }
  };

  if (isRestoring) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs animate-pulse">Restaurando Sistema OrbitM7...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const availableVehiclesCount = vehicles.filter(v => v.status === 'Disponible' || v.status === 'Available').length;

    // DETECCIÓN DINÁMICA DE MÓDULOS MAESTROS (Nuclear Sync)
    const masterCat = getMasterCategoryFromRoute(activeTab, activePageId);
    if (masterCat) {
      return (
        <MasterModule
          activeMaster={masterCat}
          user={user!}
          onAudit={async () => {}}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="min-h-full flex flex-col p-6 md:p-10 text-center animate-in fade-in duration-700 bg-slate-50">
            <h2 className="text-5xl font-black text-slate-900 mb-6 uppercase tracking-tighter">PROCESADOR ORBITM7</h2>
            <div className="w-32 h-2 bg-emerald-500 mx-auto rounded-full mb-10"></div>

            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${waStatus === 'CONNECTED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'} mb-10`}>
              <div className={`w-2 h-2 rounded-full ${waStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
              <span className="text-[10px] font-black uppercase tracking-widest">{waStatus === 'CONNECTED' ? 'ASISTENTE ONLINE' : 'ASISTENTE OFFLINE'}</span>
            </div>

            {/* HERO BANNER PROACTIVO - VISIBILIDAD MÁXIMA AL INICIO */}
            <div className={`max-w-6xl mx-auto mb-12 p-1 relative overflow-hidden rounded-[3.5rem] group transition-all duration-700 shadow-2xl ${documents.length === 0
              ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600'
              : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'
              }`}>
              <div className="bg-slate-950/90 backdrop-blur-3xl p-10 md:p-14 rounded-[3.3rem] relative overflow-hidden flex flex-col md:flex-row items-center gap-10 border border-white/5">
                {/* Background Brain Animation */}
                <div className="absolute top-0 right-0 p-10 text-emerald-500/5 group-hover:scale-110 transition-transform duration-1000 hidden md:block">
                  <Icons.Brain style={{ width: '250px', height: '250px' }} />
                </div>

                <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center shrink-0 shadow-2xl animate-pulse relative z-10 ${documents.length === 0 ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-amber-500 shadow-amber-500/20'
                  }`}>
                  <Icons.Sparkles className="text-slate-950 w-14 h-14" />
                </div>

                <div className="text-left flex-1 relative z-10">
                  <div className={`inline-block px-4 py-1.5 rounded-full mb-6 border ${documents.length === 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                    }`}>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Centro de Mando Inteligente OrbitM7</span>
                  </div>

                  <h3 className="text-white font-black text-3xl md:text-5xl uppercase tracking-tighter mb-4 leading-none">
                    {documents.length === 0
                      ? "Listo para procesar tu logística"
                      : "Hay tareas críticas que requieren tu atención"}
                  </h3>

                  <p className="text-slate-400 text-lg md:text-xl font-medium leading-relaxed max-w-3xl">
                    {documents.length === 0
                      ? "Tu panel está limpio. Sube un archivo de preventa para que OrbitM7 IQ pueda generar tus rutas optimizadas ahora."
                      : `He detectado ${documents.length} documentos detenidos. ¿Quieres que audite la carga para liberar rutas de inmediato?`}
                  </p>

                  <div className="mt-10 flex flex-wrap gap-5">
                    <button
                      onClick={() => setActiveTab('documentos')}
                      className={`px-10 py-5 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl ${documents.length === 0
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        }`}
                    >
                      {documents.length === 0 ? "Abrir Gestor de Documentos" : "Iniciar Auditoría IA"}
                    </button>
                    <button
                      onClick={() => toast.success("OrbitM7 IQ: Consultando núcleo de inteligencia...", { description: "Usa el widget inferior para ver mi reporte completo." })}
                      className="px-8 py-5 border border-white/10 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all"
                    >
                      Informe Narrativo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* KPI GRID - Ahora debajo del banner principal */}
            <div className="max-w-6xl mx-auto mb-12 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-bottom-10 duration-700">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 text-left hover:shadow-2xl transition-all">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CUMPLIMIENTO</p>
                  <Icons.Check className="text-emerald-500" />
                </div>
                <h4 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">98%</h4>
                <p className="text-xs text-slate-500 font-medium">+14% vs semana previa</p>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 text-left hover:shadow-2xl transition-all">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FLOTA DISPONIBLE</p>
                  <Icons.Truck className="text-blue-500" />
                </div>
                <h4 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">{availableVehiclesCount}</h4>
                <p className="text-xs text-slate-500 font-medium">{availableVehiclesCount > 0 ? 'Capacidad de respuesta inmediata' : 'Flota totalmente ocupada'}</p>
              </div>
              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-lg text-left hover:bg-slate-800 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">IA PROYECCIÓN</p>
                  <Icons.Route className="text-emerald-500 animate-pulse" />
                </div>
                <h4 className="text-2xl font-black text-white tracking-tighter mb-2">Plan de Vuelo OrbitM7 IQ</h4>
                <p className="text-xs text-slate-400">Ahorro estimado despacho: <span className="text-emerald-500 font-black">12 min</span></p>
              </div>
            </div>

            <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-white rounded-[2rem] shadow-xl border border-slate-100">
                <div className="text-emerald-500 text-3xl mb-4 font-black">01</div>
                <h3 className="font-black text-sm uppercase text-slate-600">CARGAR</h3>
                <p className="text-xs text-slate-400 mt-2">Sube tus archivos Excel o JSON</p>
              </div>
              <div className="p-6 bg-white rounded-[2rem] shadow-xl border border-slate-100">
                <div className="text-blue-500 text-3xl mb-4 font-black">02</div>
                <h3 className="font-black text-sm uppercase text-slate-600">VALIDAR</h3>
                <p className="text-xs text-slate-400 mt-2">Gestiona y corrige en tiempo real</p>
              </div>
              <div className="p-6 bg-white rounded-[2rem] shadow-xl border border-slate-100">
                <div className="text-purple-500 text-3xl mb-4 font-black">03</div>
                <h3 className="font-black text-sm uppercase text-slate-600">DESCARGAR</h3>
                <p className="text-xs text-slate-400 mt-2">Exporta tus resultados limpios</p>
              </div>
            </div>
          </div>
        );
      case 'master':
        return (
          <MasterModule
            activeMaster={activeMasterCategory}
            user={user!}
            onAudit={async () => {
              // SOLO recargar maestros, NO toda la app
              // El store se actualiza internamente en MasterModule
            }}
          />
        );
      case 'whatsapp-status':
        return <WhatsAppConnect user={user} />;
      case 'documentos':
        return (
          <GestionDocumentosL
            documents={documents}
            invoices={invoices}
            user={user!}
            masterEstados={allMasterData.masterEstados || []}
            onDocumentsChange={setDocuments}
            onRefresh={() => refreshAppData()}
          />
        );
      case 'rutas':
        return (
          <RoutePlanner
            invoices={invoices}
            vehicles={vehicles}
            drivers={drivers}
            assignments={assignments}
            documents={documents}
            activeRoutes={routes} // Pasamos rutas activas para filtrar vehículos ocupados
            user={user!}
            clients={allMasterData.masterClientes || []}
            onRefresh={refreshAppData}
            onAssign={(vId, dId, cId) => {
              const newAssign = { id: `as-${Date.now()}`, vehicleId: vId, driverId: dId, clientId: cId, statusId: 'EST-01' };
              setAssignments([...assignments, newAssign]);
            }}
            onSaveRoute={(route) => {
              console.log('Ruta Guardada:', route);
              alert('Ruta OrbitM7 Guardada Exitosamente');
            }}
          />
        );
      case 'admin-db':
        return (
          <React.Suspense fallback={<div className="p-10">Cargando Gestor DB...</div>}>
            <AdminDBManager />
          </React.Suspense>
        );
      case 'recibido':
        return (
          <RecibidoMaterial
            documents={documents}
            onUpdateDocuments={setDocuments}
            user={user!}
            masterEstados={allMasterData.masterEstados || []}
            masterNotificaciones={allMasterData.masterNotificaciones || []}
            masterArticulo={allMasterData.masterArticulo || []}
            onAddArticleToMaster={async (article) => {
              await api.saveArticle(article);
              setAllMasterData({ ...allMasterData, masterArticulo: [...(allMasterData.masterArticulo || []), article as MasterRecord] });
            }}
            onAddNotificationToMaster={async (notif) => {
              const newNotif = { ...notif, id: `not-${Date.now()}` };
              await api.saveMaster('masterNotificaciones', newNotif);
              setAllMasterData({ ...allMasterData, masterNotificaciones: [...(allMasterData.masterNotificaciones || []), newNotif as MasterRecord] });
            }}
          />
        );
      case 'flotas':
        return (
          <FleetManager
            vehicles={vehicles}
            drivers={drivers}
            user={user!}
            masterData={allMasterData}
            onAddVehicle={async (v) => {
              try {
                const res = await api.saveVehicle(v);
                if (!res.success) throw new Error(res.error || 'Error al guardar vehículo');
                // Normalización local inmediata para reactividad
                const newVeh = {
                  ...v,
                  id: res.id,
                  statusId: v.statusId || 'EST-01', // Default Disponible
                  capacityM3: Number(v.capacityM3) || 0
                };
                setVehicles([...vehicles, newVeh]);

                // Actualizar master data también
                const currentMaster = (allMasterData as any).masterVehiculos || [];
                setAllMasterData({
                  ...allMasterData,
                  // @ts-ignore
                  masterVehiculos: [...currentMaster, { ...newVeh, name: newVeh.plate } as MasterRecord]
                });

                return { success: true };
              } catch (e) {
                console.error(e);
                return { success: false, error: e.message || 'Error al guardar vehículo' };
              }
            }}
            onUpdateVehicle={async (id, data) => {
              try {
                await api.saveVehicle({ ...data, id });
                updateVehicle(id, data);
                // También actualizar master data para consistencia
                const currentMaster = (allMasterData as any).masterVehiculos || [];
                setAllMasterData({
                  ...allMasterData,
                  // @ts-ignore
                  masterVehiculos: currentMaster.map((v: any) => v.id === id ? { ...v, ...data, name: data.plate || v.name } : v)
                });
                return { success: true };
              } catch (e) {
                console.error(e);
                return { success: false, error: 'Error al actualizar vehículo' };
              }
            }}
            onDeleteVehicle={async (id) => {
               try {
                 await api.deleteVehicle(id);
                 deleteVehicle(id);
               } catch (e) { console.error(e); }
            }}
            onAddDriver={async (d) => {
              try {
                const res = await api.saveDriver(d);
                if (!res.success) throw new Error(res.error || 'Fallo en servidor');
                const newDriver = {
                  ...d,
                  id: res.id,
                  statusId: d.statusId || 'EST-01'
                };
                addDriver(newDriver);
                
                const currentMaster = (allMasterData as any).masterConductores || [];
                setAllMasterData({
                  ...allMasterData,
                  // @ts-ignore
                  masterConductores: [...currentMaster, { ...newDriver, name: newDriver.name } as MasterRecord]
                });
                return { success: true };
              } catch (e) {
                console.error(e);
                return { success: false, error: e.message || 'Error al guardar conductor' };
              }
            }}
            onUpdateDriver={async (id, data) => {
              try {
                await api.saveDriver({ ...data, id });
                updateDriver(id, data);
                
                const currentMaster = (allMasterData as any).masterConductores || [];
                setAllMasterData({
                  ...allMasterData,
                  // @ts-ignore
                  masterConductores: currentMaster.map((d: any) => d.id === id ? { ...d, ...data, name: data.name || d.name } : d)
                });
                return { success: true };
              } catch (e) {
                console.error(e);
                return { success: false, error: 'Error al actualizar conductor' };
              }
            }}
            onDeleteDriver={async (id) => {
              try {
                await api.deleteDriver(id);
                deleteDriver(id);
              } catch (e) { console.error(e); }
            }}
          />
        );
      case 'vinculo':
        return (
          <AssignmentManager
            vehicles={vehicles}
            drivers={drivers}
            assignments={assignments}
            user={user!}
            clients={allMasterData.masterClientes || []}
            onAssign={async (vId, dId, cId) => {
              const newAssign = { vehicleId: vId, driverId: dId, clientId: cId, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
              // @ts-ignore
              addAssignment(newAssign); // Actualización optimista
              try {
                await api.saveAssignment(newAssign);
                toast.success("Asignación guardada con éxito");
                refreshAppData(); // Sincronización real
              } catch (e: any) {
                console.error("Error saving assignment:", e);
                toast.error("Error en asignación", { description: e.message || "Conflicto en el servidor" });
              }
            }}
            onEndAssignment={async (aId) => {
              endAssignment(aId); // Actualización optimista
              try {
                await api.endAssignment(aId, user?.name);
                toast.success("Asignación finalizada");
                refreshAppData(); // Sincronización real
              } catch (e) {
                console.error("Error ending assignment:", e);
                toast.error("Error al finalizar asignación");
              }
            }}
          />
        );
      case 'firmas':
        return <DigitalSignature user={user!} />;
      case 'aprobar-firma':
        return <ApprovalManager user={user!} />;
      case 'gamification':
        // Casting de user a Driver temporal para visualización
        return <DriverGamification driver={{
          id: user!.id,
          name: user!.name,
          documentNumber: user!.id,
          statusId: 'EST-01',
          clientId: user!.clientId || 'CLI-01',
          licenseCategory: 'C2',
          status: 'Activo'
        } as any} />;
      case 'executive-dashboard':
        return <ExecutiveDashboard />;
      case 'despacho':
        return (
          <LogisticsDispatch
            user={user!}
            selectedClient={user!.clientId || 'CLI-01'}
            vehicles={vehicles}
            drivers={drivers}
            assignments={assignments}
            invoices={invoices}
            activeRoutes={routes}
            onRefresh={() => refreshAppData()}
            clients={allMasterData.masterClientes || []}
          />
        );
      case 'chatbot':
        return <AIChat context={{ user: user!.name, activeTab: 'chatbot-fullscreen' }} />;
      default:
        return (
          <div className="p-10 border-2 border-dashed border-slate-200 rounded-[3rem] text-center">
            <h2 className="text-xl font-black text-slate-400 uppercase">Módulo: {activeTab}</h2>
          </div>
        );
    }
  };

  if (isPortalMode) {
    return (
      <>
        <Toaster position="top-right" richColors theme="dark" />
        <PortalLayout>
          {portalRoute === 'login' && <ClientLogin onLogin={(token, user) => {
            // Handle client login state if we want persistence, for now just show success and maybe redirect to dashboard
            // For MVP, login just shows success or could store token
            localStorage.setItem('m7_client_token', token);
            // Redirect to simplified dashboard if we had one, or just stay logged in
            // For now, let's redirect to tracking
            window.location.hash = '#/portal/tracking';
          }} />}
          {portalRoute === 'tracking' && <OrderTracking />}
        </PortalLayout>
      </>
    );
  }

  const handleBack = () => setActiveTab('dashboard');

  if (!isAuthenticated || !user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <>
      <Toaster
        position="top-right"
        richColors
        theme="dark"
        expand={true}
        toastOptions={{
          style: { borderRadius: '1.5rem', padding: '1.25rem' }
        }}
      />
      <Layout
        user={user!}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeMasterCategory={activeMasterCategory}
        setActiveMasterCategory={setActiveMasterCategory}
        activePageId={activePageId}
        setActivePageId={setActivePageId}
        onUpdateUser={async (data) => {
          try {
            const updatedUser = { ...user, ...data } as User;
            setUser(updatedUser);
            // Persistir en Backend
            console.log('[M7-APP] Persistiendo usuario...', updatedUser);
            await api.saveUser(updatedUser);

            // Actualizar también la lista de maestros para que se vea en Auditoría/Difusión
            const freshUsers = await api.getUsers().catch(() => []);
            setAllMasterData({ ...allMasterData, masterUsuarios: freshUsers });

            localStorage.setItem('m7_user_session', JSON.stringify(updatedUser));
          } catch (e) {
            console.error('[M7-APP] Error al guardar perfil:', e);
            toast.error("Error al guardar en servidor", { description: "Los cambios son locales temporalmente." });
          }
        }}
        onLogout={() => handleLogout()}
        onBack={handleBack}
        showBack={activeTab !== 'dashboard'}
        modulesData={modules}
        pagesData={pages}
      >
        {renderContent()}
      </Layout>

      {/* CHATBOT POSICIÓN ABSOLUTA AL FRENTE - ALINEADO CON HEADER 'RUTAS' */}
      <AIChat
        key="global-ai-chat-v8"
        context={{
          user: user.name,
          activeTab,
          documentsCount: documents.length,
          invoicesCount: invoices.length,
          availableVehicles: vehicles.filter(v => v.status === 'Disponible').length,
          activeDrivers: drivers.filter(d => d.status === 'Activo').length,
          recentAssignments: assignments.slice(-5)
        }}
      />
      {showTimeoutWarning && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in zoom-in duration-300">
          <div className="bg-white max-w-md w-full p-10 rounded-[3rem] shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto animate-bounce">
              <Icons.Alert style={{ width: '40px', height: '40px' }} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase">¿Sigues ahí?</h3>
            <p className="text-slate-500 font-medium">Tu sesión se cerrará por inactividad en:</p>
            <div className="text-6xl font-black text-emerald-500 tabular-nums">
              00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
            </div>
            <button
              onClick={resetInactivityTimer}
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl"
            >
              Continuar Trabajando
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
