import React, { useState, useEffect } from 'react';
import { getMasterCategoryFromRoute } from './constants/routes';
import { User, PageModule, MasterCategory, MasterRecord } from './types';
import Login from './components/Login';
import PWABanner from './components/PWABanner';
import PortalLayout from './components/portal/PortalLayout';
import ClientLogin from './components/portal/ClientLogin';
import OrderTracking from './components/portal/OrderTracking';
import { api } from './services/api';
import { Icons, INITIAL_VEHICLES, INITIAL_DRIVERS, INITIAL_ARTICLES } from './constants';
import { Toaster, toast } from 'sonner';
import { useAppStore } from './stores/useAppStore';
import { useAppData } from './hooks/useAppData';
import { normalizeData } from './utils/normalize';
import { hasPermission } from './utils/permissions';
import AutoUpdate from './components/shared/AutoUpdate';

// ========== LAZY LOADING (CODE SPLITTING CHUNKS) ==========
// Wrapper para auto-recargar la PWA si un chunk falla por cambio de nombre
const lazyWithRetry = (componentImport: () => Promise<any>) =>
  React.lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('m7-chunk-failed-reload') || 'false'
    );
    try {
      const component = await componentImport();
      window.sessionStorage.setItem('m7-chunk-failed-reload', 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        window.sessionStorage.setItem('m7-chunk-failed-reload', 'true');
        window.location.reload();
        // Return a dummy promise that never resolves while reloading
        return new Promise(() => { });
      }
      throw error;
    }
  });

const Layout = lazyWithRetry(() => import('./components/Layout'));
const MasterModule = lazyWithRetry(() => import('./components/MasterModule'));
const WhatsAppConnect = lazyWithRetry(() => import('./components/WhatsAppConnect'));
const GestionDocumentosL = lazyWithRetry(() => import('./components/GestionDocumentosL'));
const RoutePlanner = lazyWithRetry(() => import('./components/RoutePlanner'));
const LogisticsDispatch = lazyWithRetry(() => import('./components/LogisticsDispatch'));
const RecibidoMaterial = lazyWithRetry(() => import('./components/RecibidoMaterial'));
const RecibidoManual = lazyWithRetry(() => import('./components/RecibidoManual'));
const FleetManager = lazyWithRetry(() => import('./components/FleetManager'));
const AssignmentManager = lazyWithRetry(() => import('./components/AssignmentManager'));
const AIChat = lazyWithRetry(() => import('./components/AIChat'));
const DigitalSignature = lazyWithRetry(() => import('./components/DigitalSignature'));
const CentroCapacitaciones = lazyWithRetry(() => import('./components/Capacitaciones/CapacitacionesAdmin'));
const PublicCapacitacion = lazyWithRetry(() => import('./components/Capacitaciones/PublicCapacitacion'));
const ApprovalManager = lazyWithRetry(() => import('./components/ApprovalManager'));
const ChatbotWidget = lazyWithRetry(() => import('./components/ChatbotWidget'));
const DriverGamification = lazyWithRetry(() => import('./components/DriverGamification'));
const ExecutiveDashboard = lazyWithRetry(() => import('./components/ExecutiveDashboard'));
const GrupoInterView = lazyWithRetry(() => import('./components/GrupoInterView'));
const MastersuiteReport = lazyWithRetry(() => import('./components/MastersuiteReport'));
const TrainingAdmin = lazyWithRetry(() => import('./components/TrainingAdmin'));
const AjoverDashboard = lazyWithRetry(() => import('./components/AjoverDashboard'));
const PublicAttendanceForm = lazyWithRetry(() => import('./components/PublicAttendanceForm'));
const ConciliacionFacturas = lazyWithRetry(() => import('./components/ConciliacionFacturas'));
const ConsultaFacturas = lazyWithRetry(() => import('./components/ConsultaFacturas'));
const DevolucionesBodega = lazyWithRetry(() => import('./components/Devoluciones/DevolucionesBodega'));
const ConsultaInventario = lazyWithRetry(() => import('./components/ConsultaInventario'));
const SalidaProveedor = lazyWithRetry(() => import('./components/SalidaProveedor'));
const GestionHumanaMiscelaneos = lazyWithRetry(() => import('./components/GestionHumana/Miscelaneos'));
const GestionHumanaPersonal = lazyWithRetry(() => import('./components/GestionHumana/Personal'));
const GestionHumanaVisitas = lazyWithRetry(() => import('./components/GestionHumana/Visitas'));
const GestionHumanaEntregasSalidas = lazyWithRetry(() => import('./components/GestionHumana/EntregasSalidas'));
const GestionHumanaAsignacionDevolucion = lazyWithRetry(() => import('./components/GestionHumana/AsignacionDevolucion'));
const GestionHumanaConsultasInventario = lazyWithRetry(() => import('./components/GestionHumana/ConsultasInventario'));
const GestionHumanaMasterInventario = lazyWithRetry(() => import('./components/GestionHumana/MasterInventario'));
const GestionHumanaInventarioFisico = lazyWithRetry(() => import('./components/GestionHumana/InventarioFisico'));
const PublicSurvey = lazyWithRetry(() => import('./components/GestionHumana/PublicSurvey'));
const PublicTraining = lazyWithRetry(() => import('./components/GestionHumana/PublicTraining'));
const PublicVisitForm = lazyWithRetry(() => import('./components/GestionHumana/PublicVisitForm'));
const CfgCiudades = lazyWithRetry(() => import('./components/Configuracion/Ciudades'));
const ProvClientes = lazyWithRetry(() => import('./components/Configuracion/ProvClientes'));
const GestionDocumental = lazyWithRetry(() => import('./components/documents/GestionDocumental'));
const ValidacionConciliaciones = lazyWithRetry(() => import('./components/OperacionExito/ValidacionConciliaciones'));
const FletesConciliacion = lazyWithRetry(() => import('./components/OperacionExito/FletesConciliacion'));
const InformeDashboardDrive = lazyWithRetry(() => import('./components/documents/InformeDashboardDrive'));
const AuditoriaFactura = lazyWithRetry(() => import('./components/Logistics/AuditoriaFactura'));
const InformesGerenciales = lazyWithRetry(() => import('./components/Logistics/InformesGerenciales'));
const InformesFlota = lazyWithRetry(() => import('./components/Logistics/InformesFlota'));
const OperacionesFlotaManual = lazyWithRetry(() => import('./components/OperacionExito/OperacionesFlotaManual'));
const FormatosTransportes = lazyWithRetry(() => import('./components/AdminCenter/FormatosTransportes'));

