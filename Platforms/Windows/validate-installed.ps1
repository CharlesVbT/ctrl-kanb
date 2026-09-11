param(
  [Parameter(Mandatory = $true)]
  [string]$Installer
)

$ErrorActionPreference = "Stop"
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$processName = "ctrl-kanb-windows"
$installFolder = Join-Path $env:LOCALAPPDATA "CTRL KANB"
$executable = Join-Path $installFolder "ctrl-kanb-windows.exe"
$uninstaller = Join-Path $installFolder "uninstall.exe"
$dataFolder = Join-Path $env:LOCALAPPDATA "CTRL KANB Data"
$releaseFolder = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $Installer) "..\.."))
$builtExecutable = Join-Path $releaseFolder "ctrl-kanb-windows.exe"
$taskNames = @("CTRL KANB Validation A", "CTRL KANB Validation B")

function Get-PeSubsystem {
  param([Parameter(Mandatory = $true)][string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 256 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) {
    throw "Le programme installé n’est pas un exécutable PE valide : $Path"
  }
  $peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
  if ($peOffset -lt 0 -or ($peOffset + 94) -ge $bytes.Length) {
    throw "L’en-tête PE du programme installé est incomplet : $Path"
  }
  if ($bytes[$peOffset] -ne 0x50 -or $bytes[$peOffset + 1] -ne 0x45) {
    throw "La signature PE du programme installé est invalide : $Path"
  }
  return [BitConverter]::ToUInt16($bytes, $peOffset + 92)
}

function Get-NormalizedExecutableHash {
  param([Parameter(Mandatory = $true)][string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $marker = "BUNDLE_TYPE_VAR_"
  $ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
  $markerOffset = $ascii.IndexOf($marker, [StringComparison]::Ordinal)
  if ($markerOffset -lt 0) {
    throw "Le marqueur de paquetage Tauri est absent : $Path"
  }
  $bundleTypeOffset = $markerOffset + $marker.Length
  $bundleType = [System.Text.Encoding]::ASCII.GetString($bytes, $bundleTypeOffset, 3)
  if ($bundleType -notin @("UNK", "NSS")) {
    throw "Le marqueur de paquetage Tauri est inattendu ($bundleType) : $Path"
  }
  [System.Text.Encoding]::ASCII.GetBytes("UNK").CopyTo($bytes, $bundleTypeOffset)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace("-", "")
  } finally {
    $sha256.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $builtExecutable -PathType Leaf)) {
  throw "Le programme fraîchement construit est introuvable : $builtExecutable"
}
$builtHash = (Get-FileHash $builtExecutable -Algorithm SHA256).Hash
$builtNormalizedHash = Get-NormalizedExecutableHash -Path $builtExecutable
$dataPresentBeforeInstall = Test-Path -LiteralPath $dataFolder

Get-Process $processName -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
  Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait
  for ($attempt = 0; $attempt -lt 60 -and (Test-Path -LiteralPath $executable); $attempt++) {
    Start-Sleep -Milliseconds 500
  }
  if (Test-Path -LiteralPath $executable) {
    throw "L’ancienne version installée n’a pas été retirée : $executable"
  }
}
Start-Process -FilePath $Installer -ArgumentList "/S" -Wait
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Le programme installé est introuvable : $executable"
}
$installedHash = (Get-FileHash $executable -Algorithm SHA256).Hash
$installedNormalizedHash = Get-NormalizedExecutableHash -Path $executable
if ($installedNormalizedHash -ne $builtNormalizedHash) {
  throw "Le programme installé ne correspond pas au programme fraîchement construit."
}
$peSubsystem = Get-PeSubsystem -Path $executable
if ($peSubsystem -ne 2) {
  throw "Le programme installé utilise le sous-système PE $peSubsystem au lieu du mode graphique Windows (2)."
}

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
foreach ($taskName in $taskNames) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute $executable
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Force | Out-Null
}
Start-ScheduledTask -TaskName $taskNames[0]
Start-Sleep -Seconds 5
Start-ScheduledTask -TaskName $taskNames[1]
Start-Sleep -Seconds 4

$processes = @(Get-Process $processName -ErrorAction Stop)
$result = [ordered]@{
  installed = $true
  version = (Get-Item $executable).VersionInfo.ProductVersion
  processCount = $processes.Count
  sessionIDs = @($processes | Select-Object -ExpandProperty SessionId -Unique)
  responding = -not ($processes | Where-Object { -not $_.Responding })
  executableSHA256 = $installedHash
  builtExecutableSHA256 = $builtHash
  normalizedExecutableSHA256 = $installedNormalizedHash
  installerReplacedExecutable = $installedNormalizedHash -eq $builtNormalizedHash
  peSubsystem = $peSubsystem
  graphicalExecutable = $peSubsystem -eq 2
  dataSeparated = Test-Path -LiteralPath $dataFolder
  dataPreserved = (-not $dataPresentBeforeInstall) -or (Test-Path -LiteralPath $dataFolder)
  strayBoardInInstallFolder = [bool](Get-ChildItem $installFolder -Filter "board*.json" -ErrorAction SilentlyContinue)
}

foreach ($taskName in $taskNames) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}
if ($result.processCount -ne 1) {
  throw "Le verrou d’instance unique a laissé $($result.processCount) processus."
}
$result | ConvertTo-Json -Depth 4
