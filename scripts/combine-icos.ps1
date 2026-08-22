# Combines a folder of single-image .ico files (e.g. exported individually
# by an online icon generator) into ONE multi-size .ico that can be compiled
# into the Windows app via /win32icon. Each source file must contain exactly
# one image; the per-file payload is copied verbatim.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\combine-icos.ps1 `
#       -InputDir "C:\Users\...\ico-folder" -OutFile "windows\app.ico"
param(
  [Parameter(Mandatory = $true)][string]$InputDir,
  [Parameter(Mandatory = $true)][string]$OutFile
)

$ErrorActionPreference = 'Stop'

$entries = @()
foreach ($f in (Get-ChildItem (Join-Path $InputDir '*.ico') | Sort-Object Name)) {
  $b = [IO.File]::ReadAllBytes($f.FullName)
  if ([BitConverter]::ToUInt16($b, 2) -ne 1) { throw "$($f.Name): not an icon file" }
  $count = [BitConverter]::ToUInt16($b, 4)
  if ($count -ne 1) { throw "$($f.Name): expected a single-image ico, found $count images" }
  $dim = $b[6]; if ($dim -eq 0) { $dim = 256 }
  # Strip the 6-byte header + 16-byte directory entry -> raw image payload.
  $data = New-Object byte[] ($b.Length - 22)
  [Array]::Copy($b, 22, $data, 0, $data.Length)
  $entries += , @($dim, $data)
}
if ($entries.Count -eq 0) { throw "No .ico files found in $InputDir" }

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$entries.Count)
$offset = 6 + 16 * $entries.Count
foreach ($e in $entries) {
  $s = $e[0]; $d = $e[1]
  $dim = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$dim); $bw.Write([byte]$dim)
  $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$d.Length); $bw.Write([UInt32]$offset)
  $offset += $d.Length
}
foreach ($e in $entries) { $bw.Write([byte[]]$e[1]) }
$bw.Flush()
$outDir = Split-Path -Parent $OutFile
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
[IO.File]::WriteAllBytes($OutFile, $ms.ToArray())
Write-Host ("wrote {0} with {1} sizes ({2})" -f $OutFile, $entries.Count, (($entries | ForEach-Object { $_[0] }) -join ', '))
