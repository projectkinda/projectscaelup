$ErrorActionPreference = 'Stop'

$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'G:\AndroidSDK' }
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$emulator = Join-Path $sdkRoot 'emulator\emulator.exe'

if (!(Test-Path -LiteralPath $adb)) {
  throw "Android adb was not found under $sdkRoot. Set ANDROID_HOME and try again."
}

Write-Host 'Connected Android devices:'
$devices = @(& $adb devices -l | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice\s' })
if ($devices.Count -eq 0) {
  Write-Host '  none'
} else {
  foreach ($device in $devices) {
    $line = $device.ToString().Trim()
    $serial = ($line -split '\s+')[0]
    $modelMatch = [regex]::Match($line, 'model:([^\s]+)')
    $model = if ($modelMatch.Success) { $modelMatch.Groups[1].Value } else { $serial }
    $kind = if ($serial -match '^emulator-\d+$') { 'emulator' } else { 'usb' }
    Write-Host "  $model [$serial] ($kind)"
  }
}

Write-Host ''
Write-Host 'Installed Android emulators:'
if (Test-Path -LiteralPath $emulator) {
  $avds = @(& $emulator -list-avds)
  if ($avds.Count -eq 0) {
    Write-Host '  none'
  } else {
    foreach ($avd in $avds) {
      Write-Host "  $avd"
    }
  }
} else {
  Write-Host '  emulator.exe not found'
}
