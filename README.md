# Universal Media Speed Controller

<div align="center">

**کنترل هوشمند و پیشرفته‌ی سرعت پخش تمامی ویدیوها و صوت‌ها در تمام وب‌سایت‌ها و فایل‌های محلی (۰.۱x تا ۱۶x)**  
**Advanced playback speed controller (0.1x – 16x) for all videos & audios across any website and local files.**

[![Version](https://img.shields.io/badge/version-1.2-blue.svg)](https://github.com/mehdisayyadnahed/universal-media-speed-controller)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Firefox AMO](https://img.shields.io/badge/Firefox-AMO%20Ready-orange.svg)](https://addons.mozilla.org/)
[![Privacy: No Data Collection](https://img.shields.io/badge/Privacy-100%25%20Local-brightgreen.svg)](#حریم-خصوصی-و-امنیت)

[**فارسی (Persian)**](#فارسی) • [**English**](#english)

</div>

---

<a name="فارسی"></a>
# 🇮🇷 راهنمای فارسی

## درباره پروژه

افزونه **Universal Media Speed Controller** یک افزونه مدرن، سبک و بسیار قدرتمند بر پایه **Manifest V3** است که به شما امکان می‌دهد سرعت پخش هر فایل صوتی و ویدیویی را در هر سایتی (یوتیوب، آپارات، اینستاگرام، توییتر/X، فیس‌بوک، تلگرام وب، پادکست‌ها، دوره‌های آموزشی و حتی فایل‌های محلی روی سیستم با پیشوند `file:///`) بین **۰.۱ تا ۱۶ برابر** به دلخواه خود کنترل و مدیریت کنید.

این افزونه بدون ایجاد هرگونه سربار اضافی بر مرورگر و با حفظ کامل حریم خصوصی (۱۰۰٪ آفلاین و بدون هیچ‌گونه جمع‌آوری داده)، جایگزین کاملی برای کنترل‌کننده‌های پیش‌فرض مدیا در وب است.

---

## ویژگی‌های کلیدی

- ⚡ **پشتیبانی سراسری و جامع:** کارکرد بر روی تمام وب‌سایت‌ها، ویدیوها (`<video>`) و صوت‌ها (`<audio>`)، آی‌فریم‌ها (iFrames)، شدو دام (Shadow DOM) و فایل‌های مدیا مستقیم (`.mp4`, `.mp3`, `.webm`, `.mkv`).
- 📁 **پشتیبانی کامل از فایل‌های محلی (`file:///`):** تنظیم سرعت برای فایل‌های ذخیره‌شده روی سیستم، همراه با راهنمای هوشمند دسترسی در مرورگر.
- 🎚️ **بازه سرعت گسترده و دقیق:** تنظیم سرعت از **۰.۱x تا ۱۶x** با اسلایدر و گام‌های اعشاری بسیار دقیق (`0.01`) بدون گرد شدن ناخواسته (پشتیبانی کامل از ۱.۲۵x، ۱.۷۵x و ...).
- 🔘 **۸ پیش‌تنظیم سریع (Quick Presets):** دکمه‌های آماده سرعت با قابلیت ویرایش مقادیر، ذخیره و اسپینرهای داخلی بالا/پایین.
- 🌐 **سرعت اختصاصی به ازای هر وب‌سایت (Per-Site Speeds):** تعیین سرعت خاص برای سایت‌های دلخواه (مثلاً `youtube.com → 2x` یا `aparat.com → 3x`) با امکان ویرایش نام دامنه و حذف آسان.
- ⏩ **حالت نگه داشتن کلید (Hold Speed 16x):** حرکت سریع به جلو یا عقب با نگه داشتن کلید‌های ترکیبی (قابل تنظیم بین ۲x تا ۱۶x، پیش‌فرض ۱۶x) و بازگشت خودکار به سرعت قبلی پس از رها کردن کلید.
- ⌨️ **کلیدهای میانبر کاملاً شخصی‌سازی‌پذیر:** کلیدهای دوترکیبی استاندارد برای جلوگیری از تداخل، با قابلیت روشن/خاموش کردن سریع و فعال‌سازی در فیلدهای متنی.
- 🌓 **پشتیبانی از سه حالت تم:** حالت خودکار (پیروی از تم سیستم/مرورگر)، حالت روشن (Light) و حالت تیره (Dark) با طراحی یکپارچه و بهینه‌سازی شده برای جلوگیری از پرش رنگ.
- 💾 **پشتیبان‌گیری و بازیابی (Backup & Restore):** امکان خروجی گرفتن از تمام تنظیمات با فرمت JSON، وارد کردن مجدد و بازنشانی (Reset Settings).
- 🛡️ **طراحی ایمن و مدرن:** رعایت کامل استانداردهای CSP (بدون اسکریپت‌های درون‌خطی Inline)، پشتیبانی از معماری Manifest V3 برای فایرفاکس و کروم، بدون استفاده از توابع ناامن مثل `innerHTML`.

---

## کلیدهای میانبر پیش‌فرض

| عمل | کلید پیش‌فرض | توضیحات |
| :--- | :---: | :--- |
| **پرش به جلو** | <kbd>Ctrl</kbd> + <kbd>]</kbd> | پرش ۱۰ ثانیه ضرب‌در سرعت فعلی به جلو |
| **پرش به عقب** | <kbd>Ctrl</kbd> + <kbd>[</kbd> | پرش ۱۰ ثانیه ضرب‌در سرعت فعلی به عقب |
| **افزایش سرعت (کوچک)** | <kbd>Ctrl</kbd> + <kbd>;</kbd> | افزایش سرعت به میزان ۰.۱x |
| **کاهش سرعت (کوچک)** | <kbd>Ctrl</kbd> + <kbd>'</kbd> | کاهش سرعت به میزان ۰.۱x |
| **افزایش سرعت (بزرگ)** | <kbd>Ctrl</kbd> + <kbd>.</kbd> | افزایش سرعت به میزان ۱.۰x |
| **کاهش سرعت (بزرگ)** | <kbd>Ctrl</kbd> + <kbd>,</kbd> | کاهش سرعت به میزان ۱.۰x |
| **بازنشانی سرعت** | <kbd>Ctrl</kbd> + <kbd>/</kbd> | بازگشت سریع سرعت به ۱.۰x (سرعت عادی) |
| **مکث / پخش** | <kbd>Ctrl</kbd> + <kbd>Y</kbd> | متوقف کردن یا پخش مجدد مدیا |
| **نگه‌داشتن به جلو (Hold Forward)** | <kbd>Ctrl</kbd> + <kbd>Q</kbd> | حرکت با سرعت فوق‌سریع (۱۶x) تا زمان نگه داشتن کلید |
| **نگه‌داشتن به عقب (Hold Rewind)** | <kbd>Ctrl</kbd> + <kbd>`</kbd> | عقب زدن با سرعت بالا تا زمان نگه داشتن کلید |

> **نکته:** تمامی این کلیدها از صفحه تنظیمات (**Settings & Keyboard Shortcuts**) قابل تغییر هستند.

---

## راهنمای نصب و راه‌اندازی

### ۱. نصب در مرورگرهای مبتنی بر کرومیوم (Chrome, Edge, Brave, Opera)
1. فایل `universal-media-speed-chrome.zip` را دانلود و آن را از حالت فشرده خارج (Unzip) کنید.
2. در مرورگر خود به آدرس `chrome://extensions` بروید.
3. در گوشه بالا سمت راست، گزینه **Developer mode** (حالت توسعه‌دهنده) را فعال کنید.
4. روی دکمه **Load unpacked** کلیک کرده و پوشه `chrome` را انتخاب کنید.
5. *(اختیاری برای فایل‌های محلی):* در صفحه افزونه‌ها روی گزینه **Details** افزونه کلیک کرده و گزینه **Allow access to file URLs** را فعال کنید تا افزونه روی فایل‌های کامپیوترتان نیز کار کند.

### ۲. نصب در موزیلا فایرفاکس (Mozilla Firefox)
1. فایل `universal-media-speed-firefox.zip` (یا نسخه `.xpi`) را دانلود کنید.
2. در آدرس‌بار فایرفاکس عبارت `about:debugging#/runtime/this-firefox` را تایپ و اینتر بزنید.
3. روی دکمه **Load Temporary Add-on...** کلیک کنید.
4. فایل `manifest.json` موجود در پوشه فایرفاکس یا فایل `.zip` / `.xpi` را انتخاب کنید.
5. افزونه بلافاصله نصب شده و آماده استفاده خواهد بود.

---

## راهنمای استفاده

1. **پاپ‌آپ اصلی (Popup):**
   - با کلیک روی آیکون افزونه، وضعیت مدیای در حال پخش و سرعت لحظه‌ای نمایش داده می‌شود.
   - با کشیدن اسلایدر یا کلیک روی دکمه‌های پیش‌تنظیم (Quick Presets) سرعت را تغییر دهید.
   - برای ذخیره سرعت جاری به عنوان سرعت پیش‌فرض همه سایت‌ها، روی **Set as Default** کلیک کنید.
   - برای اختصاص سرعت به سایت جاری، از دکمه **Set ...x for [site]** استفاده کنید.
2. **شخصی‌سازی پیش‌تنظیم‌ها:**
   - با زدن روی دکمه **Edit** در بخش Quick Presets، می‌توانید ۸ سرعت دلخواه خود را تعیین کرده و ذخیره نمایید.
3. **تنظیمات پیشرفته (Options):**
   - با زدن روی **Settings & Keyboard Shortcuts** به پنل کامل هدایت می‌شوید؛ در اینجا می‌توانید تم، کلیدهای میانبر، سرعت حالت Hold، رفتارهای کلیدها در فیلدهای متنی و لیست سرعت سایت‌ها را مدیریت کنید.

---

## حریم خصوصی و امنیت

- 🔒 **عدم جمع‌آوری هرگونه اطلاعات شخصی:** این افزونه طبق استاندارد جدید موزیلا و گوگل دارای مقدار `"data_collection_permissions": { "required": ["none"] }` است.
- 📡 **بدون ارسال هیچ درخواستی به اینترنت:** افزونه هیچ داده‌ای، سابقه مرور، آدرس سایت‌ها یا آماری را به هیچ سروری ارسال نمی‌کند.
- 💾 **ذخیره‌سازی کاملاً محلی:** تمام تنظیمات صرفاً در فضای حافظه محلی مرورگر شما (`chrome.storage.sync` یا `local`) نگهداری می‌شوند.

---

<br>

---

<a name="english"></a>
# 🇬🇧 English Guide

## Overview

**Universal Media Speed Controller** is a modern, lightweight, and high-performance browser extension built on **Manifest V3**. It gives you full control over playback speeds (**0.1x to 16x**) for any HTML5 video or audio element across every website (YouTube, Aparat, Instagram, X/Twitter, Facebook, TikTok, Netflix, web podcasts, online courses) as well as local media files (`file:///`).

Engineered with privacy and performance in mind, it operates 100% locally with zero external network tracking or data collection.

---

## Key Features

- ⚡ **Universal Compatibility:** Works across all websites, HTML5 `<video>` and `<audio>` elements, nested iFrames, Shadow DOM, and direct media stream URLs (`.mp4`, `.mp3`, `.webm`, etc.).
- 📁 **Full Local File Support (`file:///`):** Speed control for local media files on your drive, complete with built-in permission status detection.
- 🎚️ **Wide & Precision Speed Range:** Smooth speed adjustments from **0.1x up to 16x** with micro-precision (`0.01` step size) — no more unwanted rounding of values like 1.25x or 1.75x.
- 🔘 **8 Quick Presets:** One-click speed buttons with full customization, integrated spinner controls, and active state highlights.
- 🌐 **Per-Site Custom Speeds:** Set individual playback speeds tailored to specific domains (e.g. `youtube.com → 2x`, `instagram.com → 3x`), with instant in-place domain and speed editing.
- ⏩ **Hold Speed Mode (Fast Forward / Rewind):** Hold dedicated hotkeys to temporarily accelerate up to 16x (configurable from 2x to 16x) and automatically restore your previous speed upon key release.
- ⌨️ **Fully Customizable Keyboard Shortcuts:** Two-key combos (`Ctrl + Key`) designed to avoid conflicts with native browser and OS shortcuts, with support for typing inside text fields and event propagation controls.
- 🌓 **Three-Way Theme Engine:** Auto (matches browser/OS preference), Light, and Dark modes designed to eliminate theme flickering.
- 💾 **Backup & Restore:** Easily export all your customized settings, presets, and domain rules to a clean `.json` file, import backups, or restore defaults with a single click.
- 🛡️ **Secure & Clean Codebase:** Full Content Security Policy (CSP) compliance without inline scripts, strict DOM-safe operations (no unsafe `innerHTML`), and native Manifest V3 compliance for both Chromium and Gecko.

---

## Default Keyboard Shortcuts

| Action | Default Shortcut | Description |
| :--- | :---: | :--- |
| **Skip Forward** | <kbd>Ctrl</kbd> + <kbd>]</kbd> | Jump forward 10s multiplied by current speed |
| **Skip Backward** | <kbd>Ctrl</kbd> + <kbd>[</kbd> | Jump backward 10s multiplied by current speed |
| **Speed Up (Small)** | <kbd>Ctrl</kbd> + <kbd>;</kbd> | Increase speed by 0.1x |
| **Slow Down (Small)** | <kbd>Ctrl</kbd> + <kbd>'</kbd> | Decrease speed by 0.1x |
| **Speed Up (Large)** | <kbd>Ctrl</kbd> + <kbd>.</kbd> | Increase speed by 1.0x |
| **Slow Down (Large)** | <kbd>Ctrl</kbd> + <kbd>,</kbd> | Decrease speed by 1.0x |
| **Reset Speed** | <kbd>Ctrl</kbd> + <kbd>/</kbd> | Reset playback rate to 1.0x (normal speed) |
| **Pause / Play** | <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Toggle play/pause for active media |
| **Hold Forward** | <kbd>Ctrl</kbd> + <kbd>Q</kbd> | Hold to temporarily play forward at hold speed (16x) |
| **Hold Rewind** | <kbd>Ctrl</kbd> + <kbd>`</kbd> | Hold to temporarily rewind at hold speed (16x) |

> **Note:** Every shortcut can be re-bound or toggled on/off in the **Settings & Keyboard Shortcuts** page.

---

## Installation Guide

### 1. Chromium-based Browsers (Google Chrome, Microsoft Edge, Brave, Opera)
1. Download and extract `universal-media-speed-chrome.zip`.
2. Open your browser and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the extracted `chrome` directory.
5. *(Optional for local files):* Click on **Details** on the extension card and toggle **Allow access to file URLs** to control speeds of local video/audio files.

### 2. Mozilla Firefox
1. Download `universal-media-speed-firefox.zip` or the `.xpi` bundle.
2. In the Firefox URL bar, enter `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file inside the `firefox` folder or the `.zip` / `.xpi` archive.
5. The extension will be loaded and ready immediately.

---

## Permissions & Technical Details

| Permission | Reason for Request |
| :--- | :--- |
| `storage` | Stores user presets, default speeds, per-site speeds, theme preferences, and shortcuts locally. |
| `activeTab` | Detects media elements within the currently focused tab when opening the popup. |
| `scripting` | Coordinates media speed adjustments across dynamic iframes and isolated contexts. |
| `webNavigation` | Re-applies custom per-site speeds seamlessly during Single Page Application (SPA) navigation. |
| `<all_urls>`, `file://*/*` | Enables speed control across all web domains and local file protocols. |

---

## Privacy Policy

- **100% Local Execution:** No telemetry, tracking, or remote analytics of any kind.
- **Zero Data Collection:** Fully compliant with Firefox AMO's strict `data_collection_permissions: { "required": ["none"] }` requirement.
- **No Third-Party Requests:** All scripts, stylesheets, and icons are bundled locally within the extension package.

---

## License

This project is released under the **[MIT License](LICENSE)**.  
Developed by **Mehdi Sayyad Nahed**.

Contributions, issue reports, and pull requests are welcome on the [GitHub Repository](https://github.com/mehdisayyadnahed/universal-media-speed-controller).
