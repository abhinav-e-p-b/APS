# 🅿 ParkWatch — Smart Parking ANPR System

> End-to-end automatic number plate recognition for parking lot management, combining a YOLOv8 + PaddleOCR detection backend, a Supabase cloud database, a React + Tailwind web frontend, and a React Native mobile app.

---

## Table of Contents

- [Overview](#overview)
- [Repository Layout](#repository-layout)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [1 — Supabase Setup](#1--supabase-setup)
  - [2 — Python Backend](#2--python-backend)
  - [3 — Web Frontend](#3--web-frontend)
  - [4 — Static Dashboard](#4--static-dashboard)
  - [5 — Android App](#5--android-app)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Camera Setup](#camera-setup)
  - [ANPR Tuning](#anpr-tuning)
- [Database Schema](#database-schema)
- [Running the ANPR Gates](#running-the-anpr-gates)
- [Web Frontend](#web-frontend)
- [Static Dashboard & Manual Entry](#static-dashboard--manual-entry)
- [Android App](#android-app)
  - [Screens & Navigation](#screens--navigation)
  - [Authentication](#authentication)
  - [Admin Access](#admin-access)
  - [Building for Android](#building-for-android)
- [CLI Admin Tools](#cli-admin-tools)
- [User Flow](#user-flow)
- [Admin Panel](#admin-panel)
- [OCR Engine Details](#ocr-engine-details)
- [Performance Tuning](#performance-tuning)
- [Deployment Scenarios](#deployment-scenarios)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Controls Reference](#controls-reference)
- [License](#license)

---

## Overview

ParkWatch automates parking lot access control with computer vision. Cameras at entry and exit gates capture vehicles; a YOLO model detects the number plate region; OCR reads the plate text; and the system records the session in Supabase in real time.

Users register vehicles and pay online through either the React web app or the React Native Android app. Administrators monitor occupancy, view logs, and perform manual overrides from any of three interfaces: the React web admin panel, the static HTML dashboard, or the Python CLI.

**Key capabilities:**

- Automatic entry/exit detection with no human intervention
- Registered member detection with name lookup
- Real-time occupancy tracking across any number of machines
- Web registration with Google OAuth, plan selection, and simulated payment
- Admin dashboard with live stats, session logs, manual overrides, and CSV export
- React Native Android app with full user and admin flows
- Static HTML dashboard and manual-entry page that work without Node.js

---

## Repository Layout

```
.
├── parking_anpr/                  ← Python ANPR backend + web frontend
│   ├── parking_gate.py            ← Single-gate ANPR entry point
│   ├── run_both_gates.py          ← Run both gates on one machine (threaded)
│   ├── admin.py                   ← CLI admin tools
│   ├── config.py                  ← All settings (cameras, model, OCR, storage)
│   ├── requirements.txt
│   ├── .env.example
│   ├── db/
│   │   └── supabase_client.py     ← All DB read/write operations
│   ├── utils/
│   │   ├── preprocess.py          ← Image preprocessing (7 variants)
│   │   ├── ocr.py                 ← OCR engine wrapper + plate validation
│   │   ├── visualise.py           ← OpenCV drawing helpers
│   │   ├── tracker.py             ← IoU multi-object tracker
│   │   └── snapshot.py            ← Saves plate crop images to disk
│   ├── dashboard/
│   │   ├── index.html             ← Static live occupancy dashboard
│   │   └── manual.html            ← Static manual entry/exit interface
│   └── frontend/                  ← React + Vite web application
│       └── src/
│           ├── pages/             ← Landing, Signup, Register, AdminDashboard, …
│           ├── components/        ← Reusable UI components
│           ├── hooks/
│           └── data/mockData.js
│
└── parkwatch-android/             ← React Native (Expo) Android app
    ├── App.js
    ├── app.json
    ├── eas.json
    └── src/
        ├── components/UI.js       ← Shared component library
        ├── lib/
        │   ├── supabase.js
        │   ├── theme.js
        │   └── AppContext.js
        └── screens/               ← All app screens
```

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Entry Camera                         Exit Camera               │
│        │                                    │                    │
│        ▼                                    ▼                    │
│   YOLOv8 detection                    YOLOv8 detection           │
│   + OCR (up to 7 variants)            + OCR (up to 7 variants)   │
│   + IoU Tracker (confirm N×)          + IoU Tracker (confirm N×) │
│        │                                    │                    │
│        ▼                                    ▼                    │
│   record_entry()                      record_exit()              │
│        └──────────────────┬───────────────-─┘                    │
│                           ▼                                      │
│                      Supabase DB                                 │
│                  (parking_sessions)                              │
│                           │                                      │
│           ┌───────────────┼───────────────┐                      │
│           ▼               ▼               ▼                      │
│        vehicles         users       parking_slots                │
│           │               │               │                      │
│           └───────────────┴───────────────┘                      │
│                           │                                      │
│              ┌────────────┴────────────┐                         │
│              ▼                         ▼                         │
│   frontend/ (React + Vite)    dashboard/index.html               │
│   parkwatch-android/ (Expo)   dashboard/manual.html              │
└──────────────────────────────────────────────────────────────────┘
```

**Async DB writes** — Every database write from the ANPR gate runs in a background `ThreadPoolExecutor` so the camera inference loop never stalls waiting for network latency.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Object detection | YOLOv8 (Ultralytics) |
| OCR (primary) | PaddleOCR (~30–80 ms) |
| OCR (fallback) | EasyOCR (~200–400 ms) |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth + Google OAuth |
| Backend language | Python 3.10+ |
| Web frontend | React 19, Vite 8, Tailwind CSS 4 |
| Routing (web) | React Router DOM 7 |
| Mobile app | React Native 0.81 + Expo SDK 54 |
| Mobile navigation | React Navigation 6 (Native Stack + Bottom Tabs) |
| Mobile storage | AsyncStorage (session persistence) |
| Camera I/O | OpenCV |
| Deployment | DB hosted on Supabase; app runs locally or via EAS Build |

---

## Prerequisites

**Python backend:**

- Python 3.10 or later
- A CUDA-capable GPU is optional but speeds up both YOLO and OCR significantly
- A trained YOLOv8 weights file at `models/best.pt` (train your own or use a pre-trained plate detection model)

**Web frontend:**

- Node.js 20+ and npm

**Android app:**

- Node.js 20+ and npm
- Expo CLI (`npm install -g expo-cli`) or `npx expo`
- Android device / emulator, or Expo Go on iOS

**Cloud:**

- A free [Supabase](https://supabase.com) project
- Google OAuth configured in Supabase Auth

---

## Quick Start

### 1 — Supabase Setup

Create a free project at [supabase.com](https://supabase.com), then run the schema bootstrap:

```bash
cd parking_anpr
python admin.py setup-schema
```

Copy the printed SQL and paste it into **Supabase → SQL Editor → New Query**. Run each `STEP` block separately in order (1 through 6). After running, disable Row Level Security so the ANPR backend can write freely:

```sql
ALTER TABLE parking_sessions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE parking_slots      DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles           DISABLE ROW LEVEL SECURITY;
ALTER TABLE users              DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments           DISABLE ROW LEVEL SECURITY;
```

Enable Google OAuth in **Supabase → Authentication → Providers → Google**, then add `http://localhost:5173/auth/callback` and `parkwatch://auth/callback` to the allowed redirect URLs.

### 2 — Python Backend

```bash
cd parking_anpr

# Create a virtual environment
python -m venv venv
source venv/bin/activate        # Linux/macOS
venv\Scripts\activate           # Windows

pip install -r requirements.txt

# Copy and fill in credentials
cp .env.example .env
```

Edit `.env`:
```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=your-service-role-key
```

Run both gates on one machine:
```bash
python run_both_gates.py
```

### 3 — Web Frontend

```bash
cd parking_anpr/frontend
npm install
npm run dev        # http://localhost:5173
```

### 4 — Static Dashboard

Open `parking_anpr/dashboard/index.html` in any browser. Fill in `SUPABASE_URL` and `SUPABASE_KEY` (anon/public key) near the bottom of the file. No server required.

### 5 — Android App

```bash
cd parkwatch-android
npm install
npx expo start         # scan QR with Expo Go
# or
npx expo run:android   # run on connected device/emulator
```

---

## Configuration

### Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | `.env` (Python) | Your Supabase project URL |
| `SUPABASE_KEY` | `.env` (Python) | **Service-role key** — bypasses RLS for gate writes |
| `SUPABASE_URL` | `frontend/src/supabase.js` | Same project URL |
| Anon key | `frontend/src/supabase.js` | **Anon/public key** — safe for browser |
| Anon key | `dashboard/index.html` | Read-only dashboard operations |
| Anon key | `parkwatch-android/src/lib/supabase.js` | Mobile app |

> **Important:** Never expose the service-role key in frontend or mobile code. It bypasses all Row Level Security policies.

### Camera Setup

Edit `config.py` → `CameraConfig`:

```python
# Webcam index (0 = built-in, 1 = first USB)
entry_camera = 0
exit_camera  = 1

# Or use RTSP/HTTP URLs
entry_camera = "rtsp://admin:pass@192.168.1.10/stream1"
exit_camera  = "rtsp://admin:pass@192.168.1.11/stream1"
```

### ANPR Tuning

All settings live in `config.py`. Key parameters:

| Setting | Default | Effect |
|---|---|---|
| `model.conf_thresh` | `0.50` | YOLO confidence threshold; lower = more detections, more false positives |
| `ocr.fast_mode` | `True` | `True` = 2 preprocessing variants (faster); `False` = all 7 (slower, more accurate) |
| `video.confirm_frames` | `2` | Frames before emitting an event; `1` = instant, `3` = conservative |
| `video.nth_frame` | `3` | Process every Nth frame; raise to 4–5 to reduce CPU usage |
| `video.cooldown_frames` | `20` | Frames to ignore a plate after it fires, preventing duplicates |
| `video.async_db` | `False` | `True` = DB writes in background threads (recommended for low-end hardware) |
| `ocr.min_conf` | `0.15` | Minimum OCR confidence to accept a reading |
| `parking.total_slots` | `100` | Default capacity (also set via `admin.py set-capacity`) |

---

## Database Schema

### `users`
Mirrors Supabase Auth. Populated automatically via the `handle_new_user` trigger on Google sign-in.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Mirrors `auth.users.id` |
| `name` | text | Full name |
| `email` | text | |
| `phone` | text | Added during signup step |
| `role` | text | `'user'` or `'admin'` |
| `created_at` | timestamptz | |

### `vehicles`
One user can register multiple plates. `user_id` is nullable to allow manual admin additions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | Nullable |
| `plate_number` | text UNIQUE | Always uppercase |
| `vehicle_type` | text | `'2-wheeler'`, `'4-wheeler'`, `'suv-van'` |
| `is_active` | bool | Only active plates are matched by ANPR |
| `owner_name` | text | Fallback display name |

### `parking_sessions`
Written by the ANPR cameras on every entry and exit event.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `plate` | text | Uppercase |
| `camera_entry` | text | e.g. `'GATE_ENTRY'`, `'MANUAL_ADMIN'` |
| `camera_exit` | text | Set on exit |
| `entry_time` | timestamptz | UTC |
| `exit_time` | timestamptz | Null while inside |
| `duration_mins` | int | Set on exit |
| `status` | text | `'inside'` or `'exited'` |
| `is_registered` | bool | True if matched to a vehicle row |
| `user_id` | uuid FK → users | |
| `vehicle_id` | uuid FK → vehicles | |

### `parking_slots`
One row per zone. Tracks capacity with a simple integer counter.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `zone` | text UNIQUE | e.g. `'A'` |
| `total` | int | Total capacity |
| `occupied` | int | Current count (incremented/decremented by ANPR) |
| `is_active` | bool | |

### `bookings`
Pre-scheduled reservations created through the web or mobile frontend.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `vehicle_id` | uuid FK | |
| `slot_id` | uuid FK | |
| `plan` | text | `'daily'`, `'weekly'`, `'monthly'`, `'yearly'` |
| `scheduled_entry` | date | |
| `scheduled_exit` | date | |
| `status` | text | `'confirmed'`, `'active'`, `'completed'`, `'cancelled'` |
| `amount` | numeric | |

### `payments`
Linked to bookings. Stores simulated payment records.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `booking_id` | uuid FK | |
| `method` | text | `'upi'`, `'card'`, `'net-banking'` |
| `status` | text | `'pending'`, `'success'` |
| `amount` | numeric | |
| `transaction_id` | text | `'SP-xxxxxx'` format |
| `paid_at` | timestamptz | |

---

## Running the ANPR Gates

| Scenario | Command |
|---|---|
| Both gates, one machine | `python run_both_gates.py` |
| Entry gate only | `python parking_gate.py --mode entry --source 0` |
| Exit gate only | `python parking_gate.py --mode exit --source 1` |
| Headless (server/Pi) | `python run_both_gates.py --headless` |
| Custom RTSP cameras | `python run_both_gates.py --entry rtsp://cam1/stream --exit rtsp://cam2/stream` |
| Instant detection | `python parking_gate.py --mode entry --source 0 --confirm 1` |
| High-accuracy OCR | `python parking_gate.py --mode entry --source 0 --full-ocr` |
| Two separate machines | Run `parking_gate.py` independently on each, both pointing to the same Supabase project |

> **GUI stability:** OpenCV's `imshow` is not thread-safe. When running both gates on one machine, use `--headless` for stability.

---

## Web Frontend

```bash
cd parking_anpr/frontend
npm run dev        # Development server → http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

### Pages

| Route | Description |
|---|---|
| `/` | Landing page — Google OAuth + admin login toggle |
| `/signup` | Profile completion (name + phone) after first Google sign-in |
| `/auth/callback` | OAuth redirect handler |
| `/register` | 3-step vehicle registration + payment wizard |
| `/admin` | Full admin panel (protected by mock credential check) |
| `/forgot-password` | Redirects users to Google account management |

### Admin Panel Sections

| Section | Description |
|---|---|
| **Dashboard** | Live stat cards, occupancy bar, recent bookings. Refreshes every 30 s. |
| **Vehicles** | All registered vehicles with owner and current status. Includes manual add and force-exit controls. |
| **Event Log** | Full ANPR entry/exit history. Filterable by All / Entry / Exit / Flagged. |
| **Export Data** | Download sessions or bookings as CSV with period selector. |
| **Camera Status** | Feed placeholder for each camera and last-detected plate table. |
| **System Config** | Read-only display of ANPR parameters (confidence threshold, GPU status, slot capacity). |

Default admin credentials (change before deploying):

```
ID:       admin
Password: admin123
```

---

## Static Dashboard & Manual Entry

Open `dashboard/index.html` or `dashboard/manual.html` directly in any browser. Both files connect directly to Supabase over HTTPS — no web server needed. Fill in `SUPABASE_URL` and `SUPABASE_KEY` (anon key) in the `<script>` block near the bottom of each file.

`manual.html` provides a browser-based entry/exit interface for gate attendants who do not have access to the Python CLI.

---

## Android App

The `parkwatch-android/` directory is a React Native (Expo) application targeting Android (iOS config is present but untested).

### Screens & Navigation

```
App.js
├── (unauthenticated)
│   ├── LandingScreen    — Google OAuth + admin credential login
│   └── SignupScreen     — Name + phone completion after first sign-in
│
├── UserTabs (Bottom Tab Navigator)
│   ├── HomeScreen       — Live occupancy gauge + recent sessions
│   ├── RegisterScreen   — 3-step vehicle + pass registration wizard
│   ├── SessionsScreen   — Filterable parking session history
│   └── ProfileScreen    — Account info + sign-out
│
└── AdminTabs (Bottom Tab Navigator)
    ├── AdminDashboard   — Slot stats overview with pull-to-refresh
    ├── VehiclesScreen   — All registered plates
    ├── ManualEntryScreen — Manual plate entry/exit override
    └── ProfileScreen    — Settings + admin sign-out
```

### Authentication

**Regular users — Google OAuth:**

1. Taps **Continue with Google** on the Landing screen.
2. `supabase.auth.signInWithOAuth` returns an auth URL with `skipBrowserRedirect: true`.
3. `expo-web-browser` opens the URL in an in-app browser tab.
4. Supabase redirects back to `parkwatch://auth/callback` with tokens or a PKCE code.
5. A custom `parseOAuthUrl()` helper parses the response and sets the session via `supabase.auth.setSession()` or `exchangeCodeForSession()`.
6. `onAuthStateChange` in `App.js` detects the new session and renders the user tab stack.

**Administrators — local credentials:**

Admin login is validated against `MOCK_ADMIN` in `src/lib/theme.js` (`id: 'admin'`, `password: 'admin123'`). On success, `App.js` sets `isAdmin = true`, which renders the admin tab stack without a Supabase session. Logout is handled via `AppContext.handleAdminLogout()`.

### Building for Android

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Development build (installs a dev client on device)
eas build --profile development --platform android

# Preview APK (sideloadable)
eas build --profile preview --platform android

# Release APK
eas build --profile apk --platform android

# Production AAB (Play Store)
eas build --profile production --platform android
```

EAS Build profiles are defined in `eas.json`. The EAS project ID is `25dea634-0c17-48de-9fbb-e51e412e4639` (set in `app.json`).

---

## CLI Admin Tools

The `admin.py` script provides a full command-line interface for managing the parking database without opening a browser.

```bash
# Show current occupancy
python admin.py status

# List the 30 most recent sessions
python admin.py sessions

# Show only vehicles currently inside
python admin.py sessions --inside

# Look up a specific plate
python admin.py lookup KL07BB1234

# Update total slot capacity
python admin.py set-capacity 200

# Manually record a vehicle entry
python admin.py manual-entry KL07BB1234

# Force-exit a stuck session
python admin.py manual-exit KL07BB1234

# Interactive terminal (easiest for day-to-day use)
python admin.py interactive

# Print schema SQL (run once during initial setup)
python admin.py setup-schema
```

**Interactive mode commands:**

| Command | Example | Description |
|---|---|---|
| `IN <plate>` | `IN KL07BB1234` | Record a manual vehicle entry |
| `OUT <plate>` | `OUT MH12AB3456` | Record a manual vehicle exit |
| `CHECK <plate>` | `CHECK DL01AB1234` | Look up registration and inside status |
| `LIST` | | Show all vehicles currently inside |
| `STATUS` | | Print current occupancy stats |
| `QUIT` | | Exit the terminal |

---

## User Flow

```
1. User opens web app or Android app → Continue with Google
        ↓
2. Google OAuth → /auth/callback
        ↓
3. First-time users → /signup (name + phone)
   Returning users  → /register
        ↓
4. /register — 3-step flow:
   Step 1: Vehicle plate, date of arrival, vehicle type
   Step 2: Parking plan (daily/weekly/monthly/yearly), payment method
   Step 3: Review → payment modal (UPI/card/net banking demo)
        ↓
5. On payment confirmation:
   - booking row inserted
   - payment row inserted
   - Success screen shows booking ID
        ↓
6. On arrival — ANPR camera reads the plate → record_entry()
   - Plate matched against vehicles table
   - parking_sessions row created (status = 'inside')
   - parking_slots.occupied incremented
        ↓
7. On departure — exit camera → record_exit()
   - Open session found, duration calculated
   - Session updated (status = 'exited', duration_mins set)
   - parking_slots.occupied decremented
```

---

## OCR Engine Details

PlatReader tries **PaddleOCR first** (30–80 ms) and falls back to **EasyOCR** (200–400 ms) if PaddleOCR returns nothing or is not installed.

**Preprocessing variants (priority order):**

| Variant | Description |
|---|---|
| `gray` | CLAHE-enhanced grayscale — best for clean, well-lit plates |
| `sharp` | Unsharp-mask sharpening on top of CLAHE — helps worn/faded plates |
| `otsu` | Global Otsu threshold — good for high-contrast white-on-black plates |
| `otsu_inv` | Inverted Otsu — black-on-yellow / dark-background plates |
| `adap` | Adaptive Gaussian threshold — uneven lighting, shadows, glare |
| `adap_inv` | Inverted adaptive threshold |
| `boosted` | Canny edge overlay on grayscale — last-resort fallback |

In `fast_mode=True` only `gray` and `sharp` are tried. The reader stops on the first valid plate.

**Indian plate validation:**

1. Minimum length of 6 characters
2. Standard format `SS00LLL0000` (state code + district + series + serial)
3. BH-series plates (`00BH0000AA` format)
4. State code must be in the 37-entry `VALID_STATES` set
5. Character-substitution correction (`O`↔`0`, `I`↔`1`, `B`↔`8`, etc.) applied before validation

Set `DEBUG_OCR = True` in `utils/ocr.py` to print every raw OCR read, the output of `fix_characters()`, and the exact reason any plate is rejected.

---

## Performance Tuning

**Reduce CPU usage:**
- Raise `video.nth_frame` from 3 to 4 or 5 to skip more frames.
- Keep `ocr.fast_mode = True`.
- Set `video.async_db = True` to move DB calls off the inference thread.
- Lower camera resolution to 640×480 for weak hardware.

**Increase accuracy:**
- Set `ocr.fast_mode = False` to try all 7 preprocessing variants.
- Lower `model.conf_thresh` to `0.40` to catch partially visible plates.
- Increase `video.confirm_frames` to `3` for consensus-based confirmation.

**GPU acceleration:**
- Set `ocr.gpu = True` to run EasyOCR on CUDA.
- YOLOv8 automatically uses CUDA when `torch.cuda.is_available()` is true.
- PaddleOCR uses CPU by default (`use_gpu=False` in `utils/ocr.py`); enable by changing that flag when CUDA PaddlePaddle is installed.

---

## Deployment Scenarios

### Single machine (two webcams)

```bash
python run_both_gates.py --headless
```

### Two machines (Raspberry Pi at each gate)

```bash
# Machine 1 — entry gate
python parking_gate.py --mode entry --source 0

# Machine 2 — exit gate
python parking_gate.py --mode exit --source 0
```

Both share the same `SUPABASE_URL` and `SUPABASE_KEY` in their `.env` files.

### IP / RTSP cameras

```bash
python run_both_gates.py \
  --entry rtsp://admin:pass@192.168.1.10/stream1 \
  --exit  rtsp://admin:pass@192.168.1.11/stream1 \
  --headless
```

### Web frontend (production)

```bash
cd parking_anpr/frontend
npm run build
# Serve dist/ with Netlify, Vercel, Nginx, etc.
```

---

## Security Notes

| Risk | Mitigation |
|---|---|
| Service-role key in `.env` | Never commit `.env`. Already listed in `.gitignore`. |
| Anon key in frontend code | Acceptable — designed for browser use. Add RLS policies for production. |
| RLS disabled | Re-enable with proper policies before going to production. Use Supabase Edge Functions for write operations. |
| Admin password hardcoded | Replace `MOCK_ADMIN` in `Landing.jsx` and `theme.js` with a real admin auth flow before deploying. |
| Payment flow is simulated | The `PaymentModal` is a UI demo. Integrate Razorpay, Stripe, etc. before accepting real transactions. |
| Firebase config in `firebase.js` | Remove or rotate API keys if the web app is deployed publicly. |

---

## Troubleshooting

**Camera won't open**

Verify the index:
```bash
python -c "import cv2; c=cv2.VideoCapture(0); print(c.isOpened())"
```
On Windows, try index `1` if you have a built-in webcam. Confirm RTSP URLs with VLC before using them here.

**"Table not found" error**

Run `python admin.py setup-schema` and paste the SQL into Supabase SQL Editor, running each `STEP` block in order.

**All plates rejected by OCR**

Set `DEBUG_OCR = True` in `utils/ocr.py` to see exactly what is being read and why it is rejected. Check that your state code is in `VALID_STATES` (e.g. `KL`, `MH`, `DL`). Try `--full-ocr` to enable all 7 preprocessing variants.

**`parking_slots.occupied` not updating**

Confirm RLS is disabled on `parking_slots`. Check that the service-role key (not the anon key) is in `.env`. Run `python admin.py status` to see the current count.

**Google OAuth redirect fails (web)**

Add `http://localhost:5173/auth/callback` to the allowed redirect URLs in both Supabase (Authentication → URL Configuration) and Google Cloud Console (OAuth 2.0 → Authorised redirect URIs).

**Google OAuth redirect fails (Android)**

Add `parkwatch://auth/callback` to the same lists. The scheme `parkwatch` is defined in `app.json` under `"scheme"`.

**React frontend can't reach Supabase**

Confirm `frontend/src/supabase.js` uses the **anon/public key**, not the service-role key. Check the browser console for CORS errors — these usually mean the URL is wrong.

**Android: "No OAuth URL returned"**

Ensure `expo-web-browser` is listed in `app.json` plugins and that `WebBrowser.maybeCompleteAuthSession()` is called at the top of `LandingScreen.js`.

---

## Controls Reference

### OpenCV Gate Window

| Key | Action |
|---|---|
| `q` | Quit the gate process |
| `s` | Save the current annotated frame to `outputs/` |
| `r` | Clear the on-screen event log |

### CLI Interactive Mode

| Command | Example | Description |
|---|---|---|
| `IN <plate>` | `IN KL07BB1234` | Record a manual vehicle entry |
| `OUT <plate>` | `OUT MH12AB3456` | Record a manual vehicle exit |
| `CHECK <plate>` | `CHECK DL01AB1234` | Look up registration and inside status |
| `LIST` | | Show all vehicles currently inside |
| `STATUS` | | Print current occupancy stats |
| `HELP` | | Show command list |
| `QUIT` | | Exit the terminal |

---

## License

This project is provided for educational and personal use. Replace all mock payment, admin authentication, and demo credentials before any production deployment.
