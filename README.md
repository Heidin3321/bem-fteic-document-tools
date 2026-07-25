# BEM FTEIC Document Tools v4

## Cara menjalankan

1. Extract ZIP.
2. Buka folder hasil extract.
3. Double-click `index.html`.
4. Tidak perlu Python, Flask, CMD, atau `start.bat`.

Koneksi internet diperlukan agar library QR dan PDF dimuat ketika aplikasi dibuka. Logo dan seluruh dokumen tetap diproses di browser; file tidak diunggah ke server aplikasi.

## Bulk QR

Bisa tambah link satu per satu atau pilih **Paste Banyak**:

```text
001_SPP_DAGRI | https://drive.google.com/file/d/...
002_SPP_DAGRI | https://drive.google.com/file/d/...
```

Hasil dapat di-download satu per satu atau sekaligus sebagai ZIP.

## PDF Splitter

Upload satu PDF sumber. Contoh:

```text
1   | 001_SPP_DAGRI
2   | 002_SPP_DAGRI
3-4 | 003_SPP_DAGRI
```

Klik **Split & Download Semua PDF**. Hasilnya ZIP berisi PDF terpisah dengan nama custom dan `MANIFEST.txt`.
