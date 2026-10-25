import { supabase } from './supabase';

// One row of the public.events table.
export type SchoolEvent = {
  id: string;
  event_code: string;
  title: string;
  description: string | null;
  event_date: string; // 'YYYY-MM-DD'
  start_time: string | null; // 'HH:MM'
  end_time: string | null; // 'HH:MM'
  venue: string | null;
  status: 'open' | 'closed';
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// What the create/edit form sends to Supabase.
export type EventInput = {
  title: string;
  description: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string;
};

const EVENT_COLUMNS =
  'id, event_code, title, description, event_date, start_time, end_time, venue, status, created_by, created_at, updated_at';

// Turns database errors into short, safe messages.
function friendlyEventError(message: string): string {
  if (message.includes('row-level security') || message.includes('permission')) {
    return 'You are not allowed to do that.';
  }
  if (message.includes('duplicate') || message.includes('unique')) {
    return 'That event code is already in use. Please try again.';
  }
  if (message.includes('not-null') || message.includes('null value')) {
    // Name the column that actually failed instead of blaming
    // fields the user already filled in.
    const match = /column "([^"]+)"/.exec(message);
    const column = match?.[1];
    if (column === 'event_code') {
      return 'Could not generate the event code. Please re-run schema.sql in Supabase.';
    }
    if (column) return `The "${column}" field is required.`;
    return 'Please fill in the required fields (title and date).';
  }
  return 'Could not save the event. Please try again.';
}

// Same format the database default uses: EVT- + 8 uppercase hex
// characters. Generated here so event creation also works on
// databases whose schema.sql predates the event_code default.
function generateEventCode(): string {
  const hex = '0123456789ABCDEF';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += hex[Math.floor(Math.random() * 16)];
  }
  return `EVT-${code}`;
}

// Every signed-in user may read events (Row Level Security decides
// what each role may change). Sorted by date, soonest first.
export async function getEvents(): Promise<SchoolEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .order('event_date', { ascending: true })
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as SchoolEvent[];
}

// Only the events created by this teacher.
export async function getMyEvents(teacherId: string): Promise<SchoolEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('created_by', teacherId)
    .order('event_date', { ascending: true });

  if (error || !data) return [];
  return data as SchoolEvent[];
}

export async function getEventById(id: string): Promise<SchoolEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as SchoolEvent;
}

// CREATE - only teachers/admins pass the database policy.
export async function createEvent(
  input: EventInput
): Promise<{ id: string | null; error: string | null }> {
  // Retry a couple of times: event_code is unique, so an extremely
  // rare random collision just regenerates a fresh code.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        event_code: generateEventCode(),
        title: input.title.trim(),
        description: input.description.trim() || null,
        event_date: input.event_date,
        start_time: input.start_time || null,
        end_time: input.end_time || null,
        venue: input.venue.trim() || null,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .select('id')
      .single();

    if (!error) return { id: data.id, error: null };

    const message = error.message;
    const isCodeCollision = message.includes('duplicate') || message.includes('unique');
    if (attempt < 2 && isCodeCollision) continue;
    return { id: null, error: friendlyEventError(message) };
  }
  return { id: null, error: 'Could not save the event. Please try again.' };
}

// EDIT - the RLS policy only lets the owner or an admin update.
export async function updateEvent(
  id: string,
  input: EventInput
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('events')
    .update({
      title: input.title.trim(),
      description: input.description.trim() || null,
      event_date: input.event_date,
      start_time: input.start_time || null,
      end_time: input.end_time || null,
      venue: input.venue.trim() || null,
    })
    .eq('id', id);

  if (error) return { error: friendlyEventError(error.message) };
  return { error: null };
}

// CLOSE - after this, record_attendance() rejects every scan.
export async function closeEvent(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('events')
    .update({ status: 'closed' })
    .eq('id', id);

  if (error) return { error: friendlyEventError(error.message) };
  return { error: null };
}

// DELETE (archive) - owner or admin only; attendance rows cascade.
export async function deleteEvent(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('events').delete().eq('id', id);

  if (error) return { error: friendlyEventError(error.message) };
  return { error: null };
}
