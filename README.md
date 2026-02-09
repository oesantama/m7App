# M7 Logistics - Sistema Integrado de Gestión Logística

## 🚀 Descripción

Sistema completo de gestión logística con estado global (Zustand), GPS tracking en tiempo real, optimización de rutas con IA, y chatbot inteligente powered by Gemini AI.

## ✨ Características Principales

- 📦 Gestión de Documentos y Facturas
- 🚚 Planificación y Optimización de Rutas (IA regenerativa)
- 📍 GPS Tracking en Tiempo Real
- 💬 Chatbot Inteligente 24/7 (Gemini AI)
- 📊 Dashboard Ejecutivo con KPIs
- 🎮 Sistema de Gamificación para Conductores (próximamente)
- 📱 Integración WhatsApp
- 🔒 Autenticación y Seguridad

## 🛠️ Stack Tecnológico

### Frontend

- **React 19** + TypeScript
- **Vite** - Build tool
- **Zustand** - Estado global
- **Leaflet** - Mapas interactivos
- **Tailwind CSS** - Estilos (opcional)
- **Vitest** + **React Testing Library** - Testing

### Backend

- **Node.js** + **Express**
- **PostgreSQL** - Base de datos
- **Gemini AI** - Chatbot e inteligencia artificial

### DevOps

- **Docker** + **Docker Compose**
- **GitHub Actions** - CI/CD (configuración pendiente)

## 📋 Requisitos

- Node.js 20+
- npm 10+
- Docker 24+ y Docker Compose 2+ (para producción)
- PostgreSQL 15+ (o usar Docker)
- API Key de Google Gemini AI

## 🚀 Inicio Rápido

### Desarrollo Local (sin Docker)

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd m7App

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 4. Frontend (Vite dev server)
npm run dev
# Abre http://localhost:5173

# 5. Backend (en otra terminal)
npm run server
# Corre en http://localhost:3001
```

### Con Docker (Recomendado para Producción)

```bash
# 1. Configurar .env
cp .env.example .env
# Editar con valores reales

# 2. Build y start
docker-compose up --build

# Frontend: http://localhost:5173
# Backend: http://localhost:3001
```

**⚠️ IMPORTANTE:** Si agregas nuevas dependencias npm, debes reconstruir:

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

Ver [docker_deployment.md](./brain/docker_deployment.md) para guía completa.

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm test

# Modo watch
npm test

# UI interactiva
npm run test:ui

# Cobertura
npm run test:coverage

# En Docker
docker-compose exec frontend npm test
```

**Tests actuales:** 26/31 pasando (84%)

## 📁 Estructura del Proyecto

```
m7App/
├── components/          # Componentes React
│   ├── App.tsx         # Componente raíz
│   ├── ChatbotWidget.tsx  # Chatbot IA
│   ├── LogisticsDispatch.tsx  # GPS tracking
│   ├── RoutePlanner.tsx       # Optimización de rutas
│   └── ...
├── stores/             # Zustand stores
│   └── useAppStore.ts  # Estado global
├── services/           # Servicios y APIs
│   ├── api.ts          # Cliente API
│   └── chatbot.ts      # Servicio de chatbot IA
├── utils/              # Utilidades
│   ├── mapUtils.ts     # Funciones geográficas
│   └── routeUtils.ts   # Cálculos de rutas
├── backend/            # Backend Node/Express
│   ├── server.ts
│   ├── controllers/
│   └── routes/
├── tests/              # Tests automatizados
│   ├── routeUtils.test.ts
│   └── mapUtils.test.ts
├── Dockerfile.frontend
├── Dockerfile.backend
├── docker-compose.yml
└── vitest.config.ts
```

## 🔐 Variables de Entorno

Configurables en `.env`:

```bash
# Base de datos
DATABASE_URL=postgresql://user:pass@host:5432/m7_db

# Gemini AI (Chatbot)
GEMINI_API_KEY=tu_api_key_aqui
VITE_GEMINI_API_KEY=tu_api_key_aqui

# Servidor
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=tu_secret_seguro

# WhatsApp (opcional)
EVOLUTION_API_KEY=tu_key
```

## 📖 Documentación

- [Walkthrough Completo](./brain/walkthrough.md) - Todo lo implementado
- [Análisis de Innovaciones Futuras](./brain/future_innovations.md) - 20+ ideas con roadmap
- [Deployment Docker](./brain/docker_deployment.md) - Guía Docker completa
- [Plan de Implementación](./brain/implementation_plan.md) - Migración a Zustand

## 🎯 Roadmap 2026

### Q1-Q2 2026 (Inmediato)

- [x] Testing automatizado
- [x] Chatbot IA básico
- [ ] Gamificación para conductores
- [ ] Dashboard ejecutivo con KPIs

### Q3-Q4 2026

- [ ] Portal de cliente premium
- [ ] Telemetría vehicular (OBD-II)
- [ ] Predicción de demanda (ML)
- [ ] APIs públicas + Swagger

Ver [future_innovations.md](./brain/future_innovations.md) para roadmap completo.

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add: Amazing Feature'`)
4. Push a branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

**Estándares de código:**

- TypeScript estricto
- Tests para funciones críticas
- Documentación inline
- Commits semánticos

## 📝 Licencia

Propietario - M7 Logistics © 2026

## 👥 Equipo

Desarrollado con ❤️ por el equipo de M7 Logistics

## 📞 Soporte

- Email: soporte@m7logistics.com
- WhatsApp: +57 XXX XXX XXXX
- Chatbot IA: 24/7 en la aplicación

---

**Versión:** 1.0.0  
**Última actualización:** 2026-02-07
