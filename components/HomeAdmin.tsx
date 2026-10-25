import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import AppButton from './AppButton';
import StatCard from './StatCard';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getAdminStats, type AdminStats } from '@/lib/admin';

// ADMINISTRATOR DASHBOARD OVERVIEW: totals for the whole system.
export default function HomeAdmin() {
  const { profile } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAdminStats().then((result) => {
        if (active) setStats(result);
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
      <Text style={styles.hello}>Administrator dashboard</Text>
      <Text style={styles.name}>{profile?.full_name ?? 'Administrator'}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>ADMIN</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard value={stats?.totalUsers ?? '…'} label="Total users" icon="people-outline" />
        <StatCard value={stats?.students ?? '…'} label="Students" icon="school-outline" />
      </View>
      <View style={styles.statsRow}>
        <StatCard value={stats?.teachers ?? '…'} label="Teachers" icon="briefcase-outline" />
        <StatCard value={stats?.totalAttendance ?? '…'} label="Attendance records" icon="checkmark-done-outline" />
      </View>
      <View style={styles.statsRow}>
        <StatCard value={stats?.totalEvents ?? '…'} label="Total events" icon="calendar-outline" />
        <StatCard value={stats?.openEvents ?? '…'} label="Open events" icon="lock-open-outline" />
      </View>
      <View style={styles.statsRow}>
        <StatCard value={stats?.closedEvents ?? '…'} label="Closed events" icon="lock-closed-outline" />
      </View>

      <Text style={styles.section}>Administration</Text>
      <View style={styles.actions}>
        <AppButton
          theme="primary"
          title="Manage Users & Roles"
          icon="people-circle-outline"
          onPress={() => router.push('/users')}
        />
        <AppButton title="Attendance Management" icon="clipboard-outline" onPress={() => router.push('/attendance')} />
        <AppButton title="Reports" icon="bar-chart-outline" onPress={() => router.push('/reports')} />
        <AppButton title="Create Event" icon="add-circle-outline" onPress={() => router.push('/event/form')} />
      </View>
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
    paddingBottom: 40,
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
    marginBottom: 12,
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
});
