# Striv Mobile — aplikasi Android native

Aplikasi **native** (React Native + Expo), bukan website yang dibungkus. UI-nya
komponen Android asli, jadi terasa seperti app sungguhan: navigasi native,
gestur, splash screen, dan nanti bisa akses kamera/notifikasi.

Backend Laravel-nya **tidak berubah** — app ini ngobrol ke 68 endpoint API yang
sudah ada.

## Yang sudah jadi

| Layar | Isi |
|---|---|
| **Login** | Email + password, pesan error spesifik (suspended, rate limited, salah password) |
| **Dashboard** | Ringkasan volume/set/workout, tren 30 hari, goal aktif, PR terbaru |
| **Goals** | Daftar goal dengan progress bar, filter aktif/selesai/semua |

Infrastruktur yang sudah disiapkan: API client (timeout, auto-logout saat 401),
auth tersimpan **terenkripsi** (Android Keystore), design tokens, komponen UI
reusable.

## Cara jalanin

### 1. Nyalakan backend

```powershell
cd C:\Users\raso8\Striv
.\dev.ps1 start      # backend di :8001
```

### 2. Jalanin app

```powershell
cd C:\Users\raso8\Striv\striv-mobile
npm start
```

Terus scan QR pakai **Expo Go** di HP, atau tekan `a` buat emulator Android.

### Alamat server — otomatis

App-nya **cari sendiri** alamat backend, jadi lu gak perlu setting:

1. Pakai `EXPO_PUBLIC_API_URL` kalau di-set (buat production)
2. Kalau enggak: ambil IP komputer dari Metro bundler → `http://<IP-LU>:8001/api/v1`
3. Emulator Android: `http://10.0.2.2:8001/api/v1`

**Syarat penting:** HP dan komputer harus di **Wi-Fi yang sama**, karena app
ngambil backend dari komputer lu.

Kalau mau paksa alamat tertentu:
```powershell
$env:EXPO_PUBLIC_API_URL = "https://api.domain-lu.com/api/v1"
npm start
```

## Struktur

```
app/                    Layar (Expo Router, file-based routing)
  _layout.tsx           Provider + auth gate (redirect kalau belum login)
  login.tsx             Layar masuk
  index.tsx             Dashboard
  goals.tsx             Goals
src/
  api/
    config.ts           Deteksi alamat API (otomatis)
    client.ts           HTTP client: timeout, auth header, normalisasi error
    endpoints.ts        Wrapper per domain (goals, workouts, chat, …)
    types.ts            Tipe response API
  components/ui.tsx     Button, Card, Badge, loading/empty/error states
  hooks/useAuth.tsx     State autentikasi (context)
  lib/storage.ts        Token di SecureStore (terenkripsi)
  theme/index.ts        Warna, spacing, tipografi
```

## Kenapa arsitekturnya begini

**Token di SecureStore, bukan AsyncStorage.** AsyncStorage itu file biasa tanpa
enkripsi. Kalau HP di-root, token bisa dibaca. SecureStore pakai Android
Keystore — itu yang seharusnya buat token.

**Logout otomatis dari mana saja.** Kalau token expired, API client ngehapus
session dan ngelempar ke login, dari layar manapun. Gak perlu tiap layar mikirin.

**Offline tidak bikin logout.** Kalau HP gak ada internet, user **tetap** login
(asal token masih ada). Cuma 401 yang bikin logout. Ini penting — kalau nggak,
user di lift langsung kelempar keluar.

**`status` auth ada 3: `unknown` / `signedIn` / `signedOut`.** Yang `unknown` itu
penting — app sedang baca token dari storage. Kalau dianggap `signedOut`,
layar login bakal kedip tiap buka app.

**Goal pakai basis "mulai → target".** Progress dihitung dari `starting_value`
yang dibekukan saat goal dibuat, bukan dari nol. Jadi target 30 kg pas lu udah
angkat 30 kg gak langsung 100%.

## Langkah berikutnya

- [ ] Layar Workout (log set, timer, finish)
- [ ] Layar Chat AI (coach)
- [ ] Layar Profile
- [ ] Pull-to-refresh & optimistic update
- [ ] Offline cache (simpan data lokal)
- [ ] Push notification (pengingat latihan)
- [ ] Build APK/AAB buat Play Store (`eas build`)

## Build buat Play Store

```powershell
npm install -g eas-cli
eas login
eas build --platform android --profile production
```

Butuh akun Expo + akun Play Console ($25). Setelah itu baru bisa upload.

## Catatan teknis

- **`--legacy-peer-deps`** dipakai karena ada konflik peer dep dari `react-dom`.
  App native gak butuh `react-dom`, jadi ini aman.
- **Expo SDK 57**, React Native 0.86, React 19.
- **New Architecture** aktif (`newArchEnabled: true`) — default modern Expo.
