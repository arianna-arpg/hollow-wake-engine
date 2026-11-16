param([Parameter(Mandatory=$true)][string]$Godot, [int]$Port=47120, [string]$Skill='', [string]$SaveFile='')
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) { throw 'Install the included packages first: npm install --offline --ignore-scripts' }
$arguments=@('host/serve.mjs','--port',"$Port")
if ($Skill) {
    if ($Skill -notmatch '^[a-zA-Z0-9_]+$') { throw 'Skill must be an authored skill ID.' }
    $arguments+=@('--skill',$Skill)
}
if ($SaveFile) {
    $savePath=[System.IO.Path]::GetFullPath($SaveFile)
    if ($savePath.Contains('"') -or $savePath.EndsWith('\')) { throw 'SaveFile must name a character file.' }
    $arguments+=@('--save-file',('"'+$savePath+'"'))
}
$hostProcess=Start-Process -FilePath 'node' -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru
try {
    $ready=$false
    for ($attempt=0; $attempt -lt 100; $attempt++) {
        if ($hostProcess.HasExited) { throw 'Combat host stopped before opening the player.' }
        $probe=[System.Net.Sockets.TcpClient]::new()
        try { $probe.Connect('127.0.0.1',$Port); $ready=$true } catch {} finally { $probe.Dispose() }
        if ($ready) { break }
        Start-Sleep -Milliseconds 100
    }
    if (-not $ready) { throw 'Combat host did not become ready.' }
    & $Godot --path (Join-Path $root 'client') -- "--port=$Port"
} finally {
    if (-not $hostProcess.HasExited) { Stop-Process -Id $hostProcess.Id }
}
