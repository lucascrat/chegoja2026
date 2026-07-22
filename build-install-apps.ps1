# ============================================================
# build-install-apps.ps1
# Compila e instala ChegoJá Cliente e ChegoJá Motorista
# nos dois celulares conectados via ADB
# ============================================================

$NODE     = "C:\dev\nodejs\node.exe"
$NPM      = "C:\dev\nodejs\npm.cmd"
$ADB      = "C:\dev\android-sdk\platform-tools\adb.exe"
$ANDROID  = "$PSScriptRoot\android"
$ROOT     = $PSScriptRoot

# Detectar JAVA_HOME (precisa para o Gradle)
$env:JAVA_HOME = "C:\dev\jdk-21\jdk-21.0.7+6"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

# Detectar Android SDK
$env:ANDROID_HOME = "C:\dev\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

function Log($msg) { Write-Host $msg -ForegroundColor Cyan }
function Ok($msg)  { Write-Host "[OK] $msg" -ForegroundColor Green }
function Err($msg) { Write-Host "[ERRO] $msg" -ForegroundColor Red }

# === Verificar dispositivos ===
Log "`nVerificando dispositivos ADB..."
$devices = & $ADB devices | Where-Object { $_ -match "device$" } | ForEach-Object { ($_ -split "\s+")[0] }

if ($devices.Count -lt 2) {
    Err "Precisamos de 2 dispositivos conectados e autorizados. Encontrado(s): $($devices.Count)"
    Err "Verifique se ambos estão com depuração USB ativada e autorizaram a conexão."
    $devices | ForEach-Object { Write-Host "  - $_" }
    exit 1
}

$DEVICE_CLIENT = $devices[0]
$DEVICE_DRIVER = $devices[1]

Log "Dispositivo CLIENTE : $DEVICE_CLIENT"
Log "Dispositivo MOTORISTA: $DEVICE_DRIVER"
Write-Host ""

# === Funcao: trocar appId/nome no Android ===
function Set-AndroidApp($AppId, $AppName) {
    $buildGradle = "$ANDROID\app\build.gradle"
    $strings     = "$ANDROID\app\src\main\res\values\strings.xml"
    $manifest    = "$ANDROID\app\src\main\AndroidManifest.xml"
    $capConfig   = "$ROOT\capacitor.config.ts"

    # build.gradle — apenas applicationId muda; namespace fica igual ao package Java
    (Get-Content $buildGradle) -replace 'applicationId ".*?"', "applicationId `"$AppId`"" | Set-Content $buildGradle

    # strings.xml — nome do app
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

    # capacitor.config.ts
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

# === Funcao: copiar assets web para o Android ===
function Sync-WebAssets {
    $src = "$ROOT\dist"
    $dst = "$ANDROID\app\src\main\assets\public"
    Log "  Copiando assets web -> Android..."
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    Copy-Item $src $dst -Recurse -Force
    Ok "  Assets copiados."
}

# === Funcao: build Gradle -> APK debug ===
function Build-Apk($Label) {
    Log "  Compilando APK ($Label)..."
    Set-Location $ANDROID
    $result = & ".\gradlew.bat" assembleDebug 2>&1
    if ($LASTEXITCODE -ne 0) {
        Err "  Gradle falhou para $Label"
        $result | Select-Object -Last 20
        Set-Location $ROOT
        return $false
    }
    Set-Location $ROOT
    Ok "  APK $Label compilado."
    return $true
}

# === Funcao: instalar APK no dispositivo ===
function Install-Apk($DeviceId, $Label) {
    $apk = "$ANDROID\app\build\outputs\apk\debug\app-debug.apk"
    Log "  Instalando $Label no dispositivo $DeviceId..."
    $result = & $ADB -s $DeviceId install -r -d $apk 2>&1
    if ($result -match "Success") {
        Ok "  $Label instalado em $DeviceId"
        return $true
    } else {
        Err "  Falha ao instalar $Label em $DeviceId"
        $result
        return $false
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# APP CLIENTE
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`n===========================================" -ForegroundColor Yellow
Write-Host "  CONSTRUINDO APP CLIENTE" -ForegroundColor Yellow
Write-Host "===========================================" -ForegroundColor Yellow

Set-Location $ROOT

# Copiar env do cliente
Copy-Item ".env.client" ".env.local" -Force
Log "  Env: VITE_APP_ROLE=client"

# Build Vite
Log "  Compilando com Vite (modo client)..."
$env:VITE_APP_ROLE = "client"
& $NODE (& $NODE -e "require('path').resolve(__dirname,'node_modules/.bin/vite')" 2>$null) build 2>&1 | Out-Null
# Fallback direto
if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$ROOT\dist\index.html")) {
    & $NODE "$ROOT\node_modules\vite\bin\vite.js" build 2>&1
}

if (-not (Test-Path "$ROOT\dist\index.html")) {
    Err "Build Vite falhou. Verifique node_modules."
    exit 1
}
Ok "  Vite build (client) concluído."

# Configurar Android para cliente
Set-AndroidApp "br.com.client.chegoja" "ChegoJá Cliente"
Sync-WebAssets

# Compilar e instalar
if (Build-Apk "Cliente") {
    Install-Apk $DEVICE_CLIENT "ChegoJá Cliente"
}

# ═══════════════════════════════════════════════════════════════════════════════
# APP MOTORISTA
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`n===========================================" -ForegroundColor Yellow
Write-Host "  CONSTRUINDO APP MOTORISTA" -ForegroundColor Yellow
Write-Host "===========================================" -ForegroundColor Yellow

Set-Location $ROOT

# Copiar env do motorista
Copy-Item ".env.driver" ".env.local" -Force
Log "  Env: VITE_APP_ROLE=driver"

# Build Vite
Log "  Compilando com Vite (modo driver)..."
$env:VITE_APP_ROLE = "driver"
& $NODE "$ROOT\node_modules\vite\bin\vite.js" build 2>&1
if (-not (Test-Path "$ROOT\dist\index.html")) {
    Err "Build Vite falhou para driver."
    exit 1
}
Ok "Vite build (driver) concluído."

# Configurar Android para motorista
Set-AndroidApp "com.chegojapro.motorista" "ChegoJá Motorista"
Sync-WebAssets

# Compilar e instalar
if (Build-Apk "Motorista") {
    Install-Apk $DEVICE_DRIVER "ChegoJá Motorista"
}

# ═══════════════════════════════════════════════════════════════════════════════
# RESTAURAR CONFIG ORIGINAL
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`n===========================================" -ForegroundColor DarkGray
Log "Restaurando configurações originais..."

Set-Location $ROOT
Copy-Item ".env.local.bak" ".env.local" -ErrorAction SilentlyContinue
Set-AndroidApp "br.com.client.chegoja" "chegoja"

Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
Write-Host "  INSTALAÇÃO CONCLUÍDA!" -ForegroundColor Green
Write-Host "  $DEVICE_CLIENT -> ChegoJá Cliente" -ForegroundColor Green
Write-Host "  $DEVICE_DRIVER -> ChegoJá Motorista" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
