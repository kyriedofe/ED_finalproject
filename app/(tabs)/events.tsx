import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getEvents, type SchoolEvent } from '@/lib/events';
import { formatDate, formatTime } from '@/lib/format';

function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  const isOpen = status === 'open';
  return (
    <View style={[styles.badge, isOpen ? styles.badgeOpen : styles.badgeClosed]}>
      <Text
        style={[
          styles.badgeText,
          isOpen ? styles.badgeTextOpen : styles.badgeTextClosed,
        ]}
      >
        {isOpen ? 'OPEN' : 'CLOSED'}
      </Text>
    </View>
  );
}

export default function EventsScreen() {
  const { role, user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'all' | 'mine'>('all');

  const canManage = role === 'teacher' || role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await getEvents(); // RLS decides what this role sees
    setEvents(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Teachers/admins can look at only the events they created.
  const visibleEvents =
    scope === 'mine' && user
      ? events.filter((event) => event.created_by === user.id)
      : events;

  const header = (
    <View style={styles.headerBox}>
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Events</Text>
        {canManage && (
          <AppButton
            theme="primary"
            title="Create"
            icon="add-outline"
            onPress={() => router.push('/event/form')}
          />
        )}
      </View>

      {canManage && (
        <View style={styles.scopeRow}>
          <Pressable
            style={[styles.scopeChip, scope === 'all' && styles.scopeChipActive]}
            onPress={() => setScope('all')}
          >
            <Text
              style={[styles.scopeText, scope === 'all' && styles.scopeTextActive]}
            >
              All events
            </Text>
          </Pressable>
          <Pressable
            style={[styles.scopeChip, scope === 'mine' && styles.scopeChipActive]}
            onPress={() => setScope('mine')}
          >
            <Text
              style={[styles.scopeText, scope === 'mine' && styles.scopeTextActive]}
            >
              My events
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading events...</Text>
      </View>
    );
  }

  if (visibleEvents.length === 0) {
    return (
      <View style={styles.centered}>
        {header}
        <EmptyState
          icon="calendar-outline"
          title={scope === 'mine' ? 'You have no events yet' : 'No events yet'}
          message={
            canManage
              ? 'Create your first event to generate a QR attendance code.'
              : 'Check back later - your school events will appear here.'
          }
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={visibleEvents}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({ pathname: '/event/[id]', params: { id: item.id } })
          }
        >
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <StatusBadge status={item.status} />
          </View>

          <Text style={styles.cardMeta}>
            {formatDate(item.event_date)}
            {item.start_time ? `  ·  ${formatTime(item.start_time)}` : ''}
            {item.end_time ? ` - ${formatTime(item.end_time)}` : ''}
          </Text>
          {item.venue ? (
            <Text style={styles.cardMeta}>Venue: {item.venue}</Text>
          ) : null}
          <Text style={styles.cardCode}>{item.event_code}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerBox: {
    marginBottom: 4,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scopeChip: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  scopeChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(0,255,102,0.12)',
  },
  scopeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  scopeTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    gap: 5,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cardCode: {
    fontSize: 12,
    color: COLORS.primaryDark,
    letterSpacing: 1,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeOpen: {
    backgroundColor: 'rgba(0,255,102,0.12)',
    borderColor: COLORS.primary,
  },
  badgeClosed: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  badgeTextOpen: {
    color: COLORS.primary,
  },
  badgeTextClosed: {
    color: COLORS.textSecondary,
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
