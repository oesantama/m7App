# Testing - M7 App

## Configuración

- **Framework:** Vitest
- **Testing Library:** @testing-library/react + jest-dom
- **Entorno:** jsdom (simula navegador)

## Comandos

```bash
npm test              # Modo watch
npm test -- --run     # Ejecutar una vez
npm run test:ui       # UI interactiva
npm run test:coverage # Reporte de cobertura
```

## Tests Implementados

### routeUtils.test.ts (25 tests)

✅ calculateTotalVolume (3 casos)
✅ calculateUtilization (3 casos)
✅ normalizeCityKey (3 casos)
✅ detectPriority (3 casos)
✅ detectTime (2 casos)
✅ checkCapacityStatus (4 casos)
✅ getDominantCity (3 casos)
✅ calculateFleetDeficit (2 casos)
✅ OPTIMIZATION_CONSTANTS (1 caso)

### mapUtils.test.ts (10 tests)

✅ M7_HUB_ORIGIN (1 caso)
✅ calculateDistance (3 casos)
✅ normalizeCityName (3 casos)

**Total:** 35 tests pasando

## Próximos Tests

- [ ] useAppStore (Zustand store)
- [ ] Componentes React (LogisticsDispatch, RoutePlanner)
- [ ] API integration tests
- [ ] E2E con Playwright

## Cobertura

Objetivo: >80% para utilidades críticas
