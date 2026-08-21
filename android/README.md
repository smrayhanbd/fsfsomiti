# Somiti MS — Android App

A native Android shell (WebView) around the Somiti MS web application
deployed on Vercel. Members who log in are taken to the **Member Portal**
(`/portal`) and admins to the **Admin Dashboard** (`/dashboard`) — the
routing is done by the web app's own middleware, so one APK serves both
interfaces.

## Startup behavior

- **Logged out** → the app opens the **login page** of the web app.
- **Already logged in** (NextAuth session cookie present) → the app opens
  `/portal` directly; the web app's middleware then redirects admins to
  `/dashboard`. Sessions survive app restarts (cookies + storage persist).
- Server unreachable → a dialog offers **Retry** or **Change server**.

## How the app connects to the Vercel deployment

The server URL is compiled into the APK at build time via the `SERVER_URL`
Gradle property. The current build uses `https://fsfsomiti.vercel.app`.
To point a new build at a different deployment:

```bash
./gradlew.bat assembleRelease -PSERVER_URL=https://your-app.vercel.app
```

Without the property, the APK shows a one-time "Server address" screen on
first launch (useful for LAN testing against `npm run dev`, e.g.
`http://192.168.0.100:3000`).

> Vercel side: make sure the project has `NEXTAUTH_URL=https://fsfsomiti.vercel.app`
> and `NEXTAUTH_SECRET` set (Project → Settings → Environment Variables), or
> login will fail inside the app even though pages render.

## Requirements (already set up on this machine)

| Tool | Location |
|---|---|
| JDK 17 (Temurin) | `C:\FSF-Android\jdk-17.0.20+8` |
| Android SDK | `C:\FSF-Android\android-sdk` (platform 35, build-tools 35) |
| Gradle 8.10.2 | `C:\FSF-Android\gradle-8.10.2` (wrapper also included) |

## Building the APK

The project path `C:\FSF SOMITI` contains a space, which breaks some
Android build tools, so builds go through the junction
`C:\fsf-somiti-android` (created once, points at this folder):

```bat
:: from cmd (one-time, if the junction is gone)
mklink /J C:\fsf-somiti-android "C:\FSF SOMITI\android"
```

Build (Git Bash):

```bash
export JAVA_HOME='C:\FSF-Android\jdk-17.0.20+8'
export ANDROID_HOME='C:\FSF-Android\android-sdk'
cd /c/fsf-somiti-android
./gradlew.bat assembleDebug assembleRelease -PSERVER_URL=https://fsfsomiti.vercel.app
```

Ready-made APKs are in `android/dist/`:

- `SomitiMS-v1.1.0-release.apk` — signed, install this one on phones
- `SomitiMS-v1.1.0-debug.apk` — for testing only

Fresh builds land in `app/build/outputs/apk/{debug,release}/`.

## Release signing

`android/keystore/somiti-release.keystore` (gitignored) signs release
builds automatically via `android/keystore.properties` (also gitignored).
Credentials: store/key password `somiti2026`, alias `somiti`.

> **Keep the keystore safe.** An app update can only install over the same
> signature — if the keystore is lost, users must uninstall before updating.
> (The original v1.0.0 keystore was deleted with the old `android/` folder in
> Aug 2026; this is a new key, so any phone still running the old v1.0.0 APK
> must uninstall it before installing v1.1.0+.)
> For a Google Play upload, generate a new, private keystore instead.

## Native wiring included

- File uploads (deposit slips) via the system file picker
- PDF/receipt/ID-card downloads → Downloads folder, with auth cookies
- `mailto:` / `tel:` / WhatsApp links open external apps
- Android back button navigates WebView history
- Offline detection with Retry / Change server

## Updating app name / icon / version

- Name: `app/src/main/res/values/strings.xml`
- Icon: `app/src/main/res/drawable/ic_launcher_foreground.xml` (vector coin emblem)
- Version: `versionCode` / `versionName` in `app/build.gradle.kts`
