# Manual de Usuario — FleetManager

> **Sistema:** OrbitM7 — Milla 7 Logística
> **Módulo:** `FleetManager`
> **Versión:** Generado automáticamente
> **Fecha:** 17 de junio de 2026

---

## Descripción general

Gestión integral de la flota de vehículos: registro, mantenimiento, documentación y seguimiento de estado.

### Características principales

- Visualización de datos en tabla con paginación
- Búsqueda y filtros avanzados
- Exportación de datos (Excel / PDF)
- Diálogos y modales para acciones rápidas
- Carga de archivos y documentos
- Control de acceso por roles y permisos

---

## Requisitos de acceso

- Tener una cuenta activa en el sistema OrbitM7.
- Haber iniciado sesión con usuario y contraseña válidos.
- Contar con los permisos de módulo asignados por el administrador.
- Conexión estable a Internet (el sistema opera en la nube).

---

## Guía paso a paso

### 1. Acceso al módulo

1. Inicie sesión en [OrbitM7](https://orbitm7.m7apps.com) con sus credenciales.
2. En el menú lateral izquierdo, localice y haga clic en **Fleet Manager**.
3. Espere a que el módulo cargue completamente (indicador de carga en la parte superior).

### 2. Búsqueda y filtros

1. Utilice la barra de búsqueda ubicada en la parte superior del módulo.
2. Escriba el término a buscar (nombre, código, fecha, etc.).
3. Use los filtros adicionales (desplegables) para acotar los resultados.
4. Haga clic en **Buscar** o presione **Enter** para aplicar.
5. Para limpiar los filtros, haga clic en el botón **Limpiar** o **Restablecer**.

### 3. Visualización de datos

1. Los registros se muestran en una tabla con columnas de información clave.
2. Haga clic en el encabezado de una columna para ordenar los datos.
3. Use la paginación inferior para navegar entre páginas de resultados.
4. Para ver el detalle de un registro, haga clic sobre la fila o en el ícono de **Ver detalle**.

### Exportación de datos

1. Aplique los filtros deseados para acotar los datos a exportar.
2. Haga clic en el botón **Exportar** (ícono de descarga).
3. Seleccione el formato: **Excel (.xlsx)** o **PDF**.
4. El archivo se descargará automáticamente en su carpeta de descargas.

### Carga de archivos

1. Haga clic en el botón **Cargar archivo** o arrastre el archivo a la zona indicada.
2. Formatos aceptados: PDF, Excel (.xlsx), imágenes (JPG, PNG).
3. Tamaño máximo permitido: 50 MB por archivo.
4. Espere la confirmación de carga exitosa antes de continuar.

---

## Ejemplos de uso

### Ejemplo 1: Flujo básico de operación

```
1. Acceda al módulo desde el menú lateral.
2. Use los filtros para localizar el registro deseado.
3. Seleccione el registro para ver su detalle.
4. Realice las acciones necesarias (editar, aprobar, exportar).
5. Confirme los cambios cuando el sistema lo solicite.
```

### Ejemplo 2: Operación con múltiples registros

```
1. Seleccione varios registros usando las casillas de verificación.
2. Use las acciones masivas disponibles en la barra superior.
3. Confirme la operación en el diálogo de confirmación.
4. Verifique el resultado en la notificación emergente.
```

---

## Solución de problemas (Troubleshooting)

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| El módulo no carga | Sin permisos o sesión expirada | Cierre sesión e inicie nuevamente |
| Datos desactualizados | Caché del navegador | Presione **Ctrl + F5** para recargar |
| No se puede guardar | Campos obligatorios vacíos | Revise los campos marcados en rojo |
| Error 403 al acceder | Permisos insuficientes | Contacte al administrador del sistema |
| La exportación falla | Demasiados registros | Aplique filtros para reducir el volumen |
| Botones no responden | JavaScript deshabilitado | Verifique que JS esté activo en el navegador |

---

## Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl + F` | Abrir búsqueda |
| `Esc` | Cerrar modal / cancelar acción |
| `Enter` | Confirmar acción / buscar |
| `Ctrl + S` | Guardar formulario |

---

## Referencias institucionales

![Logo Milla 7](../public/logo-m7.png)

| | |
|-|-|
| **Sistema** | OrbitM7 — Plataforma de Gestión Logística |
| **Empresa** | Milla 7 S.A.S. |
| **Soporte** | soporte@milla7.com.co |
| **Versión** | 2026.06 |

### Endpoints de API utilizados

| Endpoint | Descripción |
|----------|-------------|
| `/api/telemetry/health` | Operación de API |
| `/api/telemetry/vehicle/${plate}/latest` | Operación de API |
### Propiedades del componente

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `vehicles` | `Vehicle[]` | Propiedad `vehicles` |
| `drivers` | `Driver[]` | Propiedad `drivers` |
| `user` | `User` | Propiedad `user` |
| `masterData` | `{ [key in MasterCategory]?` | Propiedad `masterData` |

---

*Manual generado automáticamente por el sistema HelpDesk de OrbitM7.*
*Para reportar errores en este manual, use el chat de soporte integrado.*
