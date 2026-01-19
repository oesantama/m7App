
import React, { useState, useEffect } from 'react';
import { Icons, INITIAL_CLIENTS, AVATAR_GALLERY } from '../constants';
import { User, PageModule, MasterCategory, MasterRecord } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeMasterCategory?: MasterCategory;
  setActiveMasterCategory?: (cat: MasterCategory) => void;
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
  onBack, showBack, user, onUpdateUser, onLogout, modulesData = [], pagesData = []
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(window.innerWidth < 1024);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [profileData, setProfileData] = useState({ name: user.name, email: user.email, phone: user.phone || '', avatar: user.avatar || AVATAR_GALLERY[0] });
  const client = INITIAL_CLIENTS.find(c => c.id === user.clientId);

  useEffect(() => {
    setProfileData({ name: user.name, email: user.email, phone: user.phone || '', avatar: user.avatar || AVATAR_GALLERY[0] });
  }, [user]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setIsCollapsed(true);
      else setIsCollapsed(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);
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

  const isSuperUser = user.roleId === 'ROL-01';

  // ORDENAMIENTO ASCENDENTE DE GRUPOS Y PÁGINAS
  const menuGroups = [...modulesData]
    .filter(m => m.statusId === 'EST-01')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(mod => {
      const allowedPages = [...pagesData]
        .filter(p => p.parentId === mod.id && p.statusId === 'EST-01')
        .filter(p => {
            if (isSuperUser) return true;
            const userPerm = user.permissions.find(perm => perm.module === p.id);
            return userPerm && userPerm.actions.includes('view');
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(page => ({
          id: page.id,
          label: page.name,
          module: page.route as PageModule,
          masterCat: page.moduleId as MasterCategory
        }));

      return {
        id: mod.id,
        label: mod.name,
        icon: getIcon(mod.iconClass || 'Settings'),
        items: allowedPages
      };
    })
    .filter(group => group.items.length > 0);

  const selectItem = (item: any) => {
    if (item.module) setActiveTab(item.module);
    if (item.masterCat && setActiveMasterCategory) setActiveMasterCategory(item.masterCat);
    if (window.innerWidth < 768) setIsCollapsed(true);
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUser(profileData);
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
      <aside className={`bg-slate-900 text-white flex flex-col transition-all duration-300 shrink-0 z-30 shadow-2xl ${isCollapsed ? 'w-20 md:w-24' : 'w-72'}`}>
        <div className={`flex items-center gap-4 mb-10 px-4 py-6 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shrink-0">
            <span className="text-2xl font-black text-slate-900">M7</span>
          </div>
          {!isCollapsed && (
            <div className="animate-in fade-in overflow-hidden">
              <h1 className="font-black text-xl tracking-tighter">MILLA SIETE</h1>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">M7 GLOBAL</span>
            </div>
          )}
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar px-3">
          {menuGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              <button onClick={() => toggleGroup(group.id)} className={`w-full flex items-center transition-all font-bold text-sm rounded-2xl ${isCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} ${expandedGroup === group.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}>
                <div className="flex items-center gap-3">
                  <span className={expandedGroup === group.id ? 'text-emerald-400' : 'text-slate-500'}>{group.icon}</span>
                  {!isCollapsed && <span className="truncate">{group.label}</span>}
                </div>
                {!isCollapsed && <div className={`transition-transform duration-300 ${expandedGroup === group.id ? 'rotate-90' : ''}`}><Icons.ChevronRight /></div>}
              </button>
              {expandedGroup === group.id && !isCollapsed && (
                <div className="ml-6 pl-4 border-l border-slate-800 space-y-1 py-1">
                  {group.items.map((item) => (
                    <button key={item.id} onClick={() => selectItem(item)} className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all ${(activeTab === item.module && (!activeMasterCategory || activeMasterCategory === item.masterCat)) ? 'text-emerald-400 bg-emerald-400/5' : 'text-slate-500 hover:text-slate-300'}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-slate-800">
          <div className={`bg-slate-800/40 rounded-3xl flex items-center p-4 gap-4 relative`}>
             <button onClick={() => setIsProfileModalOpen(true)} className="absolute inset-0 z-10 opacity-0 cursor-pointer"></button>
             <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden border-2 border-emerald-500 shrink-0">
               <img src={user.avatar || AVATAR_GALLERY[0]} alt="User" className="w-full h-full object-cover" />
             </div>
             {!isCollapsed && <div className="flex-1 min-w-0"><p className="text-xs font-black truncate uppercase">{user.name}</p><p className="text-[10px] text-emerald-500 font-black uppercase">{user.role}</p></div>}
             <button onClick={onLogout} title="Cerrar Sesión" className="p-2 text-slate-500 hover:text-red-500 z-20 relative transition-colors"><Icons.LogOut /></button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-4">
             <button onClick={toggleSidebar} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 hover:text-emerald-500"><Icons.Menu /></button>
             {showBack && (
               <button onClick={onBack} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-red-700">
                 Regresar
               </button>
             )}
             <div className="flex items-center gap-3">
                <div className="h-8 w-1.5 bg-emerald-500 rounded-full"></div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">{activeTab.replace('-', ' ')}</h2>
             </div>
          </div>
          <div className="text-right border-r border-slate-100 pr-4">
             <p className="text-[10px] font-black text-slate-400 uppercase">Operación Activa</p>
             <span className="text-sm font-black text-slate-800">{client?.name || 'M7 GLOBAL'}</span>
          </div>
        </header>
        <section className="flex-1 overflow-y-auto p-10 bg-slate-50/50 custom-scrollbar">{children}</section>
      </main>

      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center shrink-0">
               <h3 className="text-xl font-black uppercase tracking-tight">Mi Identidad M7</h3>
               <button onClick={() => setIsProfileModalOpen(false)} className="text-2xl font-thin hover:text-red-500 transition-colors">×</button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
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
                      <button key={i} type="button" onClick={() => setProfileData({...profileData, avatar: av})} className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${profileData.avatar === av ? 'border-emerald-500 scale-110 shadow-lg' : 'border-transparent hover:border-slate-300'}`}>
                        <img src={av} alt={`AV-${i}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Completo</label>
                  <input type="text" value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value.toUpperCase()})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teléfono / Celular</label>
                  <input type="text" value={profileData.phone} onChange={e => setProfileData({...profileData, phone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" placeholder="+57 ..." />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Corporativo</label>
                  <input type="email" value={profileData.email} disabled className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-sm text-slate-500" />
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
