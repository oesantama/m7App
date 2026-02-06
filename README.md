# M7 - Sistema de Logística Premium

<div align="center">
  <img width="1200" height="auto" alt="M7 Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## Descripción Profesional

M7 es una plataforma de gestión logística integral diseñada para optimizar la planificación de rutas, auditoría de carga e inventario en tiempo real. Este sistema permite el control preciso de despachos mediante dos motores principales: **Plan Normal** y **Plan R**, cada uno con reglas de negocio específicas para el manejo de volúmenes, pesos y trazabilidad.

## Características Principales

- **Planeador de Rutas Inteligente**: Optimización basada en capacidad de vehículo y prioridades horarias.
- **Auditoría Integral (M7 Core)**: Sistema de doble conteo con autorización remota mediante códigos dinámicos.
- **Motor de Datos Híbrido**: Soporte para formatos internacionales de importación Excel (Normal vs R).
- **Gestión de Prioridades**: Detección automática de entregas críticas (7 AM, 8 AM, Primera Hora).

## Arquitectura Técnica

- **Frontend**: React.js + Vite + Tailwind CSS (Diseño Premium Dark/Glassmorphism).
- **Backend**: Node.js + Express.js.
- **Base de Datos**: PostgreSQL con lógica de migraciones consolidada.

## Despliegue en Producción

### 1. Base de Datos

Es fundamental ejecutar el script maestro de configuración antes de iniciar el sistema por primera vez:

```bash
psql -U tu_usuario -d tu_base_de_datos -f M7_PRODUCTION_SETUP.sql
```

### 2. Variables de Entorno

Configure un archivo `.env` en la raíz con los siguientes parámetros:

```env
PORT=3006
DATABASE_URL=postgres://usuario:password@host:port/db_m7
VITE_API_URL=/api
```

### 3. Instalación y Ejecución

```bash
npm install
npm run build
npm start
```

## Políticas de Desarrollo

- Mantener siempre la integridad referencial en `document_items`.
- Las reglas de negocio para decimales son sagradas: `Plan Normal (,)` vs `Plan R (.)`.
- No subir archivos `.env` ni scripts de diagnóstico local al repositorio.

---

**Desarrollado con estándares de excelencia Full-Stack para Milla 7.**
