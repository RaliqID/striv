# Android build (Capacitor)

The Android app is a native shell around a **running** Striv frontend. It is not
a bundled copy of the web app: Striv is server-rendered and talks to a live API.

**One APK works against any server.** The app does not hard-code an address.
On first launch it shows a small setup screen asking where the server is, stores
the answer on the device, and connects. That is deliberate: a development tunnel
gets a *new random hostname every time it starts*, so a baked-in address would
go stale within minutes and force a rebuild.

---

## 1. Prerequisites

The scaffold is committed, but compiling needs tooling that is **not** in this
repo:

| Tool | Why | Notes |
|---|---|---|
| **JDK 21** (or 17) | Gradle runs on the JVM | **Not** the JDK 25 that Android Studio bundles — see the warning below. |
| **Android Studio** | Provides the Android SDK | Also gives you the SDK Manager and an emulator. |
| **Android SDK** | Platform 36 + build-tools | Installed by Android Studio's setup wizard. |

```powershell
winget install Microsoft.OpenJDK.21
```

> **Why not JDK 25?** Android Studio ships JDK 25, and Gradle 8.14.3 cannot
> compile build scripts on it. The failure is reported as
> `Unsupported class file major version 69` — which names neither the tool nor
> the cause, and costs an hour if you have not seen it before. `build.ps1`
> selects a suitable JDK automatically; if you build from Android Studio, set
> **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK**
> to 21.

`build.ps1` finds the JDK and SDK itself, so no environment variables are needed.

---

## 2. Build

```powershell
cd frontend\android
.\build.ps1              # debug APK
.\build.ps1 release      # .aab bundle for Play Store
.\build.ps1 apk          # release-signed APK (sideload)
.\build.ps1 clean
```

It resolves a JDK, resolves the SDK, runs `cap sync` (forgetting that step is
the usual reason a change silently does not appear), and builds.

Output:
- debug APK — `app/build/outputs/apk/debug/app-debug.apk`
- release bundle — `app/build/outputs/bundle/release/app-release.aab`

---

## 3. Pointing the app at a server

### Development (default)

Build without setting anything, install, and the app asks for an address:

```
https://your-tunnel.trycloudflare.com
```

Paste it, tap Connect. It is remembered, so you do this once per device — and
when the tunnel restarts with a new hostname, you just paste the new one.
**No rebuild.**

To change it later: force-stop the app and reopen, or use the "Change server
address" button that appears if the saved address stops responding.

### Branded release (no prompt for end users)

Set the production origin and the app skips the prompt entirely:

```powershell
$env:CAPACITOR_SERVER_URL = "https://your-domain.com"
.\build.ps1 release
```

The value is substituted into the bundled launcher at build time and reverted
afterwards, so the repo never carries a hard-coded environment.

---

## 4. Signing

### Create an upload keystore (once)

```powershell
keytool -genkey -v -keystore striv-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias striv
```

- Store it **outside** the repo. `*.jks` is git-ignored as a safety net, not as
  permission to keep it here.
- **Back it up.** Lose it and you cannot update this app under the same Play
  listing — you would have to publish a new app.
- Keep this as your *upload* key and enable **Play App Signing**.

### Configure

Create `frontend/android/keystore.properties` (git-ignored):

```properties
storeFile=../striv-upload.jks
storePassword=yourpassword
keyAlias=striv
keyPassword=yourpassword
```

The release build **fails with a clear message** if this file is missing,
rather than emitting an unsigned bundle that Play rejects after a long upload.

---

## 5. Versioning

In `android/app/build.gradle`:

```gradle
versionCode 1        // integer, MUST increase for every upload
versionName "1.0"    // user-visible string
```

Play rejects an upload whose `versionCode` was already used — including on test
tracks. `targetSdkVersion` lives in `android/variables.gradle`; Google raises
the required level yearly, so check before each release.

---

## 6. Local development against a dev server

Inside the emulator or on a device, `localhost` is the **device**, not your PC.
Use your machine's LAN address:

```powershell
ipconfig | findstr IPv4
# then enter http://192.168.1.50:3000 in the app's setup screen
```

Over plain HTTP the app needs `cleartext` temporarily, and the backend's
`CORS_ALLOWED_ORIGINS` must include that origin. The committed config is
HTTPS-only on purpose.

The simpler path is the share tunnel, which is already HTTPS:

```powershell
cd ..\..
.\dev.ps1 share        # prints a public https URL
```

---

## 7. Play Console checklist

- [ ] `applicationId` is final (`com.raliq.striv`) — it cannot change after the
      first upload
- [ ] `versionCode` bumped
- [ ] Signed release bundle (not debug)
- [ ] App icon 512×512 and feature graphic 1024×500
- [ ] At least 2 phone screenshots
- [ ] Privacy policy URL — **required**: the app collects an email address and
      stores workout and body-measurement data
- [ ] Data Safety form completed accurately: email address, health & fitness
      data (workouts, body weight), photos (only if the AI coach upload is used)
- [ ] Content rating questionnaire
- [ ] Target audience declared (not primarily children)
- [ ] A closed testing track run first — new personal accounts must run one, and
      testers must stay opted in for a minimum period before production access

---

## 8. Architecture notes

| File | Role |
|---|---|
| `capacitor-shell/index.html` | Bundled launcher. Asks for the server address once, stores it, redirects. This is `webDir`. |
| `capacitor-shell/error.html` | Loaded when the saved address fails (`server.errorPath`). Prevents an unreachable server from leaving a blank screen with no way out. |
| `capacitor.config.ts` | `server.url` is intentionally **not** set, so the shell decides at runtime. |

| Behaviour | Why |
|---|---|
| Auth token in `localStorage` | Keyed to the origin, so it survives app restarts but not a server change. Changing servers signs you out, which is correct. |
| Google OAuth | `accounts.google.com` is in `allowNavigation` so the flow returns into the app. If sign-in opens the system browser, check that list first. |
| Safe areas | `viewportFit: "cover"` plus the `--safe-*` CSS vars keep content clear of the notch. |
| Offline | No support yet — the setup screen is the only offline-capable page. |

---

## 9. Troubleshooting

| Symptom | Cause |
|---|---|
| `JAVA_HOME is not set` | Install JDK 21: `winget install Microsoft.OpenJDK.21` |
| `Unsupported class file major version 69` | Building with JDK 25. Use JDK 21. |
| `SDK location not found` | Set `ANDROID_HOME`, or add `sdk.dir` to `android/local.properties`. |
| Gradle hangs before any output | Corrupt wrapper cache. Delete `%USERPROFILE%\.gradle\wrapper\dists`. |
| App shows the setup screen on every launch | The address did not save — the WebView may be in private mode, or `webDir` is misconfigured. |
| "Cannot reach the server" | The address is wrong or the server stopped. Tap **Change server address**. |
| Changes not appearing | `build.ps1` runs `cap sync` for you; a manual `gradlew` build does not. |
| API calls open in the system browser | The host is missing from `allowNavigation` (only affects branded builds — the shell derives it automatically). |
| Upload rejected: version code used | Bump `versionCode`. |

