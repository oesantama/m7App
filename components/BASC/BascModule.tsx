import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import Dashboard from './Dashboard';
import DriveSync from './DriveSync';
import AuditorAI from './AuditorAI';
import Reportes from './Reportes';
import { Icons } from '../../constants';

interface BascModuleProps {
  activePageId: string;
  setActivePageId: (pageId: string) => void;
}

const BascModule: React.FC<BascModuleProps> = ({ activePageId, setActivePageId }) => {
  const [tree, setTree] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchSyncStatus = async () => {
    setLoading(true);
    try {
      const res = await api.bascGetSyncStatus();
      if (res && res.success) {
        setTree(res.tree || {});
      }
    } catch (e) {
      console.error('Error fetching sync status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const renderContent = () => {
    switch (activePageId) {
      case 'PAG-BASC-02':
        return <DriveSync tree={tree} loading={loading} onRefresh={fetchSyncStatus} />;
      case 'PAG-BASC-03':
        return <AuditorAI />;
      case 'PAG-BASC-04':
        return <Reportes tree={tree} loading={loading} />;
      case 'PAG-BASC-01':
      default:
        return <Dashboard tree={tree} loading={loading} onNavigate={setActivePageId} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950">
      {renderContent()}
    </div>
  );
};

export default BascModule;
