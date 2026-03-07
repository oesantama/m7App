
import React, { useState, useEffect } from 'react';
import { Icons, INITIAL_CLIENTS, AVATAR_GALLERY } from '../constants';
import { getMasterCategoryFromRoute } from '../constants/routes';
import { Toaster, toast } from 'sonner';
import { User, PageModule, MasterCategory, MasterRecord } from '../types';
import { api } from '../services/api';
import { hasPermission } from '../utils/permissions';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeMasterCategory?: MasterCategory;
  setActiveMasterCategory?: (cat: MasterCategory) => void;
  activePageId?: string;
  setActivePageId?: (id: string) => void;
  onBack?: () => void;
  showBack?: boolean;
  user: User;
  onUpdateUser: (data: Partial<User>) => void;
  onLogout: () => void;
  modulesData?: MasterRecord[];
  pagesData?: MasterRecord[];
}

const Layout: React.FC<LayoutProps> = ({
  children, activeTab, setActiveTab, activeMasterCategory, setActiveMasterCategory,
  activePageId, setActivePageId,
  onBack, showBack, user, onUpdateUser, onLogout, modulesData = [], pagesData = []
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isHelpMode, setIsHelpMode] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [profileData, setProfileData] = useState({ name: user.name, email: user.email, phone: user.phone || '', avatar: user.avatar || AVATAR_GALLERY[0] });

  // Estados para 2FA Flow
  const [twoFactorStep, setTwoFactorStep] = useState<'none' | 'qr'>('none');
  const [twoFactorQR, setTwoFactorQR] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [twoFactorVerifyCode, setTwoFactorVerifyCode] = useState('');

  const client = INITIAL_CLIENTS.find(c => c.id === user.clientId);

  useEffect(() => {
    setProfileData({ name: user.name, email: user.email, phone: user.phone || '', avatar: user.avatar || AVATAR_GALLERY[0] });
  }, [user]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && window.innerWidth < 1024) {
        setIsCollapsed(true);
      } else if (window.innerWidth >= 1024) {
        // Optional: Auto expand on large screens if desired, or keep user preference
      }
      if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    if (window.innerWidth < 768) {
      setIsMobileMenuOpen(!isMobileMenuOpen);
    } else {
      setIsCollapsed(!isCollapsed);
    }
  };
  const toggleGroup = (groupId: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setExpandedGroup(groupId);
    } else {
      setExpandedGroup(expandedGroup === groupId ? null : groupId);
    }
  };

  const getIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName];
    return IconComponent ? <IconComponent /> : <Icons.Alert />;
  };


  const isSuperUser = hasPermission(user, 'USUARIOS', 'super'); // O simplemente usar hasPermission donde sea necesario




  // ORDENAMIENTO ASCENDENTE DE GRUPOS Y PÁGINAS - ROBUSTECIMIENTO DE PROPIEDADES

  const menuGroups = [...modulesData]
    .filter(m => (m.statusId || m.status_id) === 'EST-01')
    .sort((a, b) => {
        const nameA = a.name.toUpperCase();
        const nameB = b.name.toUpperCase();
        if (nameA.includes('ADMINISTRACIÓN')) return 1;
        if (nameB.includes('ADMINISTRACIÓN')) return -1;
        return nameA.localeCompare(nameB);
    })
    .map(mod => {
      const modId = String(mod.id).trim().toUpperCase();
      
      const allowedPages = [...pagesData]
        .filter(p => {
          const pParentId = String(p.parentId || p.parent_id || '').trim().toUpperCase();
          const isMatch = pParentId === modId;
          const isActive = (p.statusId || p.status_id) === 'EST-01';
          return isMatch && isActive;
        })
        .filter(p => hasPermission(user, p.id, 'view'))

        .sort((a, b) => a.name.localeCompare(b.name))
        .map(page => {
          const masterCat = getMasterCategoryFromRoute(page.route, page.id);
          const isMasterPage = !!masterCat;
          
          // Sanitizar la ruta: si tiene '/' (ej: 'inventory/items'), usar solo la parte
          // que corresponde al case en App.tsx. Nunca dejar que el browser lo interprete como URL.
          const sanitizeRoute = (route: string): string => {
            if (!route) return '';
            // Si es ruta de maestro, no interesa (se usa 'master' como tab)
            if (isMasterPage) return 'master';
            // Si contiene '/', tomar la primera parte significativa
            // Ejemplo: 'inventory/items' → 'inventory'
            const clean = route.replace(/^\/+/, '').split('/')[0];
            return clean;
          };

          return {
            id: page.id,
            label: page.name,
            module: sanitizeRoute(page.route) as PageModule,
            masterCat: masterCat as MasterCategory
          };
        });

      return {
        id: mod.id,
        label: mod.name,
        icon: getIcon((mod.iconClass || mod.icon_class || 'Settings')),
        items: allowedPages
      };
    })
    .filter(group => group.items.length > 0);

  /* Módulo de Administración ahora manejado dinámicamente vía DB */



  const selectItem = (item: any) => {
    if (isHelpMode) {
      toast.info(`Módulo: ${item.label}`, {
        description: `Este módulo permite gestionar ${item.label.toLowerCase()} y sus operaciones relacionadas.`,
        duration: 4000
      });
      return;
    }
    if (item.module) setActiveTab(item.module);
    if (item.masterCat && setActiveMasterCategory) setActiveMasterCategory(item.masterCat);
    if (item.id && setActivePageId) setActivePageId(item.id);
    if (window.innerWidth < 768) setIsMobileMenuOpen(false);
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();

    onUpdateUser(profileData);
    toast.success("Perfil Actualizado Correctamente", {
      description: "Los cambios se han guardado con éxito.",
      duration: 3000
    });
    setIsProfileModalOpen(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileData({ ...profileData, avatar: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-inter">
      {/* MOBILE BACKDROP */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/50 z-20 md:hidden backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-30 bg-slate-900 text-white flex flex-col transition-all duration-300 shadow-2xl md:static md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${isCollapsed ? 'md:w-20' : 'md:w-64'} w-64`}>
        <div className="p-4 flex items-center gap-3 border-b border-white/5 shrink-0">
          <div className="w-10 h-10 relative group cursor-pointer shrink-0">
            <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-lg group-hover:bg-emerald-500/20 transition-all"></div>
            <img 
              src="/assets/brand/orbitm7_logo.png" 
              alt="OrbitM7" 
              className="w-full h-full object-contain relative z-10"
            />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <h1 className="font-black text-lg tracking-tighter text-white">ORBITM7</h1>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">GLOBAL v1.9.54-ULTRA-SLIM</span>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar px-2 mt-4">
          {hasPermission(user, 'CAPACITACIONES', 'view') && (
            <button 
              onClick={() => setActiveTab('capacitaciones')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all font-bold text-[11px] rounded-xl mb-4 ${activeTab === 'capacitaciones' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <span className={activeTab === 'capacitaciones' ? 'text-slate-950' : 'text-emerald-500'}><Icons.Award className="w-5 h-5" /></span>
              {!isCollapsed && <span className="truncate uppercase tracking-wide">Centro de Formación</span>}
            </button>
          )}


          {menuGroups.map((group) => (
            <div key={group.id} className="space-y-0.5">
              <button 
                onClick={() => toggleGroup(group.id)} 
                className={`w-full flex items-center transition-all font-bold text-[11px] rounded-xl ${isCollapsed ? 'justify-center p-3' : 'justify-between px-3 py-2.5'} ${expandedGroup === group.id ? 'bg-white/5 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`${expandedGroup === group.id ? 'text-emerald-400' : 'text-slate-500'} ${isCollapsed ? 'scale-110' : ''}`}>{group.icon}</span>
                  {!isCollapsed && <span className="truncate uppercase tracking-wide">{group.label}</span>}
                </div>
                {!isCollapsed && <div className={`transition-transform duration-300 ${expandedGroup === group.id ? 'rotate-90' : ''}`}><Icons.ChevronRight className="w-3 h-3" /></div>}
              </button>
              {expandedGroup === group.id && !isCollapsed && (
                <div className="ml-5 pl-4 border-l border-white/5 space-y-0.5 py-1">
                  {group.items.map((item) => (
                    <button 
                      key={item.id} 
                      onClick={() => selectItem(item)} 
                      className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${(activePageId === item.id) ? 'text-emerald-400 bg-emerald-400/5' : 'text-slate-500 hover:text-slate-200'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="mt-auto p-3 border-t border-white/5 space-y-2">
          <div className={`bg-white/5 rounded-2xl flex items-center p-3 gap-3 relative transition-all hover:bg-white/10`}>
            <button onClick={() => setIsProfileModalOpen(true)} className="absolute inset-0 z-10 opacity-0 cursor-pointer"></button>
            <div className="w-8 h-8 rounded-lg bg-slate-800 overflow-hidden border border-emerald-500/50 shrink-0">
              <img src={user.avatar || AVATAR_GALLERY[0]} alt="User" className="w-full h-full object-cover" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black truncate uppercase tracking-tight text-white">{user.name}</p>
                <p className="text-[8px] text-emerald-500 font-bold uppercase tracking-widest">{user.role}</p>
              </div>
            )}
            <button onClick={onLogout} title="Cerrar Sesión" className="p-1.5 text-slate-500 hover:text-rose-500 z-20 relative transition-colors"><Icons.LogOut className="w-4 h-4" /></button>
          </div>
          {!isCollapsed && (
             <p className="text-[7px] text-slate-600 font-bold uppercase text-center opacity-40">Milla 7 • Orbit v1.9.54-ULTRA-SLIM</p>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={toggleSidebar} className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-slate-400 hover:text-emerald-500 transition-all"><Icons.Menu className="w-5 h-5" /></button>
            {showBack && (
              <button onClick={onBack} className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg font-bold text-[11px] shadow-sm hover:bg-rose-700 uppercase tracking-widest transition-all">
                Regresar
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="h-4 w-1 bg-emerald-500 rounded-full"></div>
              <h2 className="text-sm font-black text-slate-800 tracking-wider uppercase">{activeTab.replace('-', ' ')}</h2>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Espacio para estatus de conexión o avisos rápidos */}
          </div>
        </header>
        <section className="flex-1 overflow-y-auto p-0 bg-slate-50/30 custom-scrollbar">{children}</section>
      </main>

      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-[90vw] h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black uppercase tracking-tight">Mi Identidad Orbit</h3>
              <button onClick={() => setIsProfileModalOpen(false)} className="text-2xl font-thin hover:text-red-500 transition-colors">&times;</button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col items-center gap-6">
                <div className="relative group">
                  <div className="w-28 h-28 rounded-[2rem] bg-slate-100 overflow-hidden border-4 border-emerald-500 shadow-xl">
                    <img src={profileData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <label className="absolute -bottom-2 -right-2 bg-slate-900 text-white p-2.5 rounded-xl cursor-pointer hover:bg-emerald-500 hover:text-slate-900 transition-all shadow-lg border border-white/10">
                    <Icons.Camera />
                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                  </label>
                </div>

                <div className="w-full">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 text-center">Seleccionar Avatar Predefinido</label>
                  <div className="flex justify-center gap-3">
                    {AVATAR_GALLERY.map((av, i) => (
                      <button key={i} type="button" onClick={() => setProfileData({ ...profileData, avatar: av })} className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${profileData.avatar === av ? 'border-emerald-500 scale-110 shadow-lg' : 'border-transparent hover:border-slate-300'}`}>
                        <img src={av} alt={`AV-${i}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Completo</label>
                  <input type="text" value={profileData.name} onChange={e => setProfileData({ ...profileData, name: e.target.value.toUpperCase() })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teléfono / Celular</label>
                  <input type="text" value={profileData.phone} onChange={e => setProfileData({ ...profileData, phone: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" placeholder="+57 ..." />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Corporativo</label>
                  <input type="email" value={profileData.email} disabled className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-sm text-slate-500" />
                </div>

                {/* SECCIÓN 2FA (Hallazgo QA: Seguridad 10/10) */}
                <div className="pt-4 border-t border-slate-100 mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${(user as any).twoFactorEnabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Icons.Shield style={{ width: '18px', height: '18px' }} />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-tight">Doble Factor (2FA)</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Seguridad TOTP Estándar</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full ${(user as any).twoFactorEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {(user as any).twoFactorEnabled ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </div>
                  </div>

                  {!(user as any).twoFactorEnabled ? (
                    <div className="space-y-4">
                      {twoFactorStep === 'none' && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await api.setup2FA(user.id);
                              if (res.success) {
                                setTwoFactorQR(res.qrCode);
                                setTwoFactorSecret(res.secret);
                                setTwoFactorStep('qr');
                                toast.info("Configuración de 2FA Iniciada");
                              }
                            } catch (e) {
                              toast.error("Error al iniciar 2FA");
                            }
                          }}
                          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 hover:border-emerald-500 hover:text-emerald-500 transition-all uppercase tracking-widest"
                        >
                          Configurar Segundo Factor
                        </button>
                      )}

                      {twoFactorStep === 'qr' && (
                        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 animate-in zoom-in-95">
                          <p className="text-[9px] font-black text-slate-500 uppercase text-center mb-4">1. Escanea este código con Google Authenticator o Authy</p>
                          <div className="w-40 h-40 bg-white mx-auto p-2 rounded-2xl border border-slate-200 mb-4">
                            <img src={twoFactorQR} alt="QR 2FA" className="w-full h-full" />
                          </div>
                          <p className="text-[9px] font-black text-slate-500 uppercase text-center mb-2">2. Ingrese el código de 6 dígitos</p>
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="000000"
                            value={twoFactorVerifyCode}
                            onChange={e => setTwoFactorVerifyCode(e.target.value)}
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-center font-black text-lg tracking-[0.5em] focus:border-emerald-500 outline-none"
                          />
                          <div className="flex gap-2 mt-4">
                            <button
                              type="button"
                              onClick={() => setTwoFactorStep('none')}
                              className="flex-1 py-3 bg-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (twoFactorVerifyCode.length !== 6) return toast.error("Código incompleto");
                                try {
                                  const res = await api.activate2FA({
                                    userId: user.id,
                                    secret: twoFactorSecret,
                                    token: twoFactorVerifyCode
                                  });
                                  if (res.success) {
                                    toast.success("2FA Activado con éxito");
                                    // Actualizar estado local y forzar refresco si es necesario
                                    onUpdateUser({ ...user, twoFactorEnabled: true } as any);
                                    setTwoFactorStep('none');
                                    setIsProfileModalOpen(false);
                                  } else {
                                    toast.error(res.error || "Código inválido");
                                  }
                                } catch (e) {
                                  toast.error("Error de verificación");
                                }
                              }}
                              className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase shadow-lg shadow-emerald-500/20"
                            >
                              Activar Ahora
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("¿Estás seguro de desactivar el 2FA? Esto reducirá la seguridad de tu cuenta.")) {
                          api.deactivate2FA(user.id).then(() => window.location.reload());
                        }
                      }}
                      className="w-full py-3 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black hover:bg-red-600 hover:text-white transition-all uppercase tracking-widest"
                    >
                      Desactivar 2FA
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setIsProfileModalOpen(false)} className="flex-1 py-4 bg-red-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg">Descartar</button>
                <button type="submit" className="flex-1 bg-slate-900 text-white py-4 rounded-[2rem] font-black text-xs uppercase hover:bg-emerald-600 transition-all shadow-lg">Actualizar Perfil</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
