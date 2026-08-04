<#
    OrbitM7 - Agente de Inventario de Activos Tecnologicos
    Milla 7 S.A.S.

    Este script recolecta informacion de hardware, sistema operativo, licenciamiento
    de Office y perifericos conectados, y la envia automaticamente a OrbitM7.

    Uso:
      - Doble clic para ejecutar una sola vez, o
      - Programar como tarea de inicio de sesion via GPO / Task Scheduler para
        que se ejecute periodicamente en cada equipo.

    Este archivo se descarga desde OrbitM7 (modulo GESTION TI > Inventarios Activos)
    con la URL y la API Key ya configuradas — no requiere edicion manual.
#>

$ApiUrl = "__API_URL__"
$ApiKey = "__API_KEY__"
$Endpoint = "$ApiUrl/api/it-activos/upload-json"

function Get-SafeValue {
    param($Value, $Default = "")
    if ($null -eq $Value -or $Value -eq "") { return $Default }
    return $Value
}

try {
    $cs  = Get-CimInstance -ClassName Win32_ComputerSystem
    $os  = Get-CimInstance -ClassName Win32_OperatingSystem
    $bios = Get-CimInstance -ClassName Win32_BIOS

    $hostname    = Get-SafeValue $env:COMPUTERNAME
    $systemUser  = Get-SafeValue "$env:USERDOMAIN\$env:USERNAME"
    $brand       = Get-SafeValue $cs.Manufacturer
    $model       = Get-SafeValue $cs.Model
    $serial      = Get-SafeValue $bios.SerialNumber
    $osName      = Get-SafeValue $os.Caption
    $osVersion   = Get-SafeValue $os.Version

    # Estado de activación de Windows
    $osLicenseStatus = "Desconocido"
    try {
        $licenseInfo = (cscript.exe //Nologo "$env:SystemRoot\System32\slmgr.vbs" /dli) 2>$null
        if ($licenseInfo -match "licensed") { $osLicenseStatus = "Activado" }
        elseif ($licenseInfo -match "notification") { $osLicenseStatus = "No activado" }
    } catch { }

    # Version y licencia de Office (busca en el registro las versiones instaladas)
    $officeVersion = "No detectado"
    $officeLicenseStatus = "Desconocido"
    try {
        $officeKeys = Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Office" -ErrorAction SilentlyContinue |
            Where-Object { $_.PSChildName -match "^\d+\.\d+$" }
        if ($officeKeys) {
            $latest = $officeKeys | Sort-Object PSChildName -Descending | Select-Object -First 1
            $officeVersion = "Office $($latest.PSChildName)"
        }
        $ospp = Get-ChildItem "C:\Program Files\Microsoft Office\Office16" -Filter "OSPP.VBS" -ErrorAction SilentlyContinue
        if ($ospp) {
            $result = (cscript.exe //Nologo $ospp.FullName /dstatus) 2>$null
            if ($result -match "LICENSED") { $officeLicenseStatus = "Activado" }
            elseif ($result -match "NOTIFICATIONS") { $officeLicenseStatus = "No activado" }
        }
    } catch { }

    # Perifericos conectados (HID, impresoras, monitores)
    $peripherals = @()
    try {
        $devices = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
            Where-Object { $_.Class -in @("HIDClass", "Printer", "Monitor", "Keyboard", "Mouse") }
        $peripherals = $devices | ForEach-Object { $_.FriendlyName } | Select-Object -Unique
    } catch { }

    $payload = @{
        serial_number   = $serial
        hostname        = $hostname
        system_user     = $systemUser
        brand           = $brand
        model           = $model
        os_name         = $osName
        os_version      = $osVersion
        os_license_status = $osLicenseStatus
        office_version  = $officeVersion
        office_license_status = $officeLicenseStatus
        peripherals     = $peripherals
    }

    $json = $payload | ConvertTo-Json -Depth 5

    Invoke-RestMethod -Uri $Endpoint -Method Post `
        -Headers @{ "X-API-Key" = $ApiKey } `
        -Body $json -ContentType "application/json; charset=utf-8" | Out-Null

    Write-Host "Inventario enviado correctamente a OrbitM7 (Serial: $serial)."
} catch {
    Write-Host "Error al recolectar o enviar el inventario: $($_.Exception.Message)"
    exit 1
}
