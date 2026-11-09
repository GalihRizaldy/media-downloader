'use client';

import { useState, useEffect } from 'react';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState(''); // Anti-Bot Honeypot field
  const [csrfToken, setCsrfToken] = useState(''); // Anti-CSRF Token
  const [loading, setLoading] = useState(false);
  const [formatLoading, setFormatLoading] = useState(null); // '720p' | 'audio' | null
  const [error, setError] = useState(null);
  const [videoData, setVideoData] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Ambil Anti-CSRF Token saat halaman pertama kali dimuat
  useEffect(() => {
    fetchCsrfToken();
  }, []);

  const fetchCsrfToken = async () => {
    try {
      const res = await fetch('/api/csrf');
      const data = await res.json();
      if (data.ok && data.csrfToken) {
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    } catch (err) {
      console.warn('CSRF token fetch error:', err);
    }
    return '';
  };

  // Helper untuk mendeteksi apakah URL adalah link YouTube
  const isYoutubeUrl = (inputUrl) => {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(inputUrl.trim());
  };

  // Fungsi submit form cerdas (otomatis membedakan YouTube vs TikTok/Instagram)
  const handleSubmit = async (e) => {
    e?.preventDefault();

    // 1. Keamanan: Cek Honeypot (jika terisi, abaikan karena bot)
    if (honeypot) {
      console.warn('Bot form otomatis terdeteksi.');
      return;
    }

    const cleanUrl = url.trim();

    // 2. Validasi input URL kosong
    if (!cleanUrl) {
      setError('Harap masukkan URL video TikTok, YouTube, atau Instagram terlebih dahulu.');
      return;
    }

    // 3. Validasi format URL
    try {
      const parsed = new URL(cleanUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error();
      }
    } catch {
      setError('Format URL tidak valid. Harap sertakan URL lengkap (contoh: https://www.tiktok.com/...)');
      return;
    }

    setLoading(true);
    setError(null);

    // Amankan token CSRF (fallback fetch jika belum sempat terisi)
    let activeToken = csrfToken;
    if (!activeToken) {
      activeToken = await fetchCsrfToken();
    }

    try {
      let response;
      let result;

      if (isYoutubeUrl(cleanUrl)) {
        // Panggil endpoint YouTube (metode POST) dengan Anti-CSRF token
        response = await fetch('/api/youtube', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': activeToken,
          },
          body: JSON.stringify({ url: cleanUrl, format: '1080p', csrf: activeToken }),
        });
        result = await response.json();
      } else {
        // Panggil endpoint universal TikTok / Instagram (metode GET) dengan Anti-CSRF token
        response = await fetch(`/api/download?url=${encodeURIComponent(cleanUrl)}`, {
          headers: {
            'x-csrf-token': activeToken,
          },
        });
        result = await response.json();
      }

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Gagal memproses URL video.');
      }

      setVideoData(result.data);
    } catch (err) {
      setError(err.message || 'Terjadi gangguan jaringan atau server.');
    } finally {
      setLoading(false);
    }
  };

  // Fungsi reset untuk kembali ke form input awal
  const handleReset = () => {
    setVideoData(null);
    setUrl('');
    setError(null);
    setFormatLoading(null);
  };

  // Fungsi tempel (paste) dari clipboard
  const handlePaste = async () => {
    try {
      if (navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUrl(text);
          setError(null);
        }
      }
    } catch (err) {
      console.warn('Clipboard permission error:', err);
    }
  };

  // Fungsi bersihkan (clear) input
  const handleClear = () => {
    setUrl('');
    setError(null);
  };

  // Helper untuk membuat link unduhan melalui API Proxy (Force Download)
  const getDownloadProxyUrl = (targetUrl, filename) => {
    if (!targetUrl) return '#';
    return `/api/file?url=${encodeURIComponent(targetUrl)}&filename=${encodeURIComponent(filename)}`;
  };

  // ========================================================
  // PENAMAAN FILE DI AMBIL LANGSUNG DARI TITLE SUMBER ASLI
  // ========================================================
  const mediaRawTitle =
    videoData?.filename ||
    videoData?.title ||
    videoData?.caption ||
    'media-download';

  // Bersihkan karakter ilegal filesystem OS dan ekstensi ganda
  const cleanMediaTitle = mediaRawTitle
    .replace(/\.(mp4|mp3|webm|m4a)$/i, '')
    .replace(/[/\\?%*:|"<>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'media-download';

  // Batasi panjang wajar (maks 120 char) agar kompatibel di Windows, Android, dan iOS
  const sourceTitle = cleanMediaTitle.slice(0, 120);

  const downloadFilenameMp4 = `${sourceTitle}.mp4`;
  const downloadFilenameMp3 = `${sourceTitle}.mp3`;

  // Handler untuk mengunduh format YouTube on-demand (misal: 720p atau MP3 audio)
  const handleYoutubeFormatDownload = async (format) => {
    if (!videoData?.originalUrl) return;

    setFormatLoading(format);
    let activeToken = csrfToken || (await fetchCsrfToken());

    try {
      const response = await fetch('/api/youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': activeToken,
        },
        body: JSON.stringify({
          url: videoData.originalUrl,
          format,
          csrf: activeToken,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Gagal mengambil format ${format}`);
      }

      const downloadUrl = result.data?.downloads?.mp4 || result.data?.downloads?.mp3;
      if (downloadUrl) {
        const targetFilename = format === 'audio' ? downloadFilenameMp3 : downloadFilenameMp4;
        const proxyUrl = getDownloadProxyUrl(downloadUrl, targetFilename);

        // Update state cache agar tidak perlu fetch ulang jika diklik lagi
        if (format === 'audio') {
          setVideoData((prev) => ({
            ...prev,
            downloads: { ...prev.downloads, mp3: downloadUrl },
          }));
        }

        // Trigger unduh langsung
        window.location.href = proxyUrl;
      }
    } catch (err) {
      alert(err.message || 'Gagal mengunduh format yang diminta.');
    } finally {
      setFormatLoading(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-geometric-pattern bg-grid-subtle flex flex-col justify-between overflow-x-hidden">
      {/* Aksen Geometri Dekoratif Samar Ringan (Performa Halus) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 md:w-96 h-72 md:h-96 rounded-full bg-white/10 blur-2xl transform -rotate-12"></div>
        <div className="absolute top-1/4 -right-24 w-80 md:w-[28rem] h-80 md:h-[28rem] rotate-45 bg-pink-400/10 rounded-3xl blur-xl"></div>
        <div className="absolute -bottom-28 left-1/3 w-72 md:w-96 h-72 md:h-96 rounded-full bg-purple-500/15 blur-2xl"></div>
      </div>

      {/* ======================================================== */}
      {/* HEADER / TOP BAR                                         */}
      {/* ======================================================== */}
      <header className="relative z-30 w-full border-b border-white/15 bg-black/20 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between">
          {/* Sisi Kiri: Hamburger di Mobile / Logo di Desktop */}
          <div className="flex items-center gap-4">
            {/* Tombol Hamburger (Khusus Mobile: md:hidden) */}
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-white hover:text-white/80 active:scale-95 transition-transform duration-150"
              aria-label="Toggle Menu"
            >
              <i className={`fa-solid ${isMenuOpen ? 'fa-xmark' : 'fa-bars'} text-2xl`}></i>
            </button>

            {/* Logo Teks Cursive: Media Downloader */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={handleReset}>
              <span className="font-cursive text-2xl sm:text-3xl md:text-3xl lg:text-4xl text-white tracking-wide drop-shadow-md hover:scale-[1.01] transition-transform duration-150">
                Media Downloader
              </span>
            </div>
          </div>

          {/* Sisi Tengah: Menu Navigasi Horizontal (Khusus Desktop: hidden md:flex) */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-2">
            <button
              type="button"
              onClick={() => {
                setUrl('https://www.tiktok.com/@505_playlist/video/7663771923943263508');
                setVideoData(null);
              }}
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition-all duration-150 flex items-center gap-2"
            >
              <i className="fa-brands fa-tiktok text-pink-300"></i>
              <span>TikTok</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
                setVideoData(null);
              }}
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition-all duration-150 flex items-center gap-2"
            >
              <i className="fa-brands fa-youtube text-red-300"></i>
              <span>YouTube</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUrl('https://www.instagram.com/reels/');
                setVideoData(null);
              }}
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition-all duration-150 flex items-center gap-2"
            >
              <i className="fa-brands fa-instagram text-rose-300"></i>
              <span>Instagram</span>
            </button>
          </nav>

          {/* Sisi Kanan: Tombol Info (Tombol Paste Desktop telah dihilangkan) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() =>
                alert('Media Downloader v2.0\nUnduh video TikTok, YouTube, dan Instagram dengan cepat tanpa watermark.')
              }
              className="p-2 text-white/80 hover:text-white active:scale-95 transition-all duration-150"
              aria-label="Information"
            >
              <i className="fa-regular fa-circle-question text-xl"></i>
            </button>
          </div>
        </div>

        {/* Dropdown Menu Khusus Mobile saat Hamburger Diklik */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-white/15 bg-black/85 backdrop-blur-lg px-4 py-3 flex flex-col gap-1 shadow-2xl animate-smooth-in">
            <button
              type="button"
              onClick={() => {
                setUrl('https://www.tiktok.com/@505_playlist/video/7663771923943263508');
                setIsMenuOpen(false);
                setVideoData(null);
              }}
              className="w-full text-left py-2.5 px-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors duration-150"
            >
              <i className="fa-brands fa-tiktok text-base w-5 text-pink-300"></i>
              <span>TikTok Downloader</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
                setIsMenuOpen(false);
                setVideoData(null);
              }}
              className="w-full text-left py-2.5 px-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors duration-150"
            >
              <i className="fa-brands fa-youtube text-base w-5 text-red-300"></i>
              <span>YouTube Downloader</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUrl('https://www.instagram.com/reels/');
                setIsMenuOpen(false);
                setVideoData(null);
              }}
              className="w-full text-left py-2.5 px-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors duration-150"
            >
              <i className="fa-brands fa-instagram text-base w-5 text-rose-300"></i>
              <span>Instagram Downloader</span>
            </button>
          </div>
        )}
      </header>

      {/* ======================================================== */}
      {/* KONTEN UTAMA                                             */}
      {/* ======================================================== */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-8 md:py-12 w-full max-w-6xl mx-auto">
        {/* ======================================================== */}
        {/* VIEW 1: FORM INPUT UTAMA                                 */}
        {/* ======================================================== */}
        {!videoData ? (
          <div className="w-full flex flex-col items-center text-center animate-smooth-in">
            {/* Tagline Cursive Hero */}
            <h1 className="font-cursive text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white mb-2 md:mb-3 drop-shadow-lg">
              Media Downloader
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-pink-100 font-medium mb-6 md:mb-8 max-w-xl">
              Unduh video TikTok, YouTube & Instagram tanpa watermark gratis dengan kualitas HD!
            </p>

            {/* Kotak Card Form Utama */}
            <div className="w-full max-w-md sm:max-w-xl md:max-w-2xl bg-black/45 backdrop-blur-md rounded-2xl md:rounded-3xl p-5 sm:p-7 md:p-8 border border-white/20 shadow-2xl transition-all duration-200">
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* 1. Keamanan: Honeypot Anti-Bot (Tersembunyi bagi manusia, bot akan mengisinya) */}
                <input
                  type="text"
                  name="_dummy_hp"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="hidden"
                  tabIndex="-1"
                  autoComplete="off"
                  aria-hidden="true"
                />

                {/* Input Field dengan Logika Dinamis Tombol Paste / Clear */}
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-gray-400 pointer-events-none">
                    <i className="fa-solid fa-link text-base md:text-lg"></i>
                  </div>
                  <input
                    type="url"
                    name="_BDu"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Tempel link video TikTok, YouTube, atau Instagram..."
                    disabled={loading}
                    className="w-full pl-11 pr-24 md:pr-28 py-3.5 md:py-4 bg-white text-gray-800 placeholder-gray-400 rounded-xl md:rounded-2xl text-sm md:text-base font-medium focus:outline-none focus:ring-4 focus:ring-pink-300 shadow-inner disabled:opacity-75 transition-all duration-150"
                  />

                  {/* LOGIKA TOMBOL: JIKA KOSONG MUNCUL PASTE, JIKA TERISI MUNCUL CLEAR */}
                  {url ? (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="absolute right-2.5 px-3 py-1.5 md:py-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-xs md:text-sm font-semibold text-gray-700 rounded-lg md:rounded-xl flex items-center gap-1.5 border border-gray-300 transition-all duration-150 shadow-sm"
                      title="Hapus teks URL"
                    >
                      <i className="fa-solid fa-xmark text-sm text-gray-500"></i>
                      <span>Clear</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePaste}
                      disabled={loading}
                      className="absolute right-2.5 px-3 py-1.5 md:py-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-xs md:text-sm font-semibold text-gray-700 rounded-lg md:rounded-xl flex items-center gap-1.5 border border-gray-300 transition-all duration-150 shadow-sm"
                      title="Tempel link dari clipboard"
                    >
                      <i className="fa-regular fa-paste text-gray-500"></i>
                      <span>Paste</span>
                    </button>
                  )}
                </div>

                {/* Pesan Kesalahan jika ada */}
                {error && (
                  <div className="bg-rose-950/80 border border-rose-400 text-rose-100 text-xs md:text-sm text-left px-4 py-3 rounded-xl flex items-center gap-2.5 animate-smooth-in">
                    <i className="fa-solid fa-circle-exclamation text-rose-300 text-base shrink-0"></i>
                    <span>{error}</span>
                  </div>
                )}

                {/* Tombol Submit "DOWNLOAD" Oranye Menyala */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 md:py-4 bg-[#ff5722] hover:bg-[#f4511e] active:scale-[0.98] text-white font-bold text-base md:text-lg tracking-wide rounded-xl md:rounded-2xl shadow-xl transition-all duration-150 flex items-center justify-center gap-2.5 disabled:opacity-75 disabled:cursor-not-allowed hover:shadow-orange-500/20"
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin text-lg md:text-xl"></i>
                      <span>MEMPROSES VIDEO...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-download text-lg md:text-xl"></i>
                      <span>DOWNLOAD</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Platform Badges */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-6 md:mt-8 text-white/80 text-xs sm:text-sm font-medium">
              <span className="flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-white/10 shadow-sm">
                <i className="fa-brands fa-tiktok text-sm"></i> TikTok
              </span>
              <span className="flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-white/10 shadow-sm">
                <i className="fa-brands fa-youtube text-sm text-red-300"></i> YouTube
              </span>
              <span className="flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-white/10 shadow-sm">
                <i className="fa-brands fa-instagram text-sm text-pink-300"></i> Instagram
              </span>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* VIEW 2: HASIL DETAIL VIDEO & TOMBOL DOWNLOAD             */
          /* ======================================================== */
          <div className="w-full max-w-md md:max-w-4xl mx-auto animate-smooth-in">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start">
              {/* ==================================================== */}
              {/* KOLOM KIRI (Desktop: 5 cols): SECTION DETAIL VIDEO    */}
              {/* ==================================================== */}
              <div className="md:col-span-5 flex flex-col">
                <h2 className="font-cursive text-2xl md:text-3xl text-white mb-2 md:mb-3 drop-shadow">
                  Detail Video:
                </h2>

                {/* Card Detail Transparan Gelap */}
                <div className="bg-black/60 backdrop-blur-md rounded-2xl md:rounded-3xl p-5 border border-white/15 shadow-2xl flex flex-col gap-4">
                  {/* Thumbnail / Header Preview jika ada */}
                  {videoData.thumbnail && (
                    <div className="relative w-full h-44 sm:h-52 rounded-xl md:rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 shadow-inner">
                      <img
                        src={videoData.thumbnail}
                        alt="Thumbnail"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs font-semibold flex items-center gap-1.5 border border-white/10">
                        {videoData.type === 'youtube' ? (
                          <>
                            <i className="fa-brands fa-youtube text-red-400"></i> YouTube
                          </>
                        ) : (
                          <>
                            <i className="fa-brands fa-tiktok text-pink-400"></i> Video
                          </>
                        )}
                      </div>
                      {videoData.duration && (
                        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-mono font-semibold">
                          {videoData.duration}s
                        </div>
                      )}
                    </div>
                  )}

                  {/* Profil Avatar & Username */}
                  <div className="flex items-center gap-3.5">
                    <div className="shrink-0">
                      {videoData.author?.avatar ? (
                        <img
                          src={videoData.author.avatar}
                          alt={videoData.author.username || 'Creator Avatar'}
                          className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover border-2 border-pink-400 shadow-md bg-neutral-800"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src =
                              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-pink-500/40 border-2 border-pink-400 flex items-center justify-center text-white text-xl font-bold">
                          <i className="fa-solid fa-user"></i>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-base md:text-lg truncate">
                          {videoData.author?.username || '@creator'}
                        </span>
                        <i className="fa-solid fa-circle-check text-blue-400 text-xs"></i>
                      </div>
                      <span className="text-xs text-pink-200">
                        {videoData.type === 'youtube' ? 'YouTube Official' : 'Creator Verified'}
                      </span>
                    </div>
                  </div>

                  {/* Caption / Hashtags */}
                  <div className="border-t border-white/10 pt-3">
                    <p className="text-xs md:text-sm text-gray-200 line-clamp-4 leading-relaxed break-words">
                      {videoData.title || 'Video tanpa deskripsi'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ==================================================== */}
              {/* KOLOM KANAN (Desktop: 7 cols): SECTION DOWNLOAD      */}
              {/* ==================================================== */}
              <div className="md:col-span-7 flex flex-col">
                <h2 className="font-cursive text-2xl md:text-3xl text-white mb-2 md:mb-3 drop-shadow">
                  Download Sekarang:
                </h2>

                {/* Barisan Tombol Unduhan Disusun Vertikal */}
                <div className="flex flex-col gap-3.5">
                  {/* --- JIKA INI KONTEN YOUTUBE --- */}
                  {videoData.type === 'youtube' ? (
                    <>
                      {/* Tombol DOWNLOAD MP4 [1080p] Mengikuti Title Sumber Asli */}
                      <a
                        href={getDownloadProxyUrl(videoData.downloads?.mp4_hd, downloadFilenameMp4)}
                        download={downloadFilenameMp4}
                        className="w-full py-4 px-5 bg-[#ff5722] hover:bg-[#f4511e] active:scale-[0.98] text-white font-bold text-sm md:text-base tracking-wide rounded-xl md:rounded-2xl shadow-xl transition-all duration-150 text-center flex items-center justify-center gap-2.5 hover:shadow-orange-500/20"
                      >
                        <i className="fa-solid fa-film text-base md:text-lg"></i>
                        <span>DOWNLOAD MP4 [1080p HD]</span>
                      </a>

                      {/* Tombol DOWNLOAD MP4 [720p] On-Demand */}
                      <button
                        type="button"
                        onClick={() => handleYoutubeFormatDownload('720p')}
                        disabled={formatLoading === '720p'}
                        className="w-full py-4 px-5 bg-[#ff5722] hover:bg-[#f4511e] active:scale-[0.98] text-white font-bold text-sm md:text-base tracking-wide rounded-xl md:rounded-2xl shadow-xl transition-all duration-150 text-center flex items-center justify-center gap-2.5 hover:shadow-orange-500/20 disabled:opacity-75"
                      >
                        {formatLoading === '720p' ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin text-base md:text-lg"></i>
                            <span>MENYIAPKAN 720p...</span>
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-video text-base md:text-lg"></i>
                            <span>DOWNLOAD MP4 [720p]</span>
                          </>
                        )}
                      </button>

                      {/* Tombol DOWNLOAD MP3 On-Demand */}
                      <button
                        type="button"
                        onClick={() => handleYoutubeFormatDownload('audio')}
                        disabled={formatLoading === 'audio'}
                        className="w-full py-4 px-5 bg-[#ff5722] hover:bg-[#f4511e] active:scale-[0.98] text-white font-bold text-sm md:text-base tracking-wide rounded-xl md:rounded-2xl shadow-xl transition-all duration-150 text-center flex items-center justify-center gap-2.5 hover:shadow-orange-500/20 disabled:opacity-75"
                      >
                        {formatLoading === 'audio' ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin text-base md:text-lg"></i>
                            <span>MENYIAPKAN AUDIO MP3...</span>
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-music text-base md:text-lg"></i>
                            <span>DOWNLOAD MP3</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    /* --- JIKA INI KONTEN TIKTOK / INSTAGRAM --- */
                    <>
                      {/* Tombol DOWNLOAD MP4 Mengikuti Title Sumber Asli */}
                      <a
                        href={getDownloadProxyUrl(videoData.downloads?.mp4, downloadFilenameMp4)}
                        download={downloadFilenameMp4}
                        className="w-full py-4 px-5 bg-[#ff5722] hover:bg-[#f4511e] active:scale-[0.98] text-white font-bold text-sm md:text-base tracking-wide rounded-xl md:rounded-2xl shadow-xl transition-all duration-150 text-center flex items-center justify-center gap-2.5 hover:shadow-orange-500/20"
                      >
                        <i className="fa-solid fa-video text-base md:text-lg"></i>
                        <span>DOWNLOAD MP4</span>
                      </a>

                      {/* Tombol DOWNLOAD MP4 [HD] Mengikuti Title Sumber Asli */}
                      <a
                        href={getDownloadProxyUrl(
                          videoData.downloads?.mp4_hd || videoData.downloads?.mp4,
                          downloadFilenameMp4
                        )}
                        download={downloadFilenameMp4}
                        className="w-full py-4 px-5 bg-[#ff5722] hover:bg-[#f4511e] active:scale-[0.98] text-white font-bold text-sm md:text-base tracking-wide rounded-xl md:rounded-2xl shadow-xl transition-all duration-150 text-center flex items-center justify-center gap-2.5 hover:shadow-orange-500/20"
                      >
                        <i className="fa-solid fa-film text-base md:text-lg"></i>
                        <span>DOWNLOAD MP4 [HD]</span>
                      </a>

                      {/* Tombol DOWNLOAD MP3 (Jika audio tersedia) Mengikuti Title Sumber Asli */}
                      {videoData.downloads?.mp3 && (
                        <a
                          href={getDownloadProxyUrl(videoData.downloads.mp3, downloadFilenameMp3)}
                          download={downloadFilenameMp3}
                          className="w-full py-4 px-5 bg-[#ff5722] hover:bg-[#f4511e] active:scale-[0.98] text-white font-bold text-sm md:text-base tracking-wide rounded-xl md:rounded-2xl shadow-xl transition-all duration-150 text-center flex items-center justify-center gap-2.5 hover:shadow-orange-500/20"
                        >
                          <i className="fa-solid fa-music text-base md:text-lg"></i>
                          <span>DOWNLOAD MP3</span>
                        </a>
                      )}
                    </>
                  )}

                  {/* Tombol Reset: DOWNLOAD VIDEO LAIN */}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full mt-2 py-4 px-5 bg-[#212529] hover:bg-[#1a1e21] active:scale-[0.98] text-white font-bold text-sm md:text-base tracking-wide rounded-xl md:rounded-2xl shadow-xl transition-all duration-150 flex items-center justify-center gap-2.5 border border-white/15"
                  >
                    <i className="fa-solid fa-arrow-left text-base md:text-lg"></i>
                    <span>DOWNLOAD VIDEO LAIN</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* FOOTER RESPONSIF                                         */}
      {/* ======================================================== */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-black/20 backdrop-blur-sm py-5 text-center text-xs text-white/70">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Media Downloader. All rights reserved.</p>
          <div className="flex items-center gap-4 text-white/80">
            <span className="hover:text-white cursor-pointer transition-colors duration-150">Ketentuan Layanan</span>
            <span>•</span>
            <span className="hover:text-white cursor-pointer transition-colors duration-150">Kebijakan Privasi</span>
            <span>•</span>
            <span className="hover:text-white cursor-pointer transition-colors duration-150">Kontak</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
