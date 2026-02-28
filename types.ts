
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
  PENDING = 'Pendiente',
  RECEIVED = 'Recibido',
  COUNTING = 'En Conteo',
  COMPLETED = 'Completado',
  IN_ROUTE = 'En ruta',
  DELIVERED = 'Entregado',
  PARTIAL = 'Entregado parcial',
  RETURNED = 'Devolución',
  INVENTORED = 'Inventariado'
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'active';
export type PageModule = 'dashboard' | 'inventory' | 'routing' | 'fleet' | 'master' | 'assignments' | 'access';

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
  codplan?: string;
  deliveryDate?: string;
  inventoryUser?: string;
  paymentsCount?: number;
}

export interface DocumentLItem {
  articleId: string;
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
  peso?: number;
  paymentMethod?: string;
  paymentValue?: string;
  paymentRef?: string;
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
}

export type MasterCategory = 
  | 'masterUsuarios' 
  | 'masterClientes' 
  | 'masterArticulo' 
  | 'masterRol' 
  | 'masterPermisosRol' 
  | 'masterPermisosUsuario'
  | 'masterCategorias' // Dedicated Table
  | 'masterEstados' 
  | 'masterTiposVehiculo' 
  | 'masterMarcas' 
  | 'masterNotificaciones'
  | 'masterTipoNotificacion'
  | 'masterUnidadMedida'
  | 'masterTipoDocumento'
  | 'modules' // Direct table access
  | 'pages'; // Direct table access

