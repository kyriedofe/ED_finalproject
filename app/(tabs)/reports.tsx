import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import StatCard from '@/components/StatCard';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getAdminStats, getRecentAuditLogs, type AdminStats, type AuditItem } from '@/lib/admin';
import { getEventTotals, type EventTotal } from '@/lib/attendance';
import { buildCsv, shareCsv } from '@/lib/csv';
import { formatDate, formatDateTime } from '@/lib/format';

export default function ReportsScreen() {
  const { role, loading: authLoading } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [totals, setTotals] = useState<EventTotal[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [statsResult, totalsResult, auditResult] = await Promise.all([
      getAdminStats(),
      getEventTotals(),
      getRecentAuditLogs(),
    ]);
    setStats(statsResult);
    setTotals(totalsResult);
    setAudit(auditResult);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // EVENT: admin exports all event totals as a CSV file.
  const handleExport = async () => {
    const csv = buildCsv(
      ['Event', 'Code', 'Date', 'Status', 'Attendees'],
      totals.map((row) => [
        row.title,
        row.eventCode,
        formatDate(row.eventDate),
        row.status,
        row.attendeeCount,
      ])
    );
    const error = await shareCsv(csv, 'Event Attendance Report');
    setBanner(
      error
        ? { ok: false, text: error }
        : { ok: true, text: `Shared a report of ${totals.length} event(s).` }
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
        message="Reports are available to administrator accounts."
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Building reports...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Reports</Text>
        <AppButton
          theme="primary"
          title="Export CSV"
          icon="download-outline"
          onPress={handleExport}
          disabled={totals.length === 0}
        />
      </View>

      {banner && (
        <Text style={[styles.banner, banner.ok ? styles.bannerOk : styles.bannerErr]}>
          {banner.text}
        </Text>
      )}

      {stats && (
        <>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.grid}>
            <StatCard label="Total Users" value={stats.totalUsers} icon="people-outline" />
            <StatCard label="Students" value={stats.students} icon="school-outline" />
            <StatCard label="Teachers" value={stats.teachers} icon="briefcase-outline" />
            <StatCard label="Events" value={stats.totalEvents} icon="calendar-outline" />
            <StatCard label="Open Events" value={stats.openEvents} icon="lock-open-outline" />
            <StatCard label="Attendance" value={stats.totalAttendance} icon="clipboard-outline" />
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Attendance per Event</Text>
      <View style={styles.panel}>
        {totals.length === 0 ? (
          <Text style={styles.panelEmpty}>No events yet.</Text>
        ) : (
          totals.map((row) => (
            <View key={row.eventId} style={styles.eventRow}>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{row.title}</Text>
                <Text style={styles.eventMeta}>
                  {formatDate(row.eventDate)} · {row.status}
                </Text>
              </View>
              <View style={styles.countBox}>
                <Text style={styles.count}>{row.attendeeCount}</Text>
                <Text style={styles.countLabel}>attended</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.panel}>
        {audit.length === 0 ? (
          <Text style={styles.panelEmpty}>No administrative actions recorded yet.</Text>
        ) : (
          audit.map((row) => (
            <View key={row.id} style={styles.auditRow}>
              <Text style={styles.auditAction}>{row.action}</Text>
              <Text style={styles.auditMeta}>
                {row.actorName} · {formatDateTime(row.createdAt)}
              </Text>
              {row.detailsText ? (
                <Text style={styles.auditDetails} numberOfLines={2}>
                  {row.detailsText}
                </Text>
              ) : null}
            </View>
          ))
        )}
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
    padding: 16,
    gap: 10,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  screenTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  banner: {
    fontSize: 13,
    lineHeight: 18,
  },
  bannerOk: { color: COLORS.success },
  bannerErr: { color: COLORS.danger },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  panel: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  panelEmpty: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventInfo: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  eventMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  countBox: {
    alignItems: 'center',
    minWidth: 56,
  },
  count: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  countLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  auditRow: {
    gap: 2,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primaryDark,
    paddingLeft: 10,
  },
  auditAction: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  auditMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  auditDetails: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
