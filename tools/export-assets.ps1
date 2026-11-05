param(
    [string]$Installation = (Join-Path $PSScriptRoot '..\BCU'),
    [string]$Output = (Join-Path $PSScriptRoot '..\web')
)
$ErrorActionPreference = 'Stop'
$Installation = [IO.Path]::GetFullPath($Installation)
$Output = [IO.Path]::GetFullPath($Output)
$classOutput = Join-Path $PSScriptRoot 'classes'
New-Item -ItemType Directory -Force -Path $classOutput | Out-Null
$bcuJar = Join-Path $Installation 'BCU-0-5-8-8.jar'
$runtimeClasspath = "$bcuJar;$(Join-Path $Installation 'BCU_lib\*')"
& javac -encoding UTF-8 -cp $runtimeClasspath -d $classOutput (Join-Path $PSScriptRoot 'ExportBcu.java')
if ($LASTEXITCODE -ne 0) { throw 'BCU exporter compilation failed' }
& java '-Xmx3g' '-Djava.awt.headless=true' -cp "$classOutput;$runtimeClasspath" ExportBcu $Installation $Output
if ($LASTEXITCODE -ne 0) { throw 'BCU export failed' }
& python (Join-Path $PSScriptRoot 'engine_manifest.py') $Output
if ($LASTEXITCODE -ne 0) { throw 'TeaVM file manifest export failed' }
