# Recompila e instala APENAS o ChegoJá Cliente no dispositivo indicado
param([string]$DeviceId = "")

$NODE     = "C:\dev\nodejs\node.exe"
$ADB      = "C:\dev\android-sdk\platform-tools\adb.exe"
$ANDROID  = "$PSScriptRoot\android"
$ROOT     = $PSScriptRoot

$env:JAVA_HOME = "C:\dev\jdk-21\jdk-21.0.7+6"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:ANDROID_HOME = "C:\dev\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

function Set-AndroidApp($AppId, $AppName) {
    $buildGradle = "$ANDROID\app\build.gradle"
    $strings     = "$ANDROID\app\src\main\res\values\strings.xml"
    $capConfig   = "$ROOT\capacitor.config.ts"

    (Get-Content $buildGradle) -replace 'applicationId ".*?"', "applicationId `"$AppId`"" | Set-Content $buildGradle

    $stringsContent = @"
<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">$AppName</string>
    <string name="title_activity_main">$AppName</string>
    <string name="package_name">$AppId</string>
    <string name="custom_url_scheme">$AppId</string>
</resources>
"@
    Set-Content $strings $stringsContent -Encoding UTF8

    $capContent = @"
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: '$AppId',
    appName: '$AppName',
    webDir: 'dist',
    server: {
        androidScheme: 'https'
    }
};

export default config;
"@
    Set-Content $capConfig $capContent -Encoding UTF8
}

Set-Location $ROOT
Copy-Item ".env.client" ".env.local" -Force
$env:VITE_APP_ROLE = "client"

Write-Host "Compilando Vite (client)..."
& $NODE "$ROOT\node_modules\vite\bin\vite.js" build 2>&1
if (-not (Test-Path "$ROOT\dist\index.html")) { Write-Host "[ERRO] Vite build falhou"; exit 1 }

Set-AndroidApp "br.com.client.chegoja" "ChegoJá Cliente"

$dst = "$ANDROID\app\src\main\assets\public"
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item "$ROOT\dist" $dst -Recurse -Force

Write-Host "Compilando APK..."
Set-Location $ANDROID
& ".\gradlew.bat" assembleDebug 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) { Write-Host "[ERRO] Gradle falhou"; Set-Location $ROOT; exit 1 }
Set-Location $ROOT

# Guarda copia do APK do cliente para reinstalacoes futuras
Copy-Item "$ANDROID\app\build\outputs\apk\debug\app-debug.apk" "$ROOT\chegoja-cliente-debug.apk" -Force

# Detectar dispositivo se não especificado
if ([string]::IsNullOrEmpty($DeviceId)) {
    Write-Host "Buscando dispositivos conectados..."
    $devices = @(& $ADB devices | Where-Object { $_ -match "device$" } | ForEach-Object { ($_ -split "\s+")[0] })
    if ($devices.Count -eq 0) {
        Write-Host "[AVISO] Nenhum dispositivo Android conectado via USB foi detectado pelo ADB."
        Write-Host "Certifique-se de que:"
        Write-Host "  1. O celular está conectado ao computador via cabo USB (dados)."
        Write-Host "  2. A 'Depuração USB' está ativada nas Opções do Desenvolvedor no celular."
        Write-Host "  3. Você autorizou o computador na tela do celular."
        Write-Host "`nO APK novo foi gerado com sucesso em: $ROOT\chegoja-cliente-debug.apk"
        Set-AndroidApp "br.com.client.chegoja" "chegoja"
        exit 1
    } elseif ($devices.Count -eq 1) {
        $DeviceId = $devices[0]
        Write-Host "Dispositivo detectado automaticamente: $DeviceId"
    } else {
        $DeviceId = $devices[0]
        Write-Host "Vários dispositivos detectados: $($devices -join ', ')."
        Write-Host "Instalando no primeiro dispositivo: $DeviceId"
    }
}

Write-Host "Instalando no dispositivo $DeviceId... (se aparecer popup no celular, ACEITE)"
$result = & $ADB -s $DeviceId install -r -d "$ROOT\chegoja-cliente-debug.apk" 2>&1
$result

$hasSuccess = $false
foreach ($line in $result) {
    if ($line -match "\bSuccess\b") {
        $hasSuccess = $true
        break
    }
}

if ($hasSuccess) {
    Write-Host "[OK] ChegoJá Cliente instalado em $DeviceId"
    Set-AndroidApp "br.com.client.chegoja" "chegoja"
    exit 0
} else {
    Write-Host "[ERRO] Instalacao falhou"
    Set-AndroidApp "br.com.client.chegoja" "chegoja"
    exit 1
}
