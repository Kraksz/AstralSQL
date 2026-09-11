param([string]$BinaryRoot = (Join-Path $env:TEMP 'astral-release-checks-014'))
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$run = Join-Path $env:TEMP ('astral-final-db-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run | Out-Null
$openssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
$cert = Join-Path $run 'server.crt'
$key = Join-Path $run 'server.key'
& $openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -keyout $key -out $cert *> (Join-Path $run 'certificate.log')
if ($LASTEXITCODE) { throw 'Could not create disposable TLS certificate' }
$password = [guid]::NewGuid().ToString('N') + 'Aa7!'
$engines = @(
  @{ Driver='mysql'; Bin=(Join-Path $BinaryRoot 'mysql-8.4.11-winx64/bin'); User='root' },
  @{ Driver='mariadb'; Bin=(Join-Path $BinaryRoot 'mariadb-11.4.10-winx64/bin'); User='root' },
  @{ Driver='postgres'; Bin=(Join-Path $BinaryRoot 'pgsql/bin'); User='astral' }
)
$results = @()
foreach ($engine in $engines) {
  $driver = $engine.Driver
  $data = Join-Path $run $driver
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
  $server = $null
  try {
    Write-Output "Preparing disposable $driver on loopback port $port"
    if ($driver -eq 'mysql') {
      & (Join-Path $engine.Bin 'mysqld.exe') --no-defaults --initialize-insecure "--datadir=$data" *> (Join-Path $run "$driver-init.log")
      if ($LASTEXITCODE) { throw "$driver initialization failed" }
      $server = Start-Process -FilePath (Join-Path $engine.Bin 'mysqld.exe') -ArgumentList @('--no-defaults',"--datadir=$data",'--bind-address=127.0.0.1',"--port=$port",'--mysqlx=OFF',"--ssl-cert=$cert","--ssl-key=$key") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run "$driver-out.log") -RedirectStandardError (Join-Path $run "$driver-err.log") -PassThru
    } elseif ($driver -eq 'mariadb') {
      & (Join-Path $engine.Bin 'mariadb-install-db.exe') "--datadir=$data" "--password=$password" "--port=$port" --silent *> (Join-Path $run "$driver-init.log")
      if ($LASTEXITCODE) { throw "$driver initialization failed" }
      $server = Start-Process -FilePath (Join-Path $engine.Bin 'mariadbd.exe') -ArgumentList @('--no-defaults',"--datadir=$data",'--bind-address=127.0.0.1',"--port=$port","--ssl-cert=$cert","--ssl-key=$key") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run "$driver-out.log") -RedirectStandardError (Join-Path $run "$driver-err.log") -PassThru
    } else {
      $passwordFile = Join-Path $run 'initdb-password.txt'
      try {
        [IO.File]::WriteAllText($passwordFile, $password + "`n", [Text.UTF8Encoding]::new($false))
        & (Join-Path $engine.Bin 'initdb.exe') -D $data -U astral "--pwfile=$passwordFile" --auth-host=scram-sha-256 --auth-local=trust --encoding=UTF8 --no-locale *> (Join-Path $run "$driver-init.log")
        if ($LASTEXITCODE) { throw "$driver initialization failed" }
      } finally {
        Remove-Item -LiteralPath $passwordFile -ErrorAction SilentlyContinue
      }
      $pgCert=$cert.Replace('\','/'); $pgKey=$key.Replace('\','/')
      @("listen_addresses='127.0.0.1'", "port=$port", 'ssl=on', "ssl_cert_file='$pgCert'", "ssl_key_file='$pgKey'") | Add-Content (Join-Path $data 'postgresql.conf')
      $server = Start-Process -FilePath (Join-Path $engine.Bin 'postgres.exe') -ArgumentList @('-D',$data) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run "$driver-out.log") -RedirectStandardError (Join-Path $run "$driver-err.log") -PassThru
    }
    $ready=$false
    for ($attempt=0; $attempt -lt 80; $attempt++) {
      if ($server.HasExited) { throw "$driver exited during startup; inspect $run" }
      $socket=[Net.Sockets.TcpClient]::new()
      try { $socket.Connect('127.0.0.1',$port); $ready=$true } catch {} finally { $socket.Dispose() }
      if ($ready) { break }; Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw "$driver did not start listening" }
    if ($driver -eq 'postgres') {
      $env:PGPASSWORD=$password
      & (Join-Path $engine.Bin 'createdb.exe') -h 127.0.0.1 -p $port -U astral astral_test *> (Join-Path $run "$driver-create.log")
    } else {
      $client = Join-Path $engine.Bin $(if ($driver -eq 'mysql') {'mysql.exe'} else {'mariadb.exe'})
      if ($driver -eq 'mysql') {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
        "ALTER USER 'root'@'localhost' IDENTIFIED BY '$password'; CREATE DATABASE astral_test CHARACTER SET utf8mb4;" | & $client --no-defaults --protocol=TCP -h 127.0.0.1 -P $port -u root *> (Join-Path $run "$driver-create.log")
      } else {
        $env:MYSQL_PWD=$password
        'CREATE DATABASE astral_test CHARACTER SET utf8mb4;' | & $client --no-defaults --protocol=TCP -h 127.0.0.1 -P $port -u root --skip-ssl-verify-server-cert *> (Join-Path $run "$driver-create.log")
      }
    }
    if ($LASTEXITCODE) { throw "$driver could not create disposable database" }
    $env:ASTRAL_TEST_DRIVER=$driver; $env:ASTRAL_TEST_PORT=[string]$port
    $env:ASTRAL_TEST_USER=$engine.User; $env:ASTRAL_TEST_PASSWORD=$password
    $env:ASTRAL_TEST_UNTRUSTED_TLS='1'
    foreach ($testHost in @('127.0.0.1','localhost')) {
      foreach ($tls in @('disable','require')) {
        $env:ASTRAL_TEST_HOST=$testHost; $env:ASTRAL_TEST_SSL_MODE=$tls
        $log=Join-Path $run "$driver-$testHost-$tls.log"
        Push-Location $repo
        try { cargo test --locked --no-default-features --test network_integration --test network_acceptance -- --ignored --nocapture *> $log; $code=$LASTEXITCODE } finally { Pop-Location }
        $results += [pscustomobject]@{engine=$driver;host=$testHost;tls=$tls;passed=($code -eq 0);log=$log}
        Write-Output "$driver / $testHost / TLS $tls : $(if($code -eq 0){'PASS'}else{'FAIL'})"
      }
    }
  } finally {
    if ($server -and !$server.HasExited) {
      if ($driver -eq 'postgres') { & (Join-Path $engine.Bin 'pg_ctl.exe') -D $data stop -m fast *> (Join-Path $run "$driver-stop.log") }
      else {
        $env:MYSQL_PWD=$password
        $admin=Join-Path $engine.Bin $(if($driver -eq 'mysql'){'mysqladmin.exe'}else{'mariadb-admin.exe'})
        & $admin --no-defaults --protocol=TCP -h 127.0.0.1 -P $port -u root shutdown *> (Join-Path $run "$driver-stop.log")
      }
      $server.Refresh(); if(!$server.HasExited){Stop-Process -Id $server.Id -ErrorAction SilentlyContinue}
    }
    $results | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $run 'results.json')
  }
}
Remove-Item Env:ASTRAL_TEST_PASSWORD,Env:MYSQL_PWD,Env:PGPASSWORD -ErrorAction SilentlyContinue
Write-Output "Result manifest: $(Join-Path $run 'results.json')"
if ($results.Count -ne 12 -or ($results | Where-Object { !$_.passed })) { exit 1 }
