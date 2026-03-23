# Dịch Video Song Ngữ — Browser Extension Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Overview

Browser extension dịch subtitle/audio trên mọi video trên mọi website, hiển thị song ngữ (ngôn ngữ gốc + bản dịch). Hỗ trợ Chrome, Firefox, Edge.

## Requirements

- Dịch subtitle có sẵn trên video (WebVTT, SRT, platform-specific)
- Fallback speech-to-text khi video không có subtitle
- Hiển thị song ngữ: overlay trên video + side panel transcript
- Dịch thuật: Google Translate free mặc định + BYOK (DeepL, OpenAI, Google Cloud)
- Speech-to-text: Web Speech API mặc định + Whisper BYOK
- Ngôn ngữ đích: nhiều ngôn ngữ, mặc định tiếng Việt
- Hoạt động trên mọi website có HTML5 `<video>` element

## Architecture

**Approach:** Monolith Content Script

```
┌─────────────────────────────────────────────────────┐
│                    Browser Extension                │
├──────────────┬──────────────────┬───────────────────┤
│  Popup UI    │  Content Script  │  Background SW    │
│  (Settings)  │  (Per-tab)       │  (Singleton)      │
│              │                  │                   │
│ • Ngôn ngữ   │ • Detect video   │ • Translation API │
│ • API keys   │ • Extract subs   │ • Caching layer   │
│ • Hiển thị   │ • Speech-to-text │ • API key storage │
│ • On/Off     │ • Overlay UI     │ • Rate limiting   │
│              │ • Side panel UI  │                   │
└──────────────┴──────────────────┴───────────────────┘
         ↕ chrome.storage    ↕ chrome.runtime.sendMessage
```

### Components

1. **Popup UI** — Settings page khi click icon extension
   - Bật/tắt extension
   - Chọn ngôn ngữ đích (mặc định: Việt)
   - Cấu hình API keys (Translation + Whisper)
   - Chọn chế độ hiển thị (overlay / side panel / cả hai)

2. **Content Script** — Inject vào mỗi tab có video
   - Quét trang tìm `<video>` elements (MutationObserver cho dynamic content)
   - Trích xuất subtitle có sẵn (track elements, YouTube API, platform-specific)
   - Fallback: Web Speech API recognition từ audio
   - Render overlay subtitle + side panel transcript

3. **Background Service Worker** — Chạy nền, xử lý API
   - Nhận text từ content script → gọi Translation API → trả kết quả
   - Cache translations (tránh dịch lại câu giống nhau)
   - Quản lý rate limiting để không bị block API free

### Communication

- Content Script ↔ Background: `chrome.runtime.sendMessage`
- Popup ↔ Storage: `chrome.storage.sync` (đồng bộ across devices)
- Content Script lắng nghe storage changes để cập nhật settings realtime

## Subtitle Extraction Pipeline

```
Video detected
     │
     ▼
┌─────────────────────┐
│ 1. Check <track>    │── Có subtitle track? ──► Extract cues từ TextTrack API
│    elements         │
└─────────────────────┘
     │ Không có
     ▼
┌─────────────────────┐
│ 2. Platform-specific│
│    subtitle fetch   │
│                     │
│  • YouTube: fetch   │
│    timedtext API    │── Tìm thấy? ──► Tiếp tục
│  • Vimeo: text      │
│    tracks endpoint  │
│  • Khác: check      │
│    common patterns  │
└─────────────────────┘
     │ Không tìm thấy
     ▼
┌─────────────────────┐
│ 3. Speech-to-Text   │
│    Fallback         │
│                     │
│  Web Speech API     │
│  hoặc Whisper BYOK  │──────────────► Gửi text tới Background SW để dịch
└─────────────────────┘
```

### Step 1: HTML5 TextTrack API
- Duyệt `video.textTracks` để tìm subtitle/caption tracks
- Lắng nghe `cuechange` event → lấy text realtime theo timestamp
- Hoạt động trên mọi website dùng `<track>` chuẩn

### Step 2: Platform-specific Extraction
- **YouTube:** Gọi `/api/timedtext` endpoint để lấy full subtitle list
- **Vimeo:** Fetch text tracks từ player config JSON
- **Các site khác:** Scan DOM tìm subtitle container phổ biến (class chứa "caption", "subtitle")
- Dùng `MutationObserver` để detect subtitle text thay đổi trên DOM

### Step 3: Speech-to-Text Fallback
- Capture audio từ video element bằng `AudioContext` + `createMediaElementSource()`
- Mặc định: `webkitSpeechRecognition` (Web Speech API) — realtime, free
- BYOK: Gửi audio chunks tới Whisper API qua Background SW
- Trả về text kèm timestamp ước lượng

### Subtitle Sync
- Mỗi subtitle cue có `startTime` + `endTime`
- Content script theo dõi `video.currentTime` bằng `timeupdate` event
- Hiển thị/ẩn cue tương ứng với thời điểm hiện tại
- Khi user tua video → instantly sync lại

## Translation Layer

### Provider Interface

```typescript
interface TranslationProvider {
  name: string;
  translate(text: string, from: string, to: string): Promise<string>;
  detectLanguage(text: string): Promise<string>;
  requiresApiKey: boolean;
}
```

### Providers

| Provider | API Key | Giới hạn | Chất lượng |
|----------|---------|----------|------------|
| Google Translate (free) | Không | ~5000 ký tự/lần, rate limited | Tốt |
| DeepL API | Có | 500k ký tự/tháng (free tier) | Rất tốt |
| OpenAI GPT | Có | Theo credit | Xuất sắc (context-aware) |
| Google Cloud Translation | Có | Theo credit | Rất tốt |

### Caching Strategy

