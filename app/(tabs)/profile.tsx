import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { refreshAuthProfile, signOut, useAuth } from '@/lib/auth';
import { updateOwnProfile } from '@/lib/profiles';
import { formatDate } from '@/lib/format';

export default function ProfileScreen() {
  const { user, profile, role } = useAuth();

  const [draftName, setDraftName] = useState('');
  const [draftStudentId, setDraftStudentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  // Keep the editable fields in sync with the profile from useAuth.
  useEffect(() => {
    if (profile) {
      setDraftName(profile.full_name ?? '');
      setDraftStudentId(profile.student_id ?? '');
      setBanner(null);
    }
  }, [profile]);

  // Refresh from the server each time this tab is opened.
  useFocusEffect(
    useCallback(() => {
      void refreshAuthProfile();
    }, [])
  );

  if (!user) {
    return (
      <EmptyState
        icon="person-outline"
        title="Not signed in"
        message="Sign in again to view your profile."
      />
    );
  }

  const originalName = profile?.full_name ?? '';
  const originalStudentId = profile?.student_id ?? '';
  const isDirty = draftName !== originalName || draftStudentId !== originalStudentId;

  // EVENT: student/staff saves their own name + student ID.
  // Only these two fields may change - the database trigger
  // blocks role / email / is_id / is_active changes.
  const handleSave = async () => {
    if (saving || !isDirty) return;

    const name = draftName.trim();
    const studentId = draftStudentId.trim();

    if (name.length < 2) {
      setBanner({ ok: false, text: 'Please enter at least 2 characters for your name.' });
      return;
    }
    if (studentId && studentId.length < 3) {
      setBanner({ ok: false, text: 'Student ID looks too short.' });
      return;
    }

    setSaving(true);
    setBanner(null);
    const { error } = await updateOwnProfile(user.id, {
      full_name: name,
      student_id: studentId || null,
    });
    setSaving(false);

    if (error) {
      setBanner({ ok: false, text: error });
      return;
    }
    await refreshAuthProfile();
    setBanner({ ok: true, text: 'Profile updated.' });
  };

  // EVENT: sign out (with confirmation).
  const handleSignOut = () => {
    if (signingOut) return;
    Alert.alert('Sign out?', 'You will need to sign in again to use the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut(); // root layout redirects to /login
          setSigningOut(false);
        },
      },
    ]);
  };

  const roleColors: Record<string, { bg: string; fg: string }> = {
    admin: { bg: 'rgba(0,255,102,0.15)', fg: COLORS.primary },
    teacher: { bg: 'rgba(255,191,71,0.12)', fg: COLORS.warning },
    student: { bg: COLORS.surface, fg: COLORS.textSecondary },
  };
  const badge = roleColors[role ?? 'student'] ?? roleColors.student;
  const initial = (profile?.full_name ?? profile?.email ?? '?').trim().charAt(0).toUpperCase();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>My Profile</Text>

      {/* Avatar + role badge */}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial || '?'}</Text>
        </View>
        <View style={styles.identityInfo}>
          <Text style={styles.name}>{profile?.full_name || 'No name set'}</Text>
          <Text style={styles.email}>{profile?.email ?? user.email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.roleBadgeText, { color: badge.fg }]}>
              {(role ?? 'student').toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Deactivated accounts are warned before they try anything. */}
      {profile && !profile.is_active && (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            This account is deactivated. Contact an administrator to restore
            access.
          </Text>
        </View>
      )}

      {banner && (
        <Text style={[styles.banner, banner.ok ? styles.bannerOk : styles.bannerErr]}>
          {banner.text}
        </Text>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Enter your full name"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>Student ID (optional)</Text>
        <TextInput
          style={styles.input}
          value={draftStudentId}
          onChangeText={setDraftStudentId}
          placeholder="e.g. 2026-00123"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Email</Text>
        <Text style={styles.readonly}>{profile?.email ?? user.email}</Text>

        <Text style={styles.label}>Account Created</Text>
        <Text style={styles.readonly}>
          {profile?.created_at ? formatDate(profile.created_at) : '—'}
        </Text>
      </View>

      <AppButton
        theme="primary"
        title={saving ? 'Saving...' : 'Save Changes'}
        icon="save-outline"
        onPress={handleSave}
        disabled={saving || !isDirty}
      />

      <AppButton
        theme="danger"
        title={signingOut ? 'Signing out...' : 'Sign Out'}
        icon="log-out-outline"
        onPress={handleSignOut}
        disabled={signingOut}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textOnPrimary,
  },
  identityInfo: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  email: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 3,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  warnBox: {
    backgroundColor: 'rgba(255,77,77,0.10)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 10,
    padding: 12,
  },
  warnText: {
    fontSize: 13,
    color: COLORS.danger,
    lineHeight: 19,
  },
  banner: {
    fontSize: 13,
    lineHeight: 18,
  },
  bannerOk: { color: COLORS.success },
  bannerErr: { color: COLORS.danger },
  infoCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  readonly: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
});
