# Deployment v6 ke Vercel

## 1. Catat domain Production Vercel

Buka project Vercel → **Settings → Domains**. Gunakan domain Production, misalnya:

```text
https://bemfteicsekum.vercel.app
```

Jangan memakai URL dashboard `vercel.com/...` dan jangan memakai URL Preview acak.

## 2. Siapkan Google Cloud

1. Buka Google Cloud Console.
2. Buat atau pilih project `BEM FTEIC Document Tools`.
3. Buka **APIs & Services → Library**.
4. Cari dan aktifkan **Google Drive API**.
5. Buka **Google Auth Platform → Branding** dan isi nama aplikasi serta email support.
6. Buka **Audience**:
   - User type: **External**.
   - Publishing status awal: **Testing**.
   - Tambahkan test user `bemfteicits2603@gmail.com`.
7. Buka **Data Access** dan tambahkan scope:

```text
openid
email
profile
https://www.googleapis.com/auth/drive
```

8. Buka **Clients → Create Client**.
9. Application type: **Web application**.
10. Authorized JavaScript origins:

```text
https://DOMAIN-PRODUCTION-VERCEL
```

11. Authorized redirect URIs:

```text
https://DOMAIN-PRODUCTION-VERCEL/api/auth/callback
```

12. Simpan **Client ID** dan **Client Secret**.

> Scope Drive penuh diperlukan karena aplikasi menerima link file dan folder Drive yang sudah ada secara bebas. Jangan menaruh Client Secret di repository atau `app.js`.

## 3. Buat SESSION_SECRET

PowerShell:

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Simpan hasilnya untuk Vercel. Jangan dibagikan atau dimasukkan ke GitHub.

## 4. Isi Environment Variables Vercel

Project Vercel → **Settings → Environment Variables**. Tambahkan untuk **Production**:

```text
APP_URL                 https://DOMAIN-PRODUCTION-VERCEL
GOOGLE_CLIENT_ID        Client ID dari Google Cloud
GOOGLE_CLIENT_SECRET    Client Secret dari Google Cloud
ALLOWED_GOOGLE_EMAIL    bemfteicits2603@gmail.com
SESSION_SECRET          hasil random PowerShell
```

Setelah mengubah environment variables, lakukan redeploy karena perubahan hanya berlaku pada deployment baru.

## 5. Upload source v6 ke GitHub

Pastikan isi folder v6 berada di root repository, bukan menjadi subfolder tambahan. Struktur minimal:

```text
api/
assets/
vendor/
app.js
index.html
styles.css
package.json
vercel.json
README.md
```

Hapus `config.js` versi v5 karena v6 tidak lagi memakai secret/config OAuth di frontend.

Commit seluruh perubahan ke branch Production repository, biasanya `main`. Project Vercel yang terhubung ke GitHub akan otomatis membuat Production Deployment baru.

## 6. Tes deployment

1. Buka:

```text
https://DOMAIN-PRODUCTION-VERCEL/api/health
```

Hasil benar:

```json
{"ok":true,"allowedEmail":"bemfteicits2603@gmail.com"}
```

2. Buka halaman utama.
3. Masuk ke **Drive Duplicator + QR**.
4. Klik **Masuk dengan Google**.
5. Login dengan `bemfteicits2603@gmail.com`.
6. Tes satu file sumber dan satu folder tujuan.
7. Pastikan file baru muncul di folder, link dapat dibuka, dan QR dapat dipindai.
8. Klik logout, kemudian pastikan tombol duplicate terkunci lagi.

## 7. Tes keamanan dasar

- Login menggunakan email selain akun BEM harus ditolak setelah callback.
- POST langsung ke `/api/drive/copy` tanpa cookie session harus menghasilkan HTTP 401.
- Mengubah email melalui DevTools atau mengaktifkan tombol secara manual tidak memberi akses, karena backend memverifikasi session lagi.
- Client Secret dan SESSION_SECRET tidak boleh terlihat di repository, source halaman, atau Network response browser.

## Catatan mode Testing Google

Pada OAuth consent screen berstatus **Testing**, hanya test user yang dapat login dan otorisasi test user dapat kedaluwarsa setelah tujuh hari. Gunakan Testing untuk setup awal. Untuk pemakaian jangka panjang, pertimbangkan memindahkan aplikasi ke **In production** dan mengikuti persyaratan verifikasi Google untuk scope Drive penuh.
