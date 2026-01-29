
import React, { useState, useEffect } from 'react';
import { User, PageModule, MasterCategory, MasterRecord } from './types';
import Login from './components/Login';
import Layout from './components/Layout';
import MasterModule from './components/MasterModule';
import WhatsAppConnect from './components/WhatsAppConnect';
import GestionDocumentosL from './components/GestionDocumentosL';
import RoutePlanner from './components/RoutePlanner';
import RecibidoMaterial from './components/RecibidoMaterial';
import FleetManager from './components/FleetManager';
import AssignmentManager from './components/AssignmentManager';
import AIChat from './components/AIChat';
import { api } from './services/api';
import { Icons, INITIAL_VEHICLES, INITIAL_DRIVERS, INITIAL_ARTICLES } from './constants';
import { Toaster, toast } from 'sonner';


const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem('m7_active_tab') || 'dashboard');
  const [activeMasterCategory, setActiveMasterCategory] = useState<MasterCategory>('masterUsuarios');
  const [allMasterData, setAllMasterData] = useState<{ [key in MasterCategory]?: MasterRecord[] }>({
    masterUsuarios: [],
    masterClientes: [],
    masterArticulo: [],
    masterTiposVehiculo: [],
    masterEstados: [
        { id: 'EST-01', name: 'ACTIVO', statusId: 'EST-01' } as any,
        { id: 'EST-02', name: 'INACTIVO', statusId: 'EST-01' } as any
    ],
    masterModulos: [],
    masterPaginas: []
  });
  const [waStatus, setWaStatus] = useState<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED');
  const [isLoading, setIsLoading] = useState(false);
  
  const normalize = (data: any[]) => {
    return data.map(item => ({
      ...item,
      statusId: item.statusId || item.status_id,
      parentId: item.parentId || item.parent_id,
      moduleId: item.moduleId || item.module_id,
      iconClass: item.iconClass || item.icon_class,
      roleId: item.roleId || item.role_id
    }));
  };
  
  // Estados Operativos
  const [documents, setDocuments] = useState<any[]>([
    { 
        id: 'DOC-MOCK-01', 
        externalDocId: 'CARGA-123', 
        vehicleData: 'XYZ-123', 
        status: 'Pendiente', 
        statusId: 'EST-03', 
        clientId: 'c1',
        codplan: 'UN-999',
        city: 'BOGOTÁ',
        createdAt: new Date().toISOString(),
        items: [] 
    },
    { 
        id: 'DOC-MOCK-02', 
        externalDocId: 'PLAN-456', 
        vehicleData: 'ABC-789', 
        status: 'Inventariado', // IMPORTANTE para RoutePlanner
        statusId: 'EST-01', 
        clientId: 'c1',
        codplan: 'UN-888',
        city: 'BOGOTÁ',
        createdAt: new Date().toISOString(),
        items: [] 
    }
  ]);
  const [invoices, setInvoices] = useState<any[]>([
    {
        id: 'INV-01',
        clientId: 'c1',
        docLId: 'DOC-MOCK-02',
        customerName: 'FERRETERIA EL MARTILLO',
        address: 'Calle 80 # 45-67',
        lat: 4.6823,
        lng: -74.0567,
        volumeM3: 12.5,
        status: 'Pendiente',
        city: 'BOGOTÁ'
    },
    {
        id: 'INV-02',
        clientId: 'c1',
        docLId: 'DOC-MOCK-02',
        customerName: 'CONSTRUCTORA BOLIVAR',
        address: 'Av Boyaca # 12-34',
        lat: 4.6543,
        lng: -74.1234,
        volumeM3: 8.2,
        status: 'Pendiente',
        city: 'BOGOTÁ'
    }
  ]);
  const [drivers, setDrivers] = useState<any[]>(INITIAL_DRIVERS);
  const [vehicles, setVehicles] = useState<any[]>(INITIAL_VEHICLES);
  const [assignments, setAssignments] = useState<any[]>([]);

  const [isRestoring, setIsRestoring] = useState(true);
  
  // Timeout - 10 Minutos (600,000 ms)
  const TIMEOUT_MS = 10 * 60 * 1000;
  const WARNING_MS = 1 * 60 * 1000; // Aviso 1 minuto antes
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60); // Segundos para el aviso
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
            console.log('[M7-AUTH] Timeout por inactividad');
            handleLogout(true);
        }, TIMEOUT_MS);

        // Timer de aviso a los 9 minutos
        warningTimer = setTimeout(() => {
            setShowTimeoutWarning(true);
            setTimeLeft(60);
            countdownInterval = setInterval(() => {
                setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
            }, 1000);
        }, TIMEOUT_MS - WARNING_MS);
    }
  };

  useEffect(() => {
      // Eventos de actividad
      window.addEventListener('mousemove', resetInactivityTimer);
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

  // Efecto para restaurar sesión
  useEffect(() => {
    console.log('%c [M7-VERSION] FRONTEND V1.0.2 - FE-SYNC-FIX ', 'background: #10b981; color: #fff; font-weight: bold;');
    
    const restoreSession = async () => {
        const savedUser = localStorage.getItem('m7_user_session');
        const savedMaster = localStorage.getItem('m7_master_data');
        
        if (savedUser) {
          try {
            const parsedUser = JSON.parse(savedUser);
            // FORZAR LOGOUT SI EL ID ES VIEJO O INCOMPLETO
            if (parsedUser && (parsedUser.id === 'U-001' || !parsedUser.permissions)) {
                 console.warn('[M7-AUTH] Sesión antigua detectada, forzando limpieza...');
                 handleLogout();
                 return;
            }

            if (parsedUser && parsedUser.id) {
                // SOLUCIÓN REAL: Forzar refresco de permisos para Admin en cada restauración
                if (parsedUser.roleId === 'ROL-01' || parsedUser.id === 'USR-01') {
                    console.log('[M7-AUTH] Refrescando permisos para Admin...');
                    const freshPerms = await api.getUserPermissions(parsedUser.id).catch(() => null);
                    if (freshPerms && Array.isArray(freshPerms)) {
                        parsedUser.permissions = freshPerms;
                    }
                }

                setUser(parsedUser);
                setIsAuthenticated(true);
                
                // CARGAR DATOS MAESTROS FRESCOS (IGNORAR CACHÉ SI ES POSIBLE)
                // CARGAR DATOS MAESTROS FRESCOS (IGNORAR CACHÉ SI ES POSIBLE)
                console.log('[M7-AUTH] Obteniendo datos maestros frescos...');
                const [modules, pages, genericMasters] = await Promise.all([
                    api.getModules().then(normalize).catch(() => []),
                    api.getPages().then(normalize).catch(() => []),
                    api.getGenericMasters().catch(() => [])
                ]);

                // Agrupar maestros genéricos
                const groupedMasters: any = {};
                if (Array.isArray(genericMasters)) {
                    genericMasters.forEach((m: any) => {
                        if (!groupedMasters[m.category]) groupedMasters[m.category] = [];
                        groupedMasters[m.category].push(m);
                    });
                }

                setAllMasterData(prev => ({
                    ...prev,
                    ...groupedMasters,
                    masterModulos: modules,
                    masterPaginas: pages
                }));

                if (savedMaster) {
                  try {
                      // Solo restaurar del caché lo que NO sea crítico/dinámico
                      const parsedMaster = JSON.parse(savedMaster);
                      setAllMasterData(prev => ({
                          ...parsedMaster, 
                          ...groupedMasters, // Prioridad a lo fresco de DB
                          masterModulos: modules, 
                          masterPaginas: pages
                      }));
                  } catch (e) { console.warn('Master data corrupto'); }
                }
          } catch (e) {
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
    if (!isAuthenticated) return;
    const checkWa = async () => { try { const res = await api.getWhatsAppStatus(); setWaStatus(res.status === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED'); } catch {} };
    checkWa();
    const timer = setInterval(checkWa, 30000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  const handleLogin = async (email: string, pass: string): Promise<boolean> => {
    try {
        setIsLoading(true);
        // 1. Autenticación Real
        const authRes = await api.login(email, pass);
        console.log('[M7-LOGIN] Auth Response:', authRes);
        
        if (!authRes.success) {
            console.log('[M7-LOGIN] Login failed - invalid credentials');
            return false;
        }
        
        const userData = authRes.user;
        console.log('[M7-LOGIN] User Data:', userData);
        
        // 2. Cargar permisos del usuario
        const userPermissions = await api.getUserPermissions(userData.id).catch(() => null);
        console.log('[M7-LOGIN] User Permissions:', userPermissions);
        
        // 3. Carga de Datos Iniciales (Parciales/Mock desde Backend)
        const [clients, users, roles, modules, pages, permissions, genericMasters] = await Promise.all([
            api.getClients().catch(() => []),
            api.getUsers().catch(() => []),
            api.getRoles().catch(() => []),
            api.getModules().then(normalize).catch(() => []),
            api.getPages().then(normalize).catch(() => []),
            api.getPermissions().catch(() => []),
            api.getGenericMasters().catch(() => [])
        ]);
        
        console.log('[M7-LOGIN] Modules:', modules);
        console.log('[M7-LOGIN] Pages:', pages);
        console.log('[M7-LOGIN] Generic Masters Loaded:', genericMasters.length);

        // Agrupar maestros genéricos por categoría
        const groupedMasters: any = {};
        if (Array.isArray(genericMasters)) {
            genericMasters.forEach((m: any) => {
                if (!groupedMasters[m.category]) groupedMasters[m.category] = [];
                groupedMasters[m.category].push(m);
            });
        }

        // 4. Mapear permisos del usuario al formato esperado
        let mappedPermissions: any[] = [];
        if (Array.isArray(userPermissions)) {
            mappedPermissions = userPermissions;
        } else if (userPermissions) {
            pages.forEach((page: any) => {
                const pageId = page.id;
                const actions: string[] = [];
                if (userPermissions[`page_${pageId}_view`]) actions.push('view');
                if (userPermissions[`page_${pageId}_create`]) actions.push('create');
                if (userPermissions[`page_${pageId}_edit`]) actions.push('edit');
                if (userPermissions[`page_${pageId}_delete`]) actions.push('delete');
                if (userPermissions[`page_${pageId}_active`]) actions.push('active');
                if (actions.length > 0) mappedPermissions.push({ module: pageId, actions });
            });
        }
        
        console.log('[M7-LOGIN] Mapped Permissions:', mappedPermissions);

        // 5. Configuración de Maestros con datos reales
        setAllMasterData(prev => ({
            ...prev,
            ...groupedMasters, // Fusionar maestros dinámicos (TipoDocumento, Notificaciones, etc.)
            masterClientes: clients,
            masterUsuarios: users,
            masterRol: roles,
            masterModulos: modules,
            masterPaginas: pages,
            masterPermisosRol: permissions
        }));

        // 6. Cargar Datos Operativos
        const [docsData, vehData] = await Promise.all([
            api.getDocuments().catch(() => []),
            api.getVehicles().catch(() => [])
        ]);
        setDocuments(docsData);
        setVehicles(vehData);
        // Podríamos cargar mas aquí si existieran los endpoints

        const finalUser = {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            role: userData.role_id === 'ROL-01' ? 'Administrador' : 'Usuario',
            roleId: userData.role_id,
            permissions: mappedPermissions,
            createdAt: '', updatedAt: '', createdBy: '', updatedBy: '', statusId: 'EST-01',
            clientId: 'c1' // Debe coincidir con INITIAL_CLIENTS
        } as any;

        setUser(finalUser);
        
        // Persistir sesión
        localStorage.setItem('m7_user_session', JSON.stringify(finalUser));
        localStorage.setItem('m7_master_data', JSON.stringify({
            ...allMasterData,
            masterClientes: clients,
            masterUsuarios: users,
            masterRol: roles,
            masterModulos: modules,
            masterPaginas: pages,
            masterPermisosRol: permissions
        }));

        setIsAuthenticated(true);
        toast.success(`Bienvenido, ${userData.name}`, {
          description: 'Conexión exitosa al sistema M7 Intelligence.',
          duration: 3000
        });
        return true;

    } catch (error) {
        console.error("[M7-LOGIN] Login Error:", error);
        return false;
    } finally {
        setIsLoading(false);
    }
  };

  const handleLogout = (expired = false) => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('m7_user_session');
    localStorage.removeItem('m7_active_tab');
    localStorage.removeItem('m7_master_data');
    if (expired) {
        toast.error("Sesión expirada por inactividad");
    } else {
        toast.info("Sesión finalizada");
    }
    // No recargar para permitir mostrar el toast y volver al login limpiamente
    // window.location.reload(); 
  };

  if (isRestoring) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-slate-950">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs animate-pulse">Restaurando Sistema M7...</p>
              </div>
          </div>
      );
  }

  const renderContent = () => {
    const availableVehiclesCount = vehicles.filter(v => v.status === 'Disponible' || v.status === 'Available').length;
    
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="p-10 text-center animate-in fade-in duration-700">
            <h2 className="text-5xl font-black text-slate-900 mb-6 uppercase tracking-tighter">PROCESADOR MILLA SIETE</h2>
            <div className="w-32 h-2 bg-emerald-500 mx-auto rounded-full mb-10"></div>
            
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${waStatus === 'CONNECTED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'} mb-10`}>
                <div className={`w-2 h-2 rounded-full ${waStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-widest">{waStatus === 'CONNECTED' ? 'ASISTENTE ONLINE' : 'ASISTENTE OFFLINE'}</span>
            </div>

            {/* HERO BANNER PROACTIVO - VISIBILIDAD MÁXIMA AL INICIO */}
            <div className={`max-w-6xl mx-auto mb-12 p-1 relative overflow-hidden rounded-[3.5rem] group transition-all duration-700 shadow-2xl ${
                documents.length === 0 
                ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600' 
                : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'
            }`}>
                <div className="bg-slate-950/90 backdrop-blur-3xl p-10 md:p-14 rounded-[3.3rem] relative overflow-hidden flex flex-col md:flex-row items-center gap-10 border border-white/5">
                    {/* Background Brain Animation */}
                    <div className="absolute top-0 right-0 p-10 text-emerald-500/5 group-hover:scale-110 transition-transform duration-1000 hidden md:block">
                        <Icons.Brain style={{ width: '250px', height: '250px' }} />
                    </div>

                    <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center shrink-0 shadow-2xl animate-pulse relative z-10 ${
                        documents.length === 0 ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-amber-500 shadow-amber-500/20'
                    }`}>
                        <Icons.Sparkles className="text-slate-950 w-14 h-14" />
                    </div>

                    <div className="text-left flex-1 relative z-10">
                        <div className={`inline-block px-4 py-1.5 rounded-full mb-6 border ${
                            documents.length === 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                        }`}>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Centro de Mando Inteligente M7</span>
                        </div>
                        
                        <h3 className="text-white font-black text-3xl md:text-5xl uppercase tracking-tighter mb-4 leading-none">
                            {documents.length === 0 
                                ? "Listo para procesar tu logística" 
                                : "Hay tareas críticas que requieren tu atención"}
                        </h3>
                        
                        <p className="text-slate-400 text-lg md:text-xl font-medium leading-relaxed max-w-3xl">
                            {documents.length === 0 
                                ? "Tu panel está limpio. Sube un archivo de preventa para que M7 IQ pueda generar tus rutas optimizadas ahora."
                                : `He detectado ${documents.length} documentos detenidos. ¿Quieres que audite la carga para liberar rutas de inmediato?`}
                        </p>

                        <div className="mt-10 flex flex-wrap gap-5">
                            <button 
                                onClick={() => setActiveTab('documentos')} 
                                className={`px-10 py-5 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl ${
                                    documents.length === 0 
                                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' 
                                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                }`}
                            >
                                {documents.length === 0 ? "Abrir Gestor de Documentos" : "Iniciar Auditoría IA"}
                            </button>
                            <button 
                                onClick={() => toast.success("M7 IQ: Consultando núcleo de inteligencia...", { description: "Usa el widget inferior para ver mi reporte completo." })} 
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
                    <h4 className="text-2xl font-black text-white tracking-tighter mb-2">Plan de Vuelo IQ</h4>
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
            allMasterData={allMasterData}
            setAllMasterData={setAllMasterData}
            user={user!}
            onAudit={() => {}}
          />
        );
      case 'whatsapp-status':
          return <WhatsAppConnect />;
      case 'documentos':
          return (
            <GestionDocumentosL 
              documents={documents} 
              invoices={invoices} 
              user={user!} 
              masterEstados={allMasterData.masterEstados || []}
              onAddDocuments={(newDocs) => setDocuments([...newDocs, ...documents])}
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
              user={user!}
              onAssign={(vId, dId, cId) => {
                const newAssign = { id: `as-${Date.now()}`, vehicleId: vId, driverId: dId, clientId: cId, statusId: 'EST-01' };
                setAssignments([...assignments, newAssign]);
              }}
              onSaveRoute={(route) => {
                console.log('Ruta Guardada:', route);
                alert('Ruta M7 Guardada Exitosamente');
              }}
            />
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
              onAddArticleToMaster={() => {}}
              onAddNotificationToMaster={() => {}}
            />
          );
      case 'flotas':
          return (
            <FleetManager 
              vehicles={vehicles} 
              drivers={drivers} 
              user={user!} 
              masterData={allMasterData}
              onAddVehicle={(v) => setVehicles([...vehicles, { ...v, id: `v-${Date.now()}` }])}
              onAddDriver={(d) => setDrivers([...drivers, { ...d, id: `d-${Date.now()}` }])}
              onUpdateVehicle={(id, data) => setVehicles(vehicles.map(v => v.id === id ? { ...v, ...data } : v))}
              onUpdateDriver={(id, data) => setDrivers(drivers.map(d => d.id === id ? { ...d, ...data } : d))}
            />
          );
      case 'vinculo':
          return (
            <AssignmentManager 
              vehicles={vehicles} 
              drivers={drivers} 
              assignments={assignments} 
              user={user!} 
              onAssign={(vId, dId, cId) => {
                const newAssign = { id: `as-${Date.now()}`, vehicleId: vId, driverId: dId, clientId: cId, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                setAssignments([...assignments, newAssign]);
              }}
              onEndAssignment={(aId) => {
                setAssignments(assignments.map(a => a.id === aId ? { ...a, isActive: false, updatedAt: new Date().toISOString() } : a));
              }}
            />
          );
      default:
        return (
          <div className="p-10 border-2 border-dashed border-slate-200 rounded-[3rem] text-center">
            <h2 className="text-xl font-black text-slate-400 uppercase">Módulo: {activeTab}</h2>
          </div>
        );
    }
  };

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
        user={user} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        activeMasterCategory={activeMasterCategory}
        setActiveMasterCategory={setActiveMasterCategory}
        onUpdateUser={async (data) => {
             try {
                 const updatedUser = { ...user, ...data };
                 setUser(updatedUser);
                 // Persistir en Backend
                 console.log('[M7-APP] Persistiendo usuario...', updatedUser);
                 await api.saveUser(updatedUser);
                 localStorage.setItem('m7_user_session', JSON.stringify(updatedUser));
             } catch (e) {
                 console.error('[M7-APP] Error al guardar perfil:', e);
                 toast.error("Error al guardar en servidor", { description: "Los cambios son locales temporalmente." });
             }
        }}
        onLogout={handleLogout}
        modulesData={allMasterData.masterModulos}
        pagesData={allMasterData.masterPaginas}
      >
        {renderContent()}
      </Layout>
      
      <AIChat 
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
