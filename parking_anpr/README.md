# 🅿 ParkWatch — Smart Parking ANPR System

> **Automatic Number Plate Recognition** for parking lot entry/exit management.
> Combines a YOLOv8 detection backend, EasyOCR/PaddleOCR text recognition, a
> Supabase cloud database, and a React + Tailwind web frontend into one
> end-to-end smart parking solution.

---

## Table of Contents

- [🅿 ParkWatch — Smart Parking ANPR System](#-parkwatch--smart-parking-anpr-system)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [System Architecture](#system-architecture)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
    - [1 — Python Backend](#1--python-backend)
    - [2 — React Frontend](#2--react-frontend)
  - [Configuration](#configuration)
    - [Environment Variables](#environment-variables)
    - [Camera Setup](#camera-setup)
    - [ANPR Tuning](#anpr-tuning)
  - [Supabase Setup](#supabase-setup)
    - [Database Schema](#database-schema)
    - [Authentication](#authentication)
  - [Running the System](#running-the-system)
    - [ANPR Gates](#anpr-gates)
    - [Web Frontend](#web-frontend)
    - [Static Dashboard](#static-dashboard)
  - [User Flow](#user-flow)
  - [Admin Panel](#admin-panel)
  - [CLI Admin Tools](#cli-admin-tools)
  - [Database Schema Reference](#database-schema-reference)
    - [`users`](#users)
    - [`vehicles`](#vehicles)
    - [`parking_sessions`](#parking_sessions)
    - [`parking_slots`](#parking_slots)
    - [`bookings`](#bookings)
    - [`payments`](#payments)
  - [OCR Engine Details](#ocr-engine-details)
  - [Performance Tuning](#performance-tuning)
  - [Deployment Scenarios](#deployment-scenarios)
    - [Single machine (two webcams)](#single-machine-two-webcams)
    - [Two machines (Raspberry Pi at each gate)](#two-machines-raspberry-pi-at-each-gate)
    - [IP / RTSP cameras](#ip--rtsp-cameras)
    - [React frontend (production)](#react-frontend-production)
  - [Security Notes](#security-notes)
  - [Troubleshooting](#troubleshooting)
  - [Controls Reference](#controls-reference)
    - [OpenCV Gate Window](#opencv-gate-window)
    - [CLI Interactive Mode (`python admin.py interactive`)](#cli-interactive-mode-python-adminpy-interactive)
  - [License](#license)

---

## Overview

ParkWatch automates parking lot access control using computer vision. Cameras at
entry and exit gates capture vehicles, a YOLO model detects the number plate
region, OCR reads the plate text, and the system records the session in Supabase.
A live React web app lets users register their vehicles and pay online, while
admins monitor occupancy, view logs, and manage vehicles in real time.

**Key capabilities:**

- Automatic entry/exit detection with no human intervention
- Registered member detection with name lookup
- Real-time occupancy tracking across any number of machines
- Web registration with Google OAuth, plan selection, and simulated payment
- Admin dashboard with live stats, session logs, manual overrides, and CSV export
- Static HTML dashboard and manual-entry page that work without Node.js

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
│        │                                    │                    │
│        └─────────────────┬─────────────────-┘                    │
│                          ▼                                       │
│                     Supabase DB                                  │
│                 (parking_sessions)                               │
│                          │                                       │
│           ┌──────────────┼──────────────┐                        │
│           ▼              ▼              ▼                        │
│        vehicles        users      parking_slots                  │
│     (plate lookup)  (profiles)    (occupancy)                    │
│           │              │              │                        │
│           └──────────────┴──────────────┘                        │
│                          │                                       │
│              ┌───────────┴────────────┐                          │
│              ▼                        ▼                          │
│    frontend/ (React + Vite)    dashboard/index.html              │
│    - Landing / Google OAuth    - Live occupancy gauge            │
│    - Vehicle registration      - Sessions table                  │
│    - Payment flow              - Auto-refresh every 10s          │
│    - Admin dashboard                                             │
└──────────────────────────────────────────────────────────────────┘
```

**Async DB writes** — Every database write from the ANPR gate runs in a
background `ThreadPoolExecutor`, so the camera inference loop never stalls
waiting for network latency.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Object detection | YOLOv8 (Ultralytics) |
| OCR (primary) | PaddleOCR (~30–80 ms) |
| OCR (fallback) | EasyOCR |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth + Google OAuth |
| Backend language | Python 3.10+ |
| Web frontend | React 19, Vite 8, Tailwind CSS 4 |
| Routing | React Router DOM 7 |
| Camera I/O | OpenCV |
| Deployment | Runs locally; DB hosted on Supabase free tier |

---

## Project Structure

```
parking_anpr/
│
├── parking_gate.py          ← Single-gate ANPR entry point
├── run_both_gates.py        ← Runs both gates on one machine (threaded)
├── admin.py                 ← CLI admin tools
├── config.py                ← All settings (cameras, model, OCR, storage)
├── requirements.txt         ← Python dependencies
├── .env.example             ← Copy to .env and fill in credentials
│
├── db/
│   ├── __init__.py
│   └── supabase_client.py   ← All DB read/write operations
│
├── utils/
│   ├── __init__.py
│   ├── preprocess.py        ← Image preprocessing (7 variants)
│   ├── ocr.py               ← OCR engine wrapper + plate validation
│   ├── visualise.py         ← OpenCV drawing helpers
│   ├── tracker.py           ← IoU multi-object tracker
│   └── snapshot.py          ← Saves plate crop images to disk
│
├── dashboard/
│   ├── index.html           ← Static live occupancy dashboard
│   └── manual.html          ← Static manual entry/exit web interface
│
└── frontend/                ← React + Vite web application
    ├── src/
    │   ├── App.jsx
    │   ├── supabase.js       ← Supabase client (anon key only)
    │   ├── firebase.js       ← Firebase config (if used)
    │   ├── pages/
    │   │   ├── Landing.jsx         ← Login (Google OAuth + admin)
    │   │   ├── Signup.jsx          ← Profile completion
    │   │   ├── Register.jsx        ← Vehicle registration + payment
    │   │   ├── AuthCallback.jsx    ← OAuth redirect handler
    │   │   ├── ForgotPassword.jsx
    │   │   └── AdminDashboard.jsx  ← Full admin panel
    │   ├── components/
    │   │   ├── admin/
    │   │   │   ├── Badge.jsx
    │   │   │   ├── StatCard.jsx
    │   │   │   ├── TableCard.jsx
    │   │   │   └── SectionHeader.jsx
    │   │   ├── AuthCard.jsx
    │   │   ├── Brand.jsx
    │   │   ├── Toast.jsx
    │   │   ├── OTPInput.jsx
    │   │   ├── PasswordInput.jsx
    │   │   ├── ProgressBars.jsx
    │   │   ├── StepIndicator.jsx
    │   │   └── SuccessScreen.jsx
    │   ├── hooks/
    │   │   └── useTimer.js
    │   └── data/
    │       └── mockData.js   ← Placeholder data for non-live admin sections
    └── package.json
```

---

## Prerequisites

**Python backend:**

- Python 3.10 or later
- A CUDA-capable GPU is optional but speeds up both YOLO and OCR significantly
- A trained YOLOv8 weights file at `models/best.pt` (train your own or use a
  pre-trained plate detection model)

**React frontend:**

- Node.js 20+ and npm

**Cloud:**

- A free [Supabase](https://supabase.com) project
- Google OAuth configured in Supabase Auth (for user sign-in)

---

## Installation

### 1 — Python Backend

```bash
# Clone or download the project
cd parking_anpr

# Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate          # Linux/macOS
venv\Scripts\activate             # Windows

# Install dependencies
pip install -r requirements.txt
```

> **Note:** `torch` and `torchvision` are listed in `requirements.txt`. If you
> want GPU support, install the CUDA build of PyTorch first by following the
> instructions at [pytorch.org](https://pytorch.org/get-started/locally/) before
> running `pip install -r requirements.txt`.

### 2 — React Frontend

```bash
cd frontend
npm install
```

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

```dotenv
# .env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=your-service-role-key   # service-role key for ANPR writes
```

> **Which key to use where:**
> - `.env` (Python backend) → **service-role key** — bypasses RLS so the ANPR
>   system can write sessions without a logged-in user context.
> - `frontend/src/supabase.js` → **anon/public key** — safe to expose in
>   browser code; relies on Supabase Auth for access control.
> - `dashboard/index.html` and `dashboard/manual.html` → **anon/public key** —
>   read-only dashboard operations only.

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

Camera resolution defaults to 1280×720. Lower it for slower machines:

```python
width  = 1280
height = 720
```

### ANPR Tuning

All settings live in `config.py`. Key parameters:

| Setting | Default | Effect |
|---|---|---|
| `model.conf_thresh` | `0.50` | YOLO confidence threshold; lower = more detections but more false positives |
| `ocr.fast_mode` | `True` | `True` = 2 preprocessing variants (faster); `False` = all 7 (slower, more accurate) |
| `video.confirm_frames` | `2` | Frames before emitting an event; `1` = instant, `3` = conservative |
| `video.nth_frame` | `3` | Process every Nth frame; raise to `4–5` to reduce CPU usage |
| `video.cooldown_frames` | `20` | Frames to ignore a plate after it fires, preventing duplicate events |
| `video.async_db` | `False` | `True` = DB writes in background threads (recommended for low-end hardware) |
| `ocr.min_conf` | `0.15` | Minimum OCR confidence to accept a reading |
| `parking.total_slots` | `100` | Default capacity (also set via `admin.py set-capacity`) |

---

## Supabase Setup

### Database Schema

Run the schema setup command to get the SQL, then execute it in your Supabase
SQL Editor in the order shown:

```bash
python admin.py setup-schema
```

Copy the printed SQL and paste it into **Supabase → SQL Editor → New Query**.
Run each `STEP` block separately (STEP 1 first, then STEP 2, and so on through
STEP 6). STEP 2 intentionally drops and recreates `parking_slots` to add the
UUID primary key required by the bookings foreign key.

After running the schema, disable Row Level Security so the ANPR backend can
write freely:

```sql
ALTER TABLE parking_sessions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE parking_slots      DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles           DISABLE ROW LEVEL SECURITY;
ALTER TABLE users              DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments           DISABLE ROW LEVEL SECURITY;
```

> For production, replace the `DISABLE RLS` approach with proper RLS policies
> and use a Supabase Edge Function for write operations instead of exposing the
> service-role key.

### Authentication

1. Go to **Supabase → Authentication → Providers → Google**.
2. Enable Google and enter your Google OAuth client ID and secret (obtained from
   [Google Cloud Console](https://console.cloud.google.com/)).
3. Add your site URL and `http://localhost:5173/auth/callback` to the allowed
   redirect URLs.

The `handle_new_user` database trigger (created in STEP 1 of the schema) 
automatically inserts a row into the `users` table whenever someone signs up via 
Google OAuth, copying their email, name, and avatar.

---

## Running the System

### ANPR Gates

| Scenario | Command |
|---|---|
| Both gates, one machine | `python run_both_gates.py` |
| Entry gate only | `python parking_gate.py --mode entry --source 0` |
| Exit gate only | `python parking_gate.py --mode exit --source 1` |
| Headless (server/Pi) | `python run_both_gates.py --headless` |
| Custom RTSP cameras | `python run_both_gates.py --entry rtsp://cam1/stream --exit rtsp://cam2/stream` |
| Instant detection (no consensus) | `python parking_gate.py --mode entry --source 0 --confirm 1` |
| High-accuracy OCR | `python parking_gate.py --mode entry --source 0 --full-ocr` |
| Two separate machines | Run `parking_gate.py` independently on each, both write to the same Supabase project |

> **GUI stability:** OpenCV's `imshow` is not thread-safe. When running both
> gates on one machine, use `--headless` for stability. Use separate terminal
> invocations of `parking_gate.py` if you need live video windows.

### Web Frontend

```bash
cd frontend
npm run dev        # Development server at http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

### Static Dashboard

Open `dashboard/index.html` in any browser. No server required — it connects
directly to Supabase over HTTPS. Fill in your credentials near the bottom of the
file:

```js
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_KEY = "your-anon-public-key";
```

Similarly, `dashboard/manual.html` provides a browser-based manual entry/exit
interface with the same credential block.

---

## User Flow

```
1. User visits the web app (frontend/) and clicks "Continue with Google"
        ↓
2. Google OAuth redirects to /auth/callback
        ↓
3. AuthCallback checks if the user already has a phone number saved
        ↓
   No phone → /signup   (user enters name + phone)
   Has phone → /register
        ↓
4. /register — 3-step flow:
   Step 1: Enter vehicle plate, date of arrival, vehicle type
   Step 2: Choose parking plan (daily/weekly/monthly/yearly), payment method
   Step 3: Review summary → payment modal (UPI/card/net banking demo)
        ↓
5. On payment confirmation:
   - A row is inserted into `bookings`
   - A row is inserted into `payments`
   - A success screen shows the booking ID
        ↓
6. On arrival, the ANPR camera reads the plate and calls record_entry()
   - Matches against `vehicles` to check if registered
   - Writes a `parking_sessions` row (status = 'inside')
   - Increments `parking_slots.occupied`
        ↓
7. On departure, the exit camera calls record_exit()
   - Finds the open session, calculates duration
   - Updates the session (status = 'exited', duration_mins set)
   - Decrements `parking_slots.occupied`
```

---

## Admin Panel

Access the admin panel by selecting **Admin Login** on the landing page and
entering the credentials (default: ID `admin`, password `admin123`; change these
in `frontend/src/pages/Landing.jsx` before deploying).

The admin panel has six sections:

| Section | Description |
|---|---|
| **Dashboard** | Live stat cards (vehicles today, inside, available slots, revenue), occupancy bar, recent bookings table. Refreshes every 30 seconds. |
| **Vehicles** | All registered vehicles with owner, type, current status. Includes manual add and force-exit controls that write directly to `parking_sessions` and update the slot counter. |
| **Event Log** | Full ANPR entry/exit history from `MOCK_LOGS` (replace with a real Supabase query to show live data). Filterable by All / Entry / Exit / Flagged. |
| **Export Data** | Download sessions or bookings as CSV. Period selector (Today / This Week / All Time). |
| **Camera Status** | Live feed placeholder for each camera plus last-detected plate table. |
| **System Config** | Read-only display of ANPR parameters (confidence threshold, debounce, GPU status, slot capacity). |

---

## CLI Admin Tools

The `admin.py` script provides a full command-line interface for managing the
parking database without opening a browser.

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

The interactive mode supports `IN`, `OUT`, `CHECK`, `LIST`, and `STATUS`
commands and is the recommended interface for gate attendants without browser
access.

---

## Database Schema Reference

### `users`
Mirrors Supabase Auth. Populated automatically via the `handle_new_user` trigger
on Google sign-in.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Mirrors `auth.users.id` |
| `name` | text | Full name |
| `email` | text | |
| `phone` | text | Added during `/signup` step |
| `role` | text | `'user'` or `'admin'` |
| `created_at` | timestamptz | |

### `vehicles`
One user can register multiple plates. `user_id` is nullable to allow manual
admin additions without an associated auth user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | Nullable |
| `plate_number` | text UNIQUE | Always uppercase |
| `vehicle_type` | text | `'2-wheeler'`, `'4-wheeler'`, `'suv-van'` |
| `is_active` | bool | Only active plates are matched by ANPR |
| `owner_name` | text | Fallback display name |
| `entry_time` | timestamptz | Last recorded entry (updated by ANPR) |

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
| `entry_image_url` | text | Path to local snapshot |
| `exit_image_url` | text | Path to local snapshot |

### `parking_slots`
One row per zone. Tracks capacity with a simple integer counter — there is no
per-slot status column.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `zone` | text UNIQUE | e.g. `'A'` |
| `total` | int | Total capacity |
| `occupied` | int | Current occupied count (incremented/decremented by ANPR) |
| `is_active` | bool | |
| `updated_at` | timestamptz | |

### `bookings`
Pre-scheduled reservations created through the web frontend.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `vehicle_id` | uuid FK → vehicles | |
| `slot_id` | uuid FK → parking_slots | |
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
| `booking_id` | uuid FK → bookings | |
| `method` | text | `'upi'`, `'card'`, `'net-banking'` |
| `status` | text | `'pending'`, `'success'` |
| `amount` | numeric | |
| `transaction_id` | text | `'SP-xxxxxx'` format |
| `paid_at` | timestamptz | |

---

## OCR Engine Details

PlatReader tries **PaddleOCR first** (30–80 ms) and falls back to **EasyOCR**
(200–400 ms) if PaddleOCR returns nothing or is not installed.

**Preprocessing variants** (in priority order):

| Variant | Description |
|---|---|
| `gray` | CLAHE-enhanced grayscale — best for clean, well-lit plates |
| `sharp` | Unsharp-mask sharpening on top of CLAHE — helps worn/faded plates |
| `otsu` | Global Otsu threshold — good for high-contrast white-on-black plates |
| `otsu_inv` | Inverted Otsu — black-on-yellow / dark-background plates |
| `adap` | Adaptive Gaussian threshold — uneven lighting, shadows, glare |
| `adap_inv` | Inverted adaptive threshold |
| `boosted` | Canny edge overlay on grayscale — last-resort fallback |

In `fast_mode=True` only `gray` and `sharp` are tried. The reader stops as soon
as any variant produces a valid plate, so most clean-plate reads cost only one
or two preprocessing passes.

**Indian plate validation** checks:

1. Minimum length of 6 characters.
2. Standard format `SS00LLL0000` (state code + district + series + serial).
3. BH-series plates (`00BH0000AA` format).
4. State code must be in the 37-entry `VALID_STATES` set.
5. Character-substitution correction (`O`↔`0`, `I`↔`1`, `B`↔`8`, etc.)
   is applied before validation.

Set `DEBUG_OCR = True` in `utils/ocr.py` to print every raw OCR read,
what `fix_characters()` produces, and the exact reason any plate is rejected.

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
- PaddleOCR uses CPU by default (`use_gpu=False` in `utils/ocr.py`); enable
  by changing that flag when CUDA PaddlePaddle is installed.

---

## Deployment Scenarios

### Single machine (two webcams)

```bash
python run_both_gates.py --headless
```

Both gate threads write to Supabase. The static dashboard auto-refreshes in any
browser on the same network.

### Two machines (Raspberry Pi at each gate)

```bash
# Machine 1 — entry gate
python parking_gate.py --mode entry --source 0

# Machine 2 — exit gate
python parking_gate.py --mode exit --source 0
```

Both machines share the same `SUPABASE_URL` and `SUPABASE_KEY` in their `.env`
files. All writes go to the same cloud database automatically.

### IP / RTSP cameras

```bash
python run_both_gates.py \
  --entry rtsp://admin:pass@192.168.1.10/stream1 \
  --exit  rtsp://admin:pass@192.168.1.11/stream1 \
  --headless
```

### React frontend (production)

```bash
cd frontend
npm run build
# Serve the dist/ folder with any static host (Netlify, Vercel, Nginx, etc.)
```

---

## Security Notes

| Risk | Mitigation |
|---|---|
| Service-role key in `.env` | Never commit `.env`. It is already listed in `.gitignore`. |
| Anon key in frontend code | Acceptable — this key is designed for browser use. Rely on RLS policies for production. |
| RLS disabled | Re-enable RLS with proper policies before going to production. Use Supabase Edge Functions for write operations instead of exposing the service-role key. |
| Admin password hardcoded | Replace the `MOCK_ADMIN` object in `Landing.jsx` with a real admin authentication flow before deploying. |
| Payment flow is simulated | The `PaymentModal` in `Register.jsx` is a UI demo only. Integrate a real payment gateway (Razorpay, Stripe, etc.) before accepting real transactions. |

---

## Troubleshooting

**Camera won't open**
- Verify the index with `python -c "import cv2; c=cv2.VideoCapture(0); print(c.isOpened())"`.
- On Windows, try index `1` instead of `0` if you have a built-in webcam.
- For RTSP streams, confirm the URL with VLC before using it here.

**"Table not found" error in the dashboard**
- Run `python admin.py setup-schema` and execute the printed SQL in Supabase SQL
  Editor, running each STEP block in order.

**All plates rejected by OCR**
- Set `DEBUG_OCR = True` in `utils/ocr.py` to see exactly what is being read
  and why it is rejected.
- Check that your state code is in `VALID_STATES` (e.g. `KL`, `MH`, `DL`).
- Try `--full-ocr` to enable all 7 preprocessing variants.

**`parking_slots.occupied` not updating**
- Confirm RLS is disabled on `parking_slots`.
- Check that the service-role key (not the anon key) is in `.env`.
- Run `python admin.py status` to see the current count and confirm the
  table row exists.

**Google OAuth redirect fails**
- Add `http://localhost:5173/auth/callback` to the allowed redirect URLs in
  both Supabase (Authentication → URL Configuration) and Google Cloud Console
  (OAuth 2.0 → Authorised redirect URIs).

**React frontend can't reach Supabase**
- Confirm `frontend/src/supabase.js` uses the **anon/public key**, not the
  service-role key.
- Open the browser console and check for CORS errors — these usually mean the
  URL is wrong.

---

## Controls Reference

### OpenCV Gate Window

| Key | Action |
|---|---|
| `q` | Quit the gate process |
| `s` | Save the current annotated frame to `outputs/` |
| `r` | Clear the on-screen event log |

### CLI Interactive Mode (`python admin.py interactive`)

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

This project is provided for educational and personal use. Replace all mock
payment, admin authentication, and demo credentials before any production
deployment.