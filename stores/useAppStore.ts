import { create } from 'zustand';
import { User, MasterCategory, MasterRecord } from '../types';

interface AppState {
  // ============ AUTENTICACIÓN ============
  isAuthenticated: boolean;
  user: User | null;
  isRestoring: boolean;
  isLoading: boolean;
  
  // ============ NAVEGACIÓN ============
  activeTab: string;
  activeMasterCategory: MasterCategory;
  activePageId: string;
  
  // ============ DATOS MAESTROS ============
  allMasterData: { [key in MasterCategory]?: MasterRecord[] };
  pages: any[]; // Dedicated table (no longer in master_records)
  modules: any[]; // Dedicated table (no longer in master_records)
  
  // ============ DATOS OPERATIVOS ============
  documents: any[];
  invoices: any[];
  vehicles: any[];
  drivers: any[];
  assignments: any[];
  routes: any[];
  
  // ============ ESTADO UI ============
  waStatus: 'CONNECTED' | 'DISCONNECTED';
  showTimeoutWarning: boolean;
  timeLeft: number;
  
  // ============ ACCIONES DE AUTENTICACIÓN ============
  setUser: (user: User | null) => void;
  setIsAuthenticated: (value: boolean) => void;
  setIsRestoring: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  
  // ============ ACCIONES DE NAVEGACIÓN ============
  setActiveTab: (tab: string) => void;
  setActiveMasterCategory: (category: MasterCategory) => void;
  setActivePageId: (id: string) => void;
  
  // ============ ACCIONES DE DATOS MAESTROS ============
  setAllMasterData: (data: { [key in MasterCategory]?: MasterRecord[] }) => void;
  updateMasterCategory: (category: MasterCategory, data: MasterRecord[]) => void;
  
  // ============ ACCIONES DE DATOS OPERATIVOS ============
  setDocuments: (documents: any[]) => void;
  addDocument: (document: any) => void;
  
  setInvoices: (invoices: any[]) => void;
  updateInvoice: (id: string, data: any) => void;
  
  setVehicles: (vehicles: any[]) => void;
  addVehicle: (vehicle: any) => void;
  updateVehicle: (id: string, data: any) => void;
  deleteVehicle: (id: string) => void;
  
  setDrivers: (drivers: any[]) => void;
  addDriver: (driver: any) => void;
  updateDriver: (id: string, data: any) => void;
  deleteDriver: (id: string) => void;
  
  setAssignments: (assignments: any[]) => void;
  addAssignment: (assignment: any) => void;
  endAssignment: (id: string) => void;
  
  setRoutes: (routes: any[]) => void;
  addRoute: (route: any) => void;
  
  // ============ ACCIONES DE UI ============
  setWaStatus: (status: 'CONNECTED' | 'DISCONNECTED') => void;
  setShowTimeoutWarning: (value: boolean) => void;
  setTimeLeft: (value: number) => void;
  decrementTimeLeft: () => void;
  
  // ============ HELPERS ============
  updateMasterData: (updates: Partial<{ [key in MasterCategory]?: MasterRecord[] }>) => void;
  
  // ============ GETTERS COMPUTADOS ============
  getActiveVehicles: () => any[];
  getAvailableVehicles: () => any[];
  getActiveDrivers: () => any[];
  getConfirmedRoutes: () => any[];
  getPendingInvoices: () => any[];
  getActiveAssignments: () => any[];
  
  // ============ UTILIDADES ============
  refreshAllData: (clientId?: string) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // ============ ESTADO INICIAL ============
  isAuthenticated: false,
  user: null,
  isRestoring: true,
  isLoading: false,
  
  activeTab: localStorage.getItem('m7_active_tab') || 'dashboard',
  activeMasterCategory: 'masterUsuarios',
  activePageId: localStorage.getItem('m7_active_page_id') || '',
  
  allMasterData: {
    masterUsuarios: [],
    masterClientes: [],
    masterRol: [],
    masterEstados: [],
    masterTiposVehiculo: [],
    masterArticulo: [],
    masterMarcas: [],
  },
  
  pages: [], // Inicializado vacío, se carga desde API /pages
  modules: [], // Inicializado vacío, se carga desde API /modules
  
  documents: [],
  invoices: [],
  vehicles: [],
  drivers: [],
  assignments: [],
  routes: [],
  
  waStatus: 'DISCONNECTED',
  showTimeoutWarning: false,
  timeLeft: 60,
  
  // ============ IMPLEMENTACIÓN DE ACCIONES ============
  
  // Autenticación
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setIsAuthenticated: (value) => set({ isAuthenticated: value }),
  setIsRestoring: (value) => set({ isRestoring: value }),
  setIsLoading: (value) => set({ isLoading: value }),
  
