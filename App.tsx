
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Login from './components/Login';
import GestionDocumentosL from './components/GestionDocumentosL';
import RecibidoMaterial from './components/RecibidoMaterial';
import RoutePlanner from './components/RoutePlanner';
import FleetManager from './components/FleetManager';
import AssignmentManager from './components/AssignmentManager';
import MasterModule from './components/MasterModule';
import HelpChat from './components/HelpChat';
import { 
  Vehicle, Driver, DocumentL, DocStatus, 
  VehicleStatus, Invoice, Route, UserRole, User, PageModule, VehicleAssignment, MasterCategory, MasterRecord, Article
} from './types';
import { INITIAL_VEHICLES, Icons, INITIAL_DRIVERS, INITIAL_USERS_DATA, INITIAL_CLIENTS, AVATAR_GALLERY, INITIAL_ARTICLES } from './constants';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<PageModule | 'receiving'>('dashboard');
  const [activeMasterCategory, setActiveMasterCategory] = useState<MasterCategory>('masterTiposVehiculo');
  const [allMasterData, setAllMasterData] = useState<{ [key in MasterCategory]?: MasterRecord[] }>({});
  
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES.map(v => ({...v, clientId: 'c1'})) as any);
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS.map(d => ({...d, clientId: 'c1'})) as any);
  const [assignments, setAssignments] = useState<VehicleAssignment[]>([]);
  const [documents, setDocuments] = useState<DocumentL[]>([]);
  const [invoices] = useState<Invoice[]>([
    { id: 'F-101', clientId: 'c1', docLId: 'doc-001', customerName: 'Ferretería El Martillo', address: 'Calle 10 #45-23, Bogotá', lat: 4.61, lng: -74.12, volumeM3: 5.5, status: DocStatus.PENDING, createdBy: 'SYSTEM', createdAt: new Date().toISOString(), updatedBy: 'SYSTEM', updatedAt: new Date().toISOString(), statusId: 'EST-03' },
    { id: 'F-102', clientId: 'c1', docLId: 'doc-001', customerName: 'Construmax Norte', address: 'Av Boyacá #127-10, Bogotá', lat: 4.71, lng: -74.07, volumeM3: 12.2, status: DocStatus.PENDING, createdBy: 'SYSTEM', createdAt: new Date().toISOString(), updatedBy: 'SYSTEM', updatedAt: new Date().toISOString(), statusId: 'EST-03' },
  ]);

  useEffect(() => {
    const cats: MasterCategory[] = [
      'masterEstados', 'masterTiposVehiculo', 'masterMarcas', 'masterNotificaciones', 
      'masterTIpoNotificacion', 'masterUnidadMedida', 'masterArticulo', 'masterClientes', 
      'masterUsuarios', 'masterRol', 'masterPermisosRol', 'masterPermisosUsuario', 'masterTipoDocumento', 
      'masterModulos', 'masterPaginas', 'masterCategorias'
    ];
    const initial: any = {};
    cats.forEach(c => initial[c] = []);

    initial['masterEstados'] = [
      { id: 'EST-01', name: 'ACTIVO', description: 'Habilitado', statusId: 'EST-01' },
      { id: 'EST-02', name: 'INACTIVO', description: 'Deshabilitado', statusId: 'EST-01' },
      { id: 'EST-03', name: 'PENDIENTE AUDITORÍA', description: 'Cargue inicial en espera', statusId: 'EST-01' }
    ];

    initial['masterTiposVehiculo'] = [
      { id: 'TV-01', name: 'TURBO', description: '4.5 Ton', statusId: 'EST-01' },
      { id: 'TV-02', name: 'SENCILLO', description: '8.5 Ton', statusId: 'EST-01' },
      { id: 'TV-03', name: 'DOBLE TROQUE', description: '16 Ton', statusId: 'EST-01' },
      { id: 'TV-04', name: 'CUATRO MANOS', description: '22 Ton', statusId: 'EST-01' },
      { id: 'TV-05', name: 'MINI MULA', description: '20 Ton', statusId: 'EST-01' },
      { id: 'TV-06', name: 'TRACTO CAMIÓN', description: '35 Ton', statusId: 'EST-01' }
    ];

    initial['masterMarcas'] = [
      { id: 'M-01', name: 'CHEVROLET', statusId: 'EST-01' },
      { id: 'M-02', name: 'HINO', statusId: 'EST-01' },
      { id: 'M-03', name: 'INTERNATIONAL', statusId: 'EST-01' },
      { id: 'M-04', name: 'KENWORTH', statusId: 'EST-01' },
      { id: 'M-05', name: 'JAC', statusId: 'EST-01' },
      { id: 'M-06', name: 'FOTON', statusId: 'EST-01' }
    ];

    initial['masterUnidadMedida'] = [
      { id: 'UM-01', name: 'UNIDAD', conversionUnd: 1, statusId: 'EST-01' },
      { id: 'UM-02', name: 'PAQUETE', conversionUnd: 10, statusId: 'EST-01' },
      { id: 'UM-03', name: 'ESTIBA', conversionUnd: 100, statusId: 'EST-01' },
      { id: 'UM-04', name: 'ATADO', conversionUnd: 25, statusId: 'EST-01' },
      { id: 'UM-05', name: 'ROLLO', conversionUnd: 1, statusId: 'EST-01' }
    ];

    initial['masterCategorias'] = [
      { id: 'CAT-01', name: 'TEJAS', statusId: 'EST-01' },
      { id: 'CAT-02', name: 'TANQUES', statusId: 'EST-01' },
      { id: 'CAT-03', name: 'ACCESORIOS', statusId: 'EST-01' },
      { id: 'CAT-04', name: 'HERRAMIENTAS', statusId: 'EST-01' }
    ];

    initial['masterTipoDocumento'] = [
      { id: 'TD-01', name: 'CÉDULA DE CIUDADANÍA', description: 'CC Colombia', statusId: 'EST-01' },
      { id: 'TD-02', name: 'NIT', description: 'Número Identificación Tributaria', statusId: 'EST-01' },
      { id: 'TD-03', name: 'CÉDULA EXTRANJERÍA', description: 'CE', statusId: 'EST-01' },
      { id: 'TD-04', name: 'PASAPORTE', description: 'Global', statusId: 'EST-01' }
    ];

    initial['masterTIpoNotificacion'] = [
      { id: 'TN-01', name: 'INVENTARIO AJOVER', description: 'Alertas de recibo', statusId: 'EST-01' }
    ];

    initial['masterNotificaciones'] = [
      { id: 'NT-01', name: 'LOGISTICA AJOVER', notificationEmail: 'logistica@ajover.com', tipoNotificacionId: 'TN-01', statusId: 'EST-01' }
    ];

    initial['masterRol'] = [
      { id: 'ROL-01', name: 'SUPERUSUARIO', description: 'Acceso Total M7', statusId: 'EST-01' },
      { id: 'ROL-02', name: 'ADMINISTRADOR', description: 'Gestión Administrativa', statusId: 'EST-01' }
    ];

    initial['masterUsuarios'] = INITIAL_USERS_DATA;
    initial['masterClientes'] = INITIAL_CLIENTS;
    initial['masterArticulo'] = INITIAL_ARTICLES;
    
    initial['masterModulos'] = [
      { id: 'MOD-01', name: 'Tablero Control', iconClass: 'Search', statusId: 'EST-01' },
      { id: 'MOD-02', name: 'Gestión Ajover', iconClass: 'Package', statusId: 'EST-01' },
      { id: 'MOD-03', name: 'Gestión Transporte', iconClass: 'Route', statusId: 'EST-01' },
      { id: 'MOD-04', name: 'Seguridad & Acceso', iconClass: 'Users', statusId: 'EST-01' },
      { id: 'MOD-05', name: 'Configuración Maestros', iconClass: 'Settings', statusId: 'EST-01' },
    ];

    const pages = [
      { id: 'PAG-OP-01', parentId: 'MOD-01', name: 'Resumen Global', route: 'dashboard', statusId: 'EST-01' },
      { id: 'PAG-OP-02', parentId: 'MOD-02', name: 'Gestión Documentos L', route: 'inventory', statusId: 'EST-01' },
      { id: 'PAG-OP-03-REC', parentId: 'MOD-02', name: 'Recibido Material', route: 'receiving', statusId: 'EST-01' },
      { id: 'PAG-OP-04', parentId: 'MOD-02', name: 'Planear Rutas', route: 'routing', statusId: 'EST-01' },
      { id: 'PAG-OP-05', parentId: 'MOD-03', name: 'Flota & Conductores', route: 'fleet', statusId: 'EST-01' },
      { id: 'PAG-OP-06', parentId: 'MOD-03', name: 'Vínculo Operativo', route: 'assignments', statusId: 'EST-01' },
      { id: 'PAG-ACC-01', parentId: 'MOD-04', name: 'Usuarios', route: 'access', moduleId: 'masterUsuarios', statusId: 'EST-01' },
      { id: 'PAG-ACC-02', parentId: 'MOD-04', name: 'Roles de Sistema', route: 'access', moduleId: 'masterRol', statusId: 'EST-01' },
      { id: 'PAG-ACC-03', parentId: 'MOD-04', name: 'Permisos por Rol', route: 'access', moduleId: 'masterPermisosRol', statusId: 'EST-01' },
      { id: 'PAG-ACC-04', parentId: 'MOD-04', name: 'Permisos por Usuario', route: 'access', moduleId: 'masterPermisosUsuario', statusId: 'EST-01' },
      { id: 'PAG-ACC-05', parentId: 'MOD-04', name: 'Módulos Sistema', route: 'access', moduleId: 'masterModulos', statusId: 'EST-01' },
      { id: 'PAG-ACC-06', parentId: 'MOD-04', name: 'Páginas Web', route: 'access', moduleId: 'masterPaginas', statusId: 'EST-01' },
      { id: 'PAG-MST-01', parentId: 'MOD-05', name: 'Estados Globales', route: 'master', moduleId: 'masterEstados', statusId: 'EST-01' },
      { id: 'PAG-MST-02', parentId: 'MOD-05', name: 'Tipos Vehículo', route: 'master', moduleId: 'masterTiposVehiculo', statusId: 'EST-01' },
      { id: 'PAG-MST-03', parentId: 'MOD-05', name: 'Marcas', route: 'master', moduleId: 'masterMarcas', statusId: 'EST-01' },
      { id: 'PAG-MST-04', parentId: 'MOD-05', name: 'Tipos Notificación', route: 'master', moduleId: 'masterTIpoNotificacion', statusId: 'EST-01' },
      { id: 'PAG-MST-05', parentId: 'MOD-05', name: 'Notificaciones', route: 'master', moduleId: 'masterNotificaciones', statusId: 'EST-01' },
      { id: 'PAG-MST-06', parentId: 'MOD-05', name: 'Unidades Medida', route: 'master', moduleId: 'masterUnidadMedida', statusId: 'EST-01' },
      { id: 'PAG-MST-07', parentId: 'MOD-05', name: 'Artículos', route: 'master', moduleId: 'masterArticulo', statusId: 'EST-01' },
      { id: 'PAG-MST-08', parentId: 'MOD-05', name: 'Clientes', route: 'master', moduleId: 'masterClientes', statusId: 'EST-01' },
      { id: 'PAG-MST-09', parentId: 'MOD-05', name: 'Tipos Documento', route: 'master', moduleId: 'masterTipoDocumento', statusId: 'EST-01' },
      { id: 'PAG-MST-10', parentId: 'MOD-05', name: 'Categorías Artículos', route: 'master', moduleId: 'masterCategorias', statusId: 'EST-01' },
    ];
    initial['masterPaginas'] = pages;

    // Matriz de permisos inicial para el superusuario
    const superPerms: any = { id: 'PERM-ROL-01', roleId: 'ROL-01', statusId: 'EST-01' };
    pages.forEach(p => {
      ['view', 'create', 'edit', 'delete', 'active'].forEach(a => { superPerms[`page_${p.id}_${a}`] = true; });
    });
    initial['masterPermisosRol'] = [superPerms];

    setAllMasterData(initial);
  }, []);

  const handleLogin = (email: string, password?: string) => {
    const userInDb = INITIAL_USERS_DATA.find(u => u.email.trim().toLowerCase() === email.trim().toLowerCase() && u.password === password);
    if (userInDb) {
      setCurrentUser({ ...userInDb, id: userInDb.id, role: UserRole.ADMIN, clientId: userInDb.clientIds?.[0] || 'c1', permissions: [], avatar: userInDb.avatar || AVATAR_GALLERY[1], statusId: 'EST-01' } as any);
      setIsAuthenticated(true);
      setActiveTab('dashboard');
      return true;
    }
    return false;
  };

  if (!isAuthenticated) return <Login onLogin={handleLogin} />;

  return (
    <Layout 
      activeTab={activeTab} setActiveTab={(t: any) => setActiveTab(t)} 
      activeMasterCategory={activeMasterCategory} setActiveMasterCategory={setActiveMasterCategory}
      user={currentUser!} onUpdateUser={data => setCurrentUser({...currentUser!, ...data})} onLogout={() => setIsAuthenticated(false)}
      modulesData={allMasterData['masterModulos']} pagesData={allMasterData['masterPaginas']}
    >
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 animate-in fade-in duration-700">
           <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl border-b-4 border-b-emerald-500"><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Vehículos</p><p className="text-4xl font-black text-slate-900 mt-2">{vehicles.length}</p></div>
           <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl border-b-4 border-b-emerald-500"><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Conductores</p><p className="text-4xl font-black text-slate-900 mt-2">{drivers.length}</p></div>
           <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl border-b-4 border-b-emerald-500"><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Doc. Pendientes</p><p className="text-4xl font-black text-slate-900 mt-2">{documents.filter(d=>d.statusId==='EST-03').length}</p></div>
           <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl border-b-4 border-b-slate-900"><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Asignaciones</p><p className="text-4xl font-black text-slate-900 mt-2">{assignments.length}</p></div>
        </div>
      )}
      {activeTab === 'inventory' && <GestionDocumentosL documents={documents} invoices={invoices} user={currentUser!} masterEstados={allMasterData['masterEstados'] || []} onAddDocuments={(newDocs) => setDocuments([...documents, ...newDocs])} />}
      {activeTab === 'receiving' && <RecibidoMaterial documents={documents} user={currentUser!} masterEstados={allMasterData['masterEstados'] || []} masterNotificaciones={allMasterData['masterNotificaciones'] || []} masterArticulo={allMasterData['masterArticulo'] || []} onUpdateDocuments={setDocuments} onAddArticleToMaster={(a) => {}} />}
      {activeTab === 'routing' && <RoutePlanner invoices={invoices} vehicles={vehicles} drivers={drivers} assignments={assignments} onAssign={(vId, dId, cId) => setAssignments([...assignments, { id: `ass-${Date.now()}`, vehicleId: vId, driverId: dId, clientId: cId, date: new Date().toISOString(), isActive: true, createdBy: 'SYSTEM', createdAt: new Date().toISOString(), updatedBy: 'SYSTEM', updatedAt: new Date().toISOString(), statusId: 'EST-01' }])} onSaveRoute={() => {}} />}
      {activeTab === 'fleet' && <FleetManager vehicles={vehicles} drivers={drivers} user={currentUser!} masterData={allMasterData} onAddVehicle={v => setVehicles([...vehicles, {...v, id: `v-${Date.now()}`} as any])} onAddDriver={d => setDrivers([...drivers, {...d, id: `d-${Date.now()}`} as any])} onUpdateVehicle={(id, data) => setVehicles(vehicles.map(v => v.id === id ? {...v, ...data} : v))} onUpdateDriver={(id, data) => setDrivers(drivers.map(d => d.id === id ? {...d, ...data} : d))} />}
      {activeTab === 'assignments' && <AssignmentManager vehicles={vehicles} drivers={drivers} assignments={assignments} user={currentUser!} onAssign={(vId, dId, cId) => setAssignments([...assignments, { id: `ass-${Date.now()}`, vehicleId: vId, driverId: dId, clientId: cId, date: new Date().toISOString(), isActive: true, createdBy: 'SYSTEM', createdAt: new Date().toISOString(), updatedBy: 'SYSTEM', updatedAt: new Date().toISOString(), statusId: 'EST-01' }])} onEndAssignment={id => setAssignments(assignments.map(a => a.id === id ? {...a, isActive: false} : a))} />}
      {(activeTab === 'master' || activeTab === 'access') && <MasterModule key={activeMasterCategory} onAudit={() => {}} activeMaster={activeMasterCategory} allMasterData={allMasterData} setAllMasterData={setAllMasterData} user={currentUser!} />}
      <HelpChat />
    </Layout>
  );
};

export default App;
