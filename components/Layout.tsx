import React, { useState, useEffect, useRef } from 'react';
import { Icons, INITIAL_CLIENTS, AVATAR_GALLERY } from '../constants';
import { getMasterCategoryFromRoute } from '../constants/routes';
import { toast } from 'sonner';
import { User, PageModule, MasterCategory, MasterRecord } from '../types';
import { api } from '../services/api';
import { hasPermission } from '../utils/permissions';
import { getVersionInfo } from '../utils/env';

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

const SECTION_ORDER = ['Operación', 'Clientes & Aliados', 'Cumplimiento & Talento', 'Administración & Estrategia'];

const getModuleSection = (moduleName: string): string => {
  const n = moduleName.toUpperCase();
  if (n.includes('TRANSPORTE') || n.includes('ÉXITO') || n.includes('EXITO') || n.includes('FULFILLMENT')) {
    return 'Operación';
  }
  if (n.includes('AJOVER') || n.includes('DICORP') || n.includes('INTER') || n.includes('DRIVE') || n.includes('CLIENTE')) {
    return 'Clientes & Aliados';
  }
  if (n.includes('FORMACIÓN') || n.includes('FORMACION') || n.includes('BASC') || n.includes('HUMANA') || n.includes('CALIDAD')) {
    return 'Cumplimiento & Talento';
  }
  return 'Administración & Estrategia';
};

