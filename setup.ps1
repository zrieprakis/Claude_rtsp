# Downloads the latest go2rtc Windows build into .\bin
$ErrorActionPreference = 'Stop'
$bin = Join-Path $PSScriptRoot 'bin'
$zip = Join-Path $env:TEMP 'go2rtc_win64.zip'
$url = 'https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_win64.zip'

New-Item -ItemType Directory -Force $bin | Out-Null
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $bin -Force
Remove-Item $zip

& (Join-Path $bin 'go2rtc.exe') -version
Write-Host "go2rtc installed to $bin"
