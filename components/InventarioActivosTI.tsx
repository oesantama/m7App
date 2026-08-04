import React, { useState, useEffect, useCallback } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';

interface ActivoTI {
  id: string;
  serial_number: string;
  hostname: string;
  system_user: string;
  brand: string;
  model: string;
  os_name: string;
  os_version: string;
  os_license_status: string;
  office_version: string;
  office_license_status: string;
  peripherals: string[];
  assigned_to_name: string;
  assigned_to_id: string;
  department: string;
  location: string;
  physical_condition: string;
  notes: string;
  conformity_accepted: boolean;
  pdf_acta_url?: string;
  updated_at: string;
}

const ESTADOS_FISICOS = ['Excelente', 'Bueno', 'Regular', 'Malo/Dañado'];

const emptyForm = {
  serial_number: '',
  hostname: '',
  system_user: '',
  brand: '',
  model: '',
  os_name: '',
  os_version: '',
  os_license_status: '',
  office_version: '',
  office_license_status: '',
  peripherals: [] as string[],
  assigned_to_name: '',
  assigned_to_id: '',
  department: '',
  location: '',
  physical_condition: 'Bueno',
  notes: '',
  conformity_accepted: false,
};

const InventarioActivosTI: React.FC = () => {
  const [form, setForm] = useState({ ...emptyForm });
  const [areas, setAreas] = useState<{ id: number; nombre: string }[]>([]);
  const [equipos, setEquipos] = useState<ActivoTI[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [peripheralInput, setPeripheralInput] = useState('');

  const [installCommand, setInstallCommand] = useState<string | null>(null);
  const [generatingCommand, setGeneratingCommand] = useState(false);

  const detectedOs = api.itActivos.detectOs();
  const detectedOsLabel = detectedOs === 'windows' ? 'Windows .ps1' : detectedOs === 'mac' ? 'macOS .sh' : 'Linux .sh';
  const detectedShellLabel = detectedOs === 'windows' ? 'PowerShell' : 'Terminal';

  const handleCopyInstallCommand = async () => {
    setGeneratingCommand(true);
    try {
      const res = await api.itActivos.getInstallCommand();
      const command = res.data.command;
      setInstallCommand(command);
      await navigator.clipboard.writeText(command);
      toast.success(`Comando copiado — pégalo en ${detectedShellLabel} (válido ${res.data.expiresInMinutes} min, un solo uso)`);
    } catch (err: any) {
      toast.error(err.message || 'No se pudo generar el comando de instalación');
    } finally {
      setGeneratingCommand(false);
    }
  };

  const loadEquipos = useCallback(async (serial?: string) => {
    setLoading(true);
    try {
      const res = await api.itActivos.list(serial ? { serial } : undefined);
      setEquipos(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar el inventario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEquipos();
    api.itActivos.getAreas()
      .then((res: any) => setAreas(res.data || []))
      .catch(() => {});
  }, [loadEquipos]);

  const applyJsonData = (data: any) => {
    setForm(prev => ({
      ...prev,
      serial_number: data.serial_number || prev.serial_number,
      hostname: data.hostname || prev.hostname,
      system_user: data.system_user || prev.system_user,
      brand: data.brand || prev.brand,
      model: data.model || prev.model,
      os_name: data.os_name || prev.os_name,
      os_version: data.os_version || prev.os_version,
      os_license_status: data.os_license_status || prev.os_license_status,
      office_version: data.office_version || prev.office_version,
      office_license_status: data.office_license_status || prev.office_license_status,
      peripherals: Array.isArray(data.peripherals) ? data.peripherals : prev.peripherals,
    }));
    toast.success('Datos del equipo precargados desde el archivo JSON');
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.json')) {
      toast.error('El archivo debe tener extensión .json');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        applyJsonData(data);
      } catch {
        toast.error('El archivo JSON no tiene un formato válido');
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const buscarPorSerial = async () => {
    if (!form.serial_number.trim()) return;
    try {
      const res = await api.itActivos.getBySerial(form.serial_number.trim());
      if (res.data) {
        setForm({ ...emptyForm, ...res.data, peripherals: res.data.peripherals || [] });
        toast.success('Equipo existente cargado — se actualizará al guardar');
      }
    } catch {
      // No existe todavía — se continúa con el registro nuevo, sin mostrar error
    }
  };

  const addPeripheral = () => {
    const value = peripheralInput.trim();
    if (!value) return;
    setForm(prev => ({ ...prev, peripherals: [...prev.peripherals, value] }));
    setPeripheralInput('');
  };

  const removePeripheral = (idx: number) => {
    setForm(prev => ({ ...prev, peripherals: prev.peripherals.filter((_, i) => i !== idx) }));
  };

  const resetForm = () => {
    setForm({ ...emptyForm });
    setPeripheralInput('');
  };

  const handleSave = async () => {
    if (!form.serial_number.trim()) return toast.error('El número de serie es obligatorio');
    if (!form.assigned_to_name.trim() || !form.assigned_to_id.trim()) {
      return toast.error('Nombre y documento del custodio son obligatorios');
    }
    if (!form.department) return toast.error('Seleccione el área / departamento');
    if (!form.location.trim()) return toast.error('Ingrese la ubicación física del equipo');
    if (!form.conformity_accepted) return toast.error('Debe confirmar la conformidad de la asignación');

    setSaving(true);
    try {
      await api.itActivos.upsert(form);
      toast.success('Equipo inventariado correctamente');
      resetForm();
      loadEquipos();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar el inventario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Icons.Laptop />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Inventarios Activos</h1>
            <p className="text-sm text-slate-400">Captura e inventario de equipos (PC / Laptops) — GESTIÓN TI</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleCopyInstallCommand}
            disabled={generatingCommand}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
          >
            <Icons.CheckCircle /> {generatingCommand ? 'Generando…' : `Copiar comando de instalación (${detectedShellLabel})`}
          </button>
          <button
            onClick={() => api.itActivos.downloadScript().catch((e: any) => toast.error(e.message))}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700"
          >
            <Icons.Download /> Descargar archivo ({detectedOsLabel})
          </button>
        </div>
      </div>

      {installCommand && (
        <div className="bg-slate-900/60 border border-emerald-700/40 rounded-lg p-4 text-sm text-slate-200">
          <p className="text-xs text-emerald-400 font-bold uppercase tracking-wide mb-2">
            Pega esto en {detectedShellLabel} del equipo del custodio — un solo uso, expira en 15 minutos
          </p>
          <code className="block bg-slate-950 border border-slate-700 rounded px-3 py-2 font-mono text-xs text-emerald-300 overflow-x-auto whitespace-nowrap">
            {installCommand}
          </code>
          <p className="text-xs text-slate-500 mt-2">
            {detectedOs === 'windows'
              ? 'Si PowerShell bloquea la ejecución de scripts, ejecuta PowerShell como Administrador y vuelve a pegar el comando.'
              : 'El script pedirá tu contraseña de sudo — es necesaria para leer el número de serie real del equipo. Si no la ingresas, el inventario se envía igual pero con datos de hardware incompletos.'}
          </p>
        </div>
      )}

      {/* Drag & Drop JSON */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-700 bg-slate-900/40'
        }`}
      >
        <Icons.Upload />
        <p className="text-sm text-slate-300 mt-2">Arrastra aquí el archivo JSON generado por el script de inventario</p>
        <p className="text-xs text-slate-500 mt-1">o</p>
        <label className="inline-block mt-2 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer border border-slate-700">
          Seleccionar archivo
          <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
      </div>

      {/* Formulario */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5 space-y-5">
        <div>
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide mb-3">Datos detectados del equipo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400">Número de serie *</label>
              <div className="flex gap-2">
                <input
                  value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  onBlur={buscarPorSerial}
                  className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm"
                  placeholder="Ej. 5CD1234ABC"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400">Marca</label>
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Modelo</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Hostname</label>
              <input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Usuario del sistema</label>
              <input value={form.system_user} onChange={(e) => setForm({ ...form, system_user: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Sistema Operativo</label>
              <input value={form.os_name} onChange={(e) => setForm({ ...form, os_name: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Versión SO</label>
              <input value={form.os_version} onChange={(e) => setForm({ ...form, os_version: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Estado Licencia SO</label>
              <input value={form.os_license_status} onChange={(e) => setForm({ ...form, os_license_status: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Versión Office</label>
              <input value={form.office_version} onChange={(e) => setForm({ ...form, office_version: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Estado Licencia Office</label>
              <input value={form.office_license_status} onChange={(e) => setForm({ ...form, office_license_status: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs text-slate-400">Periféricos conectados</label>
            <div className="flex gap-2">
              <input
                value={peripheralInput}
                onChange={(e) => setPeripheralInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPeripheral(); } }}
                placeholder="Ej. Mouse Logitech — Enter para agregar"
                className="flex-1 border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm"
              />
              <button onClick={addPeripheral} className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm border border-slate-700">Agregar</button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {form.peripherals.map((p, i) => (
                <span key={i} className="flex items-center gap-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs px-2 py-1 rounded-full">
                  {p}
                  <button onClick={() => removePeripheral(i)} className="text-slate-500 hover:text-red-400">×</button>
                </span>
              ))}
              {form.peripherals.length === 0 && <span className="text-xs text-slate-500">Ninguno registrado</span>}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide mb-3">Datos del custodio</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400">Nombre completo *</label>
              <input value={form.assigned_to_name} onChange={(e) => setForm({ ...form, assigned_to_name: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Documento de identidad *</label>
              <input value={form.assigned_to_id} onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Área / Departamento *</label>
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm">
                <option value="">Seleccione…</option>
                {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Ubicación física *</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Ej. Barranquilla, Sede Principal / Teletrabajo"
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Estado físico del equipo *</label>
              <select value={form.physical_condition} onChange={(e) => setForm({ ...form, physical_condition: e.target.value })}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm">
                {ESTADOS_FISICOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-slate-400">Observaciones</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} placeholder="Novedades en teclado, pantalla, cargador, etc."
              className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.conformity_accepted}
              onChange={(e) => setForm({ ...form, conformity_accepted: e.target.checked })}
              className="w-4 h-4" />
            Confirmo la conformidad de la asignación del equipo descrito
          </label>
          <div className="flex gap-2">
            <button onClick={resetForm} className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm border border-slate-700">
              Limpiar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
              <Icons.CheckCircle /> {saving ? 'Guardando…' : 'Guardar e Inventariar'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de inventario */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Equipos inventariados</h2>
          <div className="flex gap-2">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadEquipos(searchTerm)}
              placeholder="Buscar por serial…"
              className="border border-slate-700 bg-slate-950 text-slate-100 rounded-md px-3 py-1.5 text-sm"
            />
            <button onClick={() => loadEquipos(searchTerm)} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm border border-slate-700">
              <Icons.Search />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-3">Serial</th>
                <th className="py-2 pr-3">Custodio</th>
                <th className="py-2 pr-3">Área</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Actualizado</th>
                <th className="py-2 pr-3">Acta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && <tr><td colSpan={6} className="py-4 text-center text-slate-500">Cargando…</td></tr>}
              {!loading && equipos.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-500">Sin registros</td></tr>}
              {equipos.map(eq => (
                <tr key={eq.id} className="text-slate-200">
                  <td className="py-2 pr-3 font-mono text-xs">{eq.serial_number}</td>
                  <td className="py-2 pr-3">{eq.assigned_to_name || '—'}</td>
                  <td className="py-2 pr-3">{eq.department || '—'}</td>
                  <td className="py-2 pr-3">{eq.physical_condition || '—'}</td>
                  <td className="py-2 pr-3 text-xs text-slate-400">{eq.updated_at ? new Date(eq.updated_at).toLocaleString('es-CO') : '—'}</td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => api.itActivos.downloadActaPdf(eq.id, eq.serial_number).catch((e: any) => toast.error(e.message))}
                      className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs"
                    >
                      <Icons.FileText /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventarioActivosTI;