// Import Admin Module
const AdminDBManager = lazyWithRetry(() => import('./pages/AdminDBManager'));

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
    needsWelcomeRedirect,
    isRestoring,
    isLoading,
    pages,
    modules,

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
    logout,
    setNeedsWelcomeRedirect
  } = useAppStore();

  const { refreshAppData } = useAppData();


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
        } else if (hash.includes('/attendance/register')) {
          setIsPortalMode(true); // Tratamos el registro como modo portal (sin sidebar)
        } else {
          setPortalRoute('login');
        }
      } else if (window.location.pathname.startsWith('/attendance/register')) {
        setIsPortalMode(true);
      } else if (window.location.pathname.startsWith('/publico/encuesta')) {
        setIsPortalMode(true);
      } else if (window.location.pathname.startsWith('/publico/capacitacion')) {
        setIsPortalMode(true);
      } else if (window.location.pathname.startsWith('/publico/visitas')) {
        setIsPortalMode(true);
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
    // Listener para fallos de JWT Global (401)
    const handleAuthFailure = (event: any) => {
      handleLogout(false);
      toast.error(event.detail?.message || "Sesión Invalida", {
        description: "Por favor inicie sesión nuevamente.",
        duration: 5000
      });
    };

    window.addEventListener('orbit-auth-failed', handleAuthFailure);

    return () => {
      window.removeEventListener('orbit-auth-failed', handleAuthFailure);
    };
  }, [isAuthenticated, activeTab]);

  useEffect(() => {

    const restoreSession = async () => {
      const savedUser = localStorage.getItem('m7_user_session');

      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          if (parsedUser && parsedUser.id) {
            // FIX: Expulsar sesiones antiguas que no tengan el nuevo token JWT
            if (!parsedUser.token) {
              console.warn('[SESSION-RESTORE] Sesión antigua sin token detectada. Forzando re-login.');
              localStorage.removeItem('m7_user_session');
              setIsRestoring(false);
              return;
            }

            // M7 SOLUCIÓN NUCLEAR: Forzar refresco de permisos para TODOS en cada restauración
            // Esto evita que datos obsoletos en localStorage permitan peticiones prohibidas
            const freshPerms = await api.getUserPermissions(parsedUser.id).catch(() => null);

            if (freshPerms) {
              if (Array.isArray(freshPerms)) {
                parsedUser.permissions = freshPerms;
              } else if (typeof freshPerms === 'object') {
                // Transformar el objeto plano (page_PAG-01_view: true) al formato de Array para el Layout y hasPermission
                const permMap = new Map<string, Set<string>>();
                Object.keys(freshPerms).forEach(key => {
                  if (freshPerms[key] === true) {
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
                parsedUser.permissions = Array.from(permMap.entries()).map(([module, actions]) => ({
                  module,
                  actions: Array.from(actions)
                }));
              }
            }


            setUser({
              ...parsedUser,
              documentNumber: parsedUser.documentNumber || parsedUser.document_number
            });
            setIsAuthenticated(true);

            // CARGAR DATOS MAESTROS FRESCOS CON EL CLIENTE RESTAURADO
            refreshAppData(parsedUser.clientId);

            // M7 FIX: Forzar redirección inteligente tras restauración de sesión si es nueva entrada
            useAppStore.setState({ needsWelcomeRedirect: true });

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

  // Refresh de módulos y páginas en cada navegación — garantiza que nuevas páginas/módulos
  // creadas manualmente aparezcan en el menú sin recargar la app completa
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    Promise.all([
      api.getModules().catch(() => []),
      api.getPages().catch(() => []),
    ]).then(([mods, pags]) => {
      if (Array.isArray(mods) && mods.length > 0) useAppStore.setState({ modules: mods });
      if (Array.isArray(pags) && pags.length > 0) useAppStore.setState({ pages: pags });
    });
  }, [activeTab, activePageId, isAuthenticated]);

  // Auto-refresh de datos operativos al navegar entre páginas
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const hasPerm = (mod: string) => hasPermission(user, mod, 'view');
    const clientId = user.clientId || (user.clientIds && user.clientIds[0]) || 'CLI-01';

    const staticTabs = ['dashboard', 'master', 'admin', 'seguridad', 'capacitaciones', 'formacion'];
    if (staticTabs.includes(activeTab)) return;

    const refreshOperational = async () => {
      try {
        const fetches: Promise<any>[] = [];

        if (['documentos', 'recibido', 'recibido-manual', 'cumplidos', 'rutas'].includes(activeTab)) {
          fetches.push(
            api.getDocuments(clientId).then(d => useAppStore.setState({ documents: d || [] })).catch(() => { })
          );
        }

        if (['documentos', 'recibido', 'recibido-manual', 'cumplidos', 'rutas', 'despacho', 'dashboard-ajover'].includes(activeTab)) {
          fetches.push(
            api.getInvoices(clientId).then(inv => useAppStore.setState({ invoices: inv || [] })).catch(() => { })
          );
        }

        if (['rutas', 'despacho', 'dashboard-ajover'].includes(activeTab)) {
          fetches.push(
            api.getRoutes().then(r => useAppStore.setState({ routes: r || [] })).catch(() => { })
          );
        }

        if (['rutas', 'despacho', 'vinculo', 'dashboard-ajover'].includes(activeTab)) {
          fetches.push(
            api.getAssignments().then(a => useAppStore.setState({ assignments: a || [] })).catch(() => { })
          );
        }

        if (['rutas', 'despacho', 'flotas', 'vinculo', 'dashboard-ajover'].includes(activeTab)) {
          fetches.push(
            api.getVehicles().then(v => useAppStore.setState({ vehicles: v || [] })).catch(() => { })
          );
        }

        await Promise.all(fetches);
      } catch { /* silencioso */ }
    };

    refreshOperational();
  }, [activeTab, activePageId]);



  // Polling global para indicador WhatsApp — DESACTIVADO hasta resolver servidor Evolution
  // useEffect(() => {
  //   if (!isAuthenticated || !user?.id) return;
  //   if (!hasPermission(user, 'WHATSAPP', 'view')) return;
  //   const checkWa = async () => {
  //     try {
  //       const res = await api.getWhatsAppStatus(user.id);
  //       setWaStatus(res.status === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED');
  //     } catch { }
  //   };
  //   checkWa();
  //   const timer = setInterval(checkWa, 30000);
  //   return () => clearInterval(timer);
  // }, [isAuthenticated, user?.id, user?.permissions]);

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
        clientIds: userData.client_ids || [firstClientId],
        token: authRes.token // AGREGADO: Guardar el token para api.ts
      } as any;

      setUser(finalUser);
      localStorage.setItem('m7_user_session', JSON.stringify(finalUser));
      localStorage.setItem('token', authRes.token); // Redundancia para api.ts
      setIsAuthenticated(true);

      // Disparar hidratación de catálogos y Layout usando Lazy Load (Asíncrono real)
      refreshAppData(firstClientId);

      // M7 FIX: Activar bandera de redirección inteligente tras login exitoso
      useAppStore.setState({ needsWelcomeRedirect: true });

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


  useEffect(() => {
    if (isAuthenticated && needsWelcomeRedirect && pages.length > 0 && modules.length > 0 && user) {

      const isSuperUser = user.roleId === 'ROL-01' || user.email === 'directorti@millasiete.com';

      // 1. PRIORIDAD: DASHBOARD (Usando utilidad centralizada)
      const hasDashboard = hasPermission(user, 'DASHBOARD', 'view');

      if (hasDashboard) {
        setActiveTab('dashboard');
        setActivePageId(''); // Limpiar ID de página para evitar componentes residuales
        setNeedsWelcomeRedirect(false);
        return;
      }


      // 2. BUSCAR PRIMERA PÁGINA PERMITIDA
      const allowedModules = modules
        .filter(m => (m.statusId || m.status_id) === 'EST-01')
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const mod of allowedModules) {
        const modId = String(mod.id).trim().toUpperCase();
        const firstPage = pages
          .filter(p => String(p.parentId || p.parent_id || '').trim().toUpperCase() === modId)
          .filter(p => (p.statusId || p.status_id) === 'EST-01')
          .filter(p => hasPermission(user, p.id, 'view'))
          .sort((a, b) => a.name.localeCompare(b.name))[0];

        if (firstPage) {
          const masterCat = getMasterCategoryFromRoute(firstPage.route, firstPage.id);
          const sanitizeRoute = (route: string): string => {
            if (!route) return '';
            if (!!masterCat) return 'master';
            return route.replace(/^\/+/, '').split('/')[0];
          };

          setActiveTab(sanitizeRoute(firstPage.route));
          if (masterCat) setActiveMasterCategory(masterCat as any);
          setActivePageId(firstPage.id);
          setNeedsWelcomeRedirect(false);
          return;
        }
      }

      // 3. FALLBACK: CAPACITACIONES (Si Dashboard falló)
      if (hasPermission(user, 'CAPACITACIONES', 'view')) {
        setActiveTab('capacitaciones');
        setNeedsWelcomeRedirect(false);
        return;
      }

      // 4. ULTIMO RECURSO: DASHBOARD
      setActiveTab('dashboard');
      setNeedsWelcomeRedirect(false);
    }
  }, [isAuthenticated, needsWelcomeRedirect, pages, modules, user]);


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
          onAudit={async () => { }}
        />
      );
    }

    switch (String(activeTab).toLowerCase()) {
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
      case 'cumplidos':
        return <GestionDocumental />;
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
            onRefresh={() => refreshAppData()}
            user={user!}
            masterEstados={allMasterData.masterEstados || []}
            masterNotificaciones={allMasterData.masterNotificaciones || []}
            masterTipoNotificacion={allMasterData.masterTipoNotificacion || []}
            masterArticulo={allMasterData.masterArticulo || []}
            onAddArticleToMaster={async (article) => {
              await api.saveArticle(article);
              setAllMasterData({ ...allMasterData, masterArticulo: [...(allMasterData.masterArticulo || []), article as MasterRecord] });
            }}
            onAddNotificationToMaster={async (notif) => {
              const newNotif = {
                id: notif.id || `not-${Date.now()}`,
                name: notif.name || 'inventario ajover',
                description: notif.description || '',
                notificationEmail: (notif as any).notificationEmail || '',
                tipoNotificacionId: (notif as any).tipoNotificacionId || null,
                statusId: notif.statusId || 'EST-01',
                createdBy: user?.name || 'System',
                updatedBy: user?.name || 'System',
              };
              await api.saveNotificacionConfig(newNotif);
              setAllMasterData({ ...allMasterData, masterNotificaciones: [...(allMasterData.masterNotificaciones || []), newNotif as MasterRecord] });
            }}
          />
        );
      case 'recibido-manual':
        return (
          <RecibidoManual
            documents={documents}
            onUpdateDocuments={setDocuments}
            user={user!}
            masterEstados={allMasterData.masterEstados || []}
            masterNotificaciones={allMasterData.masterNotificaciones || []}
            masterTipoNotificacion={allMasterData.masterTipoNotificacion || []}
            masterArticulo={allMasterData.masterArticulo || []}
            clients={allMasterData.masterClientes || []}
            onAddArticleToMaster={async (article) => {
              await api.saveArticle(article);
              setAllMasterData({ ...allMasterData, masterArticulo: [...(allMasterData.masterArticulo || []), article as MasterRecord] });
            }}
          />
        );
      case 'training-ops':
        return (
          <React.Suspense fallback={<div className="p-10">Cargando Administración...</div>}>
            <TrainingAdmin />
          </React.Suspense>
        );
      case 'grupo-inter-ops':
        return (
          <React.Suspense fallback={<div className="p-10">Cargando Grupo Inter View...</div>}>
            <GrupoInterView />
          </React.Suspense>
        );
      case 'informe-mastersuite':
        return (
          <React.Suspense fallback={<div className="p-10">Cargando Informe Mastersuite...</div>}>
            <MastersuiteReport />
          </React.Suspense>
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
              try {
                const res = await api.saveAssignment({ vehicleId: vId, driverId: dId, clientId: cId });
                if (res?.success) {
                  toast.success('Asignación guardada con éxito');
                } else {
                  toast.error('Error al guardar asignación', { description: res?.error || res?.message || 'Error desconocido' });
                }
              } catch (e: any) {
                console.error('Error saving assignment:', e);
                toast.error('Error en asignación', { description: e.message || 'Conflicto en el servidor' });
              } finally {
                // Siempre recargar desde el servidor para mantener estado real
                api.getAssignments().then(a => useAppStore.setState({ assignments: a || [] })).catch(() => { });
              }
            }}
            onEndAssignment={async (aId) => {
              try {
                await api.endAssignment(aId, user?.name);
                toast.success('Asignación finalizada');
              } catch (e) {
                console.error('Error ending assignment:', e);
                toast.error('Error al finalizar asignación');
              } finally {
                api.getAssignments().then(a => useAppStore.setState({ assignments: a || [] })).catch(() => { });
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
      case 'dashboard-ajover':
        return (
          <AjoverDashboard
            user={user!}
            vehicles={vehicles}
            drivers={drivers}
            routes={routes}
            invoices={invoices}
          />
        );
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
      case 'conciliacion':
        return <ConciliacionFacturas user={user!} />;
      case 'consulta-facturas':
        return <ConsultaFacturas user={user!} />;
      case 'devoluciones-bodega':
        return <DevolucionesBodega user={user!} />;
      case 'consulta-inventario':
        return <ConsultaInventario user={user!} />;
      case 'salida-proveedor':
        return <SalidaProveedor user={user!} />;
      case 'capacitaciones':
        return <CentroCapacitaciones user={user!} />;
      case 'chatbot':
        return <AIChat context={{ user: user!.name, activeTab: 'chatbot-fullscreen' }} />;
      case 'gestion-humana-miscelaneos':
        return <GestionHumanaMiscelaneos user={user!} />;
      case 'gestion-humana-personal':
        return <GestionHumanaPersonal user={user!} />;
      case 'gestion-humana-visitas':
        return <GestionHumanaVisitas user={user!} />;
      case 'gestion-humana-entregas-salidas':
        return <GestionHumanaEntregasSalidas user={user!} />;
      case 'gestion-humana-asignacion-devolucion':
        return <GestionHumanaAsignacionDevolucion user={user!} />;
      case 'gestion-humana-consultas-inventario':
        return <GestionHumanaConsultasInventario user={user!} />;
      case 'gestion-humana-master-inventario':
        return <GestionHumanaMasterInventario user={user!} />;
      case 'gestion-humana-inventario-fisico':
        return <GestionHumanaInventarioFisico user={user!} />;
      case 'cfg-ciudades':
        return <CfgCiudades user={user!} />;
      case 'prov-clientes':
        return <ProvClientes user={user!} />;
      case 'informe-dashboard-drive':
        return <InformeDashboardDrive user={user!} />;
      case 'auditoria-factura':
        return <AuditoriaFactura user={user!} />;
      case 'informes-gerenciales':
        return (
          <React.Suspense fallback={<div className="p-10">Cargando Informes Gerenciales...</div>}>
            <InformesGerenciales />
          </React.Suspense>
        );
      case 'informes-flota':
        return (
          <React.Suspense fallback={<div className="p-10">Cargando Informes Flota...</div>}>
            <InformesFlota user={user!} />
          </React.Suspense>
        );
      case 'operaciones-flota-manual':
        return (
          <React.Suspense fallback={<div className="p-10">Cargando Operaciones Flota...</div>}>
            <OperacionesFlotaManual user={user!} />
          </React.Suspense>
        );
      case 'validacion-conciliaciones':
        return <ValidacionConciliaciones user={user!} />;
      case 'fletes-conciliacion':
        return <FletesConciliacion user={user!} />;
      case 'formatos-transportes':
        return <FormatosTransportes />;
      default:
        return (
          <div className="p-10 border-2 border-dashed border-slate-200 rounded-[3rem] text-center">
            <h2 className="text-xl font-black text-slate-400 uppercase">Módulo: {activeTab}</h2>
          </div>
        );
    }
  };

  const handleBack = () => setActiveTab('dashboard');

  // 1. RUTA PÚBLICA PRIORITARIA:Encuesta Sociodemográfica (Sin login, sin portal)
  if (window.location.pathname.startsWith('/publico/encuesta')) {
    return (
      <>
        <AutoUpdate />
        <React.Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-slate-950"><div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>}>
          <PublicSurvey />
        </React.Suspense>
      </>
    );
  }

  if (window.location.pathname.startsWith('/publico/capacitacion')) {
    return (
      <>
        <AutoUpdate />
        <React.Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-slate-950"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
          <PublicTraining />
        </React.Suspense>
      </>
    );
  }

  if (window.location.pathname.startsWith('/publico/cap')) {
    return (
      <>
        <React.Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-slate-950"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
          <PublicCapacitacion />
        </React.Suspense>
      </>
    );
  }

  if (window.location.pathname.startsWith('/publico/visitas')) {
    return (
      <>
        <AutoUpdate />
        <React.Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-slate-950"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
          <PublicVisitForm />
        </React.Suspense>
      </>
    );
  }

  // 2. MODO PORTAL: Asistencia o Cliente
  if (isPortalMode) {
    const isAttendance = window.location.pathname.startsWith('/attendance/register');

    return (
      <>
        <Toaster position="top-right" richColors theme="dark" />
        <PWABanner />
        <AutoUpdate />

        <PortalLayout>
          {isAttendance ? (
            <PublicAttendanceForm />
          ) : (
            <>
              {portalRoute === 'login' && <ClientLogin onLogin={(token, user) => {
                localStorage.setItem('m7_client_token', token);
                window.location.hash = '#/portal/tracking';
              }} />}
              {portalRoute === 'tracking' && <OrderTracking />}
            </>
          )}
        </PortalLayout>
      </>
    );
  }

  // 3. MODO ADMINISTRADOR (Requiere Login)
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
      <PWABanner />
      <AutoUpdate />

      <React.Suspense fallback={
        <div className="flex items-center justify-center h-screen w-full bg-slate-950">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs animate-pulse">Cargando Módulos...</p>
          </div>
        </div>
      }>
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
              await api.saveUser(updatedUser);

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

      </React.Suspense>
    </>
  );
};

export default App;
