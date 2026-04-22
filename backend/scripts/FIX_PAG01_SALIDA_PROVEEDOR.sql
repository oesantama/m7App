-- FIX: Restaurar PAG-01 = ARTICULOS y crear PAG-40 = SALIDA A PROVEEDOR
-- Causa: PAG-01 fue sobreescrito al crear "SALIDA A PROVEEDOR" manualmente desde el admin UI.
-- PAG-02 nunca existió en el sistema (el catálogo va PAG-01 → PAG-03).

-- 1. Restaurar PAG-01 a su valor original
UPDATE pages SET
    name      = 'ARTICULOS',
    route     = 'inventory/items',
    module_id = 'MOD-01',
    parent_id = 'MOD-01',
    status_id = 'EST-01'
WHERE id = 'PAG-01';

-- 2. Crear/actualizar PAG-40 = SALIDA A PROVEEDOR (idempotente)
INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
VALUES ('PAG-40', 'SALIDA A PROVEEDOR', 'salida-proveedor', 'MOD-03', 'MOD-03', 'EST-01')
ON CONFLICT (id) DO UPDATE SET
    name      = EXCLUDED.name,
    route     = EXCLUDED.route,
    module_id = EXCLUDED.module_id,
    parent_id = EXCLUDED.parent_id,
    status_id = EXCLUDED.status_id;

-- 3. Verificar resultado
SELECT id, name, route, module_id, parent_id FROM pages
WHERE id IN ('PAG-01', 'PAG-40')
ORDER BY id;
