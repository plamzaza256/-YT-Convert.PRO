const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// High-speed In-Memory Cache
const CONVERT_CACHE = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function extractVideoId(inputUrl) {
    if (!inputUrl) return null;
    const clean = inputUrl.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;

    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/v\/|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
        const match = clean.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

function fetchJson(targetUrl, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const parsed = new URL(targetUrl);
            const reqOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: options.method || 'GET',
                headers: options.headers || {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                },
                timeout: options.timeout || 15000
            };

            const protocol = parsed.protocol === 'https:' ? https : http;
            const req = protocol.request(reqOptions, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const nextUrl = res.headers.location.startsWith('http')
                        ? res.headers.location
                        : new URL(res.headers.location, targetUrl).href;
                    return fetchJson(nextUrl, options).then(resolve).catch(reject);
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, data: JSON.parse(data) });
                    } catch (e) {
                        resolve({ status: res.statusCode, raw: data });
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            if (options.body) {
                req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

// Provider 1: Loader.to (มีขยายเวลา Polling เป็น 60 รอบ)
async function convertViaLoaderTo(videoUrl, format, quality) {
    let fmt = (format || 'mp3').toLowerCase();
    if (fmt === 'mp4') {
        fmt = (quality === '1080' || quality === '720' || quality === '480' || quality === '360') ? quality : '720';
    }

    const startUrl = `https://loader.to/ajax/download.php?format=${encodeURIComponent(fmt)}&url=${encodeURIComponent(videoUrl)}`;
    console.log(`[*] [Loader.to] เริ่มแปลง: ${fmt.toUpperCase()} (${videoUrl})`);
    
    const startRes = await fetchJson(startUrl, { timeout: 15000 });
    if (!startRes.data || !startRes.data.id) {
        throw new Error('Loader.to ไม่ตอบสนอง');
    }

    const taskId = startRes.data.id;
    const progressUrl = startRes.data.progress_url || `https://loader.to/ajax/progress.php?id=${taskId}`;

    // เพิ่มเป็น 60 รอบ x 1 วินาที = สูงสุด 60 วินาที
    for (let i = 1; i <= 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const pRes = await fetchJson(progressUrl, { timeout: 8000 }).catch(() => null);
        if (pRes && pRes.data) {
            if (pRes.data.download_url) {
                return pRes.data.download_url;
            }
            if (pRes.data.success === 1 && pRes.data.progress >= 1000 && pRes.data.download_url) {
                return pRes.data.download_url;
            }
        }
    }
    throw new Error('Loader.to ประมวลผลช้าเกินกำหนด');
}

// Provider 2: Cobalt Direct Stream (ความเร็วสูงพิเศษ ไม่ต้องรอนาน)
async function convertViaCobalt(videoUrl, format, quality) {
    console.log(`[*] [Cobalt] เริ่มดึงลิงก์ตรงสำรอง...`);
    const isAudio = ['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(format.toLowerCase());
    
    const res = await fetchJson('https://co.wuk.sh/api/json', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        body: {
            url: videoUrl,
            vQuality: quality || '720',
            aFormat: isAudio ? format.toLowerCase() : 'mp3',
            isAudioOnly: isAudio
        },
        timeout: 12000
    });

    if (res.data && res.data.url) {
        return res.data.url;
    }
    throw new Error('Cobalt API ไม่สามารถสร้างลิงก์ได้');
}

// Master Converter (สลับเซิร์ฟเวอร์อัตโนมัติหากค้าง)
async function convertVideoSmart(videoUrl, format, quality) {
    // ลองใช้ Loader.to ก่อน
    try {
        return await convertViaLoaderTo(videoUrl, format, quality);
    } catch (err1) {
        console.warn(`[!] Loader.to ล้มเหลว (${err1.message}) -> กำลังสลับไปใช้ API สำรอง...`);
        
        // ถ้าเป็น 1080p แล้วค้าง ให้สลับลอง 720p อัตโนมัติ
        const tryQuality = (quality === '1080') ? '720' : quality;
        
        try {
            return await convertViaCobalt(videoUrl, format, tryQuality);
        } catch (err2) {
            // หากยังไม่ได้ ให้ลอง Loader.to อีกครั้งที่ความละเอียด 720p
            if (quality === '1080') {
                console.warn(`[!] กำลังพยายามลดความละเอียดลงเหลือ 720p เพื่อให้ดาวน์โหลดสำเร็จ...`);
                return await convertViaLoaderTo(videoUrl, format, '720');
            }
            throw new Error('เซิร์ฟเวอร์แปลงไฟล์ทั้งหมดไม่ตอบสนอง กรุณาลองใหม่อีกครั้งในภายหลัง');
        }
    }
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    // 1. API: Get Video Info
    if (req.method === 'GET' && pathname === '/api/info') {
        const videoUrl = parsedUrl.searchParams.get('url');
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'ลิงก์ YouTube ไม่ถูกต้อง' }));
        }

        try {
            const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
            const oRes = await fetchJson(oembedUrl);
            const oData = oRes.data || {};

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                success: true,
                info: {
                    id: videoId,
                    url: canonicalUrl,
                    title: oData.title || `YouTube Video (${videoId})`,
                    author: oData.author_name || 'YouTube Creator',
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                }
            }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
        }
    }

    // 2. API: Convert Video/Audio
    if (req.method === 'POST' && pathname === '/api/convert') {
        let bodyStr = '';
        req.on('data', chunk => bodyStr += chunk);
        req.on('end', async () => {
            try {
                const body = JSON.parse(bodyStr || '{}');
                const { url, format = 'mp3', audioQuality = '320', videoQuality = '720' } = body;

                const videoId = extractVideoId(url);
                if (!videoId) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    return res.end(JSON.stringify({ success: false, error: 'ลิงก์ YouTube ไม่ถูกต้อง' }));
                }

                const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
                const isAudio = ['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(format.toLowerCase());
                const quality = isAudio ? audioQuality : videoQuality;
                const cacheKey = `${videoId}_${format.toLowerCase()}_${quality}`;

                let rawDownloadUrl = '';

                const cached = CONVERT_CACHE.get(cacheKey);
                if (cached && (Date.now() - cached.time < CACHE_TTL_MS)) {
                    console.log(`[⚡ Cache Hit] ส่งลิงก์ทันที: ${cacheKey}`);
                    rawDownloadUrl = cached.url;
                } else {
                    rawDownloadUrl = await convertVideoSmart(canonicalUrl, format, quality);
                    CONVERT_CACHE.set(cacheKey, { url: rawDownloadUrl, time: Date.now() });
                }

                const filename = `youtube_${videoId}.${format.toLowerCase()}`;
                const safeProxyUrl = `/api/download?fileUrl=${encodeURIComponent(rawDownloadUrl)}&filename=${encodeURIComponent(filename)}`;

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    success: true,
                    downloadUrl: safeProxyUrl,
                    format: format.toUpperCase(),
                    videoId: videoId,
                    filename: filename
                }));

            } catch (err) {
                console.error('[!] Convert error:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    success: false,
                    error: err.message || 'เกิดข้อผิดพลาดในการแปลงไฟล์'
                }));
            }
        });
        return;
    }

    // 3. API: Safe Proxy File Downloader
    if (req.method === 'GET' && pathname === '/api/download') {
        const fileUrl = parsedUrl.searchParams.get('fileUrl');
        const filename = parsedUrl.searchParams.get('filename') || 'download.mp3';

        if (!fileUrl) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Missing fileUrl parameter');
        }

        try {
            const target = new URL(fileUrl);
            const protocol = target.protocol === 'https:' ? https : http;

            const proxyReq = protocol.get(fileUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            }, (proxyRes) => {
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    const redirectUrl = proxyRes.headers.location.startsWith('http')
                        ? proxyRes.headers.location
                        : new URL(proxyRes.headers.location, fileUrl).href;

                    res.writeHead(302, { 'Location': `/api/download?fileUrl=${encodeURIComponent(redirectUrl)}&filename=${encodeURIComponent(filename)}` });
                    return res.end();
                }

                if (proxyRes.statusCode !== 200) {
                    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
                    return res.end('ไม่สามารถดึงไฟล์ได้จากเซิร์ฟเวอร์ต้นทาง');
                }

                res.writeHead(200, {
                    'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
                    'Content-Length': proxyRes.headers['content-length'] || ''
                });

                proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
                console.error('[!] Proxy download error:', err.message);
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('เกิดข้อผิดพลาดขณะดาวน์โหลดไฟล์');
            });

        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Invalid file URL');
        }
        return;
    }

    // 4. Static Files
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`⚡ YT Convert PRO (Smart Multi-API Engine) รันแล้ว!`);
    console.log(`🌐 Google Chrome: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
