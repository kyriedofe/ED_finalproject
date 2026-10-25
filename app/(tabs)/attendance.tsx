import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  correctAttendance,
  getAttendanceRows,
  getEventTotals,
  type AttendanceRow,
  type EventTotal,
} from '@/lib/attendance';
import { buildCsv, shareCsv } from '@/lib/csv';
import { formatDate, formatDateTime } from '@/lib/format';

type StatusFilter = 'all' | 'present' | 'absent' | 'excused';

function StatusBadge({ status }: { status: string }) {
  const isPresent = status === 'present';
  const isExcused = status === 'excused';
  return (
    <View
      style={[
        styles.badge,
        isPresent ? styles.badgeGreen : isExcused ? styles.badgeYellow : styles.badgeRed,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          isPresent ? styles.textGreen : isExcused ? styles.textYellow : styles.textRed,
        ]}
      >
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

export default function AttendanceScreen() {
  const { role, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<'records' | 'events'>('records');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [totals, setTotals] = useState<EventTotal[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Admin correction editor (one row at a time).
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<'present' | 'absent' | 'excused'>('present');
  const [editReason, setEditReason] = useState('');
  const [correcting, setCorrecting] = useState(false);

  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const isAdmin = role === 'admin';

  const load = useCallback(async () => {
    setLoadingData(true);
    const [rowList, totalList] = await Promise.all([
      getAttendanceRows(), // RLS: teacher = own events, admin = everything
      getEventTotals(),
    ]);
    setRows(rowList);
    setTotals(totalList);
    setLoadingData(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!query) return true;
      return (
        row.studentName.toLowerCase().includes(query) ||
        row.eventTitle.toLowerCase().includes(query)
      );
    });
  }, [rows, search, statusFilter]);

  // EVENT: teacher/admin exports the current filtered list as CSV.
  const handleExport = async () => {
    const csv = buildCsv(
      ['Student', 'Event', 'Event Date', 'Checked In', 'Status'],
      filteredRows.map((row) => [
        row.studentName,
        row.eventTitle,
        formatDate(row.eventDate),
        formatDateTime(row.attendedAt),
        row.status,
      ])
    );
    const error = await shareCsv(csv, 'Attendance Records');
    setBanner(
      error
        ? { ok: false, text: error }
        : { ok: true, text: `Shared ${filteredRows.length} record(s) as CSV.` }
    );
  };

  // EVENT: admin taps a row (admin only) -> open/close the correction editor.
  const toggleEditor = (row: AttendanceRow) => {
    if (!isAdmin) return;
    if (editId === row.id) {
      setEditId(null);
      return;
    }
    setEditId(row.id);
    setEditStatus(row.status === 'present' || row.status === 'excused' ? row.status : 'absent');
    setEditReason('');
    setBanner(null);
  };

  // EVENT: admin saves a correction (reason required).
  const handleCorrect = async () => {
    if (!editId || correcting) return;
    if (editReason.trim().length < 5) {
      setBanner({ ok: false, text: 'Please give a short reason (at least 5 characters).' });
      return;
    }
    setCorrecting(true);
    const error = await correctAttendance(editId, editStatus, editReason.trim());
    setCorrecting(false);

    if (error) {
      setBanner({ ok: false, text: error });
      return;
    }
    setBanner({ ok: true, text: 'Attendance corrected and logged.' });
    setEditId(null);
    setEditReason('');
    load();
  };

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // ROLE GUARD.
  if (role !== 'teacher' && role !== 'admin') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Staff only"
        message="Only teachers and administrators can monitor attendance."
      />
    );
  }

  if (loadingData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading attendance...</Text>
      </View>
    );
  }

  const header = (
    <View style={styles.headerBox}>
      <Text style={styles.screenTitle}>Attendance</Text>

      {/* Segmented view: records vs per-event totals */}
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentBtn, mode === 'records' && styles.segmentActive]}
          onPress={() => setMode('records')}
        >
          <Text style={[styles.segmentText, mode === 'records' && styles.segmentTextActive]}>
            Records
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, mode === 'events' && styles.segmentActive]}
          onPress={() => setMode('events')}
        >
          <Text style={[styles.segmentText, mode === 'events' && styles.segmentTextActive]}>
            Events
          </Text>
        </Pressable>
      </View>

      {mode === 'records' && (
        <>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search student or event..."
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.filterRow}>
            {(['all', 'present', 'absent', 'excused'] as StatusFilter[]).map((value) => (
              <Pressable
                key={value}
                style={[styles.filterChip, statusFilter === value && styles.filterChipActive]}
                onPress={() => setStatusFilter(value)}
              >
                <Text
                  style={[
                    styles.filterText,
                    statusFilter === value && styles.filterTextActive,
                  ]}
                >
                  {value === 'all' ? 'All' : value}
                </Text>
              </Pressable>
            ))}
          </View>

          <AppButton
            title={`Export CSV (${filteredRows.length})`}
            icon="download-outline"
            onPress={handleExport}
            disabled={filteredRows.length === 0}
          />
        </>
      )}

      {banner && <Text style={[styles.banner, banner.ok ? styles.bannerOk : styles.bannerErr]}>{banner.text}</Text>}
    </View>
  );

  if (mode === 'events') {
    return (
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={totals}
        keyExtractor={(item) => item.eventId}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState icon="calendar-outline" title="No events yet" message="Events and their attendee counts will appear here." />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.cardMeta}>{formatDate(item.eventDate)}</Text>
            <Text style={styles.cardMeta}>
              Attendees: <Text style={styles.count}>{item.attendeeCount}</Text>
            </Text>
          </View>
        )}
      />
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={filteredRows}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState
          icon="clipboard-outline"
          title="No attendance records"
          message={
            search || statusFilter !== 'all'
              ? 'Nothing matches your search or filter.'
              : 'When students scan QR codes, their records will appear here.'
          }
        />
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => toggleEditor(item)}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{item.studentName}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.cardMeta}>{item.eventTitle}</Text>
          <Text style={styles.cardMeta}>
            {formatDate(item.eventDate)} · Checked in {formatDateTime(item.attendedAt)}
          </Text>
          {item.correctionReason ? (
            <Text style={styles.corrected}>Corrected: {item.correctionReason}</Text>
          ) : null}

          {isAdmin && editId === item.id && (
            <View style={styles.editor}>
              <Text style={styles.editorLabel}>Change status to:</Text>
              <View style={styles.statusRow}>
                {(['present', 'absent', 'excused'] as const).map((value) => (
                  <Pressable
                    key={value}
                    style={[styles.statusChip, editStatus === value && styles.statusChipActive]}
                    onPress={() => setEditStatus(value)}
                  >
                    <Text
                      style={[styles.statusText, editStatus === value && styles.statusTextActive]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.reasonInput}
                value={editReason}
                onChangeText={setEditReason}
                placeholder="Reason for the correction (required)"
                placeholderTextColor={COLORS.textSecondary}
                multiline
                editable={!correcting}
              />
              <AppButton
                theme="primary"
                title={correcting ? 'Saving...' : 'Save Correction'}
                icon="save-outline"
                onPress={handleCorrect}
                disabled={correcting}
              />
              <AppButton
                title="Cancel"
                icon="close-outline"
                onPress={() => setEditId(null)}
                disabled={correcting}
              />
            </View>
          )}
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
    gap: 8,
  },
  headerBox: {
    gap: 12,
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: 'rgba(0,255,102,0.12)',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  filterChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(0,255,102,0.12)',
  },
  filterText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  banner: {
    fontSize: 13,
    lineHeight: 18,
  },
  bannerOk: {
    color: COLORS.success,
  },
  bannerErr: {
    color: COLORS.danger,
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
  count: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  corrected: {
    fontSize: 12,
    color: COLORS.warning,
    fontStyle: 'italic',
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeGreen: {
    backgroundColor: 'rgba(0,255,102,0.12)',
    borderColor: COLORS.primary,
  },
  badgeYellow: {
    backgroundColor: 'rgba(255,191,71,0.12)',
    borderColor: COLORS.warning,
  },
  badgeRed: {
    backgroundColor: 'rgba(255,77,77,0.12)',
    borderColor: COLORS.danger,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  textGreen: { color: COLORS.primary },
  textYellow: { color: COLORS.warning },
  textRed: { color: COLORS.danger },
  editor: {
    marginTop: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  editorLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statusChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(0,255,102,0.12)',
  },
  statusText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  statusTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  reasonInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
