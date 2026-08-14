# Batch-extract associated icons and save them as PNG.
# Usage: extract-icon.ps1 -InputFile <utf8-json> -OutputFile <utf8-json>
#   InputFile : UTF-8 JSON array of {src, out}
#   OutputFile: UTF-8 JSON {results:[{src,out,ok,error}]}
# NOTE: keep this file ASCII-only to avoid codepage issues with PowerShell 5.1.
param(
  [Parameter(Mandatory=$true)][string]$InputFile,
  [Parameter(Mandatory=$true)][string]$OutputFile
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$items = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json
$results = @()
foreach ($it in $items) {
  $r = @{ src = $it.src; out = $it.out; ok = $false; error = '' }
  try {
    if (-not (Test-Path -LiteralPath $it.src)) {
      $r.error = 'not-exists'
      $results += $r
      continue
    }
    $dir = Split-Path -Parent $it.out
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($it.src)
    if ($icon) {
      $bmp = $icon.ToBitmap()
      $bmp.Save($it.out, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
      $icon.Dispose()
      $r.ok = $true
    } else {
      $r.error = 'no-icon'
    }
  } catch {
    $r.error = $_.Exception.Message
  }
  $results += $r
}
$json = $results | ConvertTo-Json -Compress -Depth 3
Set-Content -LiteralPath $OutputFile -Value $json -Encoding UTF8
