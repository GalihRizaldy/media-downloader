import { NextResponse } from 'next/server';
import https from 'node:https';
import { validateOriginAndReferer, verifyCsrfToken } from '../../../lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Mengizinkan eksekusi hingga 60 detik di Vercel Serverless

// Helper function untuk POST request ke RapidAPI YouTube endpoint menggunakan node:https
function postRapidApiYoutube(videoUrl, format = '1080p', apiKey, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      url: videoUrl.trim(),
      format: format || '1080p',
    });

    const options = {
      hostname: 'instagram-tiktok-youtube-downloader.p.rapidapi.com',
      port: 443,
      path: '/youtube/download',
      method: 'POST',
      headers: {
        'x-rapidapi-host': 'instagram-tiktok-youtube-downloader.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
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
            data: { detail: rawData || 'Gagal memproses respon dari server YouTube RapidAPI' },
          });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(
        new Error(
          'Proses pengunduhan YouTube di server RapidAPI membutuhkan waktu lebih lama (timeout). Silakan coba resolusi 720p atau ulangi beberapa saat lagi.'
        )
      );
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

export async function POST(request) {
  try {
    // 0. Keamanan: Validasi Origin & Referer (Mencegah Hotlinking lintas domain)
    if (!validateOriginAndReferer(request)) {
      return NextResponse.json(
        { ok: false, error: 'Akses ditolak: Permintaan lintas domain tidak diizinkan.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { url: videoUrl, format = '1080p', csrf: bodyCsrf } = body;

    // 0.1 Keamanan: Validasi Anti-CSRF Token
    const csrfToken = request.headers.get('x-csrf-token') || bodyCsrf;
    if (!verifyCsrfToken(csrfToken)) {
      return NextResponse.json(
        { ok: false, error: 'Sesi tidak valid atau telah kadaluarsa (CSRF Validation Failed). Silakan muat ulang halaman.' },
        { status: 403 }
      );
    }

    // 1. Validasi parameter URL
    if (!videoUrl || !videoUrl.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Parameter "url" wajib diisi di dalam request body.' },
        { status: 400 }
      );
    }

    try {
      new URL(videoUrl.trim());
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Format URL video YouTube tidak valid.' },
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

    // 3. Panggil endpoint YouTube RapidAPI
    const result = await postRapidApiYoutube(videoUrl, format, apiKey);

    if (!result.ok) {
      const errorMsg =
        result.data?.detail ||
        result.data?.message ||
        (result.status === 401 || result.status === 403
          ? 'RapidAPI Key tidak valid atau kuota akun habis.'
          : 'Gagal mengambil video YouTube dari server RapidAPI.');

      return NextResponse.json(
        { ok: false, error: errorMsg },
        { status: result.status || 500 }
      );
    }

    const data = result.data;

    // 4. Cek status ok dari RapidAPI
    if (data.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data.detail ||
            data.message ||
            'Video YouTube tidak ditemukan, berstatus privat, atau resolusi tidak tersedia.',
        },
        { status: 422 }
      );
    }

    // 5. Normalisasi data respon YouTube agar seragam dengan UI frontend
    const cleanTitle = data.filename
      ? data.filename.replace(/\s*\([^)]*\)\s*\.(mp4|mp3|webm)$/i, '')
      : 'YouTube Video';

    const thumbnailUrl =
      data.thumbnails?.max ||
      data.thumbnails?.low ||
      `https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`;

    return NextResponse.json({
      ok: true,
      data: {
        id: data.video_id || Date.now().toString(),
        type: 'youtube',
        title: cleanTitle,
        filename: data.filename,
        originalUrl: videoUrl,
        author: {
          username: '@YouTube',
          avatar: data.thumbnails?.low || thumbnailUrl,
        },
        thumbnail: thumbnailUrl,
        duration: data.duration || null,
        format: format,
        downloads: {
          mp4: data.download_url,
          mp4_hd: data.download_url,
          mp3: format === 'audio' ? data.download_url : null,
        },
        raw: data,
      },
    });
  } catch (error) {
    console.error('YouTube API Route Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Terjadi kesalahan pada server internal YouTube downloader.',
      },
      { status: 500 }
    );
  }
}
