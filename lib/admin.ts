import { supabase } from './supabase';
import type { Role } from './profiles';

// ------------------------------------------------------------------
// ADMINISTRATOR helpers. All privileged changes go through server
// functions (admin_set_user_role, admin_set_user_active) which
// check the admin role again inside the database and write an
// audit_logs row.
// ------------------------------------------------------------------

export type AdminStats = {
  totalUsers: number;
  students: number;
  teachers: number;
  totalEvents: number;
  totalAttendance: number;
  openEvents: number;
  closedEvents: number;
};

// Simple counting query (head = count only, no rows transferred).
async function countRows(
  table: 'profiles' | 'events' | 'attendance',
  filter?: { column: string; value: string }
): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = query.eq(filter.column, filter.value);

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

export async function getAdminStats(): Promise<AdminStats | null> {
  try {
    const [totalUsers, students, teachers, totalEvents, totalAttendance, openEvents, closedEvents] =
      await Promise.all([
        countRows('profiles'),
        countRows('profiles', { column: 'role', value: 'student' }),
        countRows('profiles', { column: 'role', value: 'teacher' }),
        countRows('events'),
        countRows('attendance'),
        countRows('events', { column: 'status', value: 'open' }),
        countRows('events', { column: 'status', value: 'closed' }),
      ]);

    return {
      totalUsers,
      students,
      teachers,
      totalEvents,
      totalAttendance,
      openEvents,
      closedEvents,
    };
  } catch {
    return null;
  }
}

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  student_id: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
};

export async function getUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, student_id, role, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as AdminUser[];
}

// Change someone's role (student / teacher / admin).
// Returns null on success or a message on failure.
export async function setUserRole(userId: string, role: Role): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('admin_set_user_role', {
      p_user_id: userId,
      p_new_role: role,
    });
    if (error) return 'Unable to change the role. Please try again.';

    const result = data as { ok: boolean; message: string };
    return result.ok ? null : result.message;
  } catch {
    return 'Unable to connect. Please try again.';
  }
}

// Activate / deactivate an account.
export async function setUserActive(
  userId: string,
  active: boolean
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('admin_set_user_active', {
      p_user_id: userId,
      p_active: active,
    });
    if (error) return 'Unable to change the account status. Please try again.';

    const result = data as { ok: boolean; message: string };
    return result.ok ? null : result.message;
  } catch {
    return 'Unable to connect. Please try again.';
  }
}

// Recent administrative actions (audit log), shown on the Reports screen.
export type AuditItem = {
  id: string;
  action: string;
  actorName: string;
  detailsText: string;
  createdAt: string;
};

export async function getRecentAuditLogs(): Promise<AuditItem[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, details, created_at, actor_id')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data) return [];
  const rows = data as any[];

  const actorIds = rows.map((r) => r.actor_id).filter(Boolean);
  const { data: profiles } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] };

  const nameById: Record<string, string> = {};
  ((profiles as any[]) ?? []).forEach((p) => {
    nameById[p.id] = p.full_name ?? (p.email ? p.email.split('@')[0] : 'User');
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: nameById[row.actor_id] ?? 'System',
    detailsText: row.details ? JSON.stringify(row.details) : '',
    createdAt: row.created_at,
  }));
}
