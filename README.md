# BEM FTEIC Document Tools v6 — Secure Vercel Edition

Fitur:

1. **Bulk QR Code** — generate QR berlogo dari banyak link.
2. **PDF Splitter** — pecah satu PDF menjadi banyak file dengan nama custom.
3. **Drive Duplicator + QR** — copy file Drive, rename, taruh ke folder tujuan, tampilkan link baru, dan generate QR otomatis.

## Perubahan keamanan v6

Versi v5 menyimpan OAuth access token di browser dan mengecek email lewat JavaScript frontend. Pemeriksaan seperti itu dapat dimodifikasi oleh pengguna.

Versi v6 memakai **OAuth Authorization Code Flow di backend Vercel**:

- Client secret hanya disimpan di Vercel Environment Variables.
- Google ID token diverifikasi dengan public key Google.
- Email kembali diperiksa di setiap API request.
- Access token dan refresh token berada di cookie HttpOnly yang terenkripsi AES-256-GCM.
- Browser tidak menerima token Google.
- Endpoint copy Drive memeriksa session, email, origin, file sumber, dan izin folder tujuan.
- OAuth memakai `state`, `nonce`, dan PKCE.

JavaScript frontend dapat dilihat atau diubah, tetapi operasi Drive tetap ditolak oleh backend apabila session bukan milik akun yang diizinkan.

## Environment Variables

```env
APP_URL=https://nama-project.vercel.app
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
ALLOWED_GOOGLE_EMAIL=bemfteicits2603@gmail.com
SESSION_SECRET=random-secret-minimal-32-karakter
```

Jangan commit `.env` atau nilai secret ke GitHub.

## Google OAuth redirect URI

```text
https://nama-project.vercel.app/api/auth/callback
```

Harus sama persis dengan `APP_URL` yang dipasang di Vercel.

## Deploy

Baca [DEPLOYMENT.md](DEPLOYMENT.md).
