$path = 'c:\Users\Admin\Documents\oscar\m7App\components\GestionDocumentosL.tsx'
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$replacements = @{
    'recepciÃ³n'    = 'recepción'
    'PÃ¡g'          = 'Pág'
    'AUDITORÃ A'    = 'AUDITORÍA'
    'AuditorÃ­a'    = 'Auditoría'
    'bÃºsqueda'     = 'búsqueda'
    'VALOR MÃ‰TODO' = 'VALOR MÉTODO'
    'MÃ‰TODO PAGO'  = 'MÉTODO PAGO'
    'recepciÃ³n'    = 'recepción'
}

foreach ($key in $replacements.Keys) {
    $content = $content.Replace($key, $replacements[$key])
}

[System.IO.File]::WriteAllText($path, $content, New-Object System.Text.UTF8Encoding($false))
