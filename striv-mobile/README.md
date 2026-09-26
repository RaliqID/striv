# Striv Mobile — aplikasi Android native

Aplikasi **native** (React Native + Expo), bukan website yang dibungkus. UI-nya
komponen Android asli, jadi terasa seperti app sungguhan: navigasi native,
gestur, splash screen, dan nanti bisa akses kamera/notifikasi.

Backend Laravel-nya **tidak berubah** — app ini ngobrol ke 68 endpoint API yang
sudah ada.

## Yang sudah jadi

5 tab, semuanya berfungsi:

| Tab | Isi |
|---|---|
| **Home** | Volume/set/workout 30 hari, tren, goal aktif, personal bests |
| **Workouts** | Riwayat + mulai workout + banner "resume" kalau ada sesi kebuka |
| **Goals** | Progress bar dengan filter aktif/selesai/semua |
| **Progress** | Grafik volume mingguan + tren estimated 1RM |
| **Coach** | Chat AI dengan daftar percakapan |

Plus layar **log set** (dibuka dari tab Workouts) — ini layar paling penting:

- Input angka langsung, tanpa form
- **Set baru otomatis ke-isi** dari set sebelumnya (kasus paling umum: ngulang
  beban yang sama) — jadi biasanya cukup 1 tap
- Target sentuh 44pt+, ukuran jempol
- Long-press buat hapus set
- Bubble chat muncul **langsung** sebelum server jawab

Infrastruktur: API client (timeout, auto-logout saat 401), token
**terenkripsi** (Android Keystore), tab navigation native, design tokens,
komponen UI reusable, dan 2 grafik yang digambar pakai Views (tanpa library
chart — cuma butuh bar + line, gak worth nambah dependency besar).

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
app/                      Layar (Expo Router, file-based)
  _layout.tsx             Provider + auth gate (redirect kalau belum login)
  login.tsx               Layar masuk
  (tabs)/
    _layout.tsx           Bottom tab bar
    index.tsx             Home
    workouts.tsx          Riwayat workout
    goals.tsx             Goals
    progress.tsx          Grafik
    coach.tsx             Chat AI
    profile.tsx           Profil
  workout/[id].tsx        Log set (id="new" = mulai sesi baru)
src/
  api/
    config.ts             Deteksi alamat API otomatis
    client.ts             HTTP client: timeout, auth, normalisasi error
    endpoints.ts          Wrapper per domain
    types.ts              Tipe response sesuai backend
  components/ui.tsx       Button, Card, Badge, loading/empty/error
  hooks/useAuth.tsx       State autentikasi
  lib/storage.ts          Token di SecureStore (terenkripsi)
  theme/index.ts          Warna, spacing, tipografi
```

## Kenapa arsitekturnya begini

**Token di SecureStore, bukan AsyncStorage.** AsyncStorage itu file biasa tanpa
enkripsi. Kalau HP di-root, token bisa dibaca. SecureStore pakai Android
Keystore — itu yang seharusnya buat token.

**Logout otomatis dari mana saja.** Kalau token expired, API client ngehapus
session dan ngelempar ke login, dari layar manapun.

**Offline tidak bikin logout.** Kalau HP gak ada internet, user **tetap** login
(asal token masih ada). Cuma 401 yang bikin logout.

**`status` auth ada 3: `unknown` / `signedIn` / `signedOut`.** Yang `unknown` itu
penting — app sedang baca token dari storage. Kalau dianggap `signedOut`,
layar login bakal kedip tiap buka app.

**Grafik digambar pakai Views, bukan library.** Cuma butuh bar dan line. Bar =
beberapa View. Line = segmen tipis yang dirotasi sesuai kemiringan. Nambah
library chart cuma buat 2 bentuk itu gak worth.

**Goal pakai basis "mulai → target".** Progress dihitung dari `starting_value`
yang dibekukan saat goal dibuat. Target 30 kg pas lu udah angkat 30 kg gak
langsung 100%.

## Catatan penting soal data

Tiga hal yang **beda dari dugaan** (ketemu saat ngecek API langsung, bukan
nebak dari dokumentasi):

- `POST /chat` pakai field **`content`**, bukan `message`, dan balikin
  `user_message` + `assistant_message` (bukan satu `message`).
- `recent_prs` di dashboard **gak punya nama exercise** — cuma `exercise_id`.
  Jadi daftar personal best diambil dari `/records` yang nge-join exercise.
- `weekly_volume` pakai key **`volume`**, bukan `volume_kg`.

## Langkah berikutnya

- [ ] Log set dengan timer istirahat
- [ ] Edit set yang sudah tersimpan (sekarang cuma bisa log/hapus)
- [ ] Upload foto ke chat AI
- [ ] Edit profil
- [ ] Offline cache (simpan data lokal)
- [ ] Push notification pengingat latihan
- [ ] Build APK/AAB buat Play Store (`eas build`)

## Build buat Play Store

```powershell
npm install -g eas-cli
eas login
eas build --platform android --profile production
```

Butuh akun Expo + akun Play Console ($25).

## Catatan teknis

- **`--legacy-peer-deps`** dipakai karena ada konflik peer dep dari `react-dom`.
  App native gak butuh `react-dom`, jadi ini aman.
- **Expo SDK 57**, React Native 0.86, React 19, Expat Router 57.
- **New Architecture** aktif (`newArchEnabled: true`).
- Verifikasi: `npx tsc --noEmit` bersih, dan `npx expo export --platform android`
  menghasilkan bundle 3.2 MB.