  // Navegación
  setActiveTab: (tab) => {
    localStorage.setItem('m7_active_tab', tab);
    set({ activeTab: tab });
  },
  setActiveMasterCategory: (category) => set({ activeMasterCategory: category }),
  setActivePageId: (id) => {
    localStorage.setItem('m7_active_page_id', id);
    set({ activePageId: id });
  },
  
  // Datos maestros
  setAllMasterData: (data) => set({ allMasterData: data }),
  updateMasterCategory: (category, data) => set((state) => ({
    allMasterData: { ...state.allMasterData, [category]: data }
  })),
  
  // Documentos
  setDocuments: (documents) => set({ documents }),
  addDocument: (document) => set((state) => ({ 
    documents: [...state.documents, document] 
  })),
  
  // Facturas
  setInvoices: (invoices) => set({ invoices }),
  updateInvoice: (id, data) => set((state) => ({
    invoices: state.invoices.map(inv => inv.id === id ? { ...inv, ...data } : inv)
  })),
  
  // Vehículos
  setVehicles: (vehicles) => set({ vehicles }),
  addVehicle: (vehicle) => set((state) => ({ 
    vehicles: [...state.vehicles, vehicle] 
  })),
  updateVehicle: (id, data) => set((state) => ({
    vehicles: state.vehicles.map(v => v.id === id ? { ...v, ...data } : v)
  })),
  deleteVehicle: (id) => set((state) => ({
    vehicles: state.vehicles.filter(v => v.id !== id)
  })),
  
  // Conductores
  setDrivers: (drivers) => set({ drivers }),
  addDriver: (driver) => set((state) => ({ 
    drivers: [...state.drivers, driver] 
  })),
  updateDriver: (id, data) => set((state) => ({
    drivers: state.drivers.map(d => d.id === id ? { ...d, ...data } : d)
  })),
  deleteDriver: (id) => set((state) => ({
    drivers: state.drivers.filter(d => d.id !== id)
  })),
  
  // Asignaciones
  setAssignments: (assignments) => set({ assignments }),
  addAssignment: (assignment) => set((state) => ({ 
    assignments: [...state.assignments, assignment] 
  })),
  endAssignment: (id) => set((state) => ({
    assignments: state.assignments.map(a => 
      a.id === id ? { ...a, isActive: false, updatedAt: new Date().toISOString() } : a
    )
  })),
  
  // Rutas
  setRoutes: (routes) => set({ routes }),
  addRoute: (route) => set((state) => ({ 
    routes: [...state.routes, route] 
  })),
  
  // UI
  setWaStatus: (status) => set({ waStatus: status }),
  setShowTimeoutWarning: (value) => set({ showTimeoutWarning: value }),
  setTimeLeft: (value) => set({ timeLeft: value }),
  decrementTimeLeft: () => set((state) => ({ timeLeft: state.timeLeft > 0 ? state.timeLeft - 1 : 0 })),
  
  // Helper para actualizar allMasterData con merge
  updateMasterData: (updates: Partial<{ [key in MasterCategory]?: MasterRecord[] }>) => set((state) => ({
    allMasterData: { ...state.allMasterData, ...updates }
  })),
  
  // ============ GETTERS COMPUTADOS ============
  getActiveVehicles: () => {
    const state = get();
    return state.vehicles.filter(v => 
      v.status === 'Activo' || v.statusId === 'EST-01' || v.status_id === 'EST-01'
    );
  },
  
  getAvailableVehicles: () => {
    const state = get();
    return state.vehicles.filter(v => 
      v.status === 'Disponible' || v.status === 'Available'
    );
  },
  
  getActiveDrivers: () => {
    const state = get();
    return state.drivers.filter(d => d.status === 'Activo');
  },
  
  getConfirmedRoutes: () => {
    const state = get();
    return state.routes.filter(r => r.status === 'confirmed' || r.status === 'CONFIRMADA');
  },
  
  getPendingInvoices: () => {
    const state = get();
    return state.invoices.filter(i => 
      i.status === 'Pendiente' || i.status === 'PENDIENTE'
    );
  },
  
  getActiveAssignments: () => {
    const state = get();
    return state.assignments.filter(a => a.isActive === true);
  },
  
  // ============ UTILIDADES ============
  refreshAllData: (clientId) => {
    // Placeholder - la lógica compleja se mantiene en App.tsx por ahora
    console.log('[ZUSTAND-STORE] refreshAllData called for client:', clientId);
  },
  
  logout: () => {
    localStorage.removeItem('m7_user_session');
    localStorage.removeItem('m7_active_tab');
    localStorage.removeItem('m7_master_data');
    set({
      isAuthenticated: false,
      user: null,
      documents: [],
      invoices: [],
      vehicles: [],
      drivers: [],
      assignments: [],
      routes: [],
      activeTab: 'dashboard'
    });
  }
}));
