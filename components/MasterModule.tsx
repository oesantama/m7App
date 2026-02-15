
import React, { useState, useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Icons, AVATAR_GALLERY } from '../constants';
import { getMasterCategoryFromRoute } from '../constants/routes';
import { MasterRecord, MasterCategory, User, Article } from '../types';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { DataImportDialog } from './DataImportDialog';

interface MasterModuleProps {
  onAudit: (entity: string, action: string) => void;
  activeMaster: MasterCategory;
  user: User;
}

const MasterModule: React.FC<MasterModuleProps> = ({ activeMaster, user, onAudit }) => {
  const { allMasterData, setAllMasterData, updateMasterCategory } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MasterRecord | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [error, setError] = useState<string | null>(null);

  const [displayMode, setDisplayMode] = useState<'table' | 'grid'>('table');
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Helper for Image Compression
  const compressImage = async (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
           ctx.drawImage(img, 0, 0, width, height);
           resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
           resolve(base64Str); // Fallback
        }
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  // Estados para el diálogo de cambio de rol
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [pendingRoleId, setPendingRoleId] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<any>(null);

  // Formateador de Fechas Ultra-Robusto M7
  const safeFormatDate = (val: any, record?: any) => {
    // Si val es nulo, intentar buscar en el record por si hay mayúsculas (CREATED_AT)
    let finalVal = val;
    if (!finalVal && record) {
      const keys = Object.keys(record);
      const findKey = (k: string) => keys.find(key => key.toUpperCase() === k.toUpperCase());
      const altKey = findKey('createdAt') || findKey('created_at') || findKey('updatedAt') || findKey('updated_at');
      if (altKey) finalVal = record[altKey];
    }

    if (!finalVal) return 'Sistema';
    
    try {
      let d = finalVal;
      if (typeof d === 'string') {
        if (d.includes(' ') && !d.includes('T')) d = d.replace(' ', 'T');
        if (d.includes('+')) d = d.split('+')[0];
      }
      
      const dateObj = new Date(d);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleString('es-CO', { 
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
          hour12: true
        });
      }
      
      // Fallback manual
      if (typeof d === 'string') {
        const match = d.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
        if (match) return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
        return d.split('.')[0].replace('T', ' '); 
      }
      return 'Fecha s/f';
    } catch {
      return 'Error Fecha';
    }
  };

  // Extracción de Maestros para Selectores
  const roles = allMasterData['masterRol'] || [];
  const pages = useAppStore(s => s.pages) || []; // Dedicated table
  const modules = useAppStore(s => s.modules) || []; // Dedicated table
  const statuses = allMasterData['masterEstados'] || [];
  const clients = allMasterData['masterClientes'] || [];
  const docTypes = allMasterData['masterTipoDocumento'] || [];
  const uoms = allMasterData['masterUnidadMedida'] || [];
  const rolePermissions = allMasterData['masterPermisosRol'] || [];
  const categoriesArt = allMasterData['masterCategorias'] || [];
  const notificationTypes = allMasterData['masterTipoNotificacion'] || [];

  const isSuperUser = user.roleId === 'ROL-01' || user.email === import.meta.env.VITE_APP_DEMO_EMAIL;

  const getPagePermissions = () => {
    if (isSuperUser) return { canCreate: true, canEdit: true, canDelete: true, canView: true };
    // Buscar la página cuya ruta mapea a la categoría maestra activa
    const pageInfo = pages.find(p => {
      const masterCat = getMasterCategoryFromRoute(p.route, p.id);
      return masterCat === activeMaster;
    });
    const perms = user.permissions.find(p => p.module === pageInfo?.id);
    return {
      canCreate: perms?.actions.includes('create') || false,
      canEdit: perms?.actions.includes('edit') || false,
      canDelete: perms?.actions.includes('delete') || false,
      canView: perms?.actions.includes('view') || false,
    };
  };

  const { canCreate, canEdit, canDelete } = getPagePermissions();

  const finalCanCreate = activeMaster === 'masterPermisosUsuario' ? false : canCreate;
  const finalCanDelete = activeMaster === 'masterPermisosUsuario' ? false : canDelete;

  const iconKeys = Object.keys(Icons);

  const MASTER_PREFIXES: Record<MasterCategory, string> = {
    masterEstados: 'EST',
    masterTiposVehiculo: 'TVH',
    masterMarcas: 'MAR',
    masterNotificaciones: 'NOT',
    masterTipoNotificacion: 'TGN',
    masterUnidadMedida: 'UOM',
    masterArticulo: 'ART',
    masterClientes: 'CLI',
    masterUsuarios: 'USR',
    masterRol: 'ROL',
    masterPermisosRol: 'PRL',
    masterPermisosUsuario: 'PUS',
    masterTipoDocumento: 'DOC',
    masterCategorias: 'CAT',
    modules: 'MOD',
    pages: 'PAG'
  };

  const MASTER_LABELS: Record<MasterCategory, string> = {
    masterEstados: 'ESTADOS GLOBALES',
    masterTiposVehiculo: 'TIPOS DE VEHÍCULO',
    masterMarcas: 'MARCAS COMERCIALES',
    masterNotificaciones: 'ALERTAS & NOTIFICACIONES',
    masterTipoNotificacion: 'GRUPOS DE ALERTA',
    masterUnidadMedida: 'UNIDADES DE MEDIDA',
    masterArticulo: 'MAESTRO DE ARTÍCULOS',
    masterClientes: 'CLIENTES CORPORATIVOS',
    masterUsuarios: 'GESTIÓN DE USUARIOS',
    masterRol: 'ROLES OPERATIVOS',
    masterPermisosRol: 'MATRIZ DE ROLES',
    masterPermisosUsuario: 'MATRIZ DE USUARIOS',
    masterTipoDocumento: 'TIPOS DE DOCUMENTO',
    masterCategorias: 'CATEGORÍAS DE ARTÍCULO',
    modules: 'MÓDULOS',
    pages: 'PÁGINAS WEB'
  };

  const generateNextId = (category: MasterCategory, data: MasterRecord[]) => {
    const prefix = MASTER_PREFIXES[category] || 'M7';
    const existingIds = data.map(d => d.id).filter(id => id.startsWith(`${prefix}-`));

    let nextNum = 1;
    if (existingIds.length > 0) {
      const nums = existingIds.map(id => {
        const parts = id.split('-');
        const numPart = parts[parts.length - 1];
        return isNaN(parseInt(numPart)) ? 0 : parseInt(numPart);
      });
      nextNum = Math.max(...nums) + 1;
    }

    return `${prefix}-${nextNum.toString().padStart(2, '0')}`;
  };

  const getInitialFormData = (category: MasterCategory, record: any = {}) => {
    const defaults: any = {
      name: '',
      statusId: 'EST-01',
      clientId: '',
      clientIds: [],
    };

    if (category === 'masterUsuarios') {
      Object.assign(defaults, {
        email: '',
        phone: '',
        documentType: '',
        documentNumber: '',
        roleId: '',
        avatar: AVATAR_GALLERY[0],
      });
    } else if (category === 'masterArticulo') {
      Object.assign(defaults, {
        sku: '',
        barcode: '',
        uomGeneralId: '',
        uomInterId: '',
        factorInter: 1,
        uomStdId: '',
        factorStd: 1,
        categoryArticuloId: '',
      });
    } else if (category === 'masterClientes') {
      Object.assign(defaults, {
        email: '',
        logoUrl: '',
      });
    } else if (category === 'masterRol') {
      Object.assign(defaults, {
        description: '',
      });
    } else if (category === 'masterCategorias') {
      Object.assign(defaults, {
        description: '',
      });
    } else if (category === 'masterNotificaciones') {
      Object.assign(defaults, {
        notificationEmail: '',
        tipoNotificacionId: '',
      });
    }

    const normalizedRecord = {
      ...record,
      statusId: record.statusId || record.status_id || 'EST-01',
      clientId: record.clientId || record.client_id || '',
      roleId: record.roleId || record.role_id || '',
      parentId: record.parentId || record.parent_id || '',
      iconClass: record.iconClass || record.icon_class || '',
      notificationEmail: record.notificationEmail || record.notification_email || '',
      tipoNotificacionId: record.tipoNotificacionId || record.tipo_notificacion_id || '',
      categoryArticuloId: record.categoryArticuloId || record.category_articulo_id || ''
    };

    return { ...defaults, ...normalizedRecord };
  };

  const getColombiaNow = () => {
    return new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const filteredData = useMemo(() => {
    // For modules and pages, use dedicated store fields
    let list: any[] = [];
    if (activeMaster === 'modules') {
      list = modules || [];
    } else if (activeMaster === 'pages') {
      list = pages || [];
    } else {
      list = allMasterData[activeMaster] || [];
    }
    
    return list.filter(d => {
      const searchStr = searchTerm.toLowerCase();
      // Enhanced Search for Articles (include SKU/ID and Barcode)
      if (activeMaster === 'masterArticulo') {
         return (
           (d.name && d.name.toLowerCase().includes(searchStr)) ||
           (d.id && d.id.toLowerCase().includes(searchStr)) ||
           ((d as any).barcode && (d as any).barcode.toLowerCase().includes(searchStr))
         );
      }
      return (d.name || d.email || d.id || '').toLowerCase().includes(searchStr);
    });
  }, [allMasterData, modules, pages, activeMaster, searchTerm]);

  const paginatedData = useMemo(() => {
    if (rowsPerPage === 'all') return filteredData;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(filteredData.length / rowsPerPage);

  // --- LÓGICA DE MATRIZ DE PERMISOS ---
  const isAllPermsChecked = useMemo(() => {
    if (activeMaster !== 'masterPermisosRol' && activeMaster !== 'masterPermisosUsuario') return false;
    const actions = ['view', 'create', 'edit', 'delete', 'active'];
    return pages.length > 0 && pages.every(p => actions.every(a => !!formData[`page_${p.id}_${a}`]));
  }, [formData, pages, activeMaster]);

  const toggleAllPerms = () => {
    const next = { ...formData };
    const actions = ['view', 'create', 'edit', 'delete', 'active'];
    const targetState = !isAllPermsChecked;
    pages.forEach(p => actions.forEach(a => { next[`page_${p.id}_${a}`] = targetState; }));
    setFormData(next);
  };

  const togglePageRow = (pageId: string) => {
    const next = { ...formData };
    const actions = ['view', 'create', 'edit', 'delete', 'active'];
    const isRowChecked = actions.every(a => !!formData[`page_${pageId}_${a}`]);
    const targetState = !isRowChecked;
    actions.forEach(a => { next[`page_${pageId}_${a}`] = targetState; });
    setFormData(next);
  };

  // --- LÓGICA DE CAMBIO DE ROL (USUARIOS) ---
  const handleRoleChangeIntent = (newRoleId: string) => {
    if (editingRecord && activeMaster === 'masterUsuarios' && newRoleId !== editingRecord.roleId) {
      setPendingRoleId(newRoleId);
      setShowRoleDialog(true);
    } else {
      setFormData({ ...formData, roleId: newRoleId });
    }
  };

  const applyRoleChange = (inherit: boolean) => {
    setFormData({
      ...formData,
      roleId: pendingRoleId,
      inheritRolePerms: inherit
    });
    setShowRoleDialog(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (activeMaster === 'masterUsuarios') {
      // RFC 5322 Email Regex
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (formData.email && !emailRegex.test(formData.email)) {
        setError("M7 ERROR: Formato de correo inválido (RFC 5322).");
        toast.error("Validación Fallida", { description: "Revise el formato del email." });
        return;
      }

      // Validación Teléfono (Mínimo 8 caracteres)
      if (formData.phone) {
        const phoneClean = formData.phone.replace(/[\s-]/g, '');
        if (phoneClean.length < 8) {
          setError("M7 ERROR: El teléfono debe tener al menos 8 dígitos.");
          return;
        }
      }

      const emailExists = (allMasterData['masterUsuarios'] || []).some(u =>
        u.email?.toLowerCase() === formData.email?.toLowerCase() && u.id !== editingRecord?.id
      );
      if (emailExists) {
        setError("M7 CRITICAL: El correo electrónico ya pertenece a otro usuario registrado.");
        return;
      }
    }

    // NUEVA VALIDACIÓN DE ACCESIBILIDAD (BUG-03)
    if (activeMaster === 'masterArticulo' && !formData.categoryArticuloId) {
      setError("M7 ERROR: Debe seleccionar una categoría para el artículo.");
      toast.error("Validación de Accesibilidad", { description: "La categoría del artículo es obligatoria (WCAG AA)." });
      return;
    }

    const now = getColombiaNow();
    // Allow user to set ID (SKU) for new records, fallback to generator
    const finalId = editingRecord?.id || formData.id || generateNextId(activeMaster, allMasterData[activeMaster] || []);
    const newRecord = { ...formData, id: finalId, updatedAt: now, updatedBy: user.name };

    try {
      // --- PERSISTENCIA BACKEND ---
      // --- PERSISTENCIA BACKEND ---
      const { api } = await import('../services/api');
      const { saveCategory } = api; // Destructure for cleaner usage

      //Determinar qué endpoint usar
      let saveResponse: any;
      if (activeMaster === 'masterUsuarios') {
        saveResponse = await api.saveUser(newRecord);
      } else if (activeMaster === 'masterArticulo') {
        // SANITIZATION: Create clean payload avoiding duplicate snake_case/camelCase keys
        const articlePayload = {
            id: newRecord.id,
            name: newRecord.name,
            clientId: newRecord.clientId,
            statusId: newRecord.statusId,
            barcode: newRecord.barcode,
            categoryArticuloId: newRecord.categoryArticuloId,
            factorInter: newRecord.factorInter,
            factorStd: newRecord.factorStd,
            uomGeneralId: newRecord.uomGeneralId,
            uomInterId: newRecord.uomInterId,
            uomStdId: newRecord.uomStdId, // Ensure this is sent
            imageUrl: newRecord.imageUrl,
            updatedBy: user.name,
            updatedAt: getColombiaNow()
        };
        saveResponse = await api.saveArticle(articlePayload);
      } else if (activeMaster === 'masterRol') {
        saveResponse = await api.saveRole(newRecord);
      } else if (activeMaster === 'masterPermisosRol') {
        saveResponse = await api.savePermission(newRecord);
      } else if (activeMaster === 'masterPermisosUsuario') {
        saveResponse = await api.saveUserPermission(newRecord);
      } else if (activeMaster === 'pages') {
        // SANITIZATION: Crear payload limpio solo con campos necesarios
        const pagePayload = {
          id: newRecord.id,
          name: newRecord.name,
          route: newRecord.route,
          parentId: newRecord.parentId,
          statusId: newRecord.statusId,
          updatedBy: user.name
        };
        saveResponse = await api.savePage(pagePayload);
      } else if (activeMaster === 'masterCategorias') {
        saveResponse = await saveCategory(newRecord);
      } else if (activeMaster === 'masterClientes') {
        saveResponse = await api.saveClient(newRecord);
      } else if (activeMaster === 'modules') {
        saveResponse = await api.saveModule(newRecord);
      } else if (activeMaster === 'masterEstados') {
        const cleanData = {
          id: newRecord.id,
          name: newRecord.name,
          description: newRecord.description || '',
          statusId: newRecord.statusId,
          createdBy: newRecord.createdBy || user.name,
          updatedBy: user.name
        };
        saveResponse = await api.saveEstado(cleanData);
      } else if (activeMaster === 'masterMarcas') {
        const cleanData = {
          id: newRecord.id,
          name: newRecord.name,
          description: newRecord.description || '',
          statusId: newRecord.statusId,
          createdBy: newRecord.createdBy || user.name,
          updatedBy: user.name
        };
        saveResponse = await api.saveMarca(cleanData);
      } else if (activeMaster === 'masterTipoDocumento') {
        const cleanData = {
          id: newRecord.id,
          name: newRecord.name,
          description: newRecord.description || '',
          statusId: newRecord.statusId,
          createdBy: newRecord.createdBy || user.name,
          updatedBy: user.name
        };
        saveResponse = await api.saveTipoDocumento(cleanData);
      } else if (activeMaster === 'masterUnidadMedida') {
        const cleanData = {
          id: newRecord.id,
          name: newRecord.name,
          abbreviation: newRecord.abbreviation || '',
          description: newRecord.description || '',
          statusId: newRecord.statusId,
          createdBy: newRecord.createdBy || user.name,
          updatedBy: user.name
        };
        saveResponse = await api.saveUnidadMedida(cleanData);
      } else if (activeMaster === 'masterNotificaciones') {
        const cleanData = {
          id: newRecord.id,
          name: newRecord.name,
          description: newRecord.description || '',
          notificationEmail: newRecord.notificationEmail || '',
          tipoNotificacionId: newRecord.tipoNotificacionId,
          statusId: newRecord.statusId,
          createdBy: newRecord.createdBy || user.name,
          updatedBy: user.name
        };
        saveResponse = await api.saveNotificacionConfig(cleanData);
      } else if (activeMaster === 'masterTiposVehiculo') {
        const cleanData = {
          id: newRecord.id,
          name: newRecord.name,
          description: newRecord.description || '',
          statusId: newRecord.statusId,
          createdBy: newRecord.createdBy || user.name,
          updatedBy: user.name
        };
        saveResponse = await api.saveTipoVehiculo(cleanData);
      } else if (activeMaster === 'masterTipoNotificacion') {
        const cleanData = {
          id: newRecord.id,
          name: newRecord.name,
          description: newRecord.description || '',
          statusId: newRecord.statusId,
          createdBy: newRecord.createdBy || user.name,
          updatedBy: user.name
        };
        saveResponse = await api.saveTipoNotificacion(cleanData);
      } else {
        // Guardado Genérico para el resto de tablas maestras (masterTipoDocumento, etc.)
        saveResponse = await api.saveMaster(activeMaster, newRecord);
      }

      // VALIDACIÓN ESTRICTA DE RESPUESTA
      if (!saveResponse || (saveResponse.success === false)) {
        const errorMsg = saveResponse?.error || 'Error desconocido en la respuesta del servidor';
        console.error('[M7-MASTER] Save failed with response:', saveResponse);
        setError(`Error del servidor: ${errorMsg}`);
        toast.error("Error al guardar", {
          description: errorMsg,
          duration: 5000
        });
        return; // NO cerrar modal si hay error
      }

      // ÉXITO CONFIRMADO
      console.log('[M7-MASTER] ✅ Save successful!', saveResponse);

      // Actualizar el estado local para que la tabla se refresque sin recargar página
      // PRIORIDAD: Usar objeto completo del backend si está disponible (ej: saveResponse.article o saveResponse.record)
      const recordWithId = saveResponse.article
        ? { ...saveResponse.article, statusId: saveResponse.article.statusId || newRecord.statusId }
        : (saveResponse.record ? saveResponse.record : { ...newRecord, id: saveResponse.id || finalId });



      // RECARGA ROBUSTA (AJAX STYLE)
      const refreshCategory = async (cat: MasterCategory) => {
        try {
          let rawData: any[] = [];
          switch (cat) {
            case 'masterUsuarios': rawData = await api.getUsers(); break;
            case 'masterClientes': rawData = await api.getClients(); break;
            case 'masterRol': rawData = await api.getRoles(); break;
            case 'masterCategorias': rawData = await api.getCategories(); break;
            case 'masterPermisosRol': rawData = await api.getPermissions(); break;
            case 'masterPermisosUsuario': rawData = await api.getAllUserPermissions(); break;
            case 'masterArticulo': rawData = await api.getArticles(); break;
            case 'masterEstados': rawData = await api.getEstados(); break;
            case 'masterMarcas': rawData = await api.getMarcas(); break;
            case 'masterTipoDocumento': rawData = await api.getTiposDocumento(); break;
            case 'masterUnidadMedida': rawData = await api.getUnidadesMedida(); break;
            case 'masterNotificaciones': rawData = await api.getNotificacionesConfig(); break;
            case 'masterTiposVehiculo': rawData = await api.getTiposVehiculo(); break;
            case 'masterTipoNotificacion': rawData = await api.getTiposNotificacion(); break;
            default:
              const allGenerics = await api.getGenericMasters();
              rawData = (allGenerics as any)[cat] || [];
          }

          // APLICAR NORMALIZACIÓN ÚNICA (Igual que en App.tsx) - Soporte Mayúsculas Driver Docker
          const normalized = (rawData || []).map(item => {
            const keys = Object.keys(item);
            const findKey = (k: string) => keys.find(key => key.toLowerCase() === k.toLowerCase());
            
            const getVal = (p: string, s: string) => {
              const key = findKey(p) || findKey(s) || p || s;
              return (item[key] !== undefined && item[key] !== null) ? item[key] : undefined;
            };

            return {
              ...item,
              statusId: getVal('statusId', 'status_id'),
              roleId: getVal('roleId', 'role_id'),
              createdAt: getVal('createdAt', 'created_at'),
              updatedAt: getVal('updatedAt', 'updated_at'),
              createdBy: getVal('createdBy', 'created_by'),
              updatedBy: getVal('updatedBy', 'updated_by')
            };
          });

          setAllMasterData({
            ...allMasterData,
            [cat]: normalized
          });

        } catch (err) {
          console.error("Error refreshing category", cat, err);
          toast.error("Error recargando datos: " + (err as any).message);
        }
      };

      await refreshCategory(activeMaster);

      toast.success("Registro Guardado", {
        description: "La tabla se ha actualizado localmente.",
        duration: 3000
      });

      if (onAudit) onAudit(activeMaster, editingRecord ? 'UPDATE' : 'CREATE');
      setIsModalOpen(false);
      setEditingRecord(null);
      setFormData({});

    } catch (err: any) {
      console.error('[M7-MASTER] Save error:', err);
      const errorMessage = err.message || 'Fallo desconocido';
      setError("Error de Sincronización: " + errorMessage);
      toast.error("Error al guardar", {
        description: errorMessage,
        duration: 5000
      });
    }
  };

  // Estados para Notification Sender
  const [isNotificationSenderOpen, setIsNotificationSenderOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [notificationMedia, setNotificationMedia] = useState<string | null>(null);
  const [notificationMediaName, setNotificationMediaName] = useState('');

  const handleDelete = async () => {
    if (!recordToDelete) return;

    try {
      const { api } = await import('../services/api');

      if (activeMaster === 'masterUsuarios') {
        await api.deleteUser(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterPermisosUsuario') {
        await api.deleteUserPermission(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterPermisosRol') {
        await api.deleteRolePermission(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterArticulo') {
        await api.deleteArticle(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterRol') {
        await api.deleteRole(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterClientes') {
        await api.deleteClient(recordToDelete.id, user.name);
      } else if (activeMaster === 'modules') {
        await api.deleteModule(recordToDelete.id, user.name);
      } else if (activeMaster === 'pages') {
        await api.deletePage(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterEstados') {
        await api.deleteEstado(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterMarcas') {
        await api.deleteMarca(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterTipoDocumento') {
        await api.deleteTipoDocumento(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterUnidadMedida') {
        await api.deleteUnidadMedida(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterNotificaciones') {
        await api.deleteNotificacionConfig(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterTiposVehiculo') {
        await api.deleteTipoVehiculo(recordToDelete.id, user.name);
      } else if (activeMaster === 'masterTipoNotificacion') {
        await api.deleteTipoNotificacion(recordToDelete.id, user.name);
      } else {
        await api.deleteMaster(activeMaster, recordToDelete.id, user.name);
      }

      toast.success("Registro Eliminado", { description: "La base de datos se ha actualizado." });
      if (onAudit) onAudit(activeMaster, 'DELETE');
      
      // Actualizar el store filtrando el registro eliminado
      const currentData = allMasterData[activeMaster] || [];
      const updatedData = currentData.filter((item: any) => item.id !== recordToDelete.id);
      useAppStore.getState().updateMasterCategory(activeMaster, updatedData);
      
      setIsModalOpen(false);
      setShowDeleteConfirm(false);
      setRecordToDelete(null);

    } catch (err: any) {
      console.error('[M7-MASTER] Delete error:', err);
      const msg = err.message || 'Fallo desconocido';
      
      let friendlyMsg = msg;
      if (msg.includes('foreign key constraint') || msg.includes('violates foreign key')) {
          friendlyMsg = "NO SE PUEDE ELIMINAR: El registro está siendo usado por otros módulos del sistema (Artículos, Facturas, etc). Debe eliminar o reasignar los dependientes primero.";
      }

      setError("Error de Eliminación: " + friendlyMsg);
      toast.error("Operación Restringida", { description: friendlyMsg, duration: 6000 });
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
    }
  };

  const handleExportExcel = () => {
    const dataToExport = filteredData.map(item => {
      const flat: any = { ...item };
      delete flat.avatar; delete flat.logoUrl; delete flat.photoUrl;

      // Asegurar formato Colombia para el reporte Excel (incluso para registros viejos)
      if (flat.createdAt) {
        flat.createdAt = safeFormatDate(flat.createdAt).replace(' a. m.', ' AM').replace(' p. m.', ' PM');
      }
      if (flat.updatedAt) {
        flat.updatedAt = safeFormatDate(flat.updatedAt || flat.createdAt).replace(' a. m.', ' AM').replace(' p. m.', ' PM');
      }

      return flat;
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    const sheetName = activeMaster.replace('master', '');
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `Informacion_de_${sheetName}_${new Date().getTime()}.xlsx`);
  };

  const handleSendNotification = async () => {
    if (selectedUserIds.length === 0) {
      toast.error("Por favor seleccione al menos un destinatario.");
      return;
    }

    setIsSending(true);

    const phones = (allMasterData.masterUsuarios || [])
      .filter(u => selectedUserIds.includes(u.id) && u.phone && u.phone.length > 5)
      .map(u => u.phone) as string[];

    const uniquePhones = [...new Set(phones)]; // Eliminar duplicados

    if (uniquePhones.length === 0) {
      toast.warning("Los usuarios seleccionados no tienen número de teléfono registrado.");
      setIsSending(false);
      return;
    }

    try {
      // Import dynamic to avoid cycles or ensure loading
      const { api } = await import('../services/api');
      const res = await api.sendWhatsAppNotification({
        phones: uniquePhones,
        message: notificationMessage,
        userId: user.id,
        media: notificationMedia || undefined,
        fileName: notificationMediaName || undefined
      });

      if (res.success) {
        toast.success("Difusión Enviada Correctamente", {
          description: `Se enviaron mensajes a ${res.results?.sent} destinatarios. (${res.results?.failed} fallidos)`,
          duration: 5000
        });

        setIsNotificationSenderOpen(false);
        setNotificationMessage('');
        setSelectedUserIds([]);
        setNotificationMedia(null);
        setNotificationMediaName('');
      } else {
        toast.error("Error en el envío", { description: res.error || 'Ocurrió un error desconocido' });
      }
    } catch (e: any) {
      console.error('[NotificationSender] Error:', e);
      toast.error("Error de Conexión", { description: e.message });
    } finally {
      setIsSending(false);
    }
  };

  const handleBatchImport = async (importedData: any[]) => {
    try {
      const currentList = [...(allMasterData[activeMaster] || [])];

      const newRecords = importedData.map((item: any) => {
        const finalId = item.id || generateNextId(activeMaster, currentList);

        // Procesar clientIds si viene como string separado por comas
        let processedClientIds = item.clientIds;
        if (typeof item.clientIds === 'string') {
          processedClientIds = item.clientIds.split(',').map((id: string) => id.trim()).filter(Boolean);
        }

        const record = {
          ...item,
          clientIds: processedClientIds,
          id: finalId,
          statusId: item.statusId || 'EST-01',
          createdAt: getColombiaNow(),
          createdBy: user.name
        };
        // Push to currentList so next item calculates from updated state
        currentList.push(record as MasterRecord);
        return record;
      });

      // TODO: Descomentar para backend real
      // const { api } = await import('../services/api');
      // await api.saveMasterBatch(activeMaster, newRecords);

      useAppStore.getState().updateMasterCategory(activeMaster, [...(allMasterData[activeMaster] || []), ...newRecords]);

      // toast.success desde el Dialog
    } catch (e) {
      console.error(e);
      throw new Error("Error procesando lote");
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
         const rawBase64 = reader.result as string;
         // Compress if it's an image
         if (file.type.startsWith('image/')) {
            try {
              toast.info("Comprimiendo imagen...", { duration: 1000 });
              const compressed = await compressImage(rawBase64);
              setFormData({ ...formData, [field]: compressed });
              toast.success("Imagen optimizada correctamente");
            } catch (err) {
              console.error("Compression error", err);
              setFormData({ ...formData, [field]: rawBase64 });
            }
         } else {
            setFormData({ ...formData, [field]: rawBase64 });
         }
      };
      reader.readAsDataURL(file);
    }
  };

  // Force load users when managing permissions to ensure names are available
  React.useEffect(() => {
    const loadUsersIfNeeded = async () => {
        if (activeMaster === 'masterPermisosUsuario' && (!allMasterData.masterUsuarios || allMasterData.masterUsuarios.length === 0)) {
            try {
                const { api } = await import('../services/api');
                const users = await api.getUsers();
                updateMasterCategory('masterUsuarios', users);
            } catch (e) {
                console.error("Error loading users for permissions view", e);
            }
        }
    };
    loadUsersIfNeeded();
  }, [activeMaster]);

  // DEBUG: Check permissions data
  React.useEffect(() => {
    if (activeMaster === 'masterPermisosUsuario') {
        console.log("DEBUG PERMISSIONS DATA:", paginatedData);
        console.log("DEBUG USERS DATA:", allMasterData.masterUsuarios);
    }
  }, [activeMaster, paginatedData, allMasterData.masterUsuarios]);

  const commonInputStyle = "w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-emerald-500 transition-all shadow-sm appearance-none cursor-pointer";

  const renderStatusField = () => (
    <div className="md:col-span-2 space-y-1 mt-4">
      <label className="text-[10px] font-black text-emerald-500 uppercase ml-2 tracking-widest">Estado Operativo M7</label>
      <div className="relative">
        <select required value={formData.statusId || ''} onChange={e => setFormData({ ...formData, statusId: e.target.value })} className={commonInputStyle}>
          <option value="">Seleccione Estado...</option>
          {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400"><Icons.ChevronRight className="rotate-90 w-3 h-3" /></div>
      </div>
    </div>
  );

  const renderFormFields = () => {
    switch (activeMaster) {
      case 'masterUsuarios':
        const currentRolePerms = rolePermissions.find(rp => rp.roleId === formData.roleId);
        return (
          <div className="space-y-10 animate-in fade-in relative">
            {showRoleDialog && (
              <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-md rounded-[3rem] flex items-center justify-center p-8 text-center animate-in zoom-in-95">
                <div className="max-w-md space-y-8">
                  <div className="w-20 h-20 bg-emerald-500 text-slate-950 rounded-3xl mx-auto flex items-center justify-center shadow-2xl"><Icons.Alert /></div>
                  <h4 className="text-white text-xl font-black uppercase tracking-tight">¿Heredar permisos del nuevo Rol?</h4>
                  <p className="text-slate-400 text-xs font-bold leading-relaxed">Ha cambiado el Rol. ¿Desea resetear los permisos del usuario a los valores predeterminados del rol o conservar los actuales?</p>
                  <div className="flex flex-col gap-4">
                    <button type="button" onClick={() => applyRoleChange(true)} className="w-full py-4 bg-emerald-500 text-slate-900 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-emerald-400 transition-all">Heredar Permisos del Rol</button>
                    <button type="button" onClick={() => applyRoleChange(false)} className="w-full py-4 bg-white/10 text-white rounded-2xl font-black text-[10px] uppercase border border-white/10 hover:bg-white/20 transition-all">Conservar Actuales</button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row items-center gap-10 p-8 bg-slate-50 rounded-[3.5rem] border-2 border-dashed border-slate-200">
              <div className="relative group">
                <div className="w-32 h-32 rounded-full bg-white overflow-hidden border-4 border-emerald-500 shadow-2xl">
                  <img src={formData.avatar || AVATAR_GALLERY[0]} className="w-full h-full object-cover" />
                </div>
                <label className="absolute bottom-0 right-0 bg-slate-900 text-white p-2.5 rounded-xl cursor-pointer hover:bg-emerald-500 transition-all shadow-lg">
                  <Icons.Camera />
                  <input type="file" className="hidden" accept="image/*" onChange={e => handlePhotoUpload(e, 'avatar')} />
                </label>
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">Identidad Visual M7</p>
                <div className="flex flex-wrap gap-3">
                  {AVATAR_GALLERY.map((av, i) => (
                    <button key={i} type="button" onClick={() => setFormData({ ...formData, avatar: av })} className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${formData.avatar === av ? 'border-emerald-500 scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'}`}>
                      <img src={av} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre Completo</label>
                <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Email Corporativo</label>
                <input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value.toLowerCase() })} className={commonInputStyle} required />
              </div>

              {/* Password Fields - Only for New Users or Explicit Change */}
              {(!editingRecord || showPasswordChange) && (
                  <div className="md:col-span-2 bg-slate-100 p-6 rounded-3xl border border-slate-200 animate-in fade-in slide-in-from-top-4 relative group">
                    <button type="button" onClick={() => {setShowPasswordChange(false); setFormData({...formData, password: '', confirmPassword: ''});}} className="absolute top-4 right-4 p-2 bg-white rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all shadow-sm"><Icons.X className="w-4 h-4" /></button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-1 relative">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Contraseña</label>
                        <div className="relative">
                            <input 
                                type={showPassword ? "text" : "password"} 
                                value={formData.password || ''} 
                                onChange={e => setFormData({ ...formData, password: e.target.value })} 
                                className={commonInputStyle} 
                                placeholder="Ingrese contraseña"
                                autoComplete="new-password"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-3 text-slate-400 hover:text-emerald-500 transition-colors">
                                {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1 relative">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Confirmar Contraseña</label>
                        <div className="relative">
                            <input 
                                type={showConfirmPassword ? "text" : "password"} 
                                value={formData.confirmPassword || ''} 
                                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} 
                                className={`${commonInputStyle} ${formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword ? 'border-red-500 text-red-600 bg-red-50' : ''}`} 
                                placeholder="Repita la contraseña"
                                autoComplete="new-password"
                            />
                             <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-3 text-slate-400 hover:text-emerald-500 transition-colors">
                                {showConfirmPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                           <p className="text-[9px] font-bold text-red-500 ml-2 mt-1 animate-pulse">Las contraseñas no coinciden</p>
                        )}
                    </div>
                    </div>
                  </div>
              )}
              
              {editingRecord && !showPasswordChange && (
                  <div className="md:col-span-2 flex justify-center">
                      <button type="button" onClick={() => setShowPasswordChange(true)} className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all flex items-center gap-2">
                          <Icons.Lock className="w-4 h-4" />
                          Cambiar Contraseña
                      </button>
                  </div>
              )}

              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Teléfono de Contacto</label>
                <input 
                    type="text" 
                    value={formData.phone || ''} 
                    onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val.length <= 15) setFormData({ ...formData, phone: val });
                    }} 
                    className={commonInputStyle} 
                    placeholder="Solo números"
                />
                {formData.phone && formData.phone.length < 7 && <p className="text-[9px] font-bold text-amber-500 ml-2">Número parece incompleto</p>}
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Tipo Documento</label>
                <select value={formData.documentType || ''} onChange={e => setFormData({ ...formData, documentType: e.target.value })} className={commonInputStyle}>
                  <option value="">Seleccione...</option>{docTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nro Documento</label>
                <input type="text" value={formData.documentNumber || ''} onChange={e => setFormData({ ...formData, documentNumber: e.target.value })} className={commonInputStyle} />
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 ml-2">Multicliente M7 (Seleccione Clientes Permitidos)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {clients.map(c => (
                  <label key={c.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${formData.clientIds?.includes(c.id) ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
                    <input type="checkbox" checked={formData.clientIds?.includes(c.id)} onChange={e => {
                      const ids = formData.clientIds || [];
                      setFormData({ ...formData, clientIds: e.target.checked ? [...ids, c.id] : ids.filter((id: string) => id !== c.id) });
                    }} className="w-5 h-5 accent-emerald-500 rounded-lg" />
                    <span className="text-[10px] font-black uppercase text-slate-900">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Rol Operativo</label>
                <select value={formData.roleId || ''} onChange={e => handleRoleChangeIntent(e.target.value)} className={commonInputStyle} required>
                  <option value="">Seleccione Rol...</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              {formData.roleId && (
                <div className="bg-slate-950 rounded-[2.5rem] overflow-hidden shadow-2xl">
                  <div className="p-6 bg-white/5 border-b border-white/10 flex justify-between items-center">
                    <h4 className="text-white font-black text-[10px] uppercase tracking-widest leading-none">Matriz de Permisos</h4>
                    <span className="text-emerald-500 text-[8px] font-black uppercase px-4 py-1 bg-emerald-500/10 rounded-full">Vista Informativa</span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-[9px]">
                      <thead className="bg-white/5 text-slate-500 font-black uppercase tracking-widest sticky top-0">
                        <tr><th className="p-4 bg-slate-950">Página</th>{['VER', 'CREAR', 'EDITAR', 'BORRAR', 'ACT'].map(a => <th key={a} className="p-4 text-center bg-slate-950">{a}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {pages.map(p => (
                          <tr key={p.id} className="hover:bg-white/5 transition-all">
                            <td className="p-4 text-slate-300 font-bold uppercase">{p.name}</td>
                            {['view', 'create', 'edit', 'delete', 'active'].map(a => (
                              <td key={a} className="p-4 text-center">
                                <div className={`w-4 h-4 mx-auto rounded flex items-center justify-center ${currentRolePerms?.[`page_${p.id}_${a}`] ? 'text-emerald-500' : 'text-red-500/20'}`}>
                                  {currentRolePerms?.[`page_${p.id}_${a}`] ? <Icons.Check /> : <Icons.X />}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* SECCIÓN SEGURIDAD AVANZADA (2FA) - SOLO USUARIOS */}
            {activeMaster === 'masterUsuarios' && editingRecord && (
              <div className="bg-amber-50 rounded-[2.5rem] p-8 border-2 border-dashed border-amber-200 mt-6 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-2xl ${(formData as any).twoFactorEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      <Icons.Shield style={{ width: '24px', height: '24px' }} />
                    </div>
                    <div>
                      <h4 className="text-amber-900 font-black text-xs uppercase tracking-widest leading-none mb-1">Seguridad Avanzada</h4>
                      <p className="text-[10px] font-bold text-amber-700/60 uppercase">
                        Estado 2FA: <span className={(formData as any).twoFactorEnabled ? 'text-emerald-600' : 'text-slate-400'}>{(formData as any).twoFactorEnabled ? 'ACTIVO' : 'INACTIVO'}</span>
                      </p>
                    </div>
                  </div>
                  {(formData as any).twoFactorEnabled ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm("¿RESET SEGURIDAD 2FA?")) {
                          const { api } = await import('../services/api');
                          await api.deactivate2FA(formData.id);
                          setFormData({ ...formData as any, twoFactorEnabled: false });
                          toast.success("2FA Reseteado");
                        }
                      }}
                      className="px-6 py-3 bg-red-600 text-white rounded-xl font-black text-[9px] uppercase hover:bg-red-700"
                    >
                      Resetear 2FA
                    </button>
                  ) : <span className="text-[9px] font-black opacity-50 uppercase tracking-widest text-slate-400">Sin Protección</span>}
                </div>
              </div>
            )}

            {renderStatusField()}
          </div>
        );

      case 'masterPermisosUsuario':
        const targetUser = (allMasterData.masterUsuarios || []).find(u => u.id === (formData.userId || formData.user_id));
        return (
          <div className="space-y-10 animate-in fade-in">
             {/* HEADER CON NOMBRE DE USUARIO */}
             <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-900 text-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                   {targetUser?.avatar ? <img src={targetUser.avatar} className="w-full h-full object-cover rounded-2xl" /> : <Icons.User />}
                </div>
                <div>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gestionando Permisos Para:</p>
                   <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{targetUser?.name || formData.userName || formData.user_id || 'Usuario Desconocido'}</h3>
                </div>
             </div>

            <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                <h4 className="text-white font-black text-xs uppercase tracking-widest leading-none">Matriz M7 de Usuario</h4>
                <button type="button" onClick={toggleAllPerms} className={`${isAllPermsChecked ? 'bg-red-600' : 'bg-emerald-500'} text-white px-8 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg hover:opacity-80 transition-all`}>
                  {isAllPermsChecked ? 'QUITAR TODO' : 'SELECCIONAR TODO'}
                </button>
              </div>
              <div className="overflow-x-auto max-h-[450px] custom-scrollbar">
                <table className="w-full text-left text-[10px]">
                  <thead className="bg-white/5 text-slate-500 font-black uppercase tracking-widest sticky top-0 z-20">
                    <tr><th className="p-4 bg-slate-900">Página</th>{['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ACTIVE'].map(a => <th key={a} className="p-4 text-center bg-slate-900">{a}</th>)}<th className="p-4 text-center bg-slate-900">Fila</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pages.map(p => (
                      <tr key={p.id} className="hover:bg-white/5 transition-all">
                        <td className="p-4 text-white font-bold uppercase">{p.name}</td>
                        {['view', 'create', 'edit', 'delete', 'active'].map(a => (
                          <td key={a} className="p-4 text-center">
                            <input type="checkbox" checked={!!formData[`page_${p.id}_${a}`]} onChange={e => setFormData({ ...formData, [`page_${p.id}_${a}`]: e.target.checked })} className="w-5 h-5 rounded-lg border-2 border-white/10 bg-transparent checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer appearance-none flex items-center justify-center after:content-['✓'] after:text-white after:font-black after:hidden checked:after:block" />
                          </td>
                        ))}
                        <td className="p-4 text-center">
                          <button type="button" onClick={() => togglePageRow(p.id)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-emerald-500 transition-all">
                            <Icons.Check />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterPermisosRol':
        const availableRoles = editingRecord ? roles : roles.filter(r => !rolePermissions.some(rp => rp.roleId === r.id));
        return (
          <div className="space-y-10 animate-in fade-in">
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Seleccione Rol (Solo disponibles)</label>
              <select required disabled={!!editingRecord} value={formData.roleId || ''} onChange={e => setFormData({ ...formData, roleId: e.target.value })} className={commonInputStyle}>
                <option value="">Seleccione Rol...</option>
                {availableRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                <h4 className="text-white font-black text-xs uppercase tracking-widest leading-none">Matriz M7</h4>
                <button type="button" onClick={toggleAllPerms} className={`${isAllPermsChecked ? 'bg-red-600' : 'bg-emerald-500'} text-white px-8 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg hover:opacity-80 transition-all`}>
                  {isAllPermsChecked ? 'QUITAR TODO' : 'SELECCIONAR TODO'}
                </button>
              </div>
              <div className="overflow-x-auto max-h-[450px] custom-scrollbar">
                <table className="w-full text-left text-[10px]">
                  <thead className="bg-white/5 text-slate-500 font-black uppercase tracking-widest sticky top-0 z-20">
                    <tr><th className="p-4 bg-slate-900">Página</th>{['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ACTIVE'].map(a => <th key={a} className="p-4 text-center bg-slate-900">{a}</th>)}<th className="p-4 text-center bg-slate-900">Fila</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pages.map(p => (
                      <tr key={p.id} className="hover:bg-white/5 transition-all">
                        <td className="p-4 text-white font-bold uppercase">{p.name}</td>
                        {['view', 'create', 'edit', 'delete', 'active'].map(a => (
                          <td key={a} className="p-4 text-center">
                            <input type="checkbox" checked={!!formData[`page_${p.id}_${a}`]} onChange={e => setFormData({ ...formData, [`page_${p.id}_${a}`]: e.target.checked })} className="w-5 h-5 rounded-lg border-2 border-white/10 bg-transparent checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer appearance-none flex items-center justify-center after:content-['✓'] after:text-white after:font-black after:hidden checked:after:block" />
                          </td>
                        ))}
                        <td className="p-4 text-center">
                          <button type="button" onClick={() => togglePageRow(p.id)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-emerald-500 transition-all">
                            <Icons.Check />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterArticulo':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 flex flex-col items-center p-6 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
              <div className="w-24 h-24 bg-white rounded-2xl overflow-hidden shadow-md border-2 border-emerald-500 mb-3 flex items-center justify-center">
                {formData.imageUrl ? <img src={formData.imageUrl} className="w-full h-full object-cover" /> : <Icons.Package className="text-slate-300 w-10 h-10" />}
              </div>
              <label className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-[9px] uppercase cursor-pointer hover:bg-emerald-600 transition-all mb-2">
                Subir Foto Art.
                <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e, 'imageUrl')} />
              </label>
              <div className="w-full max-w-xs mt-2">
                 <input type="text" placeholder="O pegar URL de imagen..." value={formData.imageUrl || ''} onChange={e => setFormData({ ...formData, imageUrl: e.target.value })} className="w-full text-center text-[9px] border-b border-slate-300 focus:border-emerald-500 outline-none bg-transparent p-1" />
              </div>
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">SKU / Identificador (Único)</label>
              <input type="text" value={formData.id || ''} onChange={e => setFormData({ ...formData, id: e.target.value.toUpperCase() })} className={commonInputStyle} required placeholder="Ej: ART-001" disabled={!!editingRecord} />
            </div>

            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Cliente Asociado</label>
              <select required value={formData.clientId || ''} onChange={e => setFormData({ ...formData, clientId: e.target.value })} className={commonInputStyle}>
                 <option value="">Seleccione Cliente...</option>
                 {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre Comercial</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>

            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Código de Barras</label>
              <input type="text" value={formData.barcode || ''} onChange={e => setFormData({ ...formData, barcode: e.target.value })} className={commonInputStyle} placeholder="Opcional..." />
            </div>

            {/* Selectores de Unidades (Triple UOM) */}
            <div className="md:col-span-2 bg-slate-100 p-8 rounded-[3rem] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 border border-slate-200">
              <div className="space-y-1"><label className="text-[9px] font-black text-emerald-600 uppercase ml-2 tracking-widest">Unidad General</label>
                <select value={formData.uomGeneralId || ''} onChange={e => setFormData({ ...formData, uomGeneralId: e.target.value })} className={commonInputStyle}>
                  <option value="">Seleccione...</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="space-y-1 w-full">
                  <label className="text-[9px] font-black text-blue-600 uppercase ml-2 tracking-widest">Unidad Intermedia</label>
                  <select value={formData.uomInterId || ''} onChange={e => setFormData({ ...formData, uomInterId: e.target.value })} className={commonInputStyle}>
                    <option value="">Seleccione...</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1 shrink-0">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest block text-center">Factor</label>
                  <input type="number" placeholder="1" value={formData.factorInter || ''} onChange={e => setFormData({ ...formData, factorInter: Number(e.target.value) })} className="w-24 p-4 rounded-2xl bg-white border-2 border-slate-200 font-black text-[10px] text-center outline-none focus:border-blue-500 transition-all" />
                </div>
              </div>

              <div className="flex gap-4">
                <div className="space-y-1 w-full">
                  <label className="text-[9px] font-black text-slate-900 uppercase ml-2 tracking-widest">Unidad Estándar</label>
                  <select value={formData.uomStdId || ''} onChange={e => setFormData({ ...formData, uomStdId: e.target.value })} className={commonInputStyle}>
                    <option value="">Seleccione...</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1 shrink-0">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest block text-center">Factor</label>
                  <input type="number" placeholder="1" value={formData.factorStd || ''} onChange={e => setFormData({ ...formData, factorStd: Number(e.target.value) })} className="w-24 p-4 rounded-2xl bg-white border-2 border-slate-200 font-black text-[10px] text-center outline-none focus:border-slate-900 transition-all" />
                </div>
              </div>
            </div>

            {/* VISOR DE FACTORES (LEYENDA INFORMATIVA) */}
            {formData.uomGeneralId && (
              <div className="md:col-span-2 bg-emerald-50/50 p-6 rounded-[2.5rem] border-2 border-dashed border-emerald-200/50 flex flex-col md:flex-row items-center justify-center gap-6 animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center font-black text-xs shadow-md">1</div>
                  <span className="text-[11px] font-black text-slate-700 uppercase">{uoms.find(u => u.id === formData.uomGeneralId)?.name || 'UNIDAD'}</span>
                </div>

                <div className="text-emerald-300 hidden md:block">
                  <Icons.ChevronRight className="w-5 h-5" />
                </div>

                <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl shadow-sm border border-emerald-100 min-w-[140px] justify-center">
                  <span className="text-sm font-black text-blue-600">{formData.factorInter || 1}</span>
                  <span className="text-[10px] font-black text-slate-500 uppercase">{uoms.find(u => u.id === formData.uomInterId)?.name || 'INTERMEDIA'}</span>
                </div>

                <div className="text-emerald-300 hidden md:block">
                  <Icons.ChevronRight className="w-5 h-5" />
                </div>

                <div className="flex items-center gap-3 bg-slate-900 px-6 py-3 rounded-2xl shadow-lg min-w-[140px] justify-center">
                  <span className="text-sm font-black text-emerald-400">{(formData.factorInter || 1) * (formData.factorStd || 1)}</span>
                  <span className="text-[10px] font-black text-white uppercase">{uoms.find(u => u.id === formData.uomStdId)?.name || 'ESTÁNDAR'}</span>
                </div>

                <div className="ml-0 md:ml-auto flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-xl">
                  <Icons.Alert className="text-emerald-600 w-3 h-3" />
                  <p className="text-[9px] font-black text-emerald-700 uppercase leading-none">Cálculo de Equivalencia M7 IQ</p>
                </div>
              </div>
            )}

            {/* Selectores Restaurados: Categoría */}
            <div className="space-y-1">
              <label
                htmlFor="categoryArticuloId"
                className={`text-[10px] font-black uppercase ml-2 tracking-widest ${error && !formData.categoryArticuloId ? 'text-red-500' : 'text-slate-400'}`}
              >
                Categoría del Articulo
              </label>
              <div className="relative group">
                <select
                  id="categoryArticuloId"
                  value={formData.categoryArticuloId || ''}
                  onChange={e => setFormData({ ...formData, categoryArticuloId: e.target.value })}
                  className={`${commonInputStyle} ${error && !formData.categoryArticuloId ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
                  required
                  aria-invalid={error && !formData.categoryArticuloId ? "true" : "false"}
                  aria-describedby={error && !formData.categoryArticuloId ? "category-error" : undefined}
                >
                  <option value="">Seleccione Categoría...</option>
                  {categoriesArt.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
                {error && !formData.categoryArticuloId && (
                  <p id="category-error" className="text-[9px] font-black text-red-500 uppercase tracking-tight mt-1 ml-2 animate-in fade-in slide-in-from-top-1">
                    M7 ERROR: Debe asignar una categoría válida al artículo
                  </p>
                )}
              </div>
            </div>

            {renderStatusField()}
          </div>
        );

      case 'masterClientes':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 flex flex-col items-center p-6 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
              <div className="w-48 h-24 bg-white rounded-2xl overflow-hidden shadow-md border-2 border-emerald-500 mb-3 flex items-center justify-center">
                {formData.logoUrl ? <img src={formData.logoUrl} className="w-full h-full object-contain p-2" /> : <Icons.Truck className="text-slate-300 w-10 h-10" />}
              </div>
              <label className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-[9px] uppercase cursor-pointer hover:bg-emerald-600 transition-all">
                Subir Logo Corporativo
                <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e, 'logoUrl')} />
              </label>
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">ID Sistema (Autogenerado)</label>
              <input type="text" value={formData.id || 'CLI-###'} disabled className={`${commonInputStyle} bg-slate-100 text-slate-500`} />
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Cliente</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            {renderStatusField()}
          </div>
        );


      case 'modules':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Módulo</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Icono Visual M7</label>
              <select value={formData.iconClass || ''} onChange={e => setFormData({ ...formData, iconClass: e.target.value })} className={commonInputStyle}>
                <option value="">Seleccione Icono...</option>{iconKeys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-center bg-slate-100 rounded-3xl">
              <div className="w-14 h-14 bg-slate-900 text-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                {formData.iconClass && (Icons as any)[formData.iconClass] ? React.createElement((Icons as any)[formData.iconClass]) : <Icons.Settings />}
              </div>
            </div>
            {renderStatusField()}
          </div>
        );

      case 'pages':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre de la Página Web</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Ruta de Sistema (Route)</label>
              <input type="text" value={formData.route || ''} onChange={e => setFormData({ ...formData, route: e.target.value })} className={commonInputStyle} />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Módulo Padre</label>
              <select value={formData.parentId || ''} onChange={e => setFormData({ ...formData, parentId: e.target.value })} className={commonInputStyle}>
                <option value="">Seleccione Módulo...</option>{modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterNotificaciones':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre de Alerta / Grupo</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descripción</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${commonInputStyle} h-24 resize-none`} placeholder="Detalle de la alerta o contexto..." />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Email de Notificación</label>
              <input type="email" placeholder="ejemplo@correo.com" value={formData.notificationEmail || ''} onChange={e => setFormData({ ...formData, notificationEmail: e.target.value.toLowerCase() })} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Tipo de Notificación</label>
              <select value={formData.tipoNotificacionId || ''} onChange={e => setFormData({ ...formData, tipoNotificacionId: e.target.value })} className={commonInputStyle} required>
                <option value="">Seleccione Tipo...</option>
                {notificationTypes.map(nt => <option key={nt.id} value={nt.id}>{nt.name}</option>)}
              </select>
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterCategorias':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre de la Categoría</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descripción</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${commonInputStyle} h-24 resize-none`} />
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterEstados':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Registro</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descripción</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${commonInputStyle} h-24 resize-none`} placeholder="Descripción opcional del estado..." />
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterUnidadMedida':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre de la Unidad</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Abreviación</label>
              <input type="text" value={formData.abbreviation || ''} onChange={e => setFormData({ ...formData, abbreviation: e.target.value.toUpperCase() })} className={commonInputStyle} placeholder="Ej: KG, M, L..." />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Estado Operativo M7</label>
              {renderStatusField()}
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descripción</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${commonInputStyle} h-24 resize-none`} placeholder="Detalles sobre esta unidad de medida..." />
            </div>
          </div>
        );

      case 'masterMarcas':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre de la Marca</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descripción</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${commonInputStyle} h-24 resize-none`} placeholder="Información adicional sobre la marca..." />
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterTipoDocumento':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Tipo de Documento</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descripción</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${commonInputStyle} h-24 resize-none`} placeholder="Detalles del tipo de documento..." />
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterTipoNotificacion':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Grupo de Alerta</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descripción</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${commonInputStyle} h-24 resize-none`} placeholder="Propósito de este grupo de alertas..." />
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterTiposVehiculo':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Tipo de Vehículo</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descripción</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${commonInputStyle} h-24 resize-none`} placeholder="Características del tipo de vehículo..." />
            </div>
            {renderStatusField()}
          </div>
        );

      default:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Registro</label>
              <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className={commonInputStyle} required />
            </div>
            {renderStatusField()}
          </div>
        );
    }
  };



  return (
    <div className="flex flex-col gap-4 h-full animate-in fade-in duration-500 overflow-hidden">
      <div className="bg-white px-6 py-4 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-900 rounded-[1.2rem] flex items-center justify-center text-emerald-500 shadow-md"><Icons.Settings /></div>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">{MASTER_LABELS[activeMaster] || activeMaster.replace('master', '')}</h2>
            <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Auditoría M7</p>
          </div>
        </div>
        <div className="flex flex-1 max-w-xl bg-slate-50 px-5 py-2.5 rounded-2xl items-center gap-3 border border-slate-100 focus-within:border-emerald-500 transition-all">
          <Icons.Search className="text-slate-300 w-4 h-4" />
          <input type="text" placeholder="Filtrar..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="bg-transparent outline-none font-black text-[10px] uppercase w-full" />
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner h-11 relative">
            <button onClick={() => setDisplayMode('table')} className={`p-2.5 rounded-xl transition-all relative z-10 ${displayMode === 'table' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.List /></button>
            <button onClick={() => setDisplayMode('grid')} className={`p-2.5 rounded-xl transition-all relative z-10 ${displayMode === 'grid' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.Grid /></button>
            <div className={`absolute top-1 bottom-1 w-[40px] bg-white rounded-xl shadow-md transition-all duration-300 ${displayMode === 'table' ? 'left-1' : 'left-[44px]'}`}></div>
          </div>

          <button onClick={() => setIsImportDialogOpen(true)} className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl hover:from-blue-600 hover:to-blue-700 hover:scale-110 active:scale-95 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 font-black text-[9px] uppercase cursor-pointer">
            <Icons.Excel className="w-4 h-4" />
            <span className="hidden xl:inline">Importar</span>
          </button>

          <button onClick={handleExportExcel} className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-2xl hover:from-emerald-600 hover:to-emerald-700 hover:scale-110 active:scale-95 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 font-black text-[9px] uppercase">
            <Icons.Excel className="w-4 h-4" />
            <span className="hidden xl:inline">Excel</span>
          </button>

          {activeMaster === 'masterNotificaciones' && (
            <button onClick={() => setIsNotificationSenderOpen(true)} className="bg-emerald-500 text-slate-900 px-8 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-400 transition-all flex items-center gap-2">
              <Icons.Chat className="w-4 h-4" />
              <span className="hidden md:inline">Difusión</span>
            </button>
          )}

          {canCreate && activeMaster !== 'masterPermisosUsuario' && (
            <button onClick={() => { setEditingRecord(null); setFormData(getInitialFormData(activeMaster)); setIsReadOnly(false); setError(null); setIsModalOpen(true); }} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all active:scale-95">Nuevo</button>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-x-auto custom-scrollbar">
          {displayMode === 'table' ? (
            <table className="w-full text-left min-w-[800px]">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white font-black uppercase tracking-widest text-[8px]">
                <tr>
                  <th className="px-8 py-4">Descripción Registro</th>
                  <th className="px-8 py-4 text-center">Creación</th>
                  <th className="px-8 py-4 text-center">Actualización</th>
                  {activeMaster === 'masterUsuarios' && <th className="px-8 py-4 text-center">Seguridad (2FA)</th>}
                  <th className="px-8 py-4 text-center">Estado</th>
                  <th className="px-8 py-4 text-right">Auditoría</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedData.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-all group">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center border border-slate-100 shrink-0 shadow-sm group-hover:scale-110 transition-transform">
                          {item.avatar ? <img src={item.avatar} className="w-full h-full object-cover" /> :
                            (item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> :
                            (item.logoUrl ? <img src={item.logoUrl} className="w-full h-full object-contain p-1" /> :
                            (item.photoUrl ? <img src={item.photoUrl} className="w-full h-full object-cover" /> : <Icons.Package className="text-slate-300 w-5 h-5" />)))}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-[12px] uppercase">
                            {activeMaster === 'masterPermisosRol'
                              ? (item.roleName || roles.find(r => r.id === item.roleId)?.name || item.roleId || item.id)
                              : (activeMaster === 'masterPermisosUsuario'
                                ? ((item as any).userName || (allMasterData.masterUsuarios || []).find(u => u.id === ((item as any).userId || (item as any).user_id))?.name || (item as any).userId || (item as any).user_id || 'Usuario Desconocido')
                                : (item.name || item.id))}
                          </p>
                          
                          {/* DETALLES DE TABLA (Artículos y Categorías) */}
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {(activeMaster === 'masterPermisosRol' || activeMaster === 'masterPermisosUsuario') && (
                               <span className="text-[8px] text-slate-400 font-bold uppercase">ID: {item.id}</span>
                            )}
                            
                            {/* EMAIL / ORIGNAL SUBTITLE */}
                            {!['masterArticulo', 'masterCategorias', 'masterPermisosRol', 'masterPermisosUsuario'].includes(activeMaster) && (
                               <span className="text-[8px] text-slate-400 font-bold uppercase">{item.email || (item as any).notificationEmail || item.id}</span>
                            )}

                            {/* ARTÍCULOS */}
                            {activeMaster === 'masterArticulo' && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[7px] font-black text-slate-500 bg-slate-100 px-1.5 rounded uppercase">
                                  {categoriesArt.find(c => c.id === (item as any).categoryArticuloId)?.name || 'SIN CAT'}
                                </span>
                                <span className="text-[7px] font-bold text-slate-400 uppercase">
                                  {(item as any).uomStdId ? uoms.find(u => u.id === (item as any).uomStdId)?.name : ''}
                                </span>
                              </div>
                            )}

                            {/* CATEGORÍAS */}
                            {activeMaster === 'masterCategorias' && (item as any).description && (
                               <span className="text-[8px] text-slate-400 font-medium italic truncate max-w-[200px]">{(item as any).description}</span>
                            )}


                            {activeMaster === 'masterNotificaciones' && (item as any).tipoNotificacionName && (
                              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded w-fit text-[8px] font-black uppercase mt-1">
                                {(item as any).tipoNotificacionName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-8 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-[9px] uppercase text-slate-700">{(item as any).createdBy || 'Sistema'}</span>
                        <span className="text-[8px] text-slate-400 font-medium whitespace-nowrap">
                          {safeFormatDate((item as any).createdAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-[9px] uppercase text-slate-700">{(item as any).updatedBy || (item as any).createdBy || 'Sistema'}</span>
                        <span className="text-[8px] text-slate-400 font-medium whitespace-nowrap">
                          {safeFormatDate((item as any).updatedAt || (item as any).createdAt)}
                        </span>
                      </div>
                    </td>

                    {activeMaster === 'masterUsuarios' && (
                      <td className="px-8 py-4 text-center">
                        <div className="flex justify-center">
                          <div className={`p-2 rounded-lg ${(item as any).twoFactorEnabled ? 'bg-emerald-500/20 text-emerald-600' : 'bg-slate-100 text-slate-300'}`} title={(item as any).twoFactorEnabled ? 'Autenticación 2FA Activa' : 'Sin 2FA'}>
                            <Icons.Shield style={{ width: '14px', height: '14px' }} />
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-8 py-4 text-center">
                      <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase border ${item.statusId === 'EST-01' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{statuses.find(s => s.id === item.statusId)?.name || 'ACTIVO'}</span>
                    </td>
                    <td className="px-8 py-4 text-right flex items-center justify-end gap-2">
                      <button onClick={() => { setEditingRecord(item); setFormData(getInitialFormData(activeMaster, item)); setIsReadOnly(true); setError(null); setIsModalOpen(true); }} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white hover:scale-110 active:scale-90 transition-all shadow-md" title="Ver Detalle"><Icons.Search /></button>
                      {canEdit && (
                        <button onClick={() => { setEditingRecord(item); setFormData(getInitialFormData(activeMaster, item)); setIsReadOnly(false); setError(null); setIsModalOpen(true); }} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white hover:scale-110 active:scale-90 transition-all shadow-md" title="Editar"><Icons.Audit /></button>
                      )}
                      {canDelete && activeMaster !== 'masterUsuarios' && (
                        <button onClick={() => { setRecordToDelete(item); setShowDeleteConfirm(true); }} className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-600 hover:text-white hover:scale-110 active:scale-90 transition-all shadow-md" title="Eliminar"><Icons.Trash /></button>
                      )}
                    </td>
                  </tr>
                ))}
                {paginatedData.length === 0 && <tr><td colSpan={activeMaster === 'masterUsuarios' ? 4 : 3} className="py-20 text-center font-black text-slate-200 uppercase text-[10px] tracking-widest">Sin registros encontrados</td></tr>}
              </tbody>
            </table>
          ) : (
            <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {paginatedData.map(item => (
                <div key={item.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl hover:border-emerald-500 transition-all group overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-slate-900 text-emerald-500 rounded-xl flex items-center justify-center shadow-lg group-hover:bg-emerald-500 group-hover:text-white transition-all overflow-hidden">
                      {item.avatar ? <img src={item.avatar} className="w-full h-full object-cover" /> :
                        (item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> :
                        (item.logoUrl ? <img src={item.logoUrl} className="w-full h-full object-contain p-1" /> : <Icons.Package />))}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[7px] font-black uppercase border ${item.statusId === 'EST-01' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{statuses.find(s => s.id === item.statusId)?.name || 'ACTIVO'}</span>
                  </div>
                  <h3 className="font-black text-slate-900 text-sm uppercase truncate mb-1 flex items-center gap-2">
                    {activeMaster === 'masterClientes' && (item as any).logoUrl && (
                      <img src={(item as any).logoUrl} alt="logo" className="w-6 h-6 object-contain rounded-md border border-slate-200" />
                    )}
                    {activeMaster === 'masterPermisosRol'
                      ? (item.roleName || roles.find(r => r.id === item.roleId)?.name || item.roleId || item.id)
                      : (activeMaster === 'masterPermisosUsuario'
                        ? ((item as any).userName || (allMasterData.masterUsuarios || []).find(u => u.id === ((item as any).userId || (item as any).user_id))?.name || (item as any).userId || (item as any).user_id || 'Usuario Desconocido')
                        : (item.name || item.id))}
                  </h3>
                  
                  {/* DETALLES ESPECÍFICOS DE ARTÍCULOS */}
                  {activeMaster === 'masterArticulo' && (
                    <div className="mb-3 space-y-1">
                       <div className="flex items-center gap-2">
                         <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">CAT:</span>
                         <span className="text-[9px] font-bold text-slate-600 truncate">
                           {categoriesArt.find(c => c.id === (item as any).categoryArticuloId)?.name || 'SIN CAT'}
                         </span>
                       </div>
                       <div className="flex items-center gap-2">
                         <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">UOM:</span>
                         <span className="text-[9px] font-bold text-slate-600 truncate">
                           {uoms.find(u => u.id === (item as any).uomStdId)?.name || 'N/A'}
                         </span>
                       </div>
                    </div>
                  )}

                  {/* DETALLES DE CATEGORÍAS */}
                  {activeMaster === 'masterCategorias' && (item as any).description && (
                     <p className="text-[9px] text-slate-500 italic mb-3 line-clamp-2">{(item as any).description}</p>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => { setEditingRecord(item); setFormData(getInitialFormData(activeMaster, item)); setIsReadOnly(true); setError(null); setIsModalOpen(true); }} className="flex-1 py-3 bg-blue-50 text-blue-600 rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:scale-105 active:scale-95 transition-all shadow-md">Detalle</button>
                    {canEdit && (
                      <button onClick={() => { setEditingRecord(item); setFormData(getInitialFormData(activeMaster, item)); setIsReadOnly(false); setError(null); setIsModalOpen(true); }} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-emerald-600 hover:scale-105 active:scale-95 transition-all shadow-md">Auditar</button>
                    )}
                    {canDelete && activeMaster !== 'masterUsuarios' && (
                      <button onClick={() => { setRecordToDelete(item); setShowDeleteConfirm(true); }} className="w-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white hover:scale-110 active:scale-90 transition-all active:scale-95"><Icons.Trash /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-50 bg-slate-50/20 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <label className="text-[8px] font-black text-slate-400 uppercase">Filas:</label>
            <select value={rowsPerPage} onChange={e => { setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1); }} className="p-1.5 bg-white border border-slate-200 rounded-lg text-[8px] font-black outline-none focus:border-emerald-500 transition-all">
              {[5, 10, 20, 50].map(v => <option key={v} value={v}>{v}</option>)}
              <option value="all">Todas</option>
            </select>
            <span className="text-[9px] text-slate-500 font-medium ml-2">
              Mostrando <span className="font-black text-slate-700">{paginatedData.length}</span> de <span className="font-black text-emerald-600">{filteredData.length}</span> registros
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              disabled={currentPage === 1} 
              onClick={() => setCurrentPage(p => p - 1)} 
              className="px-4 py-2 bg-gradient-to-r from-slate-700 to-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed hover:from-emerald-500 hover:to-emerald-600 hover:scale-105 active:scale-95 transition-all shadow-lg disabled:hover:scale-100 disabled:hover:from-slate-700 disabled:hover:to-slate-900"
            >
              ← Anterior
            </button>
            <span className="text-[10px] font-black text-slate-700 px-2">
              Pág <span className="text-emerald-600">{currentPage}</span> de <span className="text-slate-900">{totalPages}</span>
            </span>
            <button 
              disabled={currentPage >= totalPages} 
              onClick={() => setCurrentPage(p => p + 1)} 
              className="px-4 py-2 bg-gradient-to-r from-slate-700 to-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed hover:from-emerald-500 hover:to-emerald-600 hover:scale-105 active:scale-95 transition-all shadow-lg disabled:hover:scale-100 disabled:hover:from-slate-700 disabled:hover:to-slate-900"
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>

      {/* NOTIFICATION SENDER MODAL */}
      {isNotificationSenderOpen && (
        <div className="fixed inset-0 z-[500] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white w-[90vw] h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-white/10">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500 text-slate-950 rounded-xl flex items-center justify-center shadow-xl"><Icons.Chat /></div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter leading-none">Centro de Difusión M7</h3>
                  <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mt-1">Envío Masivo de WhatsApp</p>
                </div>
              </div>
              <button onClick={() => setIsNotificationSenderOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-4xl font-thin">×</button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* USER SELECTOR */}
              <div className="w-full md:w-1/3 bg-slate-50 border-r border-slate-200 flex flex-col">
                <div className="p-6 border-b border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-black text-xs uppercase text-slate-400 tracking-widest">Destinatarios</h4>
                    <span className="bg-slate-200 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold">{selectedUserIds.length} Seleccionados</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedUserIds(allMasterData.masterUsuarios?.map(u => u.id) || [])} className="flex-1 py-2 bg-slate-200 hover:bg-emerald-500 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all">Todos</button>
                    <button onClick={() => setSelectedUserIds([])} className="flex-1 py-2 bg-white border border-slate-200 hover:bg-red-100 hover:text-red-500 rounded-xl text-[10px] font-black uppercase transition-all">Ninguno</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                  {(allMasterData.masterUsuarios || []).map(u => (
                    <div key={u.id} onClick={() => {
                      if (selectedUserIds.includes(u.id)) setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                      else setSelectedUserIds([...selectedUserIds, u.id]);
                    }} className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-3 ${selectedUserIds.includes(u.id) ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-transparent hover:border-slate-200'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedUserIds.includes(u.id) ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                        {selectedUserIds.includes(u.id) && <Icons.Check className="text-white w-3 h-3" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-slate-900 truncate">{u.name}</p>
                        <p className="text-[9px] text-slate-400 truncate">{u.phone || 'Sin Teléfono'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* MESSAGE COMPOSER */}
              <div className="flex-1 flex flex-col p-8 bg-white relative">
                <div className="flex-1 flex flex-col gap-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Mensaje a difundir</label>
                  <textarea
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    placeholder="Escribe tu mensaje aquí... (Soporta formato WhatsApp: *negrita*, _cursiva_)"
                    className="flex-1 w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 resize-none outline-none focus:border-emerald-500 transition-all font-medium text-sm text-slate-700 placeholder:text-slate-300"
                  />

                  <div className="flex items-center gap-4 px-4">
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all">
                      <Icons.Paperclip className="w-4 h-4 text-slate-600" />
                      <span className="text-[10px] font-black uppercase text-slate-600">
                        {notificationMediaName ? notificationMediaName : 'Adjuntar Archivo'}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setNotificationMediaName(file.name);
                            const reader = new FileReader();
                            reader.onload = (ev) => setNotificationMedia(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    {notificationMedia && (
                      <button
                        onClick={() => { setNotificationMedia(null); setNotificationMediaName(''); }}
                        className="text-red-500 flex items-center gap-1 hover:bg-red-50 p-2 rounded-lg transition-all"
                      >
                        <Icons.X className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase">Quitar</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSendNotification}
                    disabled={isSending || selectedUserIds.length === 0 || !notificationMessage.trim()}
                    className="px-10 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl transition-all flex items-center gap-4"
                  >
                    {isSending ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <span>Enviar Difusión</span>
                        <Icons.ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[600] bg-red-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl text-center border-4 border-red-500">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full mx-auto flex items-center justify-center mb-6 animate-pulse">
              <Icons.Trash className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase mb-2">¿Eliminar Registro?</h3>
            <p className="text-slate-500 font-bold mb-8">Esta acción es irreversible. Se eliminará permanentemente de la base de datos M7.</p>
            <div className="flex gap-4">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-900 rounded-xl font-black uppercase hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black uppercase hover:bg-red-700 shadow-xl transition-all">Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[500] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white w-[90vw] h-[90vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/10">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500 text-slate-950 rounded-xl flex items-center justify-center shadow-xl"><Icons.Audit /></div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter leading-none">{editingRecord ? 'Auditoría' : 'Nuevo'} {MASTER_LABELS[activeMaster] || activeMaster.replace('master', '')}</h3>
                  <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1">Módulo: Configuración Segura M7</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-4xl font-thin">×</button>
            </div>
            <fieldset disabled={isReadOnly} className="contents">
              <form onSubmit={handleSave} className="p-10 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/20">
                {error && (
                  <div className="mb-8 p-6 bg-red-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest flex items-center gap-4 animate-in shake"><Icons.Alert /> {error}</div>
                )}
                {renderFormFields()}
                <div className="pt-10 border-t border-slate-200 flex flex-col md:flex-row gap-6 mt-10">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-12 py-5 bg-red-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-red-700 shadow-xl transition-all active:scale-95">{isReadOnly ? 'Cerrar' : 'Descartar'}</button>
                  {!isReadOnly && (
                    <button type="submit" className="flex-1 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 shadow-xl transition-all active:scale-95">Confirmar Operación M7</button>
                  )}
                </div>
              </form>
            </fieldset>
          </div>
        </div>
      )}
      {/* DATA IMPORT DIALOG */}
      <DataImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        activeMaster={activeMaster}
        existingData={allMasterData[activeMaster]}
        onImport={handleBatchImport}
      />
      {/* DELETE CONFIRMATION DIALOG */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[600] bg-red-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl text-center border-4 border-red-500">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full mx-auto flex items-center justify-center mb-6 animate-pulse">
              <Icons.Trash className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase mb-2">¿Eliminar Registro?</h3>
            <p className="text-slate-500 font-bold mb-8">
              Esta acción eliminará a <span className="text-red-600">{recordToDelete?.name || recordToDelete?.id}</span> permanentemente del sistema M7 Intelligence.
            </p>
            <div className="flex gap-4">
              <button onClick={() => { setShowDeleteConfirm(false); setRecordToDelete(null); }} className="flex-1 py-4 bg-slate-100 text-slate-900 rounded-xl font-black uppercase hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black uppercase hover:bg-red-700 shadow-xl transition-all">Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterModule;
