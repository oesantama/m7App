import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { User } from '../../types';
import { Icons } from '../../constants';
import * as XLSX from 'xlsx';

interface ClientMapping {
  clientId: string;
  clientName: string;
  managementName: string;
  bodega: string;
}

interface ProvCliente {
  documento: string;
  nombre: string;
  contacto: string;
  email: string;
  representante: string;
  estado: string;
  usuario_creacion: string;
  fecha_creacion: string;
  client_mappings?: ClientMapping[];
}

interface ClientOption {
  id: string;
  name: string;
}

interface Estado {
  id: string;
  name: string;
}

interface Props {
  user: User;
}

const ProvClientes: React.FC<Props> = ({ user }) => {
  const [records, setRecords] = useState<ProvCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<ProvCliente | null>(null);
  const [formDoc, setFormDoc] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formContacto, setFormContacto] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRepresentante, setFormRepresentante] = useState('');
  const [formEstado, setFormEstado] = useState('EST-01');
  const [formMappings, setFormMappings] = useState<ClientMapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [viewClientsFor, setViewClientsFor] = useState<ProvCliente | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getProvClientes();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    api.getEstados()
      .then((data: any[]) => setEstados(Array.isArray(data) ? data : []))
      .catch(() => {});
    api.getClients()
      .then((data: any[]) => setClientOptions(Array.isArray(data) ? data.map((c: any) => ({ id: c.id, name: c.name })) : []))
      .catch(() => {});
  }, [fetchData]);

  const filtered = useMemo(() =>
    records.filter(r =>
      r.documento?.toLowerCase().includes(search.toLowerCase()) ||
      r.nombre?.toLowerCase().includes(search.toLowerCase()) ||
      r.representante?.toLowerCase().includes(search.toLowerCase()) ||
      r.email?.toLowerCase().includes(search.toLowerCase())
    ),
    [records, search]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditing(null);
    setFormDoc('');
    setFormNombre('');
    setFormContacto('');
    setFormEmail('');
    setFormRepresentante('');
    setFormEstado('EST-01');
    setFormMappings([]);
    setClientSearch('');
    setIsOpen(true);
  };

  const openEdit = (r: ProvCliente) => {
    setEditing(r);
    setFormDoc(r.documento);
    setFormNombre(r.nombre);
    setFormContacto(r.contacto || '');
    setFormEmail(r.email || '');
    setFormRepresentante(r.representante || '');
    setFormEstado(r.estado || 'EST-01');
    setFormMappings(Array.isArray(r.client_mappings) ? r.client_mappings : []);
    setClientSearch('');
    setIsOpen(true);
  };

  const addClientMapping = (opt: ClientOption) => {
    if (formMappings.some(m => m.clientId === opt.id)) return;
    setFormMappings(prev => [...prev, { clientId: opt.id, clientName: opt.name, managementName: opt.name, bodega: '' }]);
    setClientSearch('');
  };

  const removeClientMapping = (clientId: string) => {
    setFormMappings(prev => prev.filter(m => m.clientId !== clientId));
  };

  const updateMapping = (clientId: string, field: keyof ClientMapping, value: string) => {
    setFormMappings(prev => prev.map(m => m.clientId === clientId ? { ...m, [field]: value } : m));
  };

  const handleSave = async () => {
    if (!formDoc.trim()) {
      toast.error('El documento es requerido');
      return;
    }
    if (!formNombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSaving(true);
    try {
      await api.saveProvCliente({
        documento: formDoc.trim(),
        nombre: formNombre.trim(),
        contacto: formContacto.trim() || null,
        email: formEmail.trim() || null,
        representante: formRepresentante.trim() || null,
        estado: formEstado,
        usuarioControl: user.name,
        client_mappings: formMappings
      });
      toast.success(editing ? 'Proveedor actualizado' : 'Proveedor creado');
      setIsOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (documento: string) => {
    if (!window.confirm('¿Está seguro de eliminar este proveedor?')) return;
    setDeleting(documento);
    try {
      await api.deleteProvCliente(documento);
      toast.success('Proveedor eliminado con éxito');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    } finally {
      setDeleting(null);
    }
  };

  const estadoLabel = (id: string) => estados.find(e => e.id === id)?.name ?? id;

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          toast.error('El archivo está vacío');
          return;
        }

        const items: any[] = [];
        for (const row of data) {
          const docKey = Object.keys(row).find(k => {
            const kl = k.toLowerCase().trim();
            return kl === 'documento' || kl === 'nit' || kl === 'cedula' || kl.includes('documento cliente') || kl.includes('documento') || kl.includes('nit');
          });
          const nameKey = Object.keys(row).find(k => {
            const kl = k.toLowerCase().trim();
            return kl === 'nombre' || kl === 'proveedor' || kl === 'nombre cliente' || kl === 'nombre proveedor' || kl === 'razon social' || (kl.includes('nombre') && !kl.includes('documento')) || (kl === 'cliente' && !kl.includes('documento'));
          });
          const contactKey = Object.keys(row).find(k => k.toLowerCase() === 'contacto' || k.toLowerCase() === 'telefono');
          const emailKey = Object.keys(row).find(k => k.toLowerCase() === 'email' || k.toLowerCase() === 'correo');
          const repKey = Object.keys(row).find(k => k.toLowerCase() === 'representante');

          if (!docKey || !nameKey) continue;

          items.push({
            documento: String(row[docKey]).trim(),
            nombre: String(row[nameKey]).trim(),
            contacto: contactKey ? String(row[contactKey]).trim() : null,
            email: emailKey ? String(row[emailKey]).trim() : null,
            representante: repKey ? String(row[repKey]).trim() : null,
            estado: 'EST-01'
          });
        }

        if (items.length === 0) {
          toast.error('No se encontraron columnas "Documento" y "Nombre" válidas');
          return;
        }

        setLoading(true);
        await api.bulkSaveProvClientes({ items, usuarioControl: user.name });
        toast.success(`${items.length} proveedores importados exitosamente`);
        fetchData();
      } catch (err: any) {
        toast.error('Error al procesar Excel: ' + err.message);
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    try {
      const templateData = [
        {
          'Documento Cliente': '860013771',
          'Nombre': 'AJOVER DARNEL S.A.S',
          'Contacto': '3001234567',
          'Email': 'contacto@ajover.com',
          'Representante': 'JUAN PEREZ'
        },
        {
          'Documento Cliente': '900743223',
          'Nombre': 'LOGISTICA Y SERVICIOS ASOCIADOS S.A.S',
          'Contacto': '3109876543',
          'Email': 'logistica@servicios.com',
          'Representante': 'MARIA GOMEZ'
        }
      ];
      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
      XLSX.writeFile(wb, 'Plantilla_Proveedores_Clientes.xlsx');
      toast.success('Plantilla descargada con éxito');
    } catch (err: any) {
      toast.error('Error al generar plantilla: ' + err.message);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Icons.Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Configuración Maestros</p>
          <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Proveedores Cliente</h1>
        </div>
      </div>

      {/* Informative Format Banner */}
      <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-300">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 bg-emerald-100/80 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
            <Icons.Info className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-800">Formato para Carga de Excel</h4>
            <p className="text-[11px] text-emerald-700 font-medium leading-relaxed">
              El archivo de Excel debe contener las siguientes columnas (el orden no importa):
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="px-2 py-0.5 bg-emerald-600 text-white font-black text-[9px] rounded-lg uppercase tracking-wider">Documento Cliente *</span>
              <span className="px-2 py-0.5 bg-emerald-600 text-white font-black text-[9px] rounded-lg uppercase tracking-wider">Nombre *</span>
              <span className="px-2 py-0.5 bg-emerald-100/60 text-emerald-700 font-black text-[9px] rounded-lg uppercase tracking-wider border border-emerald-200">Contacto</span>
              <span className="px-2 py-0.5 bg-emerald-100/60 text-emerald-700 font-black text-[9px] rounded-lg uppercase tracking-wider border border-emerald-200">Email</span>
              <span className="px-2 py-0.5 bg-emerald-100/60 text-emerald-700 font-black text-[9px] rounded-lg uppercase tracking-wider border border-emerald-200">Representante</span>
            </div>
            <p className="text-[9px] text-emerald-600 font-black uppercase mt-1 tracking-widest">* Columnas obligatorias</p>
          </div>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 h-10 px-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md shadow-emerald-500/10 active:scale-95 shrink-0 self-end md:self-center"
        >
          <Icons.Download className="w-3.5 h-3.5" /> Descargar Plantilla
        </button>
      </div>

      {/* Main Panel */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="bg-slate-50 h-10 px-4 rounded-xl flex items-center gap-3 w-full sm:w-72 border border-slate-100 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10">
            <Icons.Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar proveedor..."
              className="bg-transparent border-none outline-none font-bold text-[11px] uppercase text-slate-700 placeholder:text-slate-300 w-full"
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
            <button
              onClick={() => document.getElementById('excel-prov-clientes')?.click()}
              className="flex items-center gap-2 h-10 px-4 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95 shrink-0"
            >
              <Icons.FileText className="w-3.5 h-3.5" />Importar Excel
            </button>
            <input
              type="file"
              id="excel-prov-clientes"
              accept=".xlsx, .xls"
              className="hidden"
              onChange={handleExcelUpload}
            />

            <button
              onClick={openCreate}
              className="flex items-center gap-2 h-10 px-6 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 shrink-0"
            >
              <Icons.Plus className="w-3.5 h-3.5" />Nuevo Proveedor
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Documento', 'Nombre', 'Contacto', 'Email', 'Representante', 'Clientes', 'Estado', 'Creador', 'Acciones'].map(h => (
                    <th key={h} className={`${h === 'Acciones' ? 'text-right' : 'text-left'} px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Cargando proveedores...</p>
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <Icons.Alert className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Sin proveedores registrados</p>
                    </td>
                  </tr>
                ) : paginated.map((r, i) => (
                  <tr key={r.documento} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 !== 0 ? 'bg-slate-50/30' : ''}`}>
                    <td className="px-5 py-3.5 text-[11px] font-black text-slate-600">{r.documento}</td>
                    <td className="px-5 py-3.5 text-[11px] font-bold text-slate-700 uppercase">{r.nombre}</td>
                    <td className="px-5 py-3.5 text-[11px] text-slate-500">{r.contacto || '—'}</td>
                    <td className="px-5 py-3.5 text-[11px] text-slate-500 font-medium">{r.email || '—'}</td>
                    <td className="px-5 py-3.5 text-[11px] text-slate-500 uppercase font-bold">{r.representante || '—'}</td>
                    <td className="px-5 py-3.5">
                      {Array.isArray(r.client_mappings) && r.client_mappings.length > 0 ? (
                        <button onClick={() => setViewClientsFor(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors">
                          {r.client_mappings.length} cliente{r.client_mappings.length !== 1 ? 's' : ''}
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${r.estado === 'EST-01' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${r.estado === 'EST-01' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {estadoLabel(r.estado)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[11px] text-slate-500 font-bold uppercase">{r.usuario_creacion || '—'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(r)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                          <Icons.Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(r.documento)} disabled={deleting === r.documento} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40">
                          {deleting === r.documento ? (
                            <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Icons.Trash className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {filtered.length} proveedores · Pág {page}/{totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all"
                >
                  <Icons.ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all"
                >
                  <Icons.ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View Clients Modal */}
      {viewClientsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">Clientes Vinculados</p>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{viewClientsFor.nombre}</h3>
              </div>
              <button onClick={() => setViewClientsFor(null)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500">
                <Icons.X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {viewClientsFor.client_mappings?.map((m: any, i: number) => (
                <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-xs font-black text-slate-800 uppercase mb-2">{m.clientName}</p>
                  <div className="grid grid-cols-2 gap-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <div>Manifiestos: <span className="text-slate-600">{m.managementName}</span></div>
                    <div>Bodega: <span className="text-slate-600">{m.bodega || '—'}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">
                  {editing ? 'Editar' : 'Nuevo'} Proveedor
                </p>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Datos del Proveedor</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500">
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Documento / NIT *</label>
                <input
                  value={formDoc}
                  disabled={editing !== null}
                  onChange={e => setFormDoc(e.target.value)}
                  placeholder="Documento único..."
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all disabled:opacity-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nombre Completo *</label>
                <input
                  value={formNombre}
                  onChange={e => setFormNombre(e.target.value)}
                  placeholder="Nombre de la empresa..."
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Contacto / Teléfono</label>
                <input
                  value={formContacto}
                  onChange={e => setFormContacto(e.target.value)}
                  placeholder="Teléfono o número de contacto..."
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Email corporativo</label>
                <input
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="Email de contacto..."
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Representante Legal</label>
                <input
                  value={formRepresentante}
                  onChange={e => setFormRepresentante(e.target.value)}
                  placeholder="Nombre del representante..."
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estado</label>
                <select
                  value={formEstado}
                  onChange={e => setFormEstado(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                >
                  {estados.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* Client Mappings */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Clientes que Maneja</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                  Vincula cada cliente de Drive con su nombre exacto en los manifiestos para calcular cobertura correctamente.
                </p>

                {/* Search to add client */}
                <div className="relative">
                  <div className="bg-slate-50 h-9 px-3 rounded-xl flex items-center gap-2 border border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10">
                    <Icons.Search className="w-3 h-3 text-slate-400 shrink-0" />
                    <input
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      placeholder="Buscar y agregar cliente..."
                      className="bg-transparent border-none outline-none font-bold text-[10px] uppercase text-slate-700 placeholder:text-slate-300 w-full"
                    />
                  </div>
                  {clientSearch.trim().length > 1 && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                      {clientOptions
                        .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) && !formMappings.some(m => m.clientId === c.id))
                        .slice(0, 8)
                        .map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => addClientMapping(c)}
                            className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-slate-50 last:border-0"
                          >
                            {c.name}
                          </button>
                        ))}
                      {clientOptions.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) && !formMappings.some(m => m.clientId === c.id)).length === 0 && (
                        <div className="px-3 py-2 text-[10px] text-slate-400 font-medium">Sin resultados</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Mappings list */}
                {formMappings.length === 0 ? (
                  <div className="py-4 text-center text-[9px] font-black uppercase text-slate-300 tracking-widest bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Sin clientes asignados
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formMappings.map(m => (
                      <div key={m.clientId} className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black text-emerald-700 uppercase truncate flex-1">{m.clientName}</span>
                          <button type="button" onClick={() => removeClientMapping(m.clientId)} className="w-5 h-5 flex items-center justify-center rounded-md bg-red-50 text-red-400 hover:bg-red-100 transition-colors shrink-0">
                            <Icons.X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Nombre en Manifiestos</label>
                            <input
                              value={m.managementName}
                              onChange={e => updateMapping(m.clientId, 'managementName', e.target.value)}
                              placeholder="Nombre exacto en manifiestos..."
                              className="w-full h-8 px-2 rounded-lg bg-white border border-slate-200 text-[9px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 transition-all"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Bodega</label>
                            <input
                              value={m.bodega}
                              onChange={e => updateMapping(m.clientId, 'bodega', e.target.value)}
                              placeholder="Ej: GIRARDOTA..."
                              className="w-full h-8 px-2 rounded-lg bg-white border border-slate-200 text-[9px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Guardando...</>
                ) : (
                  <><Icons.Check className="w-3.5 h-3.5" />{editing ? 'Actualizar' : 'Guardar'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProvClientes;
