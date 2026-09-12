document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const urlInput = document.getElementById('youtube-url');
    const pasteBtn = document.getElementById('paste-btn');
    const clearBtn = document.getElementById('clear-btn');
    const previewCard = document.getElementById('preview-card');
    const previewThumb = document.getElementById('preview-thumb');
    const previewTitle = document.getElementById('preview-title');
    const previewChannel = document.getElementById('preview-channel').querySelector('span');
    const convertBtn = document.getElementById('convert-btn');
    const btnText = convertBtn.querySelector('.btn-text');
    const btnLoader = convertBtn.querySelector('.btn-loader');
    const progressBox = document.getElementById('progress-box');
    const progressStatusText = document.getElementById('progress-status-text');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const resultBox = document.getElementById('result-box');
    const finalDownloadBtn = document.getElementById('final-download-btn');
    const mirrorDownloadBtn = document.getElementById('mirror-download-btn');
    const errorAlert = document.getElementById('error-alert');
    const errorMessage = document.getElementById('error-message');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    // Format & Quality selectors
    const catTabs = document.querySelectorAll('.cat-tab');
    const audioOptions = document.getElementById('audio-options');
    const videoOptions = document.getElementById('video-options');
    const formatPills = document.querySelectorAll('.format-pill');
    const qPills = document.querySelectorAll('.q-pill');

    let currentVideoInfo = null;
    let debounceTimer = null;
    let progressInterval = null;

    // Determine API Endpoint (supports both http://localhost:3000 and file:///)
    const API_BASE = (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1'))
        ? ''
        : 'http://localhost:3000';

    // Load History on startup
    loadHistory();

    // 1. Tab Switching (Audio vs Video)
    catTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            catTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const type = tab.getAttribute('data-type');
            if (type === 'audio') {
                audioOptions.style.display = 'block';
                videoOptions.style.display = 'none';
                const mp3Radio = document.querySelector('input[name="format"][value="mp3"]');
                if (mp3Radio) {
                    mp3Radio.checked = true;
                    updatePillActive();
                }
            } else {
                audioOptions.style.display = 'none';
                videoOptions.style.display = 'block';
                const mp4Radio = document.querySelector('input[name="format"][value="mp4"]');
                if (mp4Radio) {
                    mp4Radio.checked = true;
                    updatePillActive();
                }
            }
        });
    });

    // 2. Format Pills UI
    formatPills.forEach(pill => {
        pill.addEventListener('click', () => {
            setTimeout(updatePillActive, 10);
        });
    });

    function updatePillActive() {
        formatPills.forEach(p => {
            const input = p.querySelector('input');
            if (input && input.checked) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
    }

    // 3. Quality Pills UI
    qPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const radio = pill.querySelector('input');
            if (radio) {
                const groupName = radio.name;
                document.querySelectorAll(`input[name="${groupName}"]`).forEach(r => {
                    r.closest('.q-pill').classList.remove('active');
                });
                pill.classList.add('active');
            }
        });
    });

    // 4. Input URL handling
    urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim();
        clearBtn.style.display = val ? 'flex' : 'none';
        hideAlert();

        clearTimeout(debounceTimer);
        if (val) {
            debounceTimer = setTimeout(() => {
                fetchVideoInfo(val);
            }, 300);
        } else {
            previewCard.style.display = 'none';
            currentVideoInfo = null;
        }
    });

    // Paste button
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text;
                clearBtn.style.display = 'flex';
                fetchVideoInfo(text);
            }
        } catch (e) {
            urlInput.focus();
        }
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        clearBtn.style.display = 'none';
        previewCard.style.display = 'none';
        resultBox.style.display = 'none';
        progressBox.style.display = 'none';
        hideAlert();
        currentVideoInfo = null;
        urlInput.focus();
    });

    // 5. Fetch YouTube Info
    async function fetchVideoInfo(url) {
        const videoId = extractClientVideoId(url);
        if (!videoId) {
            previewCard.style.display = 'none';
            return;
        }

        // Show fast thumbnail
        previewThumb.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        previewTitle.textContent = 'กำลังโหลดชื่อวิดีโอ...';
        previewChannel.textContent = 'YouTube';
        previewCard.style.display = 'flex';

        // Try local backend first
        try {
            const res = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (data.success && data.info) {
                currentVideoInfo = data.info;
                previewTitle.textContent = data.info.title;
                previewChannel.textContent = data.info.author;
                previewThumb.src = data.info.thumbnail;
                return;
            }
        } catch (err) {
            // Local backend not reachable, fallback to direct oembed
        }

        try {
            const oRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
            const oData = await oRes.json();
            if (oData && oData.title) {
                previewTitle.textContent = oData.title;
                previewChannel.textContent = oData.author_name || 'YouTube Creator';
                currentVideoInfo = {
                    id: videoId,
                    title: oData.title,
                    author: oData.author_name,
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                };
                return;
            }
        } catch (e) {}

        currentVideoInfo = {
            id: videoId,
            title: `YouTube Video (${videoId})`,
            author: 'YouTube',
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
        previewTitle.textContent = currentVideoInfo.title;
    }

    function extractClientVideoId(url) {
        if (!url) return null;
        const clean = url.trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
        const match = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    }

    function updateProgress(percent, statusText) {
        progressBox.style.display = 'block';
        progressBarFill.style.width = `${percent}%`;
        progressPercentage.textContent = `${percent}%`;
        if (statusText) {
            progressStatusText.innerHTML = `<i class="fa-solid fa-bolt" style="color: #ef4444;"></i> ${statusText}`;
        }
    }

    // 6. Convert & Download Action (100% Ad-Free Direct File Stream)
    convertBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            showAlert('กรุณากรอกหรือวางลิงก์ YouTube ที่ต้องการแปลง');
            urlInput.focus();
            return;
        }

        const videoId = extractClientVideoId(url);
        if (!videoId) {
            showAlert('ลิงก์ YouTube ไม่ถูกต้อง กรุณาตรวจสอบลิงก์อีกครั้ง');
            return;
        }

        const selectedFormat = document.querySelector('input[name="format"]:checked')?.value || 'mp3';
        const isAudio = ['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(selectedFormat);
        const quality = isAudio 
            ? (document.querySelector('input[name="audio-quality"]:checked')?.value || '320')
            : (document.querySelector('input[name="video-quality"]:checked')?.value || '720');

        setLoading(true);
        hideAlert();
        resultBox.style.display = 'none';

        // Animated progress timer simulation
        let currentPct = 15;
        updateProgress(currentPct, `กำลังเริ่มแปลงเป็น ${selectedFormat.toUpperCase()} (${quality}${isAudio ? 'kbps' : 'p'})...`);
        
        clearInterval(progressInterval);
        progressInterval = setInterval(() => {
            if (currentPct < 90) {
                currentPct += (currentPct < 60 ? 8 : 3);
                if (currentPct > 90) currentPct = 90;
                let msg = 'กำลังประมวลผลการแปลงสัญญาณเสียง...';
                if (currentPct >= 40 && currentPct < 70) msg = `กำลังเข้ารหัสไฟล์ ${selectedFormat.toUpperCase()} คุณภาพสูง (320kbps)...`;
                if (currentPct >= 70) msg = 'กำลังจัดเตรียมไฟล์สำหรับดาวน์โหลดลง Google Chrome...';
                updateProgress(currentPct, msg);
            }
        }, 1500);

        try {
            const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const videoTitle = currentVideoInfo ? currentVideoInfo.title : `YouTube_${videoId}`;
            const cleanFilename = `${sanitizeFilename(videoTitle)}.${selectedFormat}`;

            // Call Backend Convert API (No CORS, Zero Ads)
            const response = await fetch(`${API_BASE}/api/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: canonicalUrl,
                    format: selectedFormat,
                    audioQuality: quality,
                    videoQuality: quality
                })
            });

            clearInterval(progressInterval);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'เซิร์ฟเวอร์แปลงไฟล์ขัดข้อง');
            }

            const data = await response.json();

            if (!data.success || !data.downloadUrl) {
                throw new Error(data.error || 'ไม่สามารถสร้างลิงก์ดาวน์โหลดได้');
            }

            // Success 100%
            updateProgress(100, 'แปลงไฟล์สำเร็จเรียบร้อย! กำลังเริ่มดาวน์โหลด...');

            const downloadUrl = data.downloadUrl;

            // Show Result Card
            document.getElementById('result-title').textContent = `แปลงเป็น ${selectedFormat.toUpperCase()} สำเร็จแล้ว!`;
            document.getElementById('result-meta').textContent = `${videoTitle} • คุณภาพ: ${quality}${isAudio ? 'kbps' : 'p'} (ดาวน์โหลดไฟล์ตรง ไร้โฆษณา)`;
            
            finalDownloadBtn.href = downloadUrl;
            finalDownloadBtn.setAttribute('download', cleanFilename);
            if (mirrorDownloadBtn) mirrorDownloadBtn.style.display = 'none';

            resultBox.style.display = 'block';

            // Trigger Google Chrome Direct Download (NO ADS, NO POPUPS)
            downloadDirectFile(downloadUrl, cleanFilename);

            // Save to history
            saveToHistory({
                title: videoTitle,
                format: selectedFormat.toUpperCase(),
                quality: `${quality}${isAudio ? 'kbps' : 'p'}`,
                url: downloadUrl,
                date: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
            });

        } catch (err) {
            clearInterval(progressInterval);
            console.error('Conversion error:', err);
            showAlert(err.message.includes('Failed to fetch') 
                ? 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาดับเบิลคลิกเปิดไฟล์ start-youtube-converter.bat เพื่อเปิดใช้งาน'
                : (err.message || 'เกิดข้อผิดพลาดในการแปลงไฟล์'));
        } finally {
            setLoading(false);
            setTimeout(() => {
                progressBox.style.display = 'none';
            }, 4000);
        }
    });

    // 100% Clean Direct File Download (Directly triggers Chrome Download Shelf)
    function downloadDirectFile(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'music.mp3';
        a.target = '_self'; // Strictly self target, completely prevents pop-up ads!
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
        }, 150);
    }

    function sanitizeFilename(name) {
        if (!name) return 'audio_track';
        return name.replace(/[/\\?%*:|"<>]/g, '_').substring(0, 80);
    }

    function setLoading(isLoading) {
        convertBtn.disabled = isLoading;
        btnText.style.display = isLoading ? 'none' : 'inline-flex';
        btnLoader.style.display = isLoading ? 'flex' : 'none';
    }

    function showAlert(msg) {
        errorMessage.textContent = msg;
        errorAlert.style.display = 'flex';
    }

    function hideAlert() {
        errorAlert.style.display = 'none';
    }

    // 7. History System (LocalStorage)
    function saveToHistory(item) {
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('yt_convert_history') || '[]');
        } catch (e) {
            history = [];
        }

        history.unshift(item);
        if (history.length > 8) history.pop();

        localStorage.setItem('yt_convert_history', JSON.stringify(history));
        loadHistory();
    }

    function loadHistory() {
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('yt_convert_history') || '[]');
        } catch (e) {
            history = [];
        }

        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-history">
                    <i class="fa-solid fa-inbox"></i>
                    <p>ยังไม่มีประวัติการแปลงไฟล์ ลองวางลิงก์และเริ่มแปลงได้เลย!</p>
                </div>
            `;
            return;
        }

        historyList.innerHTML = '';
        history.forEach((item) => {
            const isVideo = ['MP4', 'WEBM'].includes(item.format);
            const row = document.createElement('div');
            row.className = 'history-item';
            row.innerHTML = `
                <div class="hist-left">
                    <span class="hist-badge ${isVideo ? 'video' : ''}">${item.format}</span>
                    <div>
                        <div class="hist-title">${escapeHtml(item.title)}</div>
                        <div class="hist-time">${item.quality} • เวลา ${item.date}</div>
                    </div>
                </div>
                <button class="hist-download-btn" data-url="${escapeHtml(item.url)}" data-filename="${escapeHtml(item.title)}.${item.format.toLowerCase()}">
                    <i class="fa-solid fa-download"></i> ดาวน์โหลดซ้ำ
                </button>
            `;
            historyList.appendChild(row);
        });

        document.querySelectorAll('.history-item .hist-download-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const u = btn.getAttribute('data-url');
                const f = btn.getAttribute('data-filename');
                downloadDirectFile(u, f);
            });
        });
    }

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('yt_convert_history');
        loadHistory();
    });

    function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
});
