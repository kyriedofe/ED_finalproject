import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import EmptyState from '@/components/EmptyState';
import StatCard from '@/components/StatCard';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getMyAttendance, type HistoryItem } from '@/lib/attendance';
import { formatDate, formatDateTime } from '@/lib/format';

export default function HistoryScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await getMyAttendance(user.id);
    setRows(data);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const stats = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    let thisMonth = 0;
    for (const row of rows) {
      const date = new Date(row.attendedAt);
      if (date.getMonth() === month && date.getFullYear() === year) thisMonth++;
    }

    const present = rows.filter((row) => row.status === 'present').length;
    return { total: rows.length, thisMonth, present };
  }, [rows]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading history...</Text>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon="time-outline"
          title="No attendance yet"
          message="Scan a QR code at an event and your attendance records will appear here."
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.statsRow}>
          <StatCard label="Total Events" value={stats.total} icon="calendar-outline" />
          <StatCard label="This Month" value={stats.thisMonth} icon="calendar-number-outline" />
          <StatCard label="Present" value={stats.present} icon="checkmark-circle-outline" />
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{item.eventTitle}</Text>
            <View
              style={[
                styles.badge,
                item.status === 'present' ? styles.badgePresent : styles.badgeOther,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  item.status === 'present' ? styles.badgeTextPresent : styles.badgeTextOther,
                ]}
              >
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.cardMeta}>
            Event date: {formatDate(item.eventDate)}
          </Text>
          <Text style={styles.cardMeta}>
            Checked in: {formatDateTime(item.attendedAt)}
          </Text>
        </View>
      )}
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
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
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
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgePresent: {
    backgroundColor: 'rgba(0,255,102,0.12)',
    borderColor: COLORS.primary,
  },
  badgeOther: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  badgeTextPresent: { color: COLORS.primary },
  badgeTextOther: { color: COLORS.warning },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
});
