param(
  [Alias('Avd')]
  [string]$Target
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'G:\AndroidSDK' }
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$emulator = Join-Path $sdkRoot 'emulator\emulator.exe'
$expoPort = 8082

if (!(Test-Path -LiteralPath $adb)) {
  throw "Android adb was not found under $sdkRoot. Set ANDROID_HOME and try again."
}

function Get-AvailableAvds {
  if (!(Test-Path -LiteralPath $emulator)) {
    return @()
  }

  return @(& $emulator -list-avds)
}

function Get-AdbDevices {
  return @(& $adb devices -l | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice\s' } | ForEach-Object {
    $line = $_.ToString().Trim()
    $serial = ($line -split '\s+')[0]
    $modelMatch = [regex]::Match($line, 'model:([^\s]+)')
    $productMatch = [regex]::Match($line, 'product:([^\s]+)')
    [PSCustomObject]@{
      Serial = $serial
      Model = if ($modelMatch.Success) { $modelMatch.Groups[1].Value } else { $serial }
      Product = if ($productMatch.Success) { $productMatch.Groups[1].Value } else { '' }
      IsEmulator = $serial -match '^emulator-\d+$'
    }
  })
}

function Get-EmulatorSerials {
  return @((Get-AdbDevices) | Where-Object { $_.IsEmulator } | ForEach-Object { $_.Serial })
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

function Resolve-Target([string]$Name) {
  $devices = @(Get-AdbDevices)
  $availableAvds = @(Get-AvailableAvds)

  if (!$Name) {
    $physicalDevices = @($devices | Where-Object { !$_.IsEmulator })
    if ($physicalDevices.Count -eq 1) {
      return [PSCustomObject]@{
        Serial = $physicalDevices[0].Serial
        Name = "$($physicalDevices[0].Model) ($($physicalDevices[0].Serial))"
        IsEmulator = $false
        AvdName = $null
      }
    }

    if ($devices.Count -eq 1) {
      return [PSCustomObject]@{
        Serial = $devices[0].Serial
        Name = "$($devices[0].Model) ($($devices[0].Serial))"
        IsEmulator = $devices[0].IsEmulator
        AvdName = $null
      }
    }

    $choices = @()
    $choices += $physicalDevices | ForEach-Object { "$($_.Model) [$($_.Serial)]" }
    $choices += $availableAvds | ForEach-Object { "$_ [emulator]" }
    throw "Multiple Android targets are available. Pass -Target with one of: $($choices -join ', ')"
  }

  $connected = @($devices | Where-Object {
    $_.Serial -eq $Name -or $_.Model -eq $Name -or "$($_.Model) ($($_.Serial))" -eq $Name
  })

  if ($connected.Count -gt 0) {
    return [PSCustomObject]@{
      Serial = $connected[0].Serial
      Name = "$($connected[0].Model) ($($connected[0].Serial))"
      IsEmulator = $connected[0].IsEmulator
      AvdName = $null
    }
  }

  if ($Name -in $availableAvds) {
    return [PSCustomObject]@{
      Serial = $null
      Name = $Name
      IsEmulator = $true
      AvdName = $Name
    }
  }

  $choices = @()
  $choices += $devices | ForEach-Object { "$($_.Model) [$($_.Serial)]" }
  $choices += $availableAvds | ForEach-Object { "$_ [emulator]" }
  throw "Android target '$Name' was not found. Available targets: $($choices -join ', ')"
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

$targetInfo = Resolve-Target $Target
$serial = $targetInfo.Serial

if (!$serial -and $targetInfo.AvdName) {
  if (!(Test-Path -LiteralPath $emulator)) {
    throw "Android emulator was not found under $sdkRoot. Set ANDROID_HOME and try again."
  }

  Write-Host "Starting Android emulator: $($targetInfo.AvdName)"
  $beforeSerials = @(Get-EmulatorSerials)
  Start-Process -FilePath $emulator -ArgumentList @('-avd', $targetInfo.AvdName, '-no-snapshot-load', '-no-metrics')

  $deadline = (Get-Date).AddMinutes(3)
  while (!$serial -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $serial = Get-AvdSerial $targetInfo.AvdName
    if (!$serial) {
      $serial = Get-NewSerial $beforeSerials
    }
  }

  if (!$serial) {
    $connected = @(Get-EmulatorSerials)
    throw "The '$($targetInfo.AvdName)' emulator did not become available within three minutes. Connected emulators: $($connected -join ', ')"
  }
}

if (!$serial) {
  throw "No Android device serial could be resolved for target '$Target'."
}

Write-Host "Waiting for $($targetInfo.Name) to finish booting..."
& $adb -s $serial wait-for-device | Out-Null
$deadline = (Get-Date).AddMinutes(3)
do {
  $booted = (& $adb -s $serial shell getprop sys.boot_completed 2>$null).Trim()
  if ($booted -eq '1') { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

if ($booted -ne '1') {
  throw "The '$($targetInfo.Name)' Android target did not finish booting within three minutes."
}

if ($targetInfo.IsEmulator) {
  & $adb -s $serial shell wm size reset 2>$null | Out-Null
}

$expoGoInstalled = & $adb -s $serial shell pm path host.exp.exponent 2>$null
if (!$expoGoInstalled) {
  $expoGoApk = Get-ChildItem "$env:USERPROFILE\.expo\android-apk-cache\Expo-Go-*.apk" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (!$expoGoApk) {
    throw 'Expo Go is not installed and no cached Expo Go APK was found. Run npm run android once to download it.'
  }

  Write-Host "Installing Expo Go on $($targetInfo.Name)..."
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

Write-Host "Project ScaleUp is running in Expo Go on $($targetInfo.Name)."
