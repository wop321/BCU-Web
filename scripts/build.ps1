param([switch]$SkipAssets,[switch]$Offline)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$installation = Join-Path $projectRoot 'BCU'
$engineRoot = Join-Path $projectRoot 'engine'
$webRoot = Join-Path $projectRoot 'web'
$vendor = Join-Path $engineRoot 'vendor'
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
foreach ($dependency in @(
    @((Join-Path $installation 'BCU-0-5-8-8.jar'), 'bcu-desktop-0.5.8.8.jar'),
    @((Join-Path $installation 'BCU_lib\gson-2.10.1.jar'), 'gson-2.10.1.jar'),
    @((Join-Path $installation 'BCU_lib\jsr305-3.0.2.jar'), 'jsr305-3.0.2.jar'),
    @((Join-Path $installation 'BCU_lib\json-20240303.jar'), 'json-20240303.jar'),
    @((Join-Path $installation 'BCU_lib\kotlin-stdlib-2.2.0.jar'), 'kotlin-stdlib-2.2.0.jar'),
    @((Join-Path $installation 'BCU_lib\jcodec-0.2.5.jar'), 'jcodec-0.2.5.jar')
)) {
    if (-not (Test-Path -LiteralPath $dependency[0])) { throw "Missing supplied BCU dependency: $($dependency[0])" }
    Copy-Item -LiteralPath $dependency[0] -Destination (Join-Path $vendor $dependency[1]) -Force
}
if (-not $SkipAssets) {
    & (Join-Path $projectRoot 'tools\export-assets.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Asset export failed' }
    & python (Join-Path $projectRoot 'tools-layout\extract_layouts.py')
    if ($LASTEXITCODE -ne 0) { throw 'Layout export failed' }
}
$mavenArgs = @('-f',(Join-Path $engineRoot 'pom.xml'),'-B','package','-DskipTests')
if ($Offline) { $mavenArgs += '-o' }
& mvn @mavenArgs
if ($LASTEXITCODE -ne 0) { throw 'TeaVM compilation failed' }
$engineOutput = Join-Path $webRoot 'engine'
New-Item -ItemType Directory -Force -Path $engineOutput | Out-Null
Copy-Item -LiteralPath (Join-Path $engineRoot 'dist\bcu-engine.js') -Destination (Join-Path $engineOutput 'bcu.js') -Force
if (Test-Path -LiteralPath (Join-Path $engineRoot 'dist\bcu-engine.js.map')) {
    Copy-Item -LiteralPath (Join-Path $engineRoot 'dist\bcu-engine.js.map') -Destination (Join-Path $engineOutput 'bcu-engine.js.map') -Force
}
& node (Join-Path $PSScriptRoot 'check.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Static build verification failed' }
& node (Join-Path $PSScriptRoot 'compress.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Data compression failed' }
Write-Host 'Built browser-only BCU Web. Run npm run dev.'
