$path = "c:\Users\Admin\Documents\oscar\m7App\components\GestionDocumentosL.tsx"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# 1. Correcciones masivas de Codificación (Tildes y más)
$replacements = @{
    "recepciÃ³n"      = "recepción"
    "recepciÃƒÂ³n"    = "recepción"
    "recepciÃƒfÃ'Â³n" = "recepción"
    "PÃ¡g"            = "Pág"
    "AUDITORÃ fA"     = "AUDITORÍA"
    "AUDITORÃ A"      = "AUDITORÍA"
    "AuditorÃ­a"      = "Auditoría"
    "AuditorÃfÂ­a"    = "Auditoría"
    "bÃºsqueda"       = "búsqueda"
    "VALOR MÃ‰TODO"   = "VALOR MÉTODO"
    "MÃ‰TODO PAGO"    = "MÉTODO PAGO"
    "MÃƒÂ‰TODO"       = "MÉTODO"
    "SincronizaciÃ³n" = "Sincronización"
    "ActualizaciÃ³n"  = "Actualización"
    "CreaciÃ³n"       = "Creación"
    "conexiÃ³n"       = "conexión"
    "BÃºsqueda"       = "Búsqueda"
    "PaginaciÃ³n"     = "Paginación"
    "InformaciÃ³n"    = "Información"
    "direcciÃ³n"      = "dirección"
    "DeduplicaciÃ³n"  = "Deduplicación"
}

foreach ($key in $replacements.Keys) {
    if ($content.Contains($key)) {
        $content = $content.Replace($key, $replacements[$key])
    }
}

# 2. Refinar Pestaña de Pagos (Eliminar SKU)
# Remover el header de SKU
$content = $content.Replace('<th className="py-6 px-4 font-black min-w-[150px]">SKU</th>', "")
# Remover la celda de SKU (buscando el patrón exacto)
$content = $content.Replace('<td className="py-5 px-4 uppercase font-bold text-slate-500">{it.articleId}</td>', "")

# 3. Guardar como UTF-8 sin BOM (Estándar Web)
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
