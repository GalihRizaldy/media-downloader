# MusicallyDown - Media Downloader (TikTok, YouTube, Instagram)

Aplikasi web pengunduh media yang dirancang dengan Next.js App Router, Tailwind CSS, Font Awesome, dan terintegrasi dengan RapidAPI. Tampilan mengadopsi tema khas MusicallyDown dengan dominan warna pink/magenta, aksen geometri samar, font *cursive*, kartu detail video transparan, dan tombol aksi berwarna oranye menyala.

---

## 🚀 Fitur Utama
- **Mobile-Responsive & Mobile-First:** Dirancang khusus untuk pengalaman optimal pada perangkat seluler.
- **UI Khas MusicallyDown:**
  - Latar belakang gradasi pink/magenta cerah dengan aksen geometris samar.
  - Header dengan icon hamburger (`fa-bars`) dan judul bertulisan tangan (*cursive*).
  - Bagian "Detail Video" dengan kartu transparan gelap (*rounded*), avatar profil, nama pengguna tebal, dan teks deskripsi/caption.
  - Bagian "Download Sekarang" dengan barisan tombol unduhan vertikal berwarna oranye menyala ("DOWNLOAD MP4", "DOWNLOAD MP4 [HD]", "DOWNLOAD MP3").
  - Tombol "DOWNLOAD VIDEO LAIN" dengan warna *dark slate/charcoal* dan icon panah ke kiri (`fa-arrow-left`) untuk kembali ke menu awal.
- **State & Logic Reaktif:** Menggunakan React Hooks (`useState`) untuk alur input, animasi *loading spinner*, penampilan hasil, dan tombol reset.
- **Backend API Route Aman:** API Key RapidAPI tersimpan aman di sisi server (`app/api/download/route.js`) tanpa terekspos ke klien browser.

---

## 🛠️ Persyaratan Sistem
- Node.js versi 18, 20, atau 22.
- Akun RapidAPI untuk mengakses API [Instagram TikTok YouTube Downloader](https://rapidapi.com/).

---

## 📦 Panduan Instalasi & Menjalankan

1. **Pasang Dependensi:**
   ```bash
   npm install
   ```

2. **Konfigurasi Environment Variable:**
   Salin file `.env.local.example` menjadi `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
   Buka file `.env.local` dan masukkan API Key RapidAPI Anda:
   ```env
   RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY_HERE
   ```

3. **Jalankan Server Development:**
   ```bash
   npm run dev
   ```

4. **Buka di Browser:**
   Akses `http://localhost:3000` di browser Anda.

---

## 📁 Struktur Berkas Utama

```text
├── app/
│   ├── api/
│   │   └── download/
│   │       └── route.js       # Backend API route (RapidAPI fetch & normalisasi data)
│   ├── globals.css            # Styling Tailwind & background geometri
│   ├── layout.js              # Root Layout, Google Font (Pacifico), Font Awesome CDN
│   └── page.js                # Frontend interaktif (Mobile-first, State management)
├── .env.local.example         # Template konfigurasi env
├── package.json               # Dependensi & script Next.js
├── tailwind.config.js         # Konfigurasi tema Tailwind CSS
└── README.md
```
