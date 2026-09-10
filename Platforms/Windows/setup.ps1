param(
  [switch]$InstallMissing
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $OutputEncoding

function Find-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-VisualCppTools {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) {
    return $false
  }

  $installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  return -not [string]::IsNullOrWhiteSpace(($installation | Select-Object -First 1))
}

function Test-WebView2Runtime {
  $clientId = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  $registryPaths = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$clientId",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$clientId",
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$clientId"
  )

  foreach ($path in $registryPaths) {
    $version = (Get-ItemProperty -Path $path -Name "pv" -ErrorAction SilentlyContinue).pv
    if ($version -and $version -ne "0.0.0.0") {
      return $true
    }
  }

  $runtimePath = Join-Path ${env:ProgramFiles(x86)} "Microsoft\EdgeWebView\Application"
  return Test-Path $runtimePath
}

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
  $env:PATH = "$cargoBin;$env:PATH"
}

$checks = [ordered]@{
  "Git" = Find-Command "git"
  "Node.js" = Find-Command "node"
  "npm" = Find-Command "npm"
  "Rust" = Find-Command "rustc"
  "Cargo" = Find-Command "cargo"
  "Outils C++" = Test-VisualCppTools
  "WebView2" = Test-WebView2Runtime
  "Codex" = Find-Command "codex"
  "Claude Code" = Find-Command "claude"
}

$checks.GetEnumerator() | ForEach-Object {
  $mark = if ($_.Value) { "OK" } else { "MANQUANT" }
  Write-Host ("{0,-14} {1}" -f $_.Key, $mark)
}

if ($InstallMissing -and (-not $checks.Rust -or -not $checks.Cargo)) {
  if (-not (Find-Command "winget")) {
    throw "WinGet est requis pour installer Rust automatiquement."
  }
  winget install --id Rustlang.Rustup --exact --accept-package-agreements --accept-source-agreements
  $env:PATH = "$cargoBin;$env:PATH"
  $checks.Rust = Find-Command "rustc"
  $checks.Cargo = Find-Command "cargo"
}

if (-not $checks.Git -or -not $checks.'Node.js' -or -not $checks.npm) {
  throw "Git, Node.js et npm sont requis pour construire CTRL KANB."
}

if (-not $checks.Rust -or -not $checks.Cargo) {
  Write-Host "Relancez ce script avec -InstallMissing pour installer Rustup."
  exit 2
}

if (-not $checks.'Outils C++') {
  throw "Installez Visual Studio Build Tools avec la charge de travail Développement Desktop en C++."
}

if (-not $checks.WebView2) {
  throw "Installez Microsoft Edge WebView2 Runtime avant de construire CTRL KANB."
}

rustup default stable-msvc
npm install
Write-Host "Socle Windows prêt. Codex et Claude Code restent facultatifs et seront détectés séparément par l’application."
Write-Host "Lancez npm run dev pour ouvrir la préversion."
