# ParkWatch 🅿️

> **Smart parking management for the modern lot** — ANPR-powered entry/exit, real-time slot tracking, and digital pass registration, all in one React Native app.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Setup](#environment-setup)
- [Running the App](#running-the-app)
- [Building for Android](#building-for-android)
- [Authentication](#authentication)
- [Database Schema](#database-schema)
- [Screens & Navigation](#screens--navigation)
- [Admin Access](#admin-access)
- [Theming & UI Components](#theming--ui-components)
- [Known Limitations & TODOs](#known-limitations--todos)
- [License](#license)

---

## Overview

ParkWatch is a React Native (Expo) mobile application that serves as the user-facing interface for a smart parking system. Vehicles are recognized at entry and exit via ANPR (Automatic Number Plate Recognition) cameras powered by YOLOv8 + PaddleOCR on the backend. Users register their vehicle, purchase a parking pass, and are identified automatically without stopping at a barrier. Administrators can monitor occupancy, view all registered vehicles, and manually log entries or exits when the camera system needs a fallback.

---

## Features

### User-Facing
- **Google OAuth sign-in** via Supabase Auth — no passwords, no friction.
- **Vehicle registration** with plate number and vehicle type (2-wheeler, 4-wheeler, SUV/van).
- **Parking pass purchase** — Daily, Weekly, Monthly, or Yearly plans with simulated UPI / Card / Net Banking payment flows.
- **Live occupancy dashboard** — real-time slot count, occupancy percentage, and a colour-coded progress bar (green → amber → red).
- **Session history** — filterable list of all ANPR-detected entry and exit events linked to the user's plate.
- **Profile management** — Google avatar, name, email, phone, and role displayed; one-tap sign-out.

### Admin-Facing
- **Admin dashboard** — total, occupied, and vacant slot counts with pull-to-refresh.
- **Vehicles screen** — full list of all registered plates and vehicle types in the system.
- **Manual entry override** — log an entry or exit for any plate number without camera involvement.
- **Settings / sign-out** — shares the ProfileScreen component; recognises admin context and uses local logout rather than Supabase signOut.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81 + Expo SDK 54 |
| Navigation | React Navigation 6 (Native Stack + Bottom Tabs) |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime) |
| Auth | Supabase Auth — Google OAuth (PKCE & implicit grant) |
| Storage | `@react-native-async-storage/async-storage` for session persistence |
| Icons | `@expo/vector-icons` (Ionicons) |
| HTTP tunnel (dev) | `@expo/ngrok` |
| Build / Deploy | EAS Build (Expo Application Services) |
| ANPR Engine | YOLOv8 + PaddleOCR (external Python service, not in this repo) |

---

## Project Structure

```
parkwatch-android/
├── App.js                        # Root component — auth state, navigator setup
├── app.json                      # Expo config (name, icons, permissions, EAS project ID)
├── babel.config.js
├── eas.json                      # EAS Build profiles (development / preview / apk / production)
├── package.json
└── src/
    ├── components/
    │   └── UI.js                 # Shared components: Card, Button, Input, Badge, StatCard, …
    ├── lib/
    │   ├── AppContext.js         # React context — isAdmin flag + handleAdminLogout
    │   ├── supabase.js           # Supabase client with AsyncStorage session persistence
    │   └── theme.js             # Colour tokens, parking plans, vehicle types, mock admin creds
    └── screens/
        ├── LandingScreen.js     # Google OAuth + admin credential login
        ├── SignupScreen.js      # Profile completion after first Google sign-in
        ├── HomeScreen.js        # Live occupancy gauge + recent ANPR sessions
        ├── RegisterScreen.js    # 3-step vehicle registration + payment wizard
        ├── SessionsScreen.js    # Filterable parking session history
        ├── ProfileScreen.js     # User/admin account info + sign-out
        ├── AdminDashboard.js    # Admin: slot stats overview
        ├── VehiclesScreen.js    # Admin: list of registered vehicles
        └── ManualEntryScreen.js # Admin: manual plate entry/exit override
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 20 (required by Metro / React Native 0.81)
- npm ≥ 10
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- An Android device / emulator, or Expo Go on iOS

### Clone & Install

```bash
git clone <your-repo-url>
cd parkwatch-android
npm install
```

---

## Environment Setup

The Supabase URL and anon key are currently hard-coded in `src/lib/supabase.js` for convenience during development. For a production build you should move them to environment variables.

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Then update `src/lib/supabase.js`:

```js
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
```

Expo automatically exposes variables prefixed with `EXPO_PUBLIC_` to the JavaScript bundle.

### Google OAuth Redirect URI

In your Supabase project dashboard → **Authentication → URL Configuration**, add the following as an allowed redirect URI:

```
parkwatch://auth/callback
```

The scheme `parkwatch` is defined in `app.json` under `"scheme"`.

---

## Running the App

```bash
# Start the Metro bundler
npx expo start

# Open on a connected Android device or emulator
npx expo run:android

# Open in Expo Go (scan QR from terminal)
npx expo start --tunnel    # if on a different network segment
```

---

## Building for Android

EAS Build profiles are defined in `eas.json`.

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Development build (installs a dev client on device)
eas build --profile development --platform android

# Preview APK (sideloadable)
eas build --profile preview --platform android

# Release APK (assembleRelease)
eas build --profile apk --platform android

# Production AAB (for Play Store)
eas build --profile production --platform android
```

The EAS project ID is `25dea634-0c17-48de-9fbb-e51e412e4639` (set in `app.json → extra.eas.projectId`).

---

## Authentication

### Regular Users — Google OAuth

1. User taps **Continue with Google** on the Landing screen.
2. `supabase.auth.signInWithOAuth` is called with `skipBrowserRedirect: true`, returning an auth URL.
3. `expo-web-browser` opens that URL in an in-app browser tab.
4. Supabase redirects back to `parkwatch://auth/callback` with either:
   - an `access_token` in the URL fragment (implicit grant), or
   - a `code` query parameter (PKCE flow).
5. Tokens are parsed with a custom `parseOAuthUrl()` helper (avoids dependence on Supabase internals) and the session is set via `supabase.auth.setSession()` or `exchangeCodeForSession()`.
6. `onAuthStateChange` in `App.js` picks up the new session and navigates to the user tab stack.

### Administrators — Local Credentials

Admin login is intentionally **not** backed by Supabase to avoid granting admin-level DB permissions through the mobile client. Credentials are validated against a mock object in `src/lib/theme.js`:

```js
export const MOCK_ADMIN = { id: 'admin', password: 'admin123' };
```

On success, `App.js` sets `isAdmin = true`, which bypasses the Supabase session check and renders the admin tab stack. Logout clears only this local flag via `AppContext.handleAdminLogout()`.

> **Security note:** Replace the mock credentials with a proper server-side admin auth mechanism before deploying to production.

---

## Database Schema

The app interacts with the following Supabase tables:

### `parking_slots`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `zone` | text | e.g. `'A'` |
| `total` | integer | Total slot count in zone |
| `occupied` | integer | Currently occupied count |
| `is_active` | boolean | Whether zone is in service |

### `parking_sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `plate` | text | Vehicle number plate |
| `user_id` | uuid | FK → `users.id` (nullable for unregistered vehicles) |
| `status` | text | `'inside'` or `'exited'` |
| `entry_time` | timestamptz | |
| `exit_time` | timestamptz | Null while vehicle is inside |
| `duration_mins` | integer | Computed on exit |
| `is_registered` | boolean | Whether plate is in `vehicles` table |
| `camera_entry` | text | Camera ID or `'MANUAL_OVERRIDE'` |

### `vehicles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK → `users.id` |
| `plate_number` | text | Unique |
| `vehicle_type` | text | `'2-wheeler'`, `'4-wheeler'`, `'suv-van'` |
| `is_active` | boolean | |

### `bookings`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK |
| `vehicle_id` | uuid | FK |
| `slot_id` | uuid | FK |
| `plan` | text | `'daily'`, `'weekly'`, `'monthly'`, `'yearly'` |
| `scheduled_entry` | date | |
| `scheduled_exit` | date | |
| `amount` | integer | In INR |
| `status` | text | `'confirmed'`, etc. |

### `payments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `booking_id` | uuid | FK |
| `method` | text | `'upi'`, `'card'`, `'net-banking'` |
| `status` | text | `'success'`, etc. |
| `amount` | integer | |
| `transaction_id` | text | e.g. `'SP-123456'` |
| `paid_at` | timestamptz | |

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Matches Supabase Auth UID |
| `name` | text | Display name |
| `phone` | text | e.g. `'+919876543210'` |
| `role` | text | `'user'` or `'admin'` |

---

## Screens & Navigation

```
App.js
├── (unauthenticated)
│   ├── LandingScreen    — Google login + admin login toggle
│   └── SignupScreen     — Profile completion (name + phone)
│
├── UserTabs (Bottom Tab Navigator)
│   ├── Home             — Live occupancy + recent sessions
│   ├── Register         — 3-step vehicle + pass registration
│   ├── Sessions         — Parking history with filters
│   └── Profile          — Account info + sign-out
│
└── AdminTabs (Bottom Tab Navigator)
    ├── AdminHome        — Slot statistics dashboard
    ├── Vehicles         — All registered plates
    ├── ManualEntry      — Plate entry/exit override
    └── AdminProfile     — Settings + admin sign-out
```

Navigation state is driven purely by the `session` (Supabase auth) and `isAdmin` flags stored in `App.js` state and distributed via `AppContext`.

---

## Admin Access

Default demo credentials (change before going to production):

| Field | Value |
|---|---|
| Admin ID | `admin` |
| Password | `admin123` |

These are defined in `src/lib/theme.js` as `MOCK_ADMIN`.

---

## Theming & UI Components

All colour tokens live in `src/lib/theme.js`:

```js
COLORS.bg       // #0D1B2A  — deep navy background
COLORS.surface  // #132033  — card / surface
COLORS.border   // #1E3550  — subtle borders
COLORS.cyan     // #00D4FF  — primary highlight / CTA
COLORS.blue     // #3b82f6  — secondary actions
COLORS.accent   // #00e5a0  — positive / "inside" status
COLORS.warn     // #f59e0b  — warnings / member badge
COLORS.danger   // #ef4444  — errors / danger actions
COLORS.text     // #e2e8f0  — primary text
COLORS.muted    // #64748b  — secondary / placeholder text
```

`src/components/UI.js` exports the following reusable components:

| Component | Purpose |
|---|---|
| `<Card>` | Rounded surface container |
| `<Button>` | Primary / outline / danger / success variants with loading state |
| `<Input>` | Labelled text field with error display |
| `<Badge>` | Colour-coded status pill (`inside`, `exited`, `success`, `warning`, `danger`, `info`) |
| `<StatCard>` | Metric tile with label, value, and optional subtitle |
| `<SectionTitle>` | Page section header with optional subtitle |
| `<Divider>` | Horizontal rule with optional label |
| `<Row>` | Label/value row with optional cyan highlight for totals |

---

## Known Limitations & TODOs

- **Mock admin auth** — credentials are stored in plain JS. Implement a server-side admin auth endpoint for production.
- **Payment simulation** — the payment flow (UPI OTP, card, net banking) is entirely mocked. Integrate Razorpay or a similar gateway for real transactions.
- **No push notifications** — add `expo-notifications` to alert users when their session is about to expire or a spot opens up.
- **Offline support** — no caching layer; the app requires an active network connection.
- **Slot count sync** — `parking_slots.occupied` is currently updated by the Python ANPR service. A Supabase Realtime subscription in `HomeScreen` would give smoother live updates without polling.
- **iOS untested** — the app is configured for Android (`bundleIdentifier` and iOS settings are present, but the primary target is Android).
- **No deep-link handler** — `SignupScreen` is in the navigator but is never pushed to after Google sign-in. Wire up the `onAuthStateChange` event to detect first-time users (no row in `users` table) and navigate accordingly.

---

## License

This project is private. All rights reserved.
