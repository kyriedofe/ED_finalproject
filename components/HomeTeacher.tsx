import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import AppButton from './AppButton';
import StatCard from './StatCard';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getMyEvents, type SchoolEvent } from '@/lib/events';
import { getAttendanceCount } from '@/lib/attendance';

// TEACHER DASHBOARD: my event statistics + management actions.
export default function HomeTeacher() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const [myEvents, setMyEvents] = useState<SchoolEvent[]>([]);
  const [checkIns, setCheckIns] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) return;

      Promise.all([getMyEvents(user.id), getAttendanceCount()]).then(
        ([events, count]) => {
          if (!active) return;
          setMyEvents(events);
          setCheckIns(count);
        }
      );
      return () => {
        active = false;
      };
    }, [user])
  );

  const openEvents = myEvents.filter((event) => event.status === 'open').length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.hello}>Teacher dashboard</Text>
      <Text style={styles.name}>{profile?.full_name ?? 'Teacher'}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {(profile?.role ?? 'teacher').toUpperCase()}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard value={myEvents.length} label="My events" icon="calendar-outline" />
        <StatCard value={openEvents} label="Open events" icon="lock-open-outline" />
      </View>
      <View style={styles.statsRow}>
        <StatCard value={checkIns} label="Total check-ins" icon="people-outline" />
        <StatCard value={myEvents.length - openEvents} label="Closed events" icon="lock-closed-outline" />
      </View>

      <Text style={styles.section}>Manage</Text>
      <View style={styles.actions}>
        <AppButton
          theme="primary"
          title="Create Event"
          icon="add-circle-outline"
          onPress={() => router.push('/event/form')}
        />
        <AppButton title="My Events & QR Codes" icon="qr-code-outline" onPress={() => router.push('/events')} />
        <AppButton title="Attendance Monitoring" icon="list-outline" onPress={() => router.push('/attendance')} />
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
    backgroundColor: COLORS.primaryDark,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
    marginBottom: 14,
  },
  badgeText: {
    color: '#FFFFFF',
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
