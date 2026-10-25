import { supabase } from './supabase';
import { parseScannedText } from './qr';
import { getEvents } from './events';

export type AttendanceResult = {
  ok: boolean;
  message: string;
  eventTitle?: string;
};

// ------------------------------------------------------------------
// SEND A SCANNED QR CODE TO THE DATABASE.
//
// The phone only sends the small payload text. Everything is
// checked inside record_attendance() (login, role, token, event
// status, time window, duplicates) - and we show "success" ONLY
// when the database confirms that the row was saved.
// ------------------------------------------------------------------
export async function submitAttendance(rawScannedText: string): Promise<AttendanceResult> {
  // 1) Quick format check on the phone (fast feedback, no request).
  const parsed = parseScannedText(rawScannedText);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  // 2) Ask the trusted backend to validate + save.
  try {
    const { data, error } = await supabase.rpc('record_attendance', {
      p_payload: parsed.payload,
    });

    if (error) {
      return { ok: false, message: 'Unable to connect. Please try again.' };
    }

    const result = data as { ok: boolean; message: string; event_title?: string };
    return { ok: result.ok, message: result.message, eventTitle: result.event_title };
  } catch {
    return { ok: false, message: 'Unable to connect. Please try again.' };
  }
}

// How many attendance rows THIS user is allowed to see
// (students: their own, teachers: their events, admin: all).
// Uses a count-only query, so no rows are transferred.
export async function getAttendanceCount(): Promise<number> {
  const { count, error } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true });

  if (error) return 0;
  return count ?? 0;
}

// How many students attended one specific event.
export async function getAttendeeCount(eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (error) return 0;
  return count ?? 0;
}

// ------------------------------------------------------------------
// STUDENT: my own attendance history (RLS shows only my rows).
// ------------------------------------------------------------------
export type HistoryItem = {
  id: string;
  eventTitle: string;
  eventCode: string;
  eventDate: string | null;
  attendedAt: string;
  status: string;
};

export async function getMyAttendance(studentId: string): Promise<HistoryItem[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, attended_at, attendance_status, events ( event_code, title, event_date )')
    .eq('student_id', studentId)
    .order('attended_at', { ascending: false });

  if (error || !data) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    eventTitle: row.events?.title ?? 'Unknown event',
    eventCode: row.events?.event_code ?? '',
    eventDate: row.events?.event_date ?? null,
    attendedAt: row.attended_at,
    status: row.attendance_status,
  }));
}

// ------------------------------------------------------------------
// TEACHER / ADMIN: attendance monitoring list.
// RLS already limits the rows: a teacher only receives attendance
// of their own events, an administrator receives everything.
// ------------------------------------------------------------------
export type AttendanceRow = {
  id: string;
  studentId: string;
  studentName: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  attendedAt: string;
  status: string;
  correctionReason: string | null;
};

export async function getAttendanceRows(): Promise<AttendanceRow[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(
      'id, student_id, event_id, attended_at, attendance_status, correction_reason, events ( id, title, event_date )'
    )
    .order('attended_at', { ascending: false });

  if (error || !data) return [];
  const rows = data as any[];
  if (rows.length === 0) return [];

  // attendance has no direct foreign key to profiles, so we read
  // the names in a second step (RLS limits which names we get).
  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, student_id, email')
    .in('id', studentIds);

  const nameById: Record<string, string> = {};
  ((profiles as any[]) ?? []).forEach((p) => {
    nameById[p.id] =
      p.full_name ?? p.student_id ?? (p.email ? p.email.split('@')[0] : 'Student');
  });

  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: nameById[row.student_id] ?? 'Student',
    eventId: row.event_id,
    eventTitle: row.events?.title ?? 'Unknown event',
    eventDate: row.events?.event_date ?? '',
    attendedAt: row.attended_at,
    status: row.attendance_status,
    correctionReason: row.correction_reason ?? null,
  }));
}

// ------------------------------------------------------------------
// Total number of attendees per event (used by reports + summaries).
// ------------------------------------------------------------------
export type EventTotal = {
  eventId: string;
  title: string;
  eventCode: string;
  eventDate: string;
  status: string;
  attendeeCount: number;
};

export async function getEventTotals(): Promise<EventTotal[]> {
  const events = await getEvents();

  const { data, error } = await supabase.from('attendance').select('event_id');
  if (error || !data) {
    return events.map((e) => ({
      eventId: e.id,
      title: e.title,
      eventCode: e.event_code,
      eventDate: e.event_date,
      status: e.status,
      attendeeCount: 0,
    }));
  }

  const counts: Record<string, number> = {};
  (data as any[]).forEach((row) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  });

  return events.map((e) => ({
    eventId: e.id,
    title: e.title,
    eventCode: e.event_code,
    eventDate: e.event_date,
    status: e.status,
    attendeeCount: counts[e.id] ?? 0,
  }));
}

// ------------------------------------------------------------------
// ADMIN: correct a record. A reason is mandatory - the server
// function rejects empty reasons and writes an audit log row.
// Returns null on success, or the error message.
// ------------------------------------------------------------------
export async function correctAttendance(
  attendanceId: string,
  newStatus: 'present' | 'absent' | 'excused',
  reason: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('admin_correct_attendance', {
      p_attendance_id: attendanceId,
      p_new_status: newStatus,
      p_reason: reason,
    });

    if (error) return 'Unable to save the correction. Please try again.';

    const result = data as { ok: boolean; message: string };
    return result.ok ? null : result.message;
  } catch {
    return 'Unable to connect. Please try again.';
  }
}
