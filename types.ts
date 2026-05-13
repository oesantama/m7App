
export enum UserRole {
  ADMIN = 'Administrador',
  INHOUSE = 'Operador Bodega',
  PLANNER = 'Planificador',
  DRIVER = 'Conductor'
}

export enum VehicleStatus {
  AVAILABLE = 'Disponible',
  IN_ROUTE = 'En ruta',
  MAINTENANCE = 'Mantenimiento',
  UNAVAILABLE = 'No disponible'
}

export enum DocStatus {
  PENDING    = 'EST-03',
  RECEIVED   = 'EST-06',
  COUNTING   = 'EST-04',
  AUDITED    = 'EST-05',
  COMPLETED  = 'EST-07',
  INVENTORED = 'EST-08',
  ALISTADO   = 'EST-09',
  ASSIGNED   = 'EST-10',
  IN_ROUTE   = 'EST-11',
  DELIVERED  = 'EST-12',
  RETURNED   = 'EST-13',
  PARTIAL    = 'EST-14',
  REPICE     = 'EST-15',
  ELIMINATED = 'EST-16',
  REJECTED   = 'EST-17',
}

/** Convierte un status_id a etiqueta legible para mostrar al usuario */
export const DOC_STATUS_LABELS: Record<string, string> = {
  'EST-03': 'Pendiente',
  'EST-04': 'En Conteo',
  'EST-05': 'Auditado',
  'EST-06': 'Recibido',
  'EST-07': 'Completado',
  'EST-08': 'Inventariado',
  'EST-09': 'Alistado',
  'EST-10': 'Asignado',
  'EST-11': 'En Ruta',
  'EST-12': 'Entregado',
  'EST-13': 'Devuelto',
  'EST-14': 'Entrega Parcial',
  'EST-15': 'Repice',
  'EST-16': 'Eliminado',
  'EST-17': 'Rechazado',
  // Compatibilidad retroactiva (texto legado → label)
  'PENDIENTE':       'Pendiente',
  'EN CONTEO':       'En Conteo',
  'AUDITADO':        'Auditado',
  'RECIBIDO':        'Recibido',
  'COMPLETADO':      'Completado',
  'FINALIZADO':      'Completado',
  'INVENTARIADO':    'Inventariado',
  'ALISTADO':        'Alistado',
  'ASIGNADO':        'Asignado',
  'EN RUTA':         'En Ruta',
  'ENTREGADO':       'Entregado',
  'DEVUELTO':        'Devuelto',
  'ENTREGA PARCIAL': 'Entrega Parcial',
  'REPICE':          'Repice',
  'ELIMINADO':       'Eliminado',
  'RECHAZADO':       'Rechazado',
};

