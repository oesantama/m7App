$path = 'c:\Users\Admin\Documents\oscar\m7App\components\GestionDocumentosL.tsx'
$content = Get-Content $path -Raw -Encoding utf8
$content = $content -replace 'Ã¡', 'á'
$content = $content -replace 'Ã©', 'é'
$content = $content -replace 'Ã­', 'í'
$content = $content -replace 'Ã³', 'ó'
$content = $content -replace 'Ãº', 'ú'
$content = $content -replace 'Ã±', 'ñ'
$content = $content -replace 'Ã¡', 'á'
$content = $content -replace 'Ã ', 'á'
$content = $content -replace 'Ã³', 'ó'
$content = $content -replace 'Ã ', 'ó'
$content = $content -replace 'Ã­', 'í'
$content = $content -replace 'Ã ', 'í'
$content = $content -replace 'Ã¹', 'ú'
$content = $content -replace 'Ã ', 'ú'
$content = $content -replace 'Ã ', 'ñ'
$content = $content -replace 'Ãª', 'ê'
$content = $content -replace 'Ã', 'í'

# Let's use a more comprehensive regex for common UTF-8 double encoding issues
$dict = @{
    'Ã¡' = 'á'
    'Ã©' = 'é'
    'Ã­' = 'í'
    'Ã³' = 'ó'
    'Ãº' = 'ú'
    'Ã±' = 'ñ'
    'Ã'  = 'í' # Special case for broken í
}

foreach ($key in $dict.Keys) {
    $content = $content -replace $key, $dict[$key]
}

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
