# Event-Driven Documentation

This project is an event-driven application: **something happens (an event),
a handler reacts, it calls an action, and that produces a result.** This
document lists the main events in the app and follows each one from the
screen the user touches down to the database and back.

The pattern used everywhere is:

```
EVENT (user does something)
   → HANDLER (a function in a screen or component)
      → ACTION (a function in lib/ that talks to Supabase)
         → RESULT (database response → what the user sees)
```

---

## 1. A new user signs up (always as a student)

- **Event:** The visitor fills the register form and taps **Create Account**
  (`app/register.tsx`).
- **Handler:** `handleRegister()` validates the input with
  `validateSignup()` from `lib/validation.ts`.
- **Action:** `signUp(email, password, fullName)` in `lib/auth.ts` calls
  `supabase.auth.signUp()`.
- **Result:** Supabase creates the login. A database trigger
  `handle_new_user()` creates a matching `profiles` row with
  `role = 'student'` - it **ignores any role the app might try to send**, so
  nobody can register as an admin. If email confirmation is on, the screen
  switches to a "check your email" view; otherwise the user is taken to the
  tabs.

---

## 2. A user signs in

- **Event:** The user taps **Sign In** (`app/login.tsx`).
- **Handler:** `handleLogin()` validates with `validateLogin()`, shows a
  loading state, and refuses to submit twice.
- **Action:** `signIn()` in `lib/auth.ts` calls `supabase.auth.signInWithPassword()`.
- **Result:** The session is saved on the device (AsyncStorage). The root
  layout `app/_layout.tsx` sees the new `session` and redirects from `login`
  to `/(tabs)`. `useAuth()` loads the role and the correct home dashboard is
  shown.

---

## 3. The app opens and restores the saved session

- **Event:** The app process starts (`app/_layout.tsx`).
- **Handler:** `useAuth()` in `lib/auth.ts` runs once and calls
  `supabase.auth.getSession()`.
- **Action:** The saved session is read from the device, then
  `refreshAuthProfile()` fetches the `profiles` row.
- **Result:** While loading, a green spinner is shown. After loading, the
  user lands on `/(tabs)` if a session exists, or on `/login` if it does not.
  A listener (`onAuthStateChange`) keeps everything in sync when the session
  changes.

---

## 4. A dashboard counts something (Home)

- **Event:** The user opens the **Home** tab (`app/(tabs)/index.tsx`).
- **Handler:** The screen reads `role` from `useAuth()` and renders
  `HomeStudent`, `HomeTeacher`, or `HomeAdmin`.
- **Action:** The dashboard calls `getEvents()`, `getMyAttendance()`, or
  `getAdminStats()` in the `lib/` files.
- **Result:** Stat cards show real numbers (events, attendance, users). Row
  Level Security silently limits each role to what it may see, so the same
  function returns different data per user.

---

## 5. A teacher creates an event

- **Event:** A teacher taps **Create** on the Events tab, fills the form, and
  taps **Create Event** (`app/event/form.tsx` → `components/EventForm.tsx`).
- **Handler:** `handleSubmit()` in `app/event/form.tsx` first checks the role
  (`teacher`/`admin`), then calls the action. `EventForm` already blocked bad
  input with `validateEvent()`.
- **Action:** `createEvent(input)` in `lib/events.ts` inserts into the
  `events` table.
- **Result:** The database policy allows the insert because the user is a
  teacher/admin. On success the app shows "Event saved" and returns to the
  list; a student who tried the same request would be rejected by the
  policy even with a modified app.

---

## 6. A teacher generates the attendance QR code

- **Event:** The owner or an admin opens the event and taps **Generate QR
  Code** (`app/event/[id].tsx`).
- **Handler:** `handleGenerateQr()` calls the action and stores the returned
  token in state.
- **Action:** `generateQrToken(eventId)` in `lib/qr.ts` calls the database
  function `generate_event_qr_token`.
- **Result:** The server checks the caller really owns the event (or is an
  admin), creates a random token, stores **only its SHA-256 hash** in
  `event_qr_tokens`, and returns the plain token **once**. The screen renders
  it with `react-native-qrcode-svg` using `buildQRPayload(token)` →
  `{"v":"2","token":"..."}`. Tapping **Rotate QR Code** creates a new token
  and immediately invalidates the old one.

---

## 7. A student scans a QR code to check in  (the core event)

- **Event:** A student points the camera at the QR code (`app/(tabs)/scan.tsx`).
- **Handler:** The camera event `onBarcodeScanned` fires `submitPayload()`.
  A lock (`lockRef`) makes sure the many camera callbacks produce **one**
  request. The phone first checks the text with `parseScannedText()`.
- **Action:** `submitAttendance(payload)` in `lib/attendance.ts` calls the
  database function `record_attendance(p_payload)`.
- **Result:** Inside the database the function checks, in order: the user is
  logged in, the user is an active **student**, the token exists and has not
  expired, the event is **open**, the current time is inside the event
  window, and the student has not already checked in. Only then does it
  insert the `attendance` row. The screen shows **"Attendance recorded"** or
  a clear reason (e.g. "You already checked in"). A student cannot fool the
  app: the phone only sends the token, and the database decides everything.

---