export function getStatusLabel(status: string): string {
  return DOC_STATUS_LABELS[status] ?? DOC_STATUS_LABELS[status?.toUpperCase()] ?? status;
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'active';
export type PageModule = 'home' | 'master' | 'inventory' | 'inventory-counts' | 'routes' | 'users' | 'drivers' | 'assignments' | 'reports' | 'notifications' | 'scanning' | 'whatsapp' | 'whatsapp-campaign' | 'whatsapp-status' | 'balance' | 'training' | 'inventory-news' | 'dispatch' | 'picking' | 'recibido-manual' | 'grupo-inter-ops' | 'conciliacion' | 'gestion-humana-miscelaneos' | 'cfg-ciudades' | 'prov-clientes' | 'validacion-conciliaciones' | 'fletes-conciliacion' | 'informe-dashboard-drive' | 'auditoria-factura' | 'informes-gerenciales';

export interface UserPermission {
  module: string; 
  actions: PermissionAction[];
}

export interface AuditBase {
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  statusId: string;
}

export interface RouteLog extends AuditBase {
  id: string;
  routeId?: string;
  action: 'ADD_INVOICE' | 'REMOVE_INVOICE' | 'ASSIGN_ROUTE' | 'REJECT_SUGGESTION';
  entityId: string; // ID de factura o vehículo
  comment: string;
  previousState: string;
  newState: string;
}

export interface User extends AuditBase {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clientId: string; 
  clientIds?: string[];
  documentType?: string;
  documentNumber?: string;
  phone?: string;
  permissions: UserPermission[];
  avatar?: string;
  password?: string;
  roleId?: string;
  token?: string;
}

export interface Article extends AuditBase {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  clientId: string;
  categoryArticuloId?: string;
  factorInter: number;
  factorStd: number;
}

export interface MasterRecord extends AuditBase {
  id: string;
  name: string;
  description?: string;
  tipoNotificacionId?: string; 
  notificationEmail?: string;
  roleId?: string;
  userId?: string;
  moduleId?: string;
  route?: string;
  iconClass?: string;
  parentId?: string;
  [key: string]: any;
}

export interface Vehicle extends AuditBase {
  id: string;
  plate: string;
  owner: string;
  brand: string;
  capacityM3: number;
  maxWeightKg?: number;
  status: VehicleStatus;
  clientId: string;
  soatExpiry?: string;
  technoExpiry?: string;
  soatPdfUrl?: string;
  technoPdfUrl?: string;
}

export interface Driver extends AuditBase {
  id: string;
  name: string;
  documentType: string; 
  documentNumber: string;
  status: 'Activo' | 'Inactivo';
  phone: string;
  clientId: string;
  licenseCategory?: string;
  licenseExpiry?: string;
  licensePdf?: string;
}

export interface VehicleAssignment extends AuditBase {
  id: string;
  vehicleId: string;
  driverId: string;
  clientId: string;
  date: string;
  isActive: boolean;
}

export interface DocumentL extends AuditBase {
  id: string;
  clientId: string;
  externalDocId: string;
  status: DocStatus;
  items: DocumentLItem[];
  consolidatedItems?: any[]; 
  vehicleData?: string;
  planType?: string;
  city?: string;
  address?: string;
  inventoryDate?: string;
  inventoryNotes?: string;
  inventory_observation?: string; 
  remesaTDM?: string;
  deliveryDate?: string;
  inventoryUser?: string;
  paymentsCount?: number;
}

export interface DocumentLItem {
  articleId: string;
  sku?: string;
  expectedQty: number; 
  countedQty: number;
  count1?: number; 
  count2?: number; 
  novedad?: string;
  status: 'Pending' | 'Matches' | 'Mismatch' | 'OK' | 'Novedad';
  volume?: string;
  unitVolume?: string;
  unit?: string;
  detail?: string;
  deliveryDate?: string;
  invoice?: string;
  address?: string;
  city?: string;
  observation?: string;
  batch?: string;
  qty1?: number;
  qty2?: number;
  itemStatus?: string;
  inventoryNote?: string;
  orderNumber?: string;
  unCode?: string;
  clientRef?: string;
  customerName?: string;
  peso?: number;
  paymentMethod?: string;
  paymentValue?: string;
  paymentRef?: string;
  notes?: string;
}

export interface Invoice extends AuditBase {
  id: string;
  clientId: string;
  docLId: string;
  customerName: string;
  address: string;
  lat: number;
  lng: number;
  volumeM3: number;
  weightKg?: number;
  status: DocStatus;
  city?: string;
  invoiceValue: number;
  orderNumber?: string;
  notes?: string;
  externalDocId?: string;
  invoiceNumber?: string;
  items?: DocumentLItem[];
  unCode?: string;
  clientRef?: string;
  totalItems?: number;
  paymentMethod?: string;
}

export interface Route extends AuditBase {
  id: string;
  clientId: string;
  vehicleId: string;
  vehicle_id?: string; // Aliased for backend compatibility
  driverId: string;
  driver_id?: string; // Aliased for backend compatibility
  invoiceIds: string[];
  invoice_ids?: string[]; // Aliased for backend compatibility
  status: 'Assigned' | 'In Route' | 'Completed' | 'EN_RUTA' | 'Asignada' | 'En Ruta' | 'PENDIENTE' | 'CONFIRMADA';
  driver_document?: string;
  driver_name?: string;
  plate?: string;
  delivered_invoices?: number;
  total_invoices?: number;
}

export type MasterCategory =
  | 'masterUsuarios'
  | 'masterClientes'
  | 'masterArticulo'
  | 'masterRol'
  | 'masterPermisosRol'
  | 'masterPermisosUsuario'
  | 'masterCategorias'
  | 'masterEstados'
  | 'masterTiposVehiculo'
  | 'masterMarcas'
  | 'masterNotificaciones'
  | 'masterTipoNotificacion'
  | 'masterUnidadMedida'
  | 'masterTipoDocumento'
  | 'masterVehiculos'
  | 'masterConductores'
  | 'modules'
  | 'pages';

