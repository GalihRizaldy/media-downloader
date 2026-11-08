import { NextResponse } from 'next/server';
import { validateOriginAndReferer } from '../../../lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Mengizinkan eksekusi hingga 60 detik di Vercel Serverless

export async function GET(request) {
  try {
    // 0. Keamanan: Validasi Origin & Referer (Mencegah Hotlinking file proxy dari web lain)
    if (!validateOriginAndReferer(request)) {
      return NextResponse.json(
        { ok: false, error: 'Akses ditolak: Hotlinking atau permintaan lintas domain tidak diizinkan.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');
    const customFilename = searchParams.get('filename');

    // 1. Validasi URL file
    if (!fileUrl || !fileUrl.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Parameter "url" wajib diisi.' },
        { status: 400 }
      );
    }

    // 1.1 Keamanan: Proteksi SSRF (Server-Side Request Forgery)
    try {
      const parsedUrl = new URL(fileUrl.trim());
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return NextResponse.json(
          { ok: false, error: 'Protokol URL tidak didukung.' },
          { status: 400 }
        );
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      // Blokir akses ke localhost atau private network IP
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('172.16.') ||
        hostname.startsWith('169.254.')
      ) {
        return NextResponse.json(
          { ok: false, error: 'Akses ke IP privat/internal diblokir.' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Format URL file tidak valid.' },
        { status: 400 }
      );
    }

    // 2. Fetch data file (video/audio) dari CDN pihak ketiga secara streaming
    const upstreamResponse = await fetch(fileUrl.trim(), {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Gagal mengunduh file dari CDN (Status: ${upstreamResponse.status})`,
        },
        { status: upstreamResponse.status }
      );
    }

    // 3. Tentukan Content-Type
    const contentType =
      upstreamResponse.headers.get('content-type') || 'application/octet-stream';

    // 4. Ambil nama file dan pastikan ekstensinya tepat
    let rawFilename = customFilename || 'video-download.mp4';

    if (!rawFilename.includes('.')) {
      let ext = 'mp4';
      if (contentType.includes('audio') || contentType.includes('mpeg')) {
        ext = 'mp3';
      } else if (contentType.includes('webm')) {
        ext = 'webm';
      }
      rawFilename = `${rawFilename}.${ext}`;
    }

    // 5. Encode nama file sesuai standar RFC 5987 agar aman dari karakter emoji/unicode
    const safeFilename = encodeURIComponent(rawFilename);

    // 6. Susun header response
    const headers = new Headers();
    headers.set('Content-Type', contentType);

    // Hapus header bawaan upstream jika ada
    headers.delete('Content-Disposition');

    // Set ulang header Content-Disposition menggunakan standar RFC 5987
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);

    const contentLength = upstreamResponse.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    // 7. Kembalikan stream body langsung ke browser pengguna (tanpa buffering RAM)
    return new Response(upstreamResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('File Proxy Download Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Terjadi kesalahan saat memproses unduhan file.',
      },
      { status: 500 }
    );
  }
}
