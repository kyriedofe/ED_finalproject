# QR Attendance System (QR-ATT)

A mobile attendance app for school events. Teachers create an event and show
a QR code; students scan it with their phone and their attendance is recorded
in the cloud database. Administrators manage users and view reports.

Built with **Expo (React Native) + TypeScript** and **Supabase**
(Authentication + PostgreSQL). The visual theme is black and green.

---

## Features by role

| Role | What they can do |
| --- | --- |
| **Student** | Create an account, browse events, **scan a QR code to check in**, see personal attendance history |
| **Teacher** | Everything a student can see, plus **create / edit / close/delete events**, **generate the attendance QR code**, and **monitor attendance** for their own events (with CSV export) |
| **Administrator** | Everything a teacher can do, plus **manage users** (change role, activate/deactivate) and view **reports** with an activity log |

A new account is always created as a **student**. A teacher or administrator
is promoted afterwards (see "Create the first administrator" below).

---

## How it works (short version)

1. A teacher creates an event. A **QR code** is generated for it.
2. The QR code holds only a random **token**. The database stores only the
   token's **hash**, never the token itself.
3. A student scans the code. The phone sends the token to a secure database
   function, which checks everything (login, role, event open, time window,
   no duplicate) and saves the attendance row.
4. The screen shows "Attendance recorded" **only after the database confirms
   the save** - the phone never decides on its own.

No attendance value is ever trusted from the phone. Role changes and
corrections also go through secure database functions. See
`EVENT_DRIVEN_DOCUMENTATION.md` for the full event-by-event breakdown.

---

## Project structure

```
app/                  Screens (Expo Router)
  _layout.tsx         Root stack + login protection
  login.tsx           Sign in
  register.tsx        Sign up (always creates a student)
  (tabs)/             Main bottom-tab area
    _layout.tsx       Tabs shown/hidden by role
    index.tsx         Home dashboard (per role)
    events.tsx        Event list
    scan.tsx          Student QR scanner
    history.tsx       Student attendance history
    attendance.tsx    Teacher/Admin attendance + corrections
    users.tsx         Admin user management
    reports.tsx       Admin reports + activity log
    profile.tsx       Profile / edit name & student ID / sign out
  event/
    [id].tsx          Event details + QR display + management
    form.tsx          Create / edit an event
components/           Reusable UI (buttons, cards, forms, dashboards)
constants/colors.ts   The black & green colour palette
lib/                  Database & helper logic
  supabase.ts         Supabase client (stores the session on the device)
  auth.ts             Sign in / sign up / sign out / current user
  profiles.ts         Read & update the profile
  events.ts           Event CRUD
  qr.ts               Build / read QR payloads, request a token
  attendance.ts       Send a scan, read records, admin corrections
  admin.ts            User management + stats + activity log
  csv.ts              Build & share CSV exports
  validation.ts       Form input checks
  format.ts           Date/time display helpers
schema.sql            The complete database setup (paste into Supabase)
.env.example          Template for your Supabase keys
```

---

## Setup

### 1. Install the app

```bash
npm install
```

### 2. Create a Supabase project

1. Go to https://supabase.com and create a free project.
2. In the project, open **SQL Editor**, paste the entire contents of
   `schema.sql`, and press **Run**. This creates all tables, security rules,
   and database functions. (It is safe to run again later - it only makes
   missing pieces.)

### 3. Connect the app to your project

1. In Supabase open **Project Settings → API**.
2. Copy the **Project URL** and the **anon public key**.
3. Create a file named `.env` (copy `.env.example`) and fill it in:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> `.env` must never be committed to git. `.env.example` is the safe template.

### 4. Run the app

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app, or press `a` / `i` for an
emulator. The camera screen needs a real device (or a camera-enabled
emulator).

---

## Create the first administrator

New accounts are always **students**. To get a teacher or administrator:

1. Register a normal account in the app.
2. In Supabase **SQL Editor**, run:

```sql
-- Make this account an administrator
update public.profiles
set role = 'admin'
where email = 'you@example.com';

-- ...or a teacher
update public.profiles
set role = 'teacher'
where email = 'teacher@example.com';
```

3. Return to the app (or reopen it). The profile refreshes
   automatically when the app comes to the foreground - the new
   role applies immediately, no sign-out needed.

After that, administrators can promote other users from inside the app
(**Users** tab) - no SQL needed.

---

## Trying the full flow

1. Sign in as a teacher → **Events** → **Create** an event for today.
2. Open the event → **Generate QR Code**.
3. On another device, sign in as a student → **Scan** → point it at the QR.
4. "Attendance recorded" appears, and the teacher sees the student under the
   **Attendance** tab. Try scanning twice - the second scan is refused
   (duplicate), which proves the database is the source of truth.

---

## Security notes

- The phone is treated as **untrusted**. Every important decision (role,
  attendance, corrections) is made inside secure database functions.
- Public sign-up can only create **students**; the database ignores any
  role the app might try to send.
- Attendance rows can only be written by the `record_attendance()` function,
  never directly by the app.
- QR tokens are random, stored only as hashes, can be rotated, and expire.
- Every privileged action (role change, account status, correction) is
  written to `audit_logs`.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Unable to connect" on every screen | `.env` is missing or wrong. Check the URL and anon key, then restart `npx expo start`. |
| Camera never opens | Grant camera permission; use a real device or a camera emulator. |
| "This is not an attendance QR code" | You scanned a different QR code. Use the code shown on the event screen. |
| A user still looks like a student after promotion | Bring the app to the foreground (switch back to it) - the profile reloads automatically. If it still shows the old role, sign out and back in. |
| Creating an event says "Please fill in the required fields" even though everything is filled | The `events` table is missing the `event_code` default (old schema). Re-run `schema.sql` in the SQL Editor. The app now also generates the code itself, so updating the app alone fixes it. |

---

## Scripts

```bash
npx expo start     # run the app
npm run lint       # check code style
npx tsc --noEmit   # check TypeScript types
```
