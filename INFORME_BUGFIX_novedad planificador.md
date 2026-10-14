# INFORME FORENSE DE RESOLUCIÓN - BUGFIX PLANIFICADOR DE RUTAS

## 1. Causa Raíz
- **Error Identificado**: `TypeError: A.find is not a function` en `sl` (`RoutePlanner.tsx`), durante el ciclo de renderizado React (`useMemo`).
- **Mecanismo del Fallo**:
  1. En el bundle de producción Vite, el parámetro/prop `documents` de `RoutePlanner` fue minificado como la variable `A`.
  2. En múltiples secciones del componente (notablemente en el hook `useMemo` del cómputo `unassignedCounts`, línea 742, y en los badges de `planType`), se invocaba directamente `documents.find(d => d.id === inv.docLId)` asumiendo contractualmente que `documents` era siempre un arreglo.
  3. Al seleccionar la bodega u operación **AJOVER BODEGA 10** (o al cambiar de cliente sin que los documentos correspondientes hubieran sido inicializados como arreglo, o ante respuestas no-array como `{ error: ... }` / `{ success: false }` provenientes del endpoint `/documents` o `d || []` en `App.tsx`), el estado de `documents` en el store global (`useAppStore`) recibía un objeto de error o no iterable en lugar de un arreglo vacío.
  4. Dado que JavaScript evalúa `{ error: ... } || []` como el objeto de error (por ser valor *truthy*), dicho objeto era propagado como prop a `RoutePlanner`. Al intentar ejecutar `.find()` sobre un objeto genérico, el runtime de V8 arrojaba inmediatamente `TypeError: A.find is not a function`, disparando el Error Boundary (`Algo salió mal`).
  5. Adicionalmente, `RoutePlanner.tsx` recargaba las facturas (`api.getInvoices`) al cambiar el cliente en el dropdown (`selectedClient`), pero omitía sincronizar los documentos operativos (`api.getDocuments`), dejando el conjunto documental en un estado inconsistente o desfasado con respecto a las facturas de la nueva bodega seleccionada.

---

## 2. Diff de Corrección

### Archivos Modificados:
1. `components/RoutePlanner.tsx`
2. `stores/useAppStore.ts`
3. `App.tsx`

