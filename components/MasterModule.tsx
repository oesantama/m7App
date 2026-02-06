
import React, { useState, useMemo } from 'react';
import { Icons, AVATAR_GALLERY } from '../constants';
import { MasterRecord, MasterCategory, User, Article } from '../types';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { DataImportDialog } from './DataImportDialog';

interface MasterModuleProps {
  onAudit: (entity: string, action: string) => void;
  activeMaster: MasterCategory;
  allMasterData: { [key in MasterCategory]?: MasterRecord[] };
  setAllMasterData: React.Dispatch<React.SetStateAction<{ [key in MasterCategory]?: MasterRecord[] }>>;
  user: User;
}

const MasterModule: React.FC<MasterModuleProps> = ({ activeMaster, allMasterData, setAllMasterData, user, onAudit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MasterRecord | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  
  const [displayMode, setDisplayMode] = useState<'table' | 'grid'>('table');
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Estados para el diálogo de cambio de rol
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [pendingRoleId, setPendingRoleId] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<any>(null);

  // Extracción de Maestros para Selectores
  const roles = allMasterData['masterRol'] || [];
  const modules = allMasterData['masterModulos'] || [];
  const pages = allMasterData['masterPaginas'] || [];
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
    const pageInfo = pages.find(p => (p.moduleId || p.module_id) === activeMaster);
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
    masterModulos: 'MOD',
    masterPaginas: 'PAG',
    masterCategorias: 'CAT'
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
    masterModulos: 'MÓDULOS DE SISTEMA',
    masterPaginas: 'PÀGINAS DE REDIRECCIÓN',
    masterCategorias: 'CATEGORÍAS DE ARTÍCULO'
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
    } else if (category === 'masterModulos') {
      Object.assign(defaults, {
        iconClass: '',
      });
    } else if (category === 'masterPaginas') {
      Object.assign(defaults, {
        route: '',
        parentId: '',
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
    const list = allMasterData[activeMaster] || [];
    return list.filter(d => (d.name || d.email || d.id || '').toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allMasterData, activeMaster, searchTerm]);

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
    const finalId = editingRecord?.id || generateNextId(activeMaster, allMasterData[activeMaster] || []);
    const newRecord = { ...formData, id: finalId, updatedAt: now, updatedBy: user.name };

    try {
        // --- PERSISTENCIA BACKEND ---
        const { api } = await import('../services/api');
        
        // Determinar qué endpoint usar
        if (activeMaster === 'masterUsuarios') {
            await api.saveUser(newRecord);
        } else if (activeMaster === 'masterArticulo') {
            await api.saveArticle(newRecord);
        } else if (activeMaster === 'masterRol') {
            await api.saveRole(newRecord);
        } else if (activeMaster === 'masterPermisosRol') {
            await api.savePermission(newRecord);
        } else if (activeMaster === 'masterPermisosUsuario') {
            await api.saveUserPermission(newRecord);
        } else if (activeMaster === 'masterPaginas') {
            await api.savePage(newRecord);
            await api.saveMaster(activeMaster, newRecord);
        } else {
            // Guardado Genérico para el resto de tablas maestras (masterTipoDocumento, etc.)
            await api.saveMaster(activeMaster, newRecord);
        }
        
        toast.success("Registro Guardado", { description: "Datos sincronizados con el núcleo M7." });
        if (onAudit) onAudit(activeMaster, editingRecord ? 'UPDATE' : 'CREATE');
        setIsModalOpen(false);
    } catch (err: any) {
        console.error('[M7-MASTER] Save error:', err);
        setError("Error de Sincronización: " + (err.message || 'Fallo desconocido'));
        toast.error("Error al guardar", { description: "Verifique su conexión con el servidor." });
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
        } else if (activeMaster === 'masterModulos') {
            await api.deleteModule(recordToDelete.id, user.name);
        } else if (activeMaster === 'masterPaginas') {
            await api.deletePage(recordToDelete.id, user.name);
        } else {
            await api.deleteMaster(activeMaster, recordToDelete.id, user.name);
        }

        toast.success("Registro Eliminado", { description: "La base de datos se ha actualizado." });
        if (onAudit) onAudit(activeMaster, 'DELETE');
        setIsModalOpen(false);
        setShowDeleteConfirm(false);
        setRecordToDelete(null);

    } catch (err: any) {
        console.error('[M7-MASTER] Delete error:', err);
        setError("Error de Eliminación: " + (err.message || 'Fallo desconocido'));
        toast.error("Error al eliminar", { description: err.message });
        setShowDeleteConfirm(false);
        setRecordToDelete(null);
    }
  };

  const handleExportExcel = () => {
    const dataToExport = filteredData.map(item => {
      const flat: any = { ...item };
      delete flat.avatar; delete flat.logoUrl; delete flat.photoUrl;
      
      // Asegurar formato Colombia para el reporte Excel (incluso para registros viejos)
      if (flat.createdAt && flat.createdAt.includes('T')) {
        flat.createdAt = new Date(flat.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
      }
      if (flat.updatedAt && flat.updatedAt.includes('T')) {
        flat.updatedAt = new Date(flat.updatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
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

      setAllMasterData(prev => ({
        ...prev,
        [activeMaster]: [...(prev[activeMaster] || []), ...newRecords]
      }));
      
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
      reader.onloadend = () => setFormData({ ...formData, [field]: reader.result });
      reader.readAsDataURL(file);
    }
  };

  const commonInputStyle = "w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-emerald-500 transition-all shadow-sm appearance-none cursor-pointer";

  const renderStatusField = () => (
    <div className="md:col-span-2 space-y-1 mt-4">
      <label className="text-[10px] font-black text-emerald-500 uppercase ml-2 tracking-widest">Estado Operativo M7</label>
      <div className="relative">
        <select required value={formData.statusId || ''} onChange={e => setFormData({...formData, statusId: e.target.value})} className={commonInputStyle}>
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
                      <button key={i} type="button" onClick={() => setFormData({...formData, avatar: av})} className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${formData.avatar === av ? 'border-emerald-500 scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'}`}>
                        <img src={av} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre Completo</label>
                <input type="text" value={formData.name || ''} onChange={e=>setFormData({...formData, name: e.target.value.toUpperCase()})} className={commonInputStyle} required />
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Email Corporativo</label>
                <input type="email" value={formData.email || ''} onChange={e=>setFormData({...formData, email: e.target.value.toLowerCase()})} className={commonInputStyle} required />
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Teléfono de Contacto</label>
                <input type="text" value={formData.phone || ''} onChange={e=>setFormData({...formData, phone: e.target.value})} className={commonInputStyle} />
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Tipo Documento</label>
                <select value={formData.documentType || ''} onChange={e=>setFormData({...formData, documentType: e.target.value})} className={commonInputStyle}>
                  <option value="">Seleccione...</option>{docTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nro Documento</label>
                <input type="text" value={formData.documentNumber || ''} onChange={e=>setFormData({...formData, documentNumber: e.target.value})} className={commonInputStyle} />
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 ml-2">Multicliente M7 (Seleccione Clientes Permitidos)</h4>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clients.map(c => (
                    <label key={c.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${formData.clientIds?.includes(c.id) ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
                       <input type="checkbox" checked={formData.clientIds?.includes(c.id)} onChange={e => {
                          const ids = formData.clientIds || [];
                          setFormData({...formData, clientIds: e.target.checked ? [...ids, c.id] : ids.filter((id: string) => id !== c.id)});
                        }} className="w-5 h-5 accent-emerald-500 rounded-lg" />
                       <span className="text-[10px] font-black uppercase text-slate-900">{c.name}</span>
                    </label>
                  ))}
               </div>
            </div>

            <div className="space-y-8">
               <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Rol Operativo</label>
                  <select value={formData.roleId || ''} onChange={e=>handleRoleChangeIntent(e.target.value)} className={commonInputStyle} required>
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
                                 setFormData({...formData as any, twoFactorEnabled: false});
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
        return (
          <div className="space-y-10 animate-in fade-in">
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
                                  <input type="checkbox" checked={!!formData[`page_${p.id}_${a}`]} onChange={e => setFormData({...formData, [`page_${p.id}_${a}`]: e.target.checked})} className="w-5 h-5 rounded-lg border-2 border-white/10 bg-transparent checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer appearance-none flex items-center justify-center after:content-['✓'] after:text-white after:font-black after:hidden checked:after:block" />
                               </td>
                             ))}
                             <td className="p-4 text-center">
                                <button type="button" onClick={()=>togglePageRow(p.id)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-emerald-500 transition-all">
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
              <select required disabled={!!editingRecord} value={formData.roleId || ''} onChange={e=>setFormData({...formData, roleId: e.target.value})} className={commonInputStyle}>
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
                                  <input type="checkbox" checked={!!formData[`page_${p.id}_${a}`]} onChange={e => setFormData({...formData, [`page_${p.id}_${a}`]: e.target.checked})} className="w-5 h-5 rounded-lg border-2 border-white/10 bg-transparent checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer appearance-none flex items-center justify-center after:content-['✓'] after:text-white after:font-black after:hidden checked:after:block" />
                               </td>
                             ))}
                             <td className="p-4 text-center">
                                <button type="button" onClick={()=>togglePageRow(p.id)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-emerald-500 transition-all">
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
                  {formData.photoUrl ? <img src={formData.photoUrl} className="w-full h-full object-cover" /> : <Icons.Package className="text-slate-300 w-10 h-10" />}
               </div>
               <label className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-[9px] uppercase cursor-pointer hover:bg-emerald-600 transition-all">
                  Subir Foto Art.
                  <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e, 'photoUrl')} />
               </label>
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">SKU / Identificador</label>
              <input type="text" value={formData.sku || ''} onChange={e=>setFormData({...formData, sku: e.target.value.toUpperCase()})} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre Comercial</label>
              <input type="text" value={formData.name || ''} onChange={e=>setFormData({...formData, name: e.target.value.toUpperCase()})} className={commonInputStyle} required />
            </div>

            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Código de Barras</label>
              <input type="text" value={formData.barcode || ''} onChange={e=>setFormData({...formData, barcode: e.target.value})} className={commonInputStyle} placeholder="Opcional..." />
            </div>

            {/* Selectores de Unidades (Triple UOM) */}
            <div className="md:col-span-2 bg-slate-100 p-8 rounded-[3rem] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 border border-slate-200">
               <div className="space-y-1"><label className="text-[9px] font-black text-emerald-600 uppercase ml-2 tracking-widest">Unidad General</label>
                 <select value={formData.uomGeneralId || ''} onChange={e=>setFormData({...formData, uomGeneralId: e.target.value})} className={commonInputStyle}>
                   <option value="">Seleccione...</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                 </select>
               </div>
               <div className="space-y-1"><label className="text-[9px] font-black text-blue-600 uppercase ml-2 tracking-widest">Unidad Intermedia</label>
                 <div className="flex gap-2">
                    <select value={formData.uomInterId || ''} onChange={e=>setFormData({...formData, uomInterId: e.target.value})} className={commonInputStyle}>
                      <option value="">Seleccione...</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <input type="number" placeholder="Factor" value={formData.factorInter || ''} onChange={e=>setFormData({...formData, factorInter: Number(e.target.value)})} className="w-20 p-4 rounded-2xl bg-white border-2 border-slate-200 font-black text-[10px] text-center" />
                 </div>
               </div>
               <div className="space-y-1"><label className="text-[9px] font-black text-slate-900 uppercase ml-2 tracking-widest">Unidad Estándar</label>
                 <div className="flex gap-2">
                    <select value={formData.uomStdId || ''} onChange={e=>setFormData({...formData, uomStdId: e.target.value})} className={commonInputStyle}>
                      <option value="">Seleccione...</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <input type="number" placeholder="Factor" value={formData.factorStd || ''} onChange={e=>setFormData({...formData, factorStd: Number(e.target.value)})} className="w-20 p-4 rounded-2xl bg-white border-2 border-slate-200 font-black text-[10px] text-center" />
                 </div>
               </div>
            </div>

            {/* Selectores Restaurados: Cliente y Categoría */}
            <div className="md:col-span-2 space-y-4">
               <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Clientes Propietarios (Multiselección)</label>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clients.map(c => (
                    <label key={c.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${formData.clientIds?.includes(c.id) ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
                       <input type="checkbox" checked={formData.clientIds?.includes(c.id)} onChange={e => {
                          const ids = formData.clientIds || [];
                          setFormData({...formData, clientIds: e.target.checked ? [...ids, c.id] : ids.filter((id: string) => id !== c.id)});
                        }} className="w-5 h-5 accent-emerald-500 rounded-lg" />
                       <span className="text-[10px] font-black uppercase text-slate-900">{c.name}</span>
                    </label>
                  ))}
               </div>
            </div>

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
                  onChange={e=>setFormData({...formData, categoryArticuloId: e.target.value})} 
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
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Cliente</label>
              <input type="text" value={formData.name || ''} onChange={e=>setFormData({...formData, name: e.target.value.toUpperCase()})} className={commonInputStyle} required />
            </div>
            {renderStatusField()}
          </div>
        );

      case 'masterModulos':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Módulo</label>
              <input type="text" value={formData.name || ''} onChange={e=>setFormData({...formData, name: e.target.value.toUpperCase()})} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Icono Visual M7</label>
              <select value={formData.iconClass || ''} onChange={e=>setFormData({...formData, iconClass: e.target.value})} className={commonInputStyle}>
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

      case 'masterPaginas':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre de la Página Web</label>
              <input type="text" value={formData.name || ''} onChange={e=>setFormData({...formData, name: e.target.value.toUpperCase()})} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Ruta de Sistema (Route)</label>
              <input type="text" value={formData.route || ''} onChange={e=>setFormData({...formData, route: e.target.value})} className={commonInputStyle} />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Módulo Padre</label>
              <select value={formData.parentId || ''} onChange={e=>setFormData({...formData, parentId: e.target.value})} className={commonInputStyle}>
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
              <input type="text" value={formData.name || ''} onChange={e=>setFormData({...formData, name: e.target.value.toUpperCase()})} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Email de Notificación</label>
              <input type="email" placeholder="ejemplo@correo.com" value={formData.notificationEmail || ''} onChange={e=>setFormData({...formData, notificationEmail: e.target.value.toLowerCase()})} className={commonInputStyle} required />
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Tipo de Notificación</label>
              <select value={formData.tipoNotificacionId || ''} onChange={e=>setFormData({...formData, tipoNotificacionId: e.target.value})} className={commonInputStyle} required>
                <option value="">Seleccione Tipo...</option>
                {notificationTypes.map(nt => <option key={nt.id} value={nt.id}>{nt.name}</option>)}
              </select>
            </div>
            {renderStatusField()}
          </div>
        );

      default:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre del Registro</label>
              <input type="text" value={formData.name || ''} onChange={e=>setFormData({...formData, name: e.target.value.toUpperCase()})} className={commonInputStyle} required />
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
          <input type="text" placeholder="Filtrar..." value={searchTerm} onChange={e=>{setSearchTerm(e.target.value); setCurrentPage(1);}} className="bg-transparent outline-none font-black text-[10px] uppercase w-full" />
        </div>
        <div className="flex items-center gap-3">
           <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner h-11 relative">
             <button onClick={()=>setDisplayMode('table')} className={`p-2.5 rounded-xl transition-all relative z-10 ${displayMode === 'table' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.List /></button>
             <button onClick={()=>setDisplayMode('grid')} className={`p-2.5 rounded-xl transition-all relative z-10 ${displayMode === 'grid' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.Grid /></button>
             <div className={`absolute top-1 bottom-1 w-[40px] bg-white rounded-xl shadow-md transition-all duration-300 ${displayMode === 'table' ? 'left-1' : 'left-[44px]'}`}></div>
           </div>
           
           <button onClick={() => setIsImportDialogOpen(true)} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-2 font-black text-[9px] uppercase cursor-pointer">
              <Icons.Excel />
              <span className="hidden xl:inline">Importar</span>
           </button>

           <button onClick={handleExportExcel} className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center gap-2 font-black text-[9px] uppercase"><Icons.Excel /><span className="hidden xl:inline">Excel</span></button>
           
           {activeMaster === 'masterNotificaciones' && (
               <button onClick={()=>setIsNotificationSenderOpen(true)} className="bg-emerald-500 text-slate-900 px-8 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-400 transition-all flex items-center gap-2">
                   <Icons.Chat className="w-4 h-4" />
                   <span className="hidden md:inline">Difusión</span>
               </button>
           )}

            {canCreate && (
              <button onClick={()=>{setEditingRecord(null); setFormData(getInitialFormData(activeMaster)); setIsReadOnly(false); setError(null); setIsModalOpen(true);}} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all active:scale-95">Nuevo</button>
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
                           <div className="w-10 h-10 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center border border-slate-100 shrink-0 shadow-sm">
                              {item.avatar ? <img src={item.avatar} className="w-full h-full object-cover" /> : (item.logoUrl ? <img src={item.logoUrl} className="w-full h-full object-contain p-1" /> : (item.photoUrl ? <img src={item.photoUrl} className="w-full h-full object-cover" /> : <Icons.Package className="text-slate-300 w-5 h-5" />))}
                           </div>
                           <div>
                             <p className="font-black text-slate-900 text-[12px] uppercase">
                               {activeMaster === 'masterPermisosRol' 
                                 ? (item.roleName || roles.find(r => r.id === item.roleId)?.name || item.roleId || item.id)
                                 : (activeMaster === 'masterPermisosUsuario'
                                   ? (item.userName || (allMasterData.masterUsuarios || []).find(u => u.id === item.userId)?.name || item.userId || item.id)
                                   : (item.name || item.id))}
                             </p>
                             <p className="text-[8px] text-slate-400 font-bold uppercase flex flex-col gap-1">
                               <span>{ (activeMaster === 'masterPermisosRol' || activeMaster === 'masterPermisosUsuario') ? `ID: ${item.id}` : (item.email || (item as any).notificationEmail || item.id)}</span>
                               {activeMaster === 'masterNotificaciones' && (
                                 <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded w-fit">
                                   {notificationTypes.find(nt => nt.id === (item as any).tipoNotificacionId)?.name || 'TIPO DESCONOCIDO'}
                                 </span>
                               )}
                             </p>
                           </div>
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
                          <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase border ${item.statusId === 'EST-01' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{statuses.find(s=>s.id===item.statusId)?.name || 'ACTIVO'}</span>
                       </td>
                       <td className="px-8 py-4 text-right flex items-center justify-end gap-2">
                          <button onClick={()=>{setEditingRecord(item); setFormData(getInitialFormData(activeMaster, item)); setIsReadOnly(true); setError(null); setIsModalOpen(true);}} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-md active:scale-90" title="Ver Detalle"><Icons.Search /></button>
                          {canEdit && (
                            <button onClick={()=>{setEditingRecord(item); setFormData(getInitialFormData(activeMaster, item)); setIsReadOnly(false); setError(null); setIsModalOpen(true);}} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-md active:scale-90" title="Editar"><Icons.Audit /></button>
                          )}
                          {canDelete && (
                            <button onClick={()=>{setRecordToDelete(item); setShowDeleteConfirm(true);}} className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-md active:scale-90" title="Eliminar"><Icons.Trash /></button>
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
                         {item.avatar ? <img src={item.avatar} className="w-full h-full object-cover" /> : (item.logoUrl ? <img src={item.logoUrl} className="w-full h-full object-contain p-1" /> : <Icons.Package />)}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[7px] font-black uppercase border ${item.statusId === 'EST-01' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{statuses.find(s=>s.id===item.statusId)?.name || 'ACTIVO'}</span>
                   </div>
                   <h3 className="font-black text-slate-900 text-sm uppercase truncate mb-1">
                     {activeMaster === 'masterPermisosRol'
                       ? (item.roleName || roles.find(r => r.id === item.roleId)?.name || item.roleId || item.id)
                       : (item.name || item.id)}
                   </h3>
                    <div className="flex gap-2">
                      <button onClick={()=>{setEditingRecord(item); setFormData(getInitialFormData(activeMaster, item)); setIsReadOnly(true); setError(null); setIsModalOpen(true);}} className="flex-1 py-3 bg-blue-50 text-blue-600 rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-md">Detalle</button>
                      {canEdit && (
                        <button onClick={()=>{setEditingRecord(item); setFormData(getInitialFormData(activeMaster, item)); setIsReadOnly(false); setError(null); setIsModalOpen(true);}} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md">Auditar</button>
                      )}
                      {canDelete && (
                        <button onClick={()=>{setRecordToDelete(item); setShowDeleteConfirm(true);}} className="w-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all active:scale-95"><Icons.Trash /></button>
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
              <select value={rowsPerPage} onChange={e => {setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1);}} className="p-1.5 bg-white border border-slate-200 rounded-lg text-[8px] font-black outline-none focus:border-emerald-500 transition-all">
                 {[5, 10, 20, 50].map(v => <option key={v} value={v}>{v}</option>)}
                 <option value="all">Todas</option>
              </select>
           </div>
           <div className="flex items-center gap-4">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-300 disabled:opacity-20 hover:text-emerald-500 transition-all"><Icons.ChevronRight className="rotate-180 w-3 h-3" /></button>
              <span className="text-[8px] font-black text-slate-900 uppercase">Pág {currentPage} de {totalPages}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-300 disabled:opacity-20 hover:text-emerald-500 transition-all"><Icons.ChevronRight className="w-3 h-3" /></button>
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
                 <button onClick={()=>setIsModalOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-4xl font-thin">×</button>
              </div>
               <fieldset disabled={isReadOnly} className="contents">
                 <form onSubmit={handleSave} className="p-10 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/20">
                    {error && (
                      <div className="mb-8 p-6 bg-red-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest flex items-center gap-4 animate-in shake"><Icons.Alert /> {error}</div>
                    )}
                    {renderFormFields()}
                    <div className="pt-10 border-t border-slate-200 flex flex-col md:flex-row gap-6 mt-10">
                       <button type="button" onClick={()=>setIsModalOpen(false)} className="px-12 py-5 bg-red-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-red-700 shadow-xl transition-all active:scale-95">{isReadOnly ? 'Cerrar' : 'Descartar'}</button>
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
              <button onClick={() => {setShowDeleteConfirm(false); setRecordToDelete(null);}} className="flex-1 py-4 bg-slate-100 text-slate-900 rounded-xl font-black uppercase hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black uppercase hover:bg-red-700 shadow-xl transition-all">Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterModule;
