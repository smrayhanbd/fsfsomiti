# Builds windows\dist\SomitiMS.exe — a single-file WinForms + WebView2 shell
# around the Somiti MS web deployment. Requires nothing but Windows itself:
# the .NET Framework 4.x csc.exe compiler ships with the OS, and the WebView2
# SDK assemblies are downloaded from NuGet on first build and embedded into
# the EXE as resources.
#
# Usage:  powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgDir  = Join-Path $root 'packages'
$libDir  = Join-Path $root 'lib'
$distDir = Join-Path $root 'dist'
$webView2Version = '1.0.2739.15'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path $csc)) { throw "csc.exe not found at $csc" }

New-Item -ItemType Directory -Force -Path $pkgDir, $libDir, $distDir | Out-Null

# 1. Fetch + unpack the WebView2 SDK (cached in packages\).
$nupkg = Join-Path $pkgDir 'webview2.nupkg'
if (-not (Test-Path $nupkg)) {
    Write-Host "Downloading Microsoft.Web.WebView2 $webView2Version ..."
    Invoke-WebRequest "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$webView2Version" `
        -OutFile $nupkg
}
$extracted = Join-Path $pkgDir 'extracted'
if (-not (Test-Path (Join-Path $extracted 'lib'))) {
    $zip = Join-Path $pkgDir 'webview2.zip'
    Copy-Item $nupkg $zip -Force
    Expand-Archive $zip $extracted -Force
}

# 2. App icon: the site's favicon (app/favicon.ico at the repo root).
$ico = Join-Path $root 'app.ico'
if (-not (Test-Path $ico)) {
    Copy-Item (Join-Path $root '..\app\favicon.ico') $ico
}

# 3. Reference assemblies for the compile step.
Copy-Item (Join-Path $extracted 'lib\net462\Microsoft.Web.WebView2.Core.dll')     $libDir -Force
Copy-Item (Join-Path $extracted 'lib\net462\Microsoft.Web.WebView2.WinForms.dll') $libDir -Force

# 4. Compile. The three WebView2 DLLs (two managed + the native x64 loader)
#    are embedded as manifest resources so the output is ONE self-contained
#    exe with no sibling files.
& $csc /nologo /target:winexe /platform:x64 `
    /out:"$distDir\SomitiMS.exe" `
    /win32icon:"$ico" `
    /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll `
    "/r:$libDir\Microsoft.Web.WebView2.Core.dll" `
    "/r:$libDir\Microsoft.Web.WebView2.WinForms.dll" `
    "/resource:$libDir\Microsoft.Web.WebView2.Core.dll,Microsoft.Web.WebView2.Core.dll" `
    "/resource:$libDir\Microsoft.Web.WebView2.WinForms.dll,Microsoft.Web.WebView2.WinForms.dll" `
    "/resource:$extracted\runtimes\win-x64\native\WebView2Loader.dll,WebView2Loader.dll" `
    (Join-Path $root 'Program.cs')
if ($LASTEXITCODE -ne 0) { throw "csc.exe failed with exit code $LASTEXITCODE" }

Get-Item "$distDir\SomitiMS.exe" | Select-Object Name, @{ n = 'SizeKB'; e = { [math]::Round($_.Length / 1KB) } }, LastWriteTime