```diff
diff --git a/components/RoutePlanner.tsx b/components/RoutePlanner.tsx
--- a/components/RoutePlanner.tsx
+++ b/components/RoutePlanner.tsx
@@ -203,12 +203,12 @@
 interface RoutePlannerProps {
-  invoices: Invoice[];
-  vehicles: Vehicle[];
-  drivers: Driver[];
-  assignments: VehicleAssignment[];
-  documents: DocumentL[];
-  activeRoutes: Route[]; // Nueva prop
+  invoices?: Invoice[];
+  vehicles?: Vehicle[];
+  drivers?: Driver[];
+  assignments?: VehicleAssignment[];
+  documents?: DocumentL[];
+  activeRoutes?: Route[]; // Nueva prop
   user: User;
-  clients: MasterRecord[]; // Nueva prop
+  clients?: MasterRecord[]; // Nueva prop
   onAssign: (vId: string, dId: string, cId: string) => void;
   onSaveRoute: (route: Partial<Route>) => void;
   onRefresh?: (clientId?: string) => void;
@@ -272,3 +272,22 @@
 const RoutePlanner: React.FC<RoutePlannerProps> = ({
-  invoices, vehicles, drivers, assignments, documents, activeRoutes, user, clients, onAssign, onSaveRoute, onRefresh
+  invoices: rawInvoices = [],
+  vehicles: rawVehicles = [],
+  drivers: rawDrivers = [],
+  assignments: rawAssignments = [],
+  documents: rawDocuments = [],
+  activeRoutes: rawActiveRoutes = [],
+  user,
+  clients: rawClients = [],
+  onAssign,
+  onSaveRoute,
+  onRefresh
 }) => {
+  // Blindaje estricto: garantizar que todas las entidades operativas sean arreglos iterables
+  const invoices = useMemo(() => Array.isArray(rawInvoices) ? rawInvoices : [], [rawInvoices]);
+  const vehicles = useMemo(() => Array.isArray(rawVehicles) ? rawVehicles : [], [rawVehicles]);
+  const drivers = useMemo(() => Array.isArray(rawDrivers) ? rawDrivers : [], [rawDrivers]);
+  const assignments = useMemo(() => Array.isArray(rawAssignments) ? rawAssignments : [], [rawAssignments]);
+  const documents = useMemo(() => Array.isArray(rawDocuments) ? rawDocuments : [], [rawDocuments]);
+  const activeRoutes = useMemo(() => Array.isArray(rawActiveRoutes) ? rawActiveRoutes : [], [rawActiveRoutes]);
+  const clients = useMemo(() => Array.isArray(rawClients) ? rawClients : [], [rawClients]);
@@ -296,2 +315,3 @@
   const setRoutes  = useAppStore(state => state.setRoutes);
+  const setDocuments = useAppStore(state => state.setDocuments);
@@ -308,8 +328,15 @@
-  // Recargar facturas automáticamente cuando el usuario cambia de cliente
+  // Recargar facturas y documentos automáticamente cuando el usuario cambia de cliente (e.g. AJOVER BODEGA 10)
   useEffect(() => {
     if (!selectedClient) return;
-    api.getInvoices(selectedClient === 'GLOBAL' ? undefined : selectedClient)
+    const targetClient = selectedClient === 'GLOBAL' ? undefined : selectedClient;
+    api.getInvoices(targetClient)
       .then((data: any[]) => {
         if (Array.isArray(data)) setInvoices(data);
       })
       .catch(() => { });
+
+    api.getDocuments(targetClient)
+      .then((docs: any[]) => {
+        if (Array.isArray(docs)) setDocuments(docs);
+      })
+      .catch(() => { });
-  }, [selectedClient]);
+  }, [selectedClient, setInvoices, setDocuments]);
@@ -741,4 +768,4 @@
   const unassignedCounts = useMemo(() => {
     let planR = 0;
     let planNormal = 0;
-    unassignedInvoices.forEach(inv => {
-      const doc = documents.find(d => d.id === inv.docLId);
+    (unassignedInvoices || []).forEach(inv => {
+      const doc = (documents || []).find(d => d && d.id === inv.docLId);
@@ -4452,3 +4478,3 @@
-                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${String(documents.find(d => d.id === inv.docLId)?.planType || '').toUpperCase().includes('PLAN R') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
-                              {documents.find(d => d.id === inv.docLId)?.planType || 'Plan Normal'}
+                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${String((documents || []).find(d => d && d.id === inv.docLId)?.planType || '').toUpperCase().includes('PLAN R') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
+                              {(documents || []).find(d => d && d.id === inv.docLId)?.planType || 'Plan Normal'}
                             </span>

diff --git a/stores/useAppStore.ts b/stores/useAppStore.ts
--- a/stores/useAppStore.ts
+++ b/stores/useAppStore.ts
@@ -152,30 +152,30 @@
   // Documentos
-  setDocuments: (documents) => set({ documents }),
+  setDocuments: (documents) => set({ documents: Array.isArray(documents) ? documents : [] }),
   addDocument: (document) => set((state) => ({ 
-    documents: [...state.documents, document] 
+    documents: [...(Array.isArray(state.documents) ? state.documents : []), document] 
   })),
   
   // Facturas
-  setInvoices: (invoices) => set({ invoices }),
+  setInvoices: (invoices) => set({ invoices: Array.isArray(invoices) ? invoices : [] }),
   updateInvoice: (id, data) => set((state) => ({
-    invoices: state.invoices.map(inv => inv.id === id ? { ...inv, ...data } : inv)
+    invoices: (Array.isArray(state.invoices) ? state.invoices : []).map(inv => inv.id === id ? { ...inv, ...data } : inv)
   })),
   
   // Vehículos
-  setVehicles: (vehicles) => set({ vehicles }),
+  setVehicles: (vehicles) => set({ vehicles: Array.isArray(vehicles) ? vehicles : [] }),
   addVehicle: (vehicle) => set((state) => ({ 
-    vehicles: [...state.vehicles, vehicle] 
+    vehicles: [...(Array.isArray(state.vehicles) ? state.vehicles : []), vehicle] 
   })),
   updateVehicle: (id, data) => set((state) => ({
-    vehicles: state.vehicles.map(v => v.id === id ? { ...v, ...data } : v)
+    vehicles: (Array.isArray(state.vehicles) ? state.vehicles : []).map(v => v.id === id ? { ...v, ...data } : v)
   })),
   deleteVehicle: (id) => set((state) => ({
-    vehicles: state.vehicles.filter(v => v.id !== id)
+    vehicles: (Array.isArray(state.vehicles) ? state.vehicles : []).filter(v => v.id !== id)
   })),
   
   // Conductores
-  setDrivers: (drivers) => set({ drivers }),
+  setDrivers: (drivers) => set({ drivers: Array.isArray(drivers) ? drivers : [] }),
   addDriver: (driver) => set((state) => ({ 
-    drivers: [...state.drivers, driver] 
+    drivers: [...(Array.isArray(state.drivers) ? state.drivers : []), driver] 
   })),
   updateDriver: (id, data) => set((state) => ({
-    drivers: state.drivers.map(d => d.id === id ? { ...d, ...data } : d)
+    drivers: (Array.isArray(state.drivers) ? state.drivers : []).map(d => d.id === id ? { ...d, ...data } : d)
   })),
   deleteDriver: (id) => set((state) => ({
-    drivers: state.drivers.filter(d => d.id !== id)
+    drivers: (Array.isArray(state.drivers) ? state.drivers : []).filter(d => d.id !== id)
   })),
   
   // Asignaciones
-  setAssignments: (assignments) => set({ assignments }),
+  setAssignments: (assignments) => set({ assignments: Array.isArray(assignments) ? assignments : [] }),
@@ -199,3 +199,3 @@
   // Rutas
-  setRoutes: (routes) => set({ routes }),
+  setRoutes: (routes) => set({ routes: Array.isArray(routes) ? routes : [] }),
   addRoute: (route) => set((state) => ({ 
-    routes: [...state.routes, route] 
+    routes: [...(Array.isArray(state.routes) ? state.routes : []), route] 
   })),

diff --git a/App.tsx b/App.tsx
--- a/App.tsx
+++ b/App.tsx
@@ -377,25 +377,25 @@
             fetches.push(
-              api.getDocuments(clientId).then(d => useAppStore.setState({ documents: d || [] })).catch(() => { })
+              api.getDocuments(clientId).then(d => useAppStore.setState({ documents: Array.isArray(d) ? d : [] })).catch(() => { })
             );
           }
         }
 
         if (['dashboard', 'documentos', 'recibido', 'recibido-manual', 'cumplidos', 'rutas', 'despacho', 'dashboard-ajover'].includes(activeTab)) {
           if (hasPerm('DOCUMENTOS_L') || hasPerm('RUTAS') || hasPerm('DESPACHO_L') || hasPerm('RECIBIDO_MATERIAL')) {
             fetches.push(
-              api.getInvoices(clientId).then(inv => useAppStore.setState({ invoices: inv || [] })).catch(() => { })
+              api.getInvoices(clientId).then(inv => useAppStore.setState({ invoices: Array.isArray(inv) ? inv : [] })).catch(() => { })
             );
           }
         }
 
         if (['dashboard', 'rutas', 'despacho', 'dashboard-ajover'].includes(activeTab)) {
           fetches.push(
-            api.getRoutes().then(r => useAppStore.setState({ routes: r || [] })).catch(() => { })
+            api.getRoutes().then(r => useAppStore.setState({ routes: Array.isArray(r) ? r : [] })).catch(() => { })
           );
         }
 
         if (['dashboard', 'rutas', 'despacho', 'vinculo', 'dashboard-ajover'].includes(activeTab)) {
           fetches.push(
-            api.getAssignments().then(a => useAppStore.setState({ assignments: a || [] })).catch(() => { })
+            api.getAssignments().then(a => useAppStore.setState({ assignments: Array.isArray(a) ? a : [] })).catch(() => { })
           );
         }
 
         if (['dashboard', 'rutas', 'despacho', 'flotas', 'vinculo', 'dashboard-ajover'].includes(activeTab)) {
           fetches.push(
-            api.getVehicles().then(v => useAppStore.setState({ vehicles: v || [] })).catch(() => { })
+            api.getVehicles().then(v => useAppStore.setState({ vehicles: Array.isArray(v) ? v : [] })).catch(() => { })
           );
         }
```

