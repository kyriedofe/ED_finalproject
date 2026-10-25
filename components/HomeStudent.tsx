import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import AppButton from './AppButton';
import StatCard from './StatCard';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getAttendanceCount } from '@/lib/attendance';

// STUDENT DASHBOARD: greeting, my statistics, quick actions.
export default function HomeStudent() {
  const { profile } = useAuth();
  const router = useRouter();
  const [attendanceCount, setAttendanceCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAttendanceCount().then((count) => {
        if (active) setAttendanceCount(count);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.hello}>Welcome back,</Text>
      <Text style={styles.name}>{profile?.full_name ?? 'Student'}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>STUDENT</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard value={attendanceCount} label="Events attended" icon="checkmark-done-outline" />
        <StatCard value={profile?.student_id ?? '—'} label="Student ID" icon="card-outline" />
      </View>

      <Text style={styles.section}>Quick actions</Text>
      <View style={styles.actions}>
        <AppButton
          theme="primary"
          title="Scan QR Code"
          icon="qr-code-outline"
          onPress={() => router.push('/scan')}
        />
        <AppButton title="Browse Events" icon="calendar-outline" onPress={() => router.push('/events')} />
        <AppButton title="My Attendance History" icon="time-outline" onPress={() => router.push('/history')} />
      </View>

      {!profile?.is_active && (
        <Text style={styles.warning}>
          Your account is deactivated. You can view data, but attendance and
          event actions are disabled. Please contact the administrator.
        </Text>
      )}
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
    gap: 6,
  },
  hello: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
    marginBottom: 14,
  },
  badgeText: {
    color: COLORS.textOnPrimary,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 14,
    marginBottom: 8,
  },
  actions: {
    gap: 10,
  },
  warning: {
    marginTop: 18,
    fontSize: 13,
    color: COLORS.warning,
    lineHeight: 19,
  },
});
