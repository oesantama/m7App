$path = "c:\Users\Admin\Documents\oscar\m7App\components\GestionDocumentosL.tsx"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# 1. Correcciones de Codificación
$replacements = @{
    "recepciÃ³n"    = "recepción"
    "PÃ¡g"          = "Pág"
    "AUDITORÃ A"    = "AUDITORÍA"
    "AuditorÃ­a"    = "Auditoría"
    "bÃºsqueda"     = "búsqueda"
    "VALOR MÃ‰TODO" = "VALOR MÉTODO"
    "MÃ‰TODO PAGO"  = "MÉTODO PAGO"
    "AuditorÃ­a"    = "Auditoría"
    "AUDITORÃ fA"   = "AUDITORÍA"
    "AUDITORÃƒÂ"    = "AUDITORÍA"
}

foreach ($key in $replacements.Keys) {
    $content = $content.Replace($key, $replacements[$key])
}

# 2. Eliminar SKU de la tabla de Pagos
# Remover el header de SKU
$content = $content.Replace('<th className="py-6 px-4 font-black min-w-[150px]">SKU</th>', "")
# Remover la celda de SKU
$content = $content.Replace('<td className="py-5 px-4 uppercase font-bold text-slate-500">{it.articleId}</td>', "")

# 3. Guardar como UTF-8 sin BOM
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
