# Generates the Windows + Android app launcher icons from a single square
# source image (e.g. the Somiti logo):
#
#   windows\app.ico                          — multi-size (16/32/48 BMP + 256 PNG)
#   android res mipmap-*\ic_launcher.png     — legacy full-bleed launcher icon
#   android res mipmap-*\ic_launcher_round.png
#   android res mipmap-*\ic_launcher_foreground.png — adaptive foreground
#                                             (logo at the 72/108 safe zone on
#                                             an opaque white canvas, so it
#                                             blends with the white background
#                                             color set in values/colors.xml)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\make-app-icons.ps1 `
#       -SourcePath "C:\path\to\SomitiLogo.jpeg"
param(
  [Parameter(Mandatory = $true)][string]$SourcePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repo = Split-Path -Parent (Split-Path -Parent $PSCommandPath)   # scripts\ -> repo
$icoPath = Join-Path $repo 'windows\app.ico'
$resDir = Join-Path $repo 'android\app\src\main\res'

function New-Graphics([System.Drawing.Bitmap]$bmp) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return $g
}

# ── 1. Center-crop the source to a square ────────────────────────────────
$src = [System.Drawing.Image]::FromFile($SourcePath)
try {
  $side = [Math]::Min($src.Width, $src.Height)
  $square = New-Object System.Drawing.Bitmap($side, $side)
  $g = New-Graphics $square
  $ox = -([Math]::Max(0, [double]($src.Width - $side) / 2))
  $oy = -([Math]::Max(0, [double]($src.Height - $side) / 2))
  $g.DrawImage($src, [single]$ox, [single]$oy, [single]$src.Width, [single]$src.Height)
  $g.Dispose()
} finally { $src.Dispose() }

function New-SizedSquare([int]$size) {
  $b = New-Object System.Drawing.Bitmap($size, $size)
  $g = New-Graphics $b
  $g.DrawImage($square, 0, 0, $size, $size)
  $g.Dispose()
  return $b
}

function Get-PngBytes([System.Drawing.Bitmap]$bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  return $ms.ToArray()
}

# ── 2. Windows .ico — classic BMP entries for 16/32/48 (universally
#      accepted, incl. by the old csc.exe) + one PNG entry for 256. ──────
function Get-IcoBmpEntry([System.Drawing.Bitmap]$bmp) {
  # Icon.Save() emits a complete single-image .ico: 6-byte header +
  # 16-byte directory entry + data. Strip the 22-byte prefix to get the
  # raw DIB entry payload.
  $hicon = $bmp.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($hicon)
  $ms = New-Object System.IO.MemoryStream
  $icon.Save($ms)
  $all = $ms.ToArray()
  $data = New-Object byte[] ($all.Length - 22)
  [Array]::Copy($all, 22, $data, 0, $data.Length)
  [void]$icon.Dispose()
  [void][Win32.NativeMethods]::DestroyIcon($hicon)
  return $data
}

# DestroyIcon needs a P/Invoke to avoid leaking GDI handles.
Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition '
[DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);
'

$icoSizes = @(16, 32, 48, 256)
$entries = @()
foreach ($s in $icoSizes) {
  $b = New-SizedSquare $s
  if ($s -ge 256) { $data = Get-PngBytes $b } else { $data = Get-IcoBmpEntry $b }
  $entries += , @($s, $data)
  $b.Dispose()
}

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
[IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
Write-Host ("wrote {0} ({1} KB)" -f $icoPath, [math]::Round((Get-Item $icoPath).Length / 1KB))

# ── 3. Android mipmaps ──────────────────────────────────────────────────
$densities = [ordered]@{ mdpi = 1.0; hdpi = 1.5; xhdpi = 2.0; xxhdpi = 3.0; xxxhdpi = 4.0 }
foreach ($key in $densities.Keys) {
  $d = $densities[$key]
  $dir = Join-Path $resDir ("mipmap-" + $key)
  New-Item -ItemType Directory -Force -Path $dir | Out-Null

  # Legacy full-bleed icon (48dp base) — also the pre-API-26 fallback.
  $base = [int][Math]::Round(48 * $d)
  $b = New-SizedSquare $base
  $b.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Save((Join-Path $dir 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()

  # Adaptive foreground (108dp canvas, logo at the 72/108 safe zone). The
  # canvas is opaque white so it blends with the white
  # ic_launcher_background under any mask shape.
  $fg = [int][Math]::Round(108 * $d)
  $canvas = New-Object System.Drawing.Bitmap($fg, $fg)
  $g = New-Graphics $canvas
  $g.Clear([System.Drawing.Color]::White)
  $inner = [int][Math]::Round($fg * 72 / 108)
  $off = [int](($fg - $inner) / 2)
  $g.DrawImage($square, $off, $off, $inner, $inner)
  $g.Dispose()
  $canvas.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()

  Write-Host ("wrote mipmap-{0} (icon {1}px, foreground {2}px)" -f $key, $base, $fg)
}

$square.Dispose()
