$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $Project
try {
  npm ci
  npm run check
  npm run build
} finally {
  Pop-Location
}
