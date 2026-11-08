import crypto from 'node:crypto';

// Kunci rahasia untuk tanda tangan HMAC CSRF
const SECRET_KEY =
  process.env.CSRF_SECRET ||
  process.env.RAPIDAPI_KEY ||
  'musicallydown-security-secret-key-2026';

/**
 * Membuat Anti-CSRF Token bertanda tangan HMAC dengan masa berlaku 1 jam.
 */
export function generateCsrfToken() {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(timestamp)
    .digest('hex')
    .slice(0, 32);

  return `${timestamp}.${signature}`;
}

/**
 * Memverifikasi keabsahan dan masa berlaku Anti-CSRF Token.
 */
export function verifyCsrfToken(token) {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);

  if (isNaN(timestamp)) return false;

  // Cek masa kadaluarsa token (berlaku maksimal 1 jam / 3600000 ms)
  const MAX_AGE = 60 * 60 * 1000;
  if (Date.now() - timestamp > MAX_AGE || timestamp > Date.now() + 60000) {
    return false;
  }

  // Cek keaslian tanda tangan HMAC (mencegah pemalsuan token)
  const expectedSignature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(timestampStr)
    .digest('hex')
    .slice(0, 32);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Memvalidasi Origin & Referer untuk mencegah Hotlinking dan API Leeching lintas domain.
 * Kompatibel dengan Vercel Reverse Proxy (x-forwarded-host).
 */
export function validateOriginAndReferer(request) {
  const host =
    request.headers.get('x-forwarded-host') || request.headers.get('host');
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const secFetchSite = request.headers.get('sec-fetch-site');

  // 1. Jika browser mengirim sec-fetch-site 'cross-site', tolak akses (API Leeching dari web lain)
  if (secFetchSite && secFetchSite === 'cross-site') {
    return false;
  }

  // 2. Jika ada header Origin, pastikan domainnya cocok dengan host server kita
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (host && originHost !== host) {
        return false;
      }
    } catch {
      return false;
    }
  }

  // 3. Jika ada header Referer, pastikan domainnya cocok dengan host server kita
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (host && refererHost !== host) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}
