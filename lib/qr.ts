import { supabase } from './supabase';

// ------------------------------------------------------------------
// QR payload format: {"v":"2","token":"<32 random characters>"}
// The payload contains ONLY the token - no user id, no role,
// no password, no database keys. The backend trusts none of it
// anyway: it reads the real user from the login session.
// ------------------------------------------------------------------

export function buildQRPayload(token: string): string {
  return JSON.stringify({ v: '2', token });
}

export type ParseQRResult =
  | { ok: true; payload: string }
  | { ok: false; message: string };

// Checks the scanned/typed text BEFORE it is sent to the backend.
export function parseScannedText(raw: string): ParseQRResult {
  const text = raw.trim();
  if (!text) {
    return { ok: false, message: 'Invalid QR code.' };
  }

  // 1) A normal QR code from this app is JSON with a token.
  try {
    const json = JSON.parse(text);
    if (
      json &&
      json.v === '2' &&
      typeof json.token === 'string' &&
      json.token.length >= 16
    ) {
      return { ok: true, payload: JSON.stringify({ v: '2', token: json.token }) };
    }
    return { ok: false, message: 'This is not an attendance QR code.' };
  } catch {
    // Not JSON -> continue below (manual token entry).
  }

  // 2) Manual entry: only a plain token (letters/digits, 16+ chars).
  if (/^[A-Za-z0-9_-]{16,}$/.test(text)) {
    return { ok: true, payload: JSON.stringify({ v: '2', token: text }) };
  }

  return { ok: false, message: 'Invalid QR code.' };
}

// Ask the database to create (or rotate) the QR token for an event.
// Only the owner of the event or an administrator may do this - the
// server function checks that itself. The plain token comes back
// exactly once; only its hash is stored.
export async function generateQrToken(
  eventId: string
): Promise<{ token: string | null; expiresAt: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('generate_event_qr_token', {
      p_event_id: eventId,
    });

    if (error) {
      return { token: null, expiresAt: null, error: 'Unable to generate a QR code. Please try again.' };
    }

    const result = data as {
      ok: boolean;
      token?: string;
      expires_at?: string;
      message?: string;
    };

    if (!result.ok) {
      return {
        token: null,
        expiresAt: null,
        error: result.message ?? 'Unable to generate a QR code.',
      };
    }

    return { token: result.token ?? null, expiresAt: result.expires_at ?? null, error: null };
  } catch {
    return { token: null, expiresAt: null, error: 'Unable to connect. Please try again.' };
  }
}
