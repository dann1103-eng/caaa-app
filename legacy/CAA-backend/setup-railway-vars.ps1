# Configura las variables de entorno en Railway leyendolas del archivo .env local.
# El .env esta gitignored, por lo que este script NO contiene secretos.
# Ejecutar desde la carpeta legacy/CAA-backend DESPUES de hacer `railway init`.
# Uso: .\setup-railway-vars.ps1

$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) {
  Write-Host "ERROR: No se encontro .env en $envPath" -ForegroundColor Red
  Write-Host "Crea el .env (puedes basarte en .env.example) antes de correr este script." -ForegroundColor Yellow
  exit 1
}

# Leer pares KEY=VALUE del .env (ignorando comentarios y lineas vacias)
$setArgs = @()
Get-Content $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $setArgs += "--set"
    $setArgs += $line
  }
}

if ($setArgs.Count -eq 0) {
  Write-Host "ERROR: No se encontraron variables en el .env" -ForegroundColor Red
  exit 1
}

Write-Host "Configurando $($setArgs.Count / 2) variables en Railway desde .env..." -ForegroundColor Cyan
railway variables @setArgs

Write-Host ""
Write-Host "Listo. Recuerda agregar ALLOWED_ORIGINS con la URL de Vercel:" -ForegroundColor Yellow
Write-Host '  railway variables --set "ALLOWED_ORIGINS=https://TU-APP.vercel.app,http://localhost:3000"' -ForegroundColor Yellow
