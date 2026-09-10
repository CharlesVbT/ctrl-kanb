param(
  [Parameter(Mandatory = $true)]
  [string]$Installer
)

$ErrorActionPreference = "Stop"
$processName = "ctrl-kanb-windows"
$installFolder = Join-Path $env:LOCALAPPDATA "CTRL KANB"
$executable = Join-Path $installFolder "ctrl-kanb-windows.exe"
$taskNames = @("CTRL KANB Validation A", "CTRL KANB Validation B")

Get-Process $processName -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath $Installer -ArgumentList "/S" -Wait
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Le programme installé est introuvable : $executable"
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
  executableSHA256 = (Get-FileHash $executable -Algorithm SHA256).Hash
  dataSeparated = Test-Path (Join-Path $env:LOCALAPPDATA "CTRL KANB Data")
  strayBoardInInstallFolder = [bool](Get-ChildItem $installFolder -Filter "board*.json" -ErrorAction SilentlyContinue)
}

foreach ($taskName in $taskNames) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}
if ($result.processCount -ne 1) {
  throw "Le verrou d’instance unique a laissé $($result.processCount) processus."
}
$result | ConvertTo-Json -Depth 4
