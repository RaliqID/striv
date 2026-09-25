# Deploying Striv

Two pieces deploy separately: the **Laravel API** (needs a real server and
HTTPS) and the **Next.js frontend** (static/edge hosting). The Android app is a
wrapper around the deployed frontend, so both must be live first.

---

## 0. Before you deploy: the production safety gate

`app/Providers/ProductionSafetyProvider.php` **refuses to boot** in production
unless all of these hold. It is not a checklist — the app will throw instead of
quietly leaking data:

| Check | Why it exists |
|---|---|
| `APP_DEBUG=false` | Debug mode renders a full stack trace, including environment values, to whoever triggers a 500. |
| `APP_KEY` set | Without it, encryption and signed URLs cannot be trusted. |
| `CORS_ALLOWED_ORIGINS` not `*` | A wildcard lets any website call the API with a signed-in user's token. |
| `APP_URL` is HTTPS | Tokens and passwords would otherwise travel in clear text. |

Run this to confirm it is working:

```bash
APP_ENV=production php artisan config:clear && php artisan about
```

If a setting is wrong, you get a clear error naming the problem, not a silent
deploy.

---

## 1. Backend (Laravel) — recommended: Railway or Render

Both give you a managed Postgres/MySQL, HTTPS, and a stable domain with no
server administration. A VPS works too; the env below is the same.

### Provision

1. Push the repo to GitHub (already done).
2. Create a new service from the repo. Set the **root directory** to `/`
   (Laravel lives at the repo root).
3. Add a database add-on (MySQL or Postgres) and copy its credentials.

### Build & start commands

```
Build:  composer install --no-dev --optimize-autoloader && php artisan migrate --force
Start:  php artisan serve --host=0.0.0.0 --port=$PORT
```

For a VPS, point Nginx at `public/` instead — never expose the repo root:

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    root /var/www/striv/public;
    index index.php;

    # SPA + API only; nothing else should be reachable.
    location / { try_files $uri $uri/ /index.php?$query_string; }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # Never serve these, even if someone gets the path right.
    location ~ /\.(env|git) { deny all; }
}
```

### Required environment

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.yourdomain.com
APP_KEY=                      # php artisan key:generate --show

# Lock this to your real frontend origin, comma-separated. NOT '*'.
CORS_ALLOWED_ORIGINS=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Where the Google OAuth callback returns to.
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/v1/auth/google/callback

# Cloudflare / load balancer / proxy IPs. Leave blank for the safe default.
TRUSTED_PROXIES=

# AI (9router gateway must be reachable from the server)
AI_PROVIDER=devstack
DEVSTACK_BASE_URI=https://your-9router-host/v1
DEVSTACK_API_KEY=

# Contact form
MAIL_MAILER=smtp
CONTACT_NOTIFY_EMAIL=
```

### First deploy

```bash
php artisan key:generate --show     # copy into APP_KEY
php artisan migrate --force
php artisan db:seed --class=AdminUserSeeder   # creates your admin account
php artisan storage:link            # chat image uploads
php artisan config:cache && php artisan route:cache && php artisan view:cache
```

> After changing any env var, re-run `php artisan config:cache`. The safety
> provider reads config, and a stale cache can hide a misconfiguration.

### Verify

```bash
curl -i https://api.yourdomain.com/up            # 200
curl -i https://api.yourdomain.com/api/v1/auth/user   # 401 + security headers
php artisan ai:status                            # provider chain resolved
```

The 401 response should carry `X-Content-Type-Options`, `X-Frame-Options`,
`Content-Security-Policy`, and (over HTTPS) `Strict-Transport-Security`.

---

## 2. Frontend (Next.js) — Vercel

1. Import the repo, set **root directory** to `frontend`.
2. Environment variable:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

3. Deploy. Then add the Vercel domain to the backend's `CORS_ALLOWED_ORIGINS`
   and `FRONTEND_URL`, and re-run `php artisan config:cache`.

> If you would rather proxy through Next (one origin, no CORS at all), leave
> `NEXT_PUBLIC_API_URL` unset and set `BACKEND_PROXY_URL` instead —
> `next.config.js` already rewrites `/api/*` to it. This is what the share
> tunnel uses.

---

## 3. Google OAuth

In Google Cloud Console → Credentials, add the production callback:

```
https://api.yourdomain.com/api/v1/auth/google/callback
```

Update `GOOGLE_REDIRECT_URI` on the backend. A mismatch here is the usual cause
of `redirect_uri_mismatch`.

---

## 4. Android (Capacitor)

See `frontend/android/README-ANDROID.md` for the build steps. The short version:
the app loads your deployed frontend URL, so **deploy first**.

Key points for Play Store:

- `applicationId` must be unique and permanent (`com.yourname.striv`).
- Bump `versionCode` (integer) and `versionName` (string) for every upload.
- Sign with an **upload key**, and keep the keystore backed up — losing it
  means you cannot ship updates under the same listing.
- Target the API level Google currently requires; `targetSdkVersion` in
  `android/variables.gradle` is what reviewers check.
- Complete the Data Safety form: the app collects email, and stores workout
  and body-measurement data. Declare it accurately — mismatches get apps
  rejected.

---

## Security checklist

Run through this before the app is public:

- [ ] `APP_DEBUG=false` and `APP_ENV=production`
- [ ] `APP_KEY` generated and **not** committed
- [ ] `CORS_ALLOWED_ORIGINS` is your real origin, not `*`
- [ ] `APP_URL` and `FRONTEND_URL` are HTTPS
- [ ] `TRUSTED_PROXIES` narrowed to your proxy (blank = safe default)
- [ ] Database is not publicly reachable
- [ ] `.env` is not in the repo or the deploy artifact
- [ ] Admin account exists and has a strong, unique password
- [ ] `CONTACT_NOTIFY_EMAIL` set, or the contact form silently goes nowhere
- [ ] Login/register throttles verified on the live URL
- [ ] `php artisan config:cache` run after the final env change
- [ ] Backups enabled on the database

### What is already handled in code

- Passwords hashed with bcrypt
- Login throttled per IP (20/min) **and** per IP+account (5/15min); a correct
  password is refused while an account is locked
- Register capped at 5/hour per IP; OAuth endpoints at 10/min
- Suspension enforced by middleware on every authenticated request, not just
  at login
- Admin routes gated by `auth:sanctum` + `admin`
- Append-only audit log of every privileged action
- Security headers on every response, including failures
- Production safety gate refuses to boot on unsafe config
