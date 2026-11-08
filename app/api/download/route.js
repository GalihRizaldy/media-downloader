import { NextResponse } from 'next/server';
import https from 'node:https';
import { validateOriginAndReferer, verifyCsrfToken } from '../../../lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Mengizinkan eksekusi hingga 60 detik di Vercel Serverless

// Helper function untuk melakukan HTTPS request menggunakan node:https
function fetchRapidApi(targetUrl, apiKey, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const encodedTargetUrl = encodeURIComponent(targetUrl.trim());
    const path = `/fetch?url=${encodedTargetUrl}`;

    const options = {
      hostname: 'instagram-tiktok-youtube-downloader.p.rapidapi.com',
      port: 443,
      path,
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'instagram-tiktok-youtube-downloader.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      timeout: timeoutMs,
    };

    const req = https.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        rawData += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(rawData);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: json,
          });
        } catch (parseError) {
          resolve({
            ok: false,
            status: res.statusCode,
            data: { detail: rawData || 'Gagal memproses data dari RapidAPI' },
          });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Koneksi ke RapidAPI timeout. Silakan periksa koneksi internet Anda atau coba lagi.'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

export async function GET(request) {
  try {
    // 0. Keamanan: Validasi Origin & Referer (Mencegah API Leeching / Hotlinking)
    if (!validateOriginAndReferer(request)) {
      return NextResponse.json(
        { ok: false, error: 'Akses ditolak: Permintaan lintas domain tidak diizinkan.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');

    // 0.1 Keamanan: Validasi Anti-CSRF Token
    const csrfToken = request.headers.get('x-csrf-token') || searchParams.get('csrf');
    if (!verifyCsrfToken(csrfToken)) {
      return NextResponse.json(
        { ok: false, error: 'Sesi tidak valid atau telah kadaluarsa (CSRF Validation Failed). Silakan muat ulang halaman.' },
        { status: 403 }
      );
    }

    // 1. Validasi parameter URL
    if (!videoUrl || !videoUrl.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Parameter "url" wajib diisi.' },
        { status: 400 }
      );
    }

    try {
      new URL(videoUrl.trim());
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Format URL video tidak valid.' },
        { status: 400 }
      );
    }

    // 2. Cek API Key RapidAPI di environment variable
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'RAPIDAPI_KEY belum dikonfigurasi di file environment. Silakan tambahkan RAPIDAPI_KEY di dashboard Vercel.',
        },
        { status: 500 }
      );
    }

    // 3. Panggil RapidAPI menggunakan helper yang aman dari timeout
    const result = await fetchRapidApi(videoUrl, apiKey);

    if (!result.ok) {
      const errorMsg =
        result.data?.detail ||
        result.data?.message ||
        (result.status === 401 || result.status === 403
          ? 'RapidAPI Key tidak valid atau kuota akun habis.'
          : 'Terjadi kesalahan saat memproses video di RapidAPI.');

      return NextResponse.json(
        { ok: false, error: errorMsg },
        { status: result.status || 500 }
      );
    }

    const data = result.data;

    // 4. Cek status respon internal dari endpoint RapidAPI
    if (data.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data.detail ||
            data.message ||
            'Video tidak ditemukan, berstatus privat, atau format link tidak didukung.',
        },
        { status: 422 }
      );
    }

    // 5. Ekstrak username (dari metadata API atau fallback ekstrak dari URL @username)
    let extractedUsername =
      data.author?.username ||
      data.author?.unique_id ||
      data.author?.name ||
      data.username ||
      data.author ||
      '';

    if (!extractedUsername) {
      const matchUsername = videoUrl.match(/@([a-zA-Z0-9_.-]+)/);
      if (matchUsername && matchUsername[1]) {
        extractedUsername = matchUsername[1];
      } else {
        extractedUsername = 'creator';
      }
    }

    if (!extractedUsername.startsWith('@')) {
      extractedUsername = `@${extractedUsername}`;
    }

    const caption =
      data.caption ||
      data.title ||
      data.description ||
      'Video tanpa deskripsi';

    const thumbnailUrl =
      data.thumbnail_url ||
      data.thumbnail ||
      data.cover ||
      '';

    const authorAvatar =
      data.author?.avatar ||
      data.author?.avatar_thumb ||
      data.author?.profile_pic_url ||
      data.avatar ||
      thumbnailUrl ||
      '';

    // Link download video MP4, HD, dan MP3
    const primaryDownloadUrl =
      data.download_url ||
      data.url ||
      (Array.isArray(data.items) && data.items[0]?.download_url) ||
      '';

    const hdDownloadUrl =
      data.download_hd_url ||
      data.hd_url ||
      data.url_hd ||
      primaryDownloadUrl;

    const audioUrl =
      data.music_url ||
      data.music?.download_url ||
      data.audio_url ||
      data.music ||
      '';

    return NextResponse.json({
      ok: true,
      data: {
        id: data.id || Date.now().toString(),
        type: data.type || 'video',
        title: caption,
        author: {
          username: extractedUsername,
          avatar: authorAvatar,
        },
        thumbnail: thumbnailUrl,
        duration: data.duration || null,
        downloads: {
          mp4: primaryDownloadUrl,
          mp4_hd: hdDownloadUrl,
          mp3: audioUrl,
        },
        items: Array.isArray(data.items) ? data.items : [],
        raw: data,
      },
    });
  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Terjadi kesalahan pada server internal.',
      },
      { status: 500 }
    );
  }
}
