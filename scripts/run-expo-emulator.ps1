param(
  [Parameter(Mandatory = $true)]
  [string]$Avd
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'G:\AndroidSDK' }
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$emulator = Join-Path $sdkRoot 'emulator\emulator.exe'
$expoPort = 8082

if (!(Test-Path -LiteralPath $adb) -or !(Test-Path -LiteralPath $emulator)) {
  throw "Android SDK tools were not found under $sdkRoot. Set ANDROID_HOME and try again."
}

$availableAvds = @(& $emulator -list-avds)
if ($Avd -notin $availableAvds) {
  throw "Android emulator '$Avd' is not installed. Available emulators: $($availableAvds -join ', ')"
}

function Get-EmulatorSerials {
  return @(& $adb devices | Select-String '^emulator-\d+\s+device$' | ForEach-Object {
    ($_ -split '\s+')[0]
  })
}

function Get-AvdSerial([string]$Name) {
  $serials = @(Get-EmulatorSerials)

  foreach ($serial in $serials) {
    $runningName = (& $adb -s $serial shell getprop ro.boot.qemu.avd_name 2>$null).Trim()
    if (!$runningName) {
      $runningName = @(& $adb -s $serial emu avd name 2>$null)[0]
    }

    if ($runningName -and $runningName.Trim() -eq $Name) {
      return $serial
    }
  }

  return $null
}

function Get-NewSerial([string[]]$BeforeSerials) {
  $afterSerials = @(Get-EmulatorSerials)
  $newSerials = @($afterSerials | Where-Object { $_ -notin $BeforeSerials })

  if ($newSerials.Count -eq 1) {
    return $newSerials[0]
  }

  return $null
}

function Test-Port([int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $client.Connect('127.0.0.1', $Port)
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Stop-ExpoOnPort([int]$Port) {
  $listeners = @(netstat -ano | Select-String ":$Port\s" | ForEach-Object {
    $parts = $_.ToString().Trim() -split '\s+'
    if ($parts.Count -ge 5 -and $parts[3] -eq 'LISTENING') {
      [int]$parts[4]
    }
  } | Select-Object -Unique)

  foreach ($processId in $listeners) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

$serial = Get-AvdSerial $Avd
if (!$serial) {
  Write-Host "Starting Android emulator: $Avd"
  $beforeSerials = @(Get-EmulatorSerials)
  Start-Process -FilePath $emulator -ArgumentList @('-avd', $Avd, '-no-snapshot-load', '-no-metrics')

  $deadline = (Get-Date).AddMinutes(3)
  while (!$serial -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $serial = Get-AvdSerial $Avd
    if (!$serial) {
      $serial = Get-NewSerial $beforeSerials
    }
  }

  if (!$serial) {
    $connected = @(Get-EmulatorSerials)
    throw "The '$Avd' emulator did not become available within three minutes. Connected emulators: $($connected -join ', ')"
  }
}

Write-Host "Waiting for $Avd to finish booting..."
& $adb -s $serial wait-for-device | Out-Null
$deadline = (Get-Date).AddMinutes(3)
do {
  $booted = (& $adb -s $serial shell getprop sys.boot_completed 2>$null).Trim()
  if ($booted -eq '1') { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

if ($booted -ne '1') {
  throw "The '$Avd' emulator did not finish booting within three minutes."
}

& $adb -s $serial shell wm size reset 2>$null | Out-Null

$expoGoInstalled = & $adb -s $serial shell pm path host.exp.exponent 2>$null
if (!$expoGoInstalled) {
  $expoGoApk = Get-ChildItem "$env:USERPROFILE\.expo\android-apk-cache\Expo-Go-*.apk" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (!$expoGoApk) {
    throw 'Expo Go is not installed and no cached Expo Go APK was found. Run npm run android once to download it.'
  }

  Write-Host "Installing Expo Go on $Avd..."
  & $adb -s $serial install -r $expoGoApk.FullName | Out-Null
}

if (!(Test-Port $expoPort)) {
  Stop-ExpoOnPort $expoPort
  Write-Host "Starting Expo on port $expoPort..."
  $npm = 'C:\Program Files\nodejs\npm.cmd'
  $stdout = Join-Path $projectRoot '.expo-debug.log'
  $stderr = Join-Path $projectRoot '.expo-debug-error.log'
  Start-Process -FilePath $npm `
    -ArgumentList @('start', '--', '--host', 'lan', '--port', $expoPort, '--clear') `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden

  $deadline = (Get-Date).AddMinutes(2)
  while (!(Test-Port $expoPort) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
  }

  if (!(Test-Port $expoPort)) {
    throw "Expo did not start. Check $stderr for details."
  }
}

& $adb -s $serial reverse "tcp:$expoPort" "tcp:$expoPort" | Out-Null
& $adb -s $serial shell am start `
  -a android.intent.action.VIEW `
  -d "exp://127.0.0.1:$expoPort" `
  host.exp.exponent | Out-Null

Write-Host "Project ScaleUp is running in Expo Go on $Avd."
