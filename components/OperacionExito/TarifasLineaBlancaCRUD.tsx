import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { User } from '../../types';
import { Icons } from '../../constants';
import * as XLSX from 'xlsx';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface TarifaLineaBlanca {
  id?: number;
  destino: string;
  articulo: string;
  precio: number;
  usuario_creacion?: string;
  fecha_creacion?: string;
}

interface Props {
  user: User;
}

const TarifasLineaBlancaCRUD: React.FC<Props> = ({ user }) => {
  const [records, setRecords] = useState<TarifaLineaBlanca[]>([]);
  const [loading, setLoading] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<TarifaLineaBlanca | null>(null);
  const [formDestino, setFormDestino] = useState('');
  const [formArticulo, setFormArticulo] = useState('');
  const [formPrecio, setFormPrecio] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTarifasLineaBlanca();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar tarifas de línea blanca');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setFormDestino('');
    setFormArticulo('');
    setFormPrecio('');
    setIsOpen(true);
  };

  const openEdit = (r: TarifaLineaBlanca) => {
    setEditing(r);
    setFormDestino(r.destino);
    setFormArticulo(r.articulo);
    setFormPrecio(String(r.precio));
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!formDestino.trim()) {
      toast.error('El destino es requerido');
      return;
    }
    if (!formArticulo.trim()) {
      toast.error('El artículo es requerido');
      return;
    }
    if (!formPrecio.trim() || isNaN(Number(formPrecio))) {
      toast.error('El precio debe ser un número válido');
      return;
    }

    setSaving(true);
    try {
      await api.saveTarifaLineaBlanca({
        id: editing?.id,
        destino: formDestino.trim(),
        articulo: formArticulo.trim(),
        precio: parseFloat(formPrecio),
        usuarioControl: user.name
      });
      toast.success(editing ? 'Tarifa actualizada' : 'Tarifa creada');
      setIsOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (!window.confirm('¿Está seguro de eliminar esta tarifa?')) return;
    setDeleting(id);
    try {
      await api.deleteTarifaLineaBlanca(String(id));
      toast.success('Tarifa eliminada con éxito');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    } finally {
      setDeleting(null);
    }
  };

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
          const destKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'destino');
          const artKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'articulo' || k.toLowerCase().trim() === 'artículo');
          const precKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'precio' || k.toLowerCase().trim() === 'valor');

          if (!destKey || !artKey || !precKey) continue;
          
          const precio = parseFloat(String(row[precKey]).replace(/[^0-9.-]+/g,""));
          if(isNaN(precio)) continue;

          items.push({
            destino: String(row[destKey]).trim(),
            articulo: String(row[artKey]).trim(),
            precio: precio,
          });
        }

        if (items.length === 0) {
          toast.error('No se encontraron columnas "Destino", "Artículo" y "Precio" válidas o no hay precios numéricos.');
          return;
        }

        setLoading(true);
        await api.bulkSaveTarifasLineaBlanca({ items, usuarioControl: user.name });
        toast.success(`${items.length} tarifas importadas exitosamente`);
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
          'Destino': 'BOGOTA',
          'Artículo': 'NEVERA',
          'Precio': 50000
        },
        {
          'Destino': 'MEDELLIN',
          'Artículo': 'LAVADORA',
          'Precio': 45000
        }
      ];
      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tarifas');
      XLSX.writeFile(wb, 'Plantilla_Tarifas_Linea_Blanca.xlsx');
      toast.success('Plantilla descargada con éxito');
    } catch (err: any) {
      toast.error('Error al generar plantilla: ' + err.message);
    }
  };

  const columns = useMemo<ColumnDef<TarifaLineaBlanca>[]>(() => [
    {
      header: 'Destino',
      key: 'destino',
      render: (r) => <span className="font-black text-slate-700 uppercase">{r.destino}</span>
    },
    {
      header: 'Artículo',
      key: 'articulo',
      render: (r) => <span className="font-bold text-slate-600 uppercase">{r.articulo}</span>
    },
    {
      header: 'Precio',
      key: 'precio',
      render: (r) => <span className="font-bold text-slate-600">${r.precio.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
    },
    {
      header: 'Creador',
      key: 'usuario_creacion',
      render: (r) => <span className="font-bold text-slate-500 uppercase">{r.usuario_creacion || '—'}</span>
    },
    {
      header: 'Acciones',
      key: 'acciones',
      sortable: false,
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => openEdit(r)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
            <Icons.Edit className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40">
            {deleting === r.id ? (
              <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Icons.Trash className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )
    }
  ], [deleting]);

  return (
    <div className="space-y-4">
      {/* Informative Format Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-300">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
            <Icons.Info className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-blue-800">Cargar Tarifas (Excel)</h4>
            <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
              El archivo de Excel debe contener las siguientes columnas obligatorias:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="px-2 py-0.5 bg-blue-600 text-white font-black text-[9px] rounded-lg uppercase tracking-wider">Destino *</span>
              <span className="px-2 py-0.5 bg-blue-600 text-white font-black text-[9px] rounded-lg uppercase tracking-wider">Artículo *</span>
              <span className="px-2 py-0.5 bg-blue-600 text-white font-black text-[9px] rounded-lg uppercase tracking-wider">Precio *</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0 self-end md:self-center">
          <button
            onClick={() => document.getElementById('excel-tarifas-lb')?.click()}
            className="flex items-center gap-2 h-10 px-4 bg-white text-blue-600 border border-blue-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all active:scale-95 shadow-sm"
          >
            <Icons.FileText className="w-3.5 h-3.5" />Importar Excel
          </button>
          <input
            type="file"
            id="excel-tarifas-lb"
            accept=".xlsx, .xls"
            className="hidden"
            onChange={handleExcelUpload}
          />
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 h-10 px-4 bg-blue-100 text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-200 transition-all active:scale-95"
          >
            <Icons.Download className="w-3.5 h-3.5" /> Plantilla
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 h-10 px-6 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
          >
            <Icons.Plus className="w-3.5 h-3.5" />Nueva Tarifa
          </button>
        </div>
      </div>

      {loading && records.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cargando tarifas...</p>
        </div>
      ) : (
        <DataTable
          data={records}
          columns={columns}
          searchPlaceholder="Buscar destino o artículo..."
          excelFileName={`Tarifas_Linea_Blanca_${new Date().toISOString().split('T')[0]}.xlsx`}
          excelSheetName="Tarifas"
        />
      )}

      {/* Save Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 mb-0.5">
                  {editing ? 'Editar' : 'Nueva'} Tarifa
                </p>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Datos de Tarifa</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500">
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Destino *</label>
                <input
                  value={formDestino}
                  onChange={e => setFormDestino(e.target.value)}
                  placeholder="Ej: BOGOTA"
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Artículo *</label>
                <input
                  value={formArticulo}
                  onChange={e => setFormArticulo(e.target.value)}
                  placeholder="Ej: NEVERA"
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Precio *</label>
                <input
                  type="number"
                  value={formPrecio}
                  onChange={e => setFormPrecio(e.target.value)}
                  placeholder="Ej: 50000"
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
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
                className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
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

export default TarifasLineaBlancaCRUD;
