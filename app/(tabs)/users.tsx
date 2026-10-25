import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import EmptyState from '@/components/EmptyState';
import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getUsers, setUserActive, setUserRole, type AdminUser } from '@/lib/admin';
import type { Role } from '@/lib/profiles';
import { formatDate } from '@/lib/format';

const ROLES: Role[] = ['student', 'teacher', 'admin'];

function roleBadgeStyle(role: Role) {
  if (role === 'admin') return { bg: 'rgba(0,255,102,0.15)', border: COLORS.primary, color: COLORS.primary };
  if (role === 'teacher') return { bg: 'rgba(255,191,71,0.12)', border: COLORS.warning, color: COLORS.warning };
  return { bg: COLORS.surface, border: COLORS.border, color: COLORS.textSecondary };
}

export default function UsersScreen() {
  const { user, role, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadingUsers(true);
    const rows = await getUsers(); // RLS: administrators only
    setUsers(rows);
    setLoadingUsers(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((u) =>
      [u.email, u.full_name ?? '', u.student_id ?? '', u.role]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [users, search]);

  // EVENT: admin picks a new role for someone (with confirmation).
  const changeRole = (target: AdminUser, newRole: Role) => {
    if (target.role === newRole || busyId) return;
    Alert.alert(
      'Change role?',
      `${target.full_name ?? target.email} will become a ${newRole}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change Role',
          onPress: async () => {
            setBusyId(target.id);
            const error = await setUserRole(target.id, newRole);
            setBusyId(null);
            if (error) setBanner({ ok: false, text: error });
            else setBanner({ ok: true, text: 'Role updated.' });
            load();
          },
        },
      ]
    );
  };

  // EVENT: admin activates / deactivates an account (with confirmation).
  const toggleActive = (target: AdminUser) => {
    if (busyId) return;
    const deactivating = target.is_active;
    Alert.alert(
      deactivating ? 'Deactivate account?' : 'Activate account?',
      deactivating
        ? `${target.full_name ?? target.email} will not be able to sign in until reactivated.`
        : `${target.full_name ?? target.email} will be able to sign in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: deactivating ? 'Deactivate' : 'Activate',
          style: deactivating ? 'destructive' : 'default',
          onPress: async () => {
            setBusyId(target.id);
            const error = await setUserActive(target.id, !deactivating);
            setBusyId(null);
            if (error) setBanner({ ok: false, text: error });
            else
              setBanner({
                ok: true,
                text: deactivating ? 'Account deactivated.' : 'Account activated.',
              });
            load();
          },
        },
      ]
    );
  };

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // ROLE GUARD: administrators only.
  if (role !== 'admin') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Administrators only"
        message="User management is available to administrator accounts."
      />
    );
  }

  if (loadingUsers) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading users...</Text>
      </View>
    );
  }

  const header = (
    <View style={styles.headerBox}>
      <Text style={styles.screenTitle}>Users</Text>
      <Text style={styles.subtitle}>
        {users.length} account{users.length === 1 ? '' : 's'} · tap a card to manage
      </Text>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search name, email, or ID..."
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {banner && (
        <Text style={[styles.banner, banner.ok ? styles.bannerOk : styles.bannerErr]}>
          {banner.text}
        </Text>
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={filtered}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState icon="people-outline" title="No users found" message="Try a different search." />
      }
      renderItem={({ item }) => {
        const isSelf = item.id === user?.id;
        const badge = roleBadgeStyle(item.role);
        const busy = busyId === item.id;

        return (
          <Pressable
            style={styles.card}
            onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
          >
            <View style={styles.cardTop}>
              <View style={styles.nameBox}>
                <Text style={styles.cardTitle}>{item.full_name ?? 'No name'}</Text>
                <Text style={styles.cardEmail}>{item.email}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                <Text style={[styles.badgeText, { color: badge.color }]}>
                  {item.role.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              {item.student_id ? <Text style={styles.meta}>ID: {item.student_id}</Text> : null}
              <Text style={styles.meta}>Joined {formatDate(item.created_at)}</Text>
              <View
                style={[
                  styles.activeDot,
                  { backgroundColor: item.is_active ? COLORS.primary : COLORS.danger },
                ]}
              />
              <Text style={[styles.meta, { color: item.is_active ? COLORS.primary : COLORS.danger }]}>
                {item.is_active ? 'Active' : 'Deactivated'}
              </Text>
            </View>

            {expandedId === item.id && (
              <View style={styles.editor}>
                {isSelf ? (
                  <Text style={styles.selfNote}>
                    You cannot change your own role or account status here.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.editorLabel}>Role</Text>
                    <View style={styles.chipRow}>
                      {ROLES.map((value) => (
                        <Pressable
                          key={value}
                          style={[
                            styles.chip,
                            item.role === value && styles.chipActive,
                            busy && styles.chipDisabled,
                          ]}
                          disabled={busy}
                          onPress={() => changeRole(item, value)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              item.role === value && styles.chipTextActive,
                            ]}
                          >
                            {value}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <AppButton
                      theme={item.is_active ? 'danger' : 'primary'}
                      title={
                        busy
                          ? 'Working...'
                          : item.is_active
                            ? 'Deactivate Account'
                            : 'Activate Account'
                      }
                      icon={item.is_active ? 'ban-outline' : 'checkmark-circle-outline'}
                      onPress={() => toggleActive(item)}
                      disabled={busy}
                    />
                  </>
                )}
              </View>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBox: {
    gap: 10,
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  search: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  banner: {
    fontSize: 13,
    lineHeight: 18,
  },
  bannerOk: { color: COLORS.success },
  bannerErr: { color: COLORS.danger },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  nameBox: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  meta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  editor: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    gap: 10,
  },
  editorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(0,255,102,0.12)',
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  selfNote: {
    fontSize: 13,
    color: COLORS.warning,
    lineHeight: 19,
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