const Layout: React.FC<LayoutProps> = ({
  children, activeTab, setActiveTab, activeMasterCategory, setActiveMasterCategory,
  activePageId, setActivePageId,
  onBack, showBack, user, onUpdateUser, onLogout, modulesData = [], pagesData = []
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isHelpMode, setIsHelpMode] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [profileData, setProfileData] = useState({ name: user.name, email: user.email, phone: user.phone || '', avatar: user.avatar || AVATAR_GALLERY[0] });

  // Búsqueda Rápida (Ctrl+K)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Favoritos y Recientes persistentes por usuario
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`orbitm7_favs_${user.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [recents, setRecents] = useState<Array<{ id: string; label: string; module: PageModule; masterCat?: MasterCategory; groupLabel?: string }>>(() => {
    try {
      const saved = localStorage.getItem(`orbitm7_recents_${user.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Estados para 2FA Flow
  const [twoFactorStep, setTwoFactorStep] = useState<'none' | 'qr'>('none');
  const [twoFactorQR, setTwoFactorQR] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [twoFactorVerifyCode, setTwoFactorVerifyCode] = useState('');

  const client = INITIAL_CLIENTS.find(c => c.id === user.clientId);
  const versionInfo = getVersionInfo();

  useEffect(() => {
    setProfileData({ name: user.name, email: user.email, phone: user.phone || '', avatar: user.avatar || AVATAR_GALLERY[0] });
  }, [user]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Atajo de teclado global Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // Autofoco en el input de búsqueda al abrir el modal
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isSearchOpen]);

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

  const toggleFavorite = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId];
      try {
        localStorage.setItem(`orbitm7_favs_${user.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const recordRecent = (item: any, groupLabel?: string) => {
    setRecents(prev => {
      const filtered = prev.filter(p => p.id !== item.id);
      const next = [{ id: item.id, label: item.label, module: item.module, masterCat: item.masterCat, groupLabel }, ...filtered].slice(0, 4);
      try {
        localStorage.setItem(`orbitm7_recents_${user.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const getIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName];
    return IconComponent ? <IconComponent className="w-4 h-4 shrink-0" /> : <Icons.Alert className="w-4 h-4 shrink-0" />;
  };

  // Construcción del menú con permisos de rol validados
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

          const sanitizeRoute = (route: string): string => {
            if (!route) return '';
            if (isMasterPage) return 'master';
            return route.replace(/^\/+/, '').split('/')[0];
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
        section: getModuleSection(mod.name),
        items: allowedPages
      };
    })
    .filter(group => group.items.length > 0);

  // Lista plana de páginas navegables para el buscador global y favoritos
  const allNavigablePages = menuGroups.flatMap(group =>
    group.items.map(item => ({
      ...item,
      groupLabel: group.label,
      groupId: group.id
    }))
  );

  const favoritePages = allNavigablePages.filter(p => favorites.includes(p.id));

  const filteredSearchPages = searchQuery.trim() === ''
    ? allNavigablePages.slice(0, 8)
    : allNavigablePages.filter(p =>
        p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.groupLabel.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Auto-desplegar el grupo del módulo correspondiente a la página actual
  useEffect(() => {
    if (menuGroups.length > 0) {
      const activeGroup = menuGroups.find(g =>
        g.items.some(item => (activePageId && item.id === activePageId) || (activeTab && item.module === activeTab))
      );
      if (activeGroup && expandedGroup !== activeGroup.id) {
        setExpandedGroup(activeGroup.id);
      }
    }
  }, [activePageId, activeTab, menuGroups.length]);

  const selectItem = (item: any, groupLabel?: string) => {
    if (isHelpMode) {
      toast.info(`Módulo: ${item.label}`, {
        description: `Este módulo permite gestionar ${item.label.toLowerCase()} y sus operaciones relacionadas.`,
        duration: 4000
      });
      return;
    }
    recordRecent(item, groupLabel);
    if (item.module) setActiveTab(item.module);
    if (setActiveMasterCategory) setActiveMasterCategory(item.masterCat || '' as MasterCategory);
    if (item.id && setActivePageId) setActivePageId(item.id);
    if (window.innerWidth < 768) setIsMobileMenuOpen(false);
    setIsSearchOpen(false);
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
      {/* WCAG: Saltar al contenido principal */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-[300] px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold shadow-2xl focus:outline-none focus:ring-4 focus:ring-emerald-400 text-xs motion-reduce:transition-none"
      >
        Saltar al contenido principal
      </a>

      {/* MOBILE BACKDROP */}
      {isMobileMenuOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Cerrar menú móvil"
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setIsMobileMenuOpen(false); }}
          className="fixed inset-0 bg-slate-950/60 z-20 md:hidden backdrop-blur-sm animate-in fade-in motion-reduce:animate-none"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* MENÚ LATERAL ACCESIBLE */}
      <aside
        aria-label="Navegación principal"
        className={`fixed inset-y-0 left-0 z-30 bg-slate-900 text-white flex flex-col transition-all duration-300 shadow-2xl md:static md:translate-x-0 motion-reduce:transition-none ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-20' : 'md:w-64'} w-64`}
      >
        {/* ENCABEZADO DEL MENÚ */}
        <div className="p-4 flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 relative group shrink-0">
              <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-lg group-hover:bg-emerald-500/20 transition-all"></div>
              <img
                src="/assets/brand/orbitm7_logo.png"
                alt="Logo OrbitM7"
                className="w-full h-full object-contain relative z-10"
              />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    role="heading"
                    aria-level={2}
                    className="font-black text-lg tracking-tighter text-white"
                  >
                    ORBITM7
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                      versionInfo.env === 'DEVELOP'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {versionInfo.env === 'DEVELOP' ? 'QA • DEV' : 'PROD'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                    v{versionInfo.version} <span className="text-slate-400 font-mono text-[9px]">({versionInfo.build})</span>
                  </span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={toggleSidebar}
            aria-label={isCollapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
            title={isCollapsed ? "Expandir" : "Contraer"}
            className="hidden md:flex p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
          >
            {isCollapsed ? <Icons.ChevronRight className="w-4 h-4" /> : <Icons.ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* BUSCADOR RÁPIDO (Ctrl+K) */}
        {!isCollapsed && (
          <div className="px-3 pt-3 pb-1 shrink-0">
            <button
              onClick={() => setIsSearchOpen(true)}
              aria-label="Buscar módulo o página (Ctrl+K)"
              title="Buscar módulo (Ctrl+K)"
              className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-white/10 transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
            >
              <span className="flex items-center gap-2.5">
                <Icons.Search className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">Buscar módulo...</span>
              </span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white/10 text-slate-300 rounded border border-white/15">
                Ctrl+K
              </kbd>
            </button>
          </div>
        )}

        {/* NAVEGACIÓN AGRUPADA POR SECCIONES */}
        <nav
          aria-label="Lista de módulos"
          className="flex-1 space-y-3 overflow-y-auto custom-scrollbar px-2 mt-2"
        >
          {/* FAVORITOS (Si existen y no está colapsado) */}
          {!isCollapsed && favoritePages.length > 0 && (
            <div className="space-y-1 pb-2 border-b border-white/5">
              <div className="px-3 py-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-amber-400">
                <Icons.Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>Favoritos</span>
              </div>
              <div className="space-y-0.5">
                {favoritePages.map(page => (
                  <button
                    key={`fav-${page.id}`}
                    onClick={() => selectItem(page, page.groupLabel)}
                    aria-current={activePageId === page.id ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
                      activePageId === page.id
                        ? 'text-emerald-400 bg-emerald-500/10 font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{page.label}</span>
                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(page.id, e)}
                      aria-label={`Quitar ${page.label} de favoritos`}
                      title="Quitar de favoritos"
                      className="p-1 text-amber-400 hover:text-slate-400 transition-colors"
                    >
                      <Icons.Star className="w-3.5 h-3.5 fill-amber-400" />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RECIENTES (Si existen y no está colapsado) */}
          {!isCollapsed && recents.length > 0 && (
            <div className="space-y-1 pb-2 border-b border-white/5">
              <div className="px-3 py-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <Icons.Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Recientes</span>
              </div>
              <div className="space-y-0.5">
                {recents.map(recent => (
                  <button
                    key={`recent-${recent.id}`}
                    onClick={() => selectItem(recent, recent.groupLabel)}
                    aria-current={activePageId === recent.id ? 'page' : undefined}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
                      activePageId === recent.id
                        ? 'text-emerald-400 bg-emerald-500/10 font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate block">{recent.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MÓDULOS AGRUPADOS POR SECCIÓN */}
          {SECTION_ORDER.map(sectionName => {
            const groupsInSection = menuGroups.filter(g => g.section === sectionName);
            if (groupsInSection.length === 0) return null;

            return (
              <div key={sectionName} className="space-y-1">
                {!isCollapsed && (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-black uppercase tracking-wider text-slate-400 border-t border-white/5 first:border-0 first:pt-0">
                    {sectionName}
                  </div>
                )}
                {groupsInSection.map(group => (
                  <div key={group.id} className="space-y-0.5">
                    <button
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={expandedGroup === group.id}
                      aria-label={`${group.label} (${group.items.length} opciones)`}
                      className={`w-full flex items-center transition-all font-bold text-xs rounded-xl min-h-[44px] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
                        isCollapsed ? 'justify-center p-3' : 'justify-between px-3 py-2.5'
                      } ${
                        expandedGroup === group.id
                          ? 'bg-white/10 text-white'
                          : 'text-slate-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`${
                            expandedGroup === group.id ? 'text-emerald-400' : 'text-slate-400'
                          } ${isCollapsed ? 'scale-110' : ''}`}
                        >
                          {group.icon}
                        </span>
                        {!isCollapsed && (
                          <span className="truncate uppercase tracking-wide text-xs">
                            {group.label}
                          </span>
                        )}
                      </div>
                      {!isCollapsed && (
                        <div
                          className={`transition-transform duration-200 motion-reduce:transition-none text-slate-400 ${
                            expandedGroup === group.id ? 'rotate-90 text-emerald-400' : ''
                          }`}
                        >
                          <Icons.ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </button>

                    {expandedGroup === group.id && !isCollapsed && (
                      <div
                        role="region"
                        aria-label={`Subpáginas de ${group.label}`}
                        className="ml-4 pl-3 border-l-2 border-white/10 space-y-0.5 py-1 animate-in slide-in-from-top-1 motion-reduce:animate-none"
                      >
                        {group.items.map(item => {
                          const isFav = favorites.includes(item.id);
                          const isActive = activePageId === item.id || activeTab === item.module;
                          return (
                            <div
                              key={item.id}
                              className="flex items-center justify-between group/item rounded-lg"
                            >
                              <button
                                onClick={() => selectItem(item, group.label)}
                                aria-current={isActive ? 'page' : undefined}
                                className={`flex-1 text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
                                  isActive
                                    ? 'text-emerald-400 bg-emerald-500/10 font-bold'
                                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                {item.label}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => toggleFavorite(item.id, e)}
                                aria-label={isFav ? `Quitar ${item.label} de favoritos` : `Agregar ${item.label} a favoritos`}
                                title={isFav ? "Quitar de favoritos" : "Agregar a favoritos"}
                                className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[36px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
                                  isFav
                                    ? 'text-amber-400'
                                    : 'text-slate-600 hover:text-amber-400 opacity-0 group-hover/item:opacity-100'
                                }`}
                              >
                                <Icons.Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400' : ''}`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </nav>

        {/* PIE DE BARRA LATERAL CON IDENTIDAD Y SALIDA */}
        <div className="mt-auto p-3 border-t border-white/5 space-y-2 shrink-0">
          <div className="bg-white/5 rounded-2xl flex items-center p-3 gap-3 relative transition-all hover:bg-white/10">
            <button
              onClick={() => setIsProfileModalOpen(true)}
              aria-label="Abrir perfil de usuario y configuración"
              title="Mi perfil y ajustes"
              className="absolute inset-0 z-10 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none rounded-2xl"
            />
            <div className="w-9 h-9 rounded-xl bg-slate-800 overflow-hidden border border-emerald-500/50 shrink-0">
              <img src={user.avatar || AVATAR_GALLERY[0]} alt="" className="w-full h-full object-cover" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black truncate uppercase tracking-tight text-white">{user.name}</p>
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">{user.role}</p>
              </div>
            )}
            <button
              onClick={onLogout}
              aria-label="Cerrar sesión"
              title="Cerrar Sesión"
              className="p-2 text-slate-400 hover:text-rose-400 z-20 relative transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
            >
              <Icons.LogOut className="w-4 h-4" />
            </button>
          </div>
          {!isCollapsed && (
            <div className="flex items-center justify-center gap-1.5 px-2 py-1 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase">
                Milla 7 • Orbit v{versionInfo.version} •{' '}
                <span className={versionInfo.env === 'DEVELOP' ? "text-amber-400 font-black" : "text-emerald-400 font-black"}>
                  {versionInfo.env === 'DEVELOP' ? "QA" : "PROD"}
                </span>
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 flex flex-col overflow-hidden relative focus:outline-none"
      >
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSidebar}
              aria-label="Alternar menú de navegación"
              title="Menú lateral"
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-emerald-600 hover:bg-slate-100 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            >
              <Icons.Menu className="w-5 h-5" />
            </button>
            {showBack && (
              <button
                onClick={onBack}
                aria-label="Regresar a la pantalla anterior"
                title="Regresar"
                className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm hover:bg-rose-700 uppercase tracking-wider transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
              >
                Regresar
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="h-4 w-1 bg-emerald-500 rounded-full" aria-hidden="true" />
              <h2 className="text-xs md:text-sm font-black text-slate-800 tracking-wider uppercase">
                {activeTab.replace('-', ' ')}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Botón rápido de búsqueda para pantallas medianas/grandes */}
            <button
              onClick={() => setIsSearchOpen(true)}
              aria-label="Buscar en la aplicación (Ctrl+K)"
              title="Buscar (Ctrl+K)"
              className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-all min-h-[40px] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            >
              <Icons.Search className="w-3.5 h-3.5 text-slate-500" />
              <span>Buscar...</span>
              <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-white text-slate-500 rounded border border-slate-300">
                Ctrl+K
              </kbd>
            </button>
          </div>
        </header>
        <section className="flex-1 overflow-y-auto p-0 bg-slate-50/50 custom-scrollbar">
          {children}
        </section>
      </main>

      {/* DIÁLOGO MODAL: BÚSQUEDA RÁPIDA (Ctrl+K) */}
      {isSearchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Búsqueda rápida de módulos"
          className="fixed inset-0 z-[250] flex items-start justify-center pt-20 p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none"
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 motion-reduce:animate-none flex flex-col max-h-[70vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <Icons.Search className="w-5 h-5 text-emerald-600 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Escribe el nombre de un módulo o página..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm md:text-base font-bold text-slate-800 placeholder-slate-400 outline-none"
              />
              <kbd className="hidden sm:inline px-2 py-1 text-[10px] font-mono bg-slate-100 text-slate-500 rounded-lg border border-slate-200">
                ESC
              </kbd>
            </div>
            <div className="overflow-y-auto p-3 space-y-1 custom-scrollbar">
              {filteredSearchPages.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                  No se encontraron módulos con el término "{searchQuery}".
                </div>
              ) : (
                filteredSearchPages.map(page => (
                  <button
                    key={`search-${page.id}`}
                    onClick={() => selectItem(page, page.groupLabel)}
                    className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-emerald-50/70 hover:text-emerald-950 text-left transition-all group min-h-[44px] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                  >
                    <div>
                      <p className="text-xs font-black text-slate-800 group-hover:text-emerald-900 uppercase">
                        {page.label}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {page.groupLabel}
                      </p>
                    </div>
                    <span className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-bold text-xs flex items-center gap-1">
                      Abrir <Icons.ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PERFIL Y AJUSTES */}
      {isProfileModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mi Identidad Orbit y Ajustes"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300 motion-reduce:animate-none"
        >
          <div className="bg-white w-[90vw] max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
              <h3 className="text-base md:text-lg font-black uppercase tracking-tight">Mi Identidad Orbit</h3>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                aria-label="Cerrar modal de perfil"
                className="text-2xl font-thin hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col items-center gap-6">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-[2rem] bg-slate-100 overflow-hidden border-4 border-emerald-500 shadow-xl">
                    <img src={profileData.avatar} alt="Avatar de usuario" className="w-full h-full object-cover" />
                  </div>
                  <label
                    aria-label="Subir foto de avatar"
                    className="absolute -bottom-2 -right-2 bg-slate-900 text-white p-2.5 rounded-xl cursor-pointer hover:bg-emerald-500 hover:text-slate-900 transition-all shadow-lg border border-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Icons.Camera className="w-4 h-4" />
                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                  </label>
                </div>

                <div className="w-full">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-3 text-center">
                    Seleccionar Avatar Predefinido
                  </label>
                  <div className="flex justify-center gap-3 flex-wrap">
                    {AVATAR_GALLERY.map((av, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setProfileData({ ...profileData, avatar: av })}
                        aria-label={`Seleccionar avatar ${i + 1}`}
                        className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all min-h-[48px] min-w-[48px] ${
                          profileData.avatar === av ? 'border-emerald-500 scale-110 shadow-lg' : 'border-transparent hover:border-slate-300'
                        }`}
                      >
                        <img src={av} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Nombre Completo</label>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={e => setProfileData({ ...profileData, name: e.target.value.toUpperCase() })}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm min-h-[44px]"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Teléfono / Celular</label>
                  <input
                    type="text"
                    value={profileData.phone}
                    onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm min-h-[44px]"
                    placeholder="+57 ..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Email Corporativo</label>
                  <input
                    type="email"
                    value={profileData.email}
                    disabled
                    className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-sm text-slate-500 min-h-[44px]"
                  />
                </div>

                {/* AJUSTES: LIMPIEZA DE CACHÉ Y VERSIÓN ÚNICA */}
                <div className="pt-4 border-t border-slate-100 mt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div>
                      <p className="text-xs font-black uppercase tracking-tight text-slate-800">Caché y Almacenamiento Local</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Versión actual: v{versionInfo.version} ({versionInfo.build}). Limpia la memoria local para descargar la última compilación.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if ('caches' in window) {
                          const keys = await caches.keys();
                          await Promise.all(keys.map(k => caches.delete(k)));
                        }
                        localStorage.removeItem('orbitm7_sw_updated');
                        toast.info("Caché purgada correctamente. Recargando...");
                        setTimeout(() => window.location.reload(), 600);
                      }}
                      aria-label="Limpiar caché y recargar aplicación"
                      className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all min-h-[44px] shrink-0 shadow-sm"
                    >
                      <Icons.RefreshCw className="w-4 h-4 text-emerald-600" />
                      Limpiar Caché y Recargar
                    </button>
                  </div>
                </div>

                {/* SECCIÓN 2FA (TOTP) */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${(user as any).twoFactorEnabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Icons.Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-tight text-slate-800">Doble Factor (2FA)</p>
                        <p className="text-xs text-slate-500">Seguridad TOTP estándar con Google Authenticator o Authy</p>
                      </div>
                    </div>
                    <span className={`text-xs font-black px-3 py-1 rounded-full ${(user as any).twoFactorEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {(user as any).twoFactorEnabled ? 'ACTIVO' : 'INACTIVO'}
                    </span>
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
                          className="w-full py-3.5 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-black text-slate-600 hover:border-emerald-500 hover:text-emerald-600 transition-all uppercase tracking-wider min-h-[44px]"
                        >
                          Configurar Segundo Factor
                        </button>
                      )}

                      {twoFactorStep === 'qr' && (
                        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 animate-in zoom-in-95 motion-reduce:animate-none">
                          <p className="text-xs font-black text-slate-600 uppercase text-center mb-4">
                            1. Escanea este código con Google Authenticator o Authy
                          </p>
                          <div className="w-40 h-40 bg-white mx-auto p-2 rounded-2xl border border-slate-200 mb-4">
                            <img src={twoFactorQR} alt="Código QR para 2FA" className="w-full h-full" />
                          </div>
                          <p className="text-xs font-black text-slate-600 uppercase text-center mb-2">
                            2. Ingrese el código de 6 dígitos
                          </p>
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="000000"
                            value={twoFactorVerifyCode}
                            onChange={e => setTwoFactorVerifyCode(e.target.value)}
                            className="w-full p-3.5 bg-white border border-slate-200 rounded-xl text-center font-black text-lg tracking-[0.5em] focus:border-emerald-500 outline-none min-h-[44px]"
                          />
                          <div className="flex gap-2 mt-4">
                            <button
                              type="button"
                              onClick={() => setTwoFactorStep('none')}
                              className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase min-h-[44px]"
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
                              className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-emerald-500/20 min-h-[44px]"
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
                      className="w-full py-3.5 bg-red-50 text-red-600 rounded-2xl text-xs font-black hover:bg-red-600 hover:text-white transition-all uppercase tracking-wider min-h-[44px]"
                    >
                      Desactivar 2FA
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="flex-1 py-3.5 bg-slate-100 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-200 transition-all min-h-[44px]"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 text-white py-3.5 rounded-2xl font-black text-xs uppercase hover:bg-emerald-600 transition-all shadow-lg min-h-[44px]"
                >
                  Actualizar Perfil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
