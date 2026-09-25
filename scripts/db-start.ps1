# Starts the local portable PostgreSQL 16 (installed on E:\tools, data in E:\tools\pgdata).
$pg = 'E:\tools\pg16\pgsql\bin'
& "$pg\pg_ctl.exe" -D E:\tools\pgdata status | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host 'PostgreSQL is already running.'; exit 0 }
Start-Process -FilePath "$pg\pg_ctl.exe" -ArgumentList @('-D', 'E:\tools\pgdata', '-l', 'E:\tools\pgdata\server.log', '-o', '"-p 5432"', 'start') -NoNewWindow -Wait:$false
Start-Sleep -Seconds 3
& "$pg\pg_ctl.exe" -D E:\tools\pgdata status
