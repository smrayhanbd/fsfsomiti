# Somiti MS — Windows App

A single-file Windows shell (WinForms + WebView2) around the Somiti MS web
application deployed on Vercel — the desktop counterpart of the Android app
(`../android`). Members who log in land on the **Member Portal** (`/portal`)
and admins on the **Admin Dashboard** (`/dashboard`); the routing is done by
the web app's own middleware, so one EXE serves both interfaces.

The build output is **one `SomitiMS.exe` (~850 KB)** with every dependency
(the two WebView2 managed assemblies and the native loader) embedded as
resources — no installer, no runtime downloads. It runs on any Windows 10/11
x64 machine, which already include .NET Framework 4.8 and the WebView2
(Edge) runtime.

## Startup behavior

- **Logged out** → the app opens the **login page** of the web app.
- **Already logged in** (NextAuth session cookie present) → the app opens
  `/portal` directly; the web app's middleware then redirects admins to
  `/dashboard`. Sessions survive app restarts — cookies live in a per-app
  WebView2 profile under `%LOCALAPPDATA%\SomitiMS\WebView2`.
- Server unreachable → a built-in error page offers **Retry** or
  **Change server**.
- `mailto:` / `tel:` / `whatsapp:` links and cross-origin `target=_blank`
  links open in the default system browser; same-origin popups reuse the
  app window.
- File uploads (deposit slips) use the native Windows file picker, and
  downloads (money-receipt PDFs, ledger CSVs) use WebView2's built-in
  download experience.
- A small diagnostic log is written to `%LOCALAPPDATA%\SomitiMS\shell.log`.

## How the app connects to the deployment

The server URL is compiled in as `Config.DefaultServerUrl` in `Program.cs`
(currently `https://fsfsomiti.vercel.app`). Users can point the app at a
different deployment via **Change server** (error page → *Change Server*),
which persists the choice to `FSFSomiti.config.json` — next to the EXE when
writable, otherwise under `%LOCALAPPDATA%\SomitiMS`. Delete that file to
return to the compiled-in default.

To change the compiled-in default, edit `Config.DefaultServerUrl` and rebuild.

## Build

Requires nothing but Windows itself (the compiler is the .NET Framework
`csc.exe` that ships with the OS; the WebView2 SDK is fetched from NuGet on
first build and cached in `packages\`):

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

Output: `dist\SomitiMS.exe`.

## Publishing to the landing page

Upload `dist\SomitiMS.exe` from **Dashboard → Settings → Landing Page
Content → Download Software → Windows App (.exe)**, with a version label
(e.g. `v1.0.0`). The Windows card appears on the landing page as soon as a
file is uploaded.

> **SmartScreen note:** the EXE is unsigned, so on first run Windows may show
> "Windows protected your PC" — users click *More info → Run anyway*. A code
> signing certificate removes the warning.