## 8. A student views their attendance history

- **Event:** The student opens the **History** tab (`app/(tabs)/history.tsx`).
- **Handler:** `useFocusEffect` reloads the list whenever the tab is shown.
- **Action:** `getMyAttendance(user.id)` in `lib/attendance.ts` reads the
  `attendance` table joined with `events`.
- **Result:** The screen shows stat cards (total, this month, present) and a
  list of check-ins. Row Level Security guarantees a student only ever
  receives **their own** rows.

---

## 9. A teacher monitors attendance and exports a CSV

- **Event:** A teacher opens the **Attendance** tab, searches/filters, and
  taps **Export CSV** (`app/(tabs)/attendance.tsx`).
- **Handler:** `handleExport()` builds a CSV from the currently filtered
  rows.
- **Action:** `getAttendanceRows()` in `lib/attendance.ts` loads records
  (RLS limits a teacher to **their own** events), then `buildCsv()` and
  `shareCsv()` in `lib/csv.ts` prepare and share the file.
- **Result:** The phone's share sheet opens so the teacher can send the file
  to a spreadsheet or email. The same screen has an **Events** view showing
  the number of attendees per event.

---

## 10. An administrator corrects an attendance record

- **Event:** An admin taps an attendance row and taps **Save Correction**
  (`app/(tabs)/attendance.tsx`).
- **Handler:** `handleCorrect()` requires a reason of at least 5 characters
  before doing anything.
- **Action:** `correctAttendance(id, newStatus, reason)` in
  `lib/attendance.ts` calls the database function `admin_correct_attendance`.
- **Result:** The server re-checks the admin role, updates the status, stores
  the reason, and writes an `audit_logs` row. The screen confirms
  "Attendance corrected and logged" and refreshes the list.

---

## 11. An administrator changes a user's role

- **Event:** An admin opens **Users**, taps a user, chooses a new role, and
  confirms (`app/(tabs)/users.tsx`).
- **Handler:** `changeRole()` shows a confirmation dialog (and blocks the
  admin from changing their own role).
- **Action:** `setUserRole(userId, role)` in `lib/admin.ts` calls the
  database function `admin_set_user_role`.
- **Result:** The server verifies the caller is an admin and cannot demote
  themselves accidentally, writes the change, and writes an `audit_logs`
  row. The list refreshes with the new role badge.

---

## 12. An administrator activates / deactivates an account

- **Event:** An admin taps **Deactivate Account** (or **Activate**) on a user
  (`app/(tabs)/users.tsx`).
- **Handler:** `toggleActive()` warns that a deactivated user cannot sign in,
  then proceeds on confirmation.
- **Action:** `setUserActive(userId, active)` in `lib/admin.ts` calls the
  database function `admin_set_user_active`.
- **Result:** The account's `is_active` flag flips. The helper functions
  `is_active_user()` used by the policies then block that account from
  recording attendance or reading events, and the action is written to
  `audit_logs`.

---

## 13. An administrator views reports

- **Event:** An admin opens the **Reports** tab (`app/(tabs)/reports.tsx`).
- **Handler:** The screen loads everything at once with `Promise.all`.
- **Action:** `getAdminStats()`, `getEventTotals()` and
  `getRecentAuditLogs()` in `lib/admin.ts` / `lib/attendance.ts` run counting
  and list queries.
- **Result:** The screen shows an overview grid, attendance-per-event numbers,
  and the most recent administrative actions. **Export CSV** shares the same
  data as a file.

---

## 14. A user edits their own profile

- **Event:** The user edits their name / student ID and taps **Save Changes**
  (`app/(tabs)/profile.tsx`).
- **Handler:** `handleSave()` validates the fields locally and only enables
  the button when something changed.
- **Action:** `updateOwnProfile(userId, {...})` in `lib/profiles.ts` updates
  the `profiles` row, then `refreshAuthProfile()` reloads it.
- **Result:** The profile updates. A database trigger
  `protect_profile_changes()` **rejects any attempt to change `role`,
  `is_active`, `email` or `id`** from the app, so editing a profile can never
  be used to gain more rights.

---

## 15. A user signs out

- **Event:** The user taps **Sign Out** and confirms (`app/(tabs)/profile.tsx`).
- **Handler:** `handleSignOut()` asks for confirmation first.
- **Action:** `signOut()` in `lib/auth.ts` calls `supabase.auth.signOut()`
  and clears the saved session.
- **Result:** The `onAuthStateChange` listener clears the session and the
  root layout `app/_layout.tsx` redirects to `/login`.

---

### Why these events matter

Every important event ends in **one small, trusted place** making the
decision:

| Event | Where the real decision is made |
| --- | --- |
| Sign up | DB trigger `handle_new_user()` (forces role = student) |
| Check in | DB function `record_attendance()` |
| Generate / rotate QR | DB function `generate_event_qr_token()` |
| Correct attendance | DB function `admin_correct_attendance()` |
| Change role | DB function `admin_set_user_role()` |
| Activate / deactivate | DB function `admin_set_user_active()` |
| Edit profile | DB trigger `protect_profile_changes()` |

This is what makes the system event-driven **and** secure: the phone emits
events, but the database is the only thing allowed to decide what they mean.