- **Level 1 — In-memory Map:** Cache nhanh trong session, key = `hash(text + sourceLang + targetLang)`
- **Level 2 — IndexedDB:** Cache persist qua sessions, tự động expire sau 7 ngày
- Subtitle thường lặp lại → cache giảm đáng kể API calls

### Rate Limiting (Google Translate free)

- Queue requests, batch nhiều cue cùng lúc thay vì gửi từng câu
- Delay 100-200ms giữa các batch
- Nếu bị 429 → tự động giảm tốc độ, thông báo user

### Auto-detect Ngôn Ngữ Nguồn

- Gửi vài câu đầu tiên qua `detectLanguage()`
- Cache kết quả cho toàn bộ video
- Nếu ngôn ngữ nguồn = ngôn ngữ đích → không dịch, thông báo user

## UI Design

### Chế độ 1: Overlay trên Video

- Subtitle song ngữ hiển thị trực tiếp trên video
- Ngôn ngữ gốc: nhạt, nhỏ hơn, nền `rgba(0,0,0,0.6)` — ở trên
- Bản dịch: đậm, lớn hơn, nền `rgba(0,0,0,0.85)` — ở dưới
- Có thể kéo thả vị trí subtitle
- Font size tùy chỉnh

### Chế độ 2: Side Panel

- Panel bên phải video hiển thị full transcript song ngữ
- Câu hiện tại highlight (border-left xanh + background)
- Click vào câu bất kỳ để tua video tới timestamp đó
- Auto-scroll theo video
- Hiển thị timestamp cho mỗi cue

### Nút Điều Khiển (Floating Button)

- Nút tròn nổi ở góc phải dưới video
- Hover hiện quick menu:
  - Toggle overlay ON/OFF
  - Toggle side panel ON/OFF
  - Chuyển ngôn ngữ nhanh (dropdown)
- Không cần mở popup extension để điều khiển

## Project Structure

```
dich_moi_nen_tang/
├── manifest.json
├── package.json
├── webpack.config.js
│
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   ├── index.js
│   │   ├── video-detector.js
│   │   ├── subtitle-extractor.js
│   │   ├── speech-recognizer.js
│   │   ├── overlay-ui.js
│   │   ├── side-panel-ui.js
│   │   └── control-button.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── providers/
│   │   ├── translation-provider.js
│   │   ├── google-free.js
│   │   ├── deepl.js
│   │   ├── openai.js
│   │   └── google-cloud.js
│   ├── utils/
│   │   ├── cache.js
│   │   ├── rate-limiter.js
│   │   ├── language-detector.js
│   │   └── constants.js
│   └── styles/
│       ├── overlay.css
│       ├── side-panel.css
│       └── control-button.css
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── _locales/
│   ├── vi/messages.json
│   └── en/messages.json
└── tests/
    ├── subtitle-extractor.test.js
    ├── translation-provider.test.js
    └── cache.test.js
```

### Cross-browser Build

- **Chrome/Edge:** Manifest V3 — build trực tiếp
- **Firefox:** `webextension-polyfill` + Manifest V2 format (`background.scripts` thay vì `service_worker`)
- **Webpack** bundle riêng: `npm run build:chrome`, `npm run build:firefox`, `npm run build:edge`

## Error Handling

| Tình huống | Xử lý |
|---|---|
| API translation bị lỗi/timeout | Retry 2 lần exponential backoff (1s → 3s). Fail → hiển thị text gốc + ⚠️ |
| Google Translate bị rate limit (429) | Giảm tốc độ, queue requests. Thông báo user |
| Web Speech API không nhận giọng | Badge "Không nhận diện được" + gợi ý Whisper API key |
| Video không có audio track | Skip speech recognition, thông báo |
| Website block content script (CSP) | Graceful degrade, thông báo trong popup |
| Video dynamic load (SPA) | MutationObserver theo dõi DOM changes |
| User tua video nhanh | Debounce 200ms, cancel pending translations |
| Mất internet | Serve từ cache nếu có, hiển thị offline indicator |

## Edge Cases

- **Nhiều video trên 1 trang** — Mỗi video có instance riêng, click để active
- **Video trong iframe** — Không hỗ trợ (chỉ HTML5 video trên main page)
- **Live stream** — Speech recognition realtime, translation delay ~1-2s
- **Ngôn ngữ nguồn = đích** — Detect và thông báo, không dịch
- **Subtitle nhiều ngôn ngữ** — User chọn track nguồn trong control menu
- **Video rất dài (>2 giờ)** — Chỉ dịch cue hiện tại + buffer 5 cue tiếp theo

## Testing Strategy

### Unit Tests (Jest)
- `subtitle-extractor.test.js` — Parse WebVTT, SRT, TextTrack API
- `translation-provider.test.js` — Mock API responses, error cases
- `cache.test.js` — Hit/miss, expiry, IndexedDB mock
- `rate-limiter.test.js` — Throttle, queue behavior
- `language-detector.test.js` — Detect accuracy

### Integration Tests (Jest + jsdom)
- `video-detector.test.js` — MutationObserver, dynamic video
- `overlay-ui.test.js` — Render, sync, position
- `content-flow.test.js` — Full pipeline: detect → extract → translate → display

### E2E Tests (Playwright)
- `youtube.spec.js` — Test trên YouTube thật
- `vimeo.spec.js` — Test trên Vimeo thật
- `generic-video.spec.js` — Test trên trang có HTML5 video

## Performance Targets

| Metric | Target |
|---|---|
| Subtitle hiển thị sau khi cue xuất hiện | < 500ms (cached) / < 2s (API call) |
| Memory usage | < 50MB per tab |
| Content script load time | < 100ms |
| Cache lookup | < 5ms |
