import { supabase } from './supabase';

export type Role = 'student' | 'teacher' | 'admin';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  student_id: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
};

// Reads the profile row that the database created at sign-up.
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, student_id, role, is_active, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Profile;
}

// Converts database errors into messages that are safe and clear.
// (We never show raw server details to the user.)
function friendlyProfileError(message: string): string {
  if (message.includes('You cannot change') || message.includes('Only administrators')) {
    return message; // our own trigger message, safe to show
  }
  if (message.includes('student_id')) {
    return 'That student ID is already used by another account.';
  }
  if (message.includes('Email cannot be changed')) {
    return 'Email cannot be changed.';
  }
  return 'Could not save your changes. Please try again.';
}

// Students may edit only full_name and student_id.
// The role / is_active / email columns are protected by the
// profiles_protect_changes database trigger, so even a modified
// copy of the app cannot escalate privileges.
export async function updateOwnProfile(
  userId: string,
  updates: { full_name?: string; student_id?: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) return { error: friendlyProfileError(error.message) };
  return { error: null };
}
