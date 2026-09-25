# Android build (Capacitor)

The Android app is a native shell around the **deployed** Striv frontend. It is
not a bundled copy of the web app: Striv is server-rendered and talks to a live
API, so `capacitor.config.ts` points the WebView at a URL.

**Deploy the frontend first** (see `../../DEPLOY.md`), then point the app at it.

---

## 1. Prerequisites

The scaffold is already committed, but compiling needs tooling that is **not**
part of this repo. Install:

| Tool | Why | Notes |
|---|---|---|
| **JDK 17** | Gradle runs on the JVM | Capacitor 8 targets Java 17. JDK 21 also works. Do **not** use JDK 8/11. |
| **Android Studio** | Provides the Android SDK + platform tools | Includes its own JDK; use its bundled one or a standalone JDK 17. |
| **Android SDK** | Platform 36 + build-tools | Android Studio installs these via the SDK Manager. |

After installing, set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) and put the
platform-tools directory on `PATH`:

```powershell
# Typical Windows locations
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path += ";$env:ANDROID_HOME\platform-tools"
```

Verify before going further — every later step depends on these:

```powershell
java -version          # must print 17 or higher
adb --version          # must print a version
```

> You can also just open the `android/` folder in Android Studio, which uses its
> own JDK and SDK and skips most of the above.

---

## 2. Point the app at your deployment

Edit `capacitor.config.ts` if your production URL is not `https://striv.vercel.app`,
or override it per build without editing the file:

```powershell
$env:CAPACITOR_SERVER_URL = "https://your-frontend-domain.com"
npx cap sync android
```

`allowNavigation` in that file must list your API domain too, or the WebView
will open API calls in the system browser instead of keeping them in-app.

---

## 3. Sync web changes into the native project

Run this after **any** change to the frontend, icons, or config. Skipping it is
the most common cause of "my change is not in the app":

```powershell
npm run android:sync      # = cap sync android
```

Regenerating icons (if you changed the logo mark):

```powershell
npm run icons             # rewrites web + android launcher/splash art
npm run android:sync
```

---

## 4. Run on a device or emulator

```powershell
npm run android:run       # = cap run android
```

Or open the project and press Run in the IDE:

```powershell
npm run android:open      # = cap open android
```

Debug builds work without a keystore.

### Local development against your dev server

Inside the emulator, `localhost` is the *emulator*, not your PC. Use your LAN IP:

```powershell
# Find it
ipconfig | findstr IPv4

$env:CAPACITOR_SERVER_URL = "http://192.168.1.50:3000"
npx cap sync android
```

This requires `cleartext: true` temporarily in `capacitor.config.ts`, and the
backend's `CORS_ALLOWED_ORIGINS` must include that origin. Revert both before
shipping — the committed config is HTTPS-only on purpose.

---

## 5. Build for Play Store

### 5a. Create an upload keystore (once)

```powershell
keytool -genkey -v -keystore striv-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias striv
```

- Store the file **outside** the repo. `*.jks` is git-ignored as a safety net,
  not as permission to keep it here.
- **Back it up.** If you lose it, you cannot update this app under the same Play
  listing — you would have to publish a new app.
- Put the real key in Play Console → App integrity → **Play App Signing**, and
  keep this keystore as the *upload* key.

### 5b. Configure signing

Create `frontend/android/keystore.properties` (git-ignored):

```properties
storeFile=../striv-upload.jks
storePassword=yourpassword
keyAlias=striv
keyPassword=yourpassword
```

The release build **fails with a clear message** if this file is missing, rather
than producing an unsigned bundle that Play rejects after a long upload.

### 5c. Build

```powershell
cd frontend
npm run android:sync
cd android

# App Bundle (.aab) — this is what you upload to Play
gradlew.bat bundleRelease

# Or an APK for sideload testing
gradlew.bat assembleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

> `gradlew.bat` on Windows, `./gradlew` on macOS/Linux.

---

## 6. Versioning

In `android/app/build.gradle`:

```gradle
versionCode 1        // integer, MUST increase for every upload
versionName "1.0"    // user-visible string, free-form
```

Play rejects an upload whose `versionCode` has already been used. Bump it every
time, including for test-track uploads.

`targetSdkVersion` lives in `android/variables.gradle`. Google requires new
submissions to target a recent API level and raises that floor yearly — check
the current requirement before each release.

---

## 7. Play Console checklist

- [ ] `applicationId` is final (`com.raliq.striv`). It is the app's permanent
      identity and **cannot** be changed after the first upload.
- [ ] `versionCode` bumped
- [ ] Signed release bundle built (not debug)
- [ ] App icon 512×512 and feature graphic 1024×500 for the store listing
- [ ] At least 2 phone screenshots
- [ ] Privacy policy URL — **required**, because the app collects an email
      address and stores workout and body-measurement data
- [ ] Data Safety form completed accurately. Declare:
      - Email address (account management)
      - Health & fitness data (workouts, body weight)
      - Photos (only if the AI coach image upload is used)
      Mismatches between this form and actual behaviour are a common rejection.
- [ ] Content rating questionnaire completed
- [ ] Target audience declared (not primarily children)
- [ ] Closed testing track run before production — new personal accounts must
      run a test track first, and testers must be opted in for a minimum period
      before production access is granted.

---

## 8. Things that differ in the app vs the browser

| Area | Behaviour |
|---|---|
| Auth | Bearer token in `localStorage`. Persists across launches, so the login screen is skipped until it 401s. |
| Google OAuth | Opens a web flow; `accounts.google.com` is in `allowNavigation` so it returns into the app rather than the system browser. If it misbehaves, that list is the first thing to check. |
| Safe areas | `viewportFit: "cover"` plus the `--safe-*` CSS vars in `globals.css` keep content clear of the notch and gesture bar. |
| Back button | Android hardware back navigates WebView history. On `/dashboard` it exits the app, which is expected. |
| Offline | No offline support yet — the app needs a connection. A service worker would be the next step if that matters. |

---

## 9. Troubleshooting

| Symptom | Cause |
|---|---|
| `JAVA_HOME is not set` | Install JDK 17 and set the variable. |
| `SDK location not found` | Set `ANDROID_HOME`, or add `sdk.dir` to `android/local.properties`. |
| Blank screen on launch | `server.url` is unreachable from the device. Check the URL and that the device has network. |
| Changes not appearing | Forgot `npm run android:sync`. |
| `App not installed` | A previous build with a different signing key is installed — uninstall it first. |
| API calls open in the browser | Your API domain is missing from `allowNavigation`. |
| Upload rejected: version code used | Bump `versionCode`. |
