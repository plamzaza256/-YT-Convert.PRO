# 🎵 YouTube Converter & Downloader Web App (สำหรับ Google Chrome)

เว็บไซต์สำหรับแปลงลิงก์ YouTube เป็นไฟล์เพลง **MP3** และสกุลไฟล์อื่นๆ รองรับการเปิดใช้งานบน **Google Chrome** ได้โดยตรง ด้วยคลิกเดียว

---

## ✨ คุณสมบัติเด่น (Features)
- 🚀 **เปิดบน Google Chrome อัตโนมัติ**: ดับเบิลคลิกเดียวเปิดหน้าเว็บพร้อมใช้งานทันที
- 🎵 **ไฟล์เสียง (Audio)**:
  - **MP3**: เลือกบิตเรตได้ 320 kbps (สูงสุด), 256 kbps, 128 kbps
  - **M4A / AAC**: เหมาะสำหรับฟังบน iPhone, iPad, Apple Music
  - **WAV**: ไฟล์เสียงสด ไม่บีบอัด
  - **FLAC**: ไฟล์เสียง Lossless คุณภาพระดับสตูดิโอ
- 🎬 **ไฟล์วิดีโอ (Video)**:
  - **MP4**: ความละเอียด 1080p (Full HD), 720p (HD), 480p, 360p
  - **WEBM**: ไฟล์วิดีโอขนาดกะทัดรัด
- 📱 **รองรับทุกลิงก์ YouTube**:
  - `https://www.youtube.com/watch?v=...`
  - `https://youtu.be/...`
  - `https://www.youtube.com/shorts/...` (YouTube Shorts)
- 🖼️ **แสดงตัวอย่างวิดีโอ (Preview)**: โชว์รูปปก (Thumbnail), ชื่อคลิป, และชื่อช่องทันทีที่วางลิงก์
- 🕒 **ประวัติการแปลงไฟล์ (Download History)**: บันทึกรายการล่าสุด ให้สามารถกดดาวน์โหลดซ้ำได้ตลอดเวลา
- 🛡️ **ปลอดภัย 100%**: ไม่มีโฆษณา ไม่เปิดเว็บสแปม ไฟล์ดาวน์โหลดตรงเข้าโฟลเดอร์ Downloads ของคอมพิวเตอร์

---

## 🚀 วิธีเปิดใช้งาน (How to Run)

มีให้เลือกใช้งาน 2 วิธีง่ายๆ:

### วิธีที่ 1: ดับเบิลคลิกไฟล์ Launcher (แนะนำ - ทำงานครบทุกระบบ)
1. ดับเบิลคลิกที่ไฟล์ `start-youtube-converter.bat` (อยู่ที่โฟลเดอร์หลัก) หรือ `run-app.bat` (ในโฟลเดอร์ youtube-converter)
2. ระบบจะทำการตรวจสอบและเปิด **Google Chrome** ไปที่ `http://localhost:3000` ให้อัตโนมัติ!

### วิธีที่ 2: ดับเบิลคลิกเปิดใน Google Chrome โดยตรง (ไม่ต้องเปิดเซิร์ฟเวอร์)
1. ดับเบิลคลิกที่ไฟล์ `open-in-chrome.bat` หรือเปิดไฟล์ `public/index.html` ด้วย Google Chrome
2. หน้าเว็บจะรันในโหมด Browser Direct Mode ทันที

---

## 📂 โครงสร้างโปรเจกต์
```
youtube-converter/
├── public/
│   ├── index.html       # หน้าตาเว็บ UI ภาษาไทย
│   ├── style.css        # ดีไซน์และธีม Dark Glassmorphism
│   └── app.js           # ระบบควบคุมหน้าเว็บ ตรวจจับลิงก์ และแปลงไฟล์
├── server.js            # ระบบ Backend จัดการแปลงไฟล์และสตรีมมิ่ง
├── package.json         # การตั้งค่า dependencies
├── run-app.bat          # สคริปต์เปิดใช้งานและเปิด Chrome อัตโนมัติ
├── open-in-chrome.bat   # สคริปต์เปิดหน้าเว็บใน Chrome โดยตรง
└── README.md            # คู่มือการใช้งาน
```