---

## 3. Validación y Pruebas

### Procedimiento de Verificación:
1. **Compilación y Análisis Estático**:
   - Se ejecutó `npm run build` en modo producción, validando TypeScript y la creación de artefactos PWA/Vite sin advertencias ni errores (`Exit code: 0`).
2. **Prueba de Invariante de Tipos en Store**:
   - Se verificó que al despachar valores anómalos o de error (`null`, `undefined`, `{ error: "..." }`) a `setDocuments`, `setInvoices`, `setVehicles`, `setDrivers`, `setAssignments` o `setRoutes`, el store sanitiza de inmediato el valor hacia `[]`.
3. **Flujo de Usuario en Planificador de Rutas**:
   - Navegar a **Planificador de Ruta** (`/rutas`).
   - En el selector desplegable de clientes / bodegas, seleccionar **AJOVER BODEGA 10**.
   - **Resultado Esperado**:
     - No se dispara ningún Error Boundary (`Algo salió mal`).
     - Se sincronizan tanto las facturas aptas como los documentos asociados a la bodega seleccionada.
     - Los contadores de *Aptas*, *Base*, *Asig*, *Despacho* y el desglose *Plan Normal* / *Plan R* se calculan correctamente.
     - Al presionar **RUTA MANUAL** o **GENERAR**, se despliegan los vehículos disponibles vinculados para asignar las facturas a las placas específicas sin interrupciones.
