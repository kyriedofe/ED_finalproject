import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  closeEvent,
  deleteEvent,
  getEventById,
  type SchoolEvent,
} from '@/lib/events';
import { buildQRPayload, generateQrToken } from '@/lib/qr';
import { getAttendeeCount } from '@/lib/attendance';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';

export default function EventDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role, user } = useAuth();

  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const canManage =
    role === 'admin' || (role === 'teacher' && event?.created_by === user?.id);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const row = await getEventById(id);
    setEvent(row);
    if (row) setAttendeeCount(await getAttendeeCount(row.id));
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // EVENT: owner/admin presses "Generate QR Code".
  const handleGenerateQr = async () => {
    if (!event || qrBusy) return;
    setQrBusy(true);
    setQrError(null);

    const result = await generateQrToken(event.id);
    if (result.error || !result.token) {
      setQrError(result.error ?? 'Unable to generate a QR code.');
    } else {
      setToken(result.token);
      setExpiresAt(result.expiresAt);
    }
    setQrBusy(false);
  };

  // EVENT: owner/admin presses "Close Event" (with confirmation).
  const handleCloseEvent = () => {
    if (!event) return;
    Alert.alert(
      'Close this event?',
      'After closing, students can no longer record attendance for it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Event',
          style: 'destructive',
          onPress: async () => {
            setActionBusy(true);
            const { error } = await closeEvent(event.id);
            setActionBusy(false);
            if (error) Alert.alert('Error', error);
            else load();
          },
        },
      ]
    );
  };

  // EVENT: owner/admin presses "Delete Event" (with confirmation).
  const handleDeleteEvent = () => {
    if (!event) return;
    Alert.alert(
      'Delete this event?',
      'The event and all of its attendance records will be removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionBusy(true);
            const { error } = await deleteEvent(event.id);
            setActionBusy(false);
            if (error) {
              Alert.alert('Error', error);
            } else {
              router.back();
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading event...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Event not found"
        message="It may have been deleted."
      />
    );
  }

  const isOpen = event.status === 'open';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>{event.title}</Text>
        <View
          style={[
            styles.badge,
            isOpen ? styles.badgeOpen : styles.badgeClosed,
          ]}
        >
          <Text
            style={[styles.badgeText, isOpen ? styles.badgeTextOpen : styles.badgeTextClosed]}
          >
            {isOpen ? 'OPEN' : 'CLOSED'}
          </Text>
        </View>
      </View>
      <Text style={styles.code}>{event.event_code}</Text>

      <View style={styles.infoCard}>
        <InfoRow icon="calendar-outline" label="Date" value={formatDate(event.event_date)} />
        <InfoRow
          icon="time-outline"
          label="Time"
          value={
            event.start_time
              ? `${formatTime(event.start_time)}${event.end_time ? ` - ${formatTime(event.end_time)}` : ''}`
              : 'Whole day'
          }
        />
        <InfoRow
          icon="location-outline"
          label="Venue"
          value={event.venue || 'Not specified'}
        />
        <InfoRow icon="people-outline" label="Attendees" value={String(attendeeCount)} />
        <InfoRow icon="document-text-outline" label="Description" value={event.description || 'No description'} />
        <InfoRow icon="cube-outline" label="Last updated" value={formatDateTime(event.updated_at)} />
      </View>

      {/* QR CODE: only the owner of the event or an admin sees this.
          The token itself is created by the database, and only its
          hash is stored - the plain token exists only on this screen. */}
      {canManage && (
        <View style={styles.qrSection}>
          <Text style={styles.sectionTitle}>Attendance QR Code</Text>

          {token ? (
            <View style={styles.qrCard}>
              {/* White background so phone cameras can read it easily */}
              <View style={styles.qrBox}>
                <QRCode
                  value={buildQRPayload(token)}
                  size={220}
                  color="#000000"
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text style={styles.qrHint}>
                Show this QR code to students. Scanning it records attendance.
              </Text>
              {expiresAt ? (
                <Text style={styles.qrMeta}>Expires: {formatDateTime(expiresAt)}</Text>
              ) : null}
              <AppButton
                theme="primary"
                title="Rotate QR Code"
                icon="refresh-outline"
                onPress={handleGenerateQr}
                disabled={qrBusy}
              />
              <Text style={styles.qrWarning}>
                Rotating creates a new QR code and immediately invalidates the
                one shown above.
              </Text>
            </View>
          ) : (
            <View style={styles.qrCard}>
              <Text style={styles.qrHint}>
                Generate a QR code that students can scan to check in.
              </Text>
              <AppButton
                theme="primary"
                title={qrBusy ? 'Generating...' : 'Generate QR Code'}
                icon="qr-code-outline"
                onPress={handleGenerateQr}
                disabled={qrBusy}
              />
            </View>
          )}

          {qrError ? <Text style={styles.error}>{qrError}</Text> : null}
        </View>
      )}

      {/* MANAGEMENT ACTIONS */}
      {canManage && (
        <View style={styles.actions}>
          <AppButton
            title="Edit Event"
            icon="create-outline"
            onPress={() =>
              router.push({ pathname: '/event/form', params: { id: event.id } })
            }
            disabled={actionBusy}
          />
          {isOpen && (
            <AppButton
              title="Close Event"
              icon="lock-closed-outline"
              onPress={handleCloseEvent}
              disabled={actionBusy}
            />
          )}
          <AppButton
            theme="danger"
            title="Delete Event"
            icon="trash-outline"
            onPress={handleDeleteEvent}
            disabled={actionBusy}
          />
        </View>
      )}

      {/* Students jump straight to the scanner. */}
      {role === 'student' && (
        <View style={styles.actions}>
          {isOpen ? (
            <AppButton
              theme="primary"
              title="Scan QR to Check In"
              icon="qr-code-outline"
              onPress={() => router.push('/scan')}
            />
          ) : (
            <View style={styles.closedBox}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.warning} />
              <Text style={styles.closedText}>
                This event is closed - check-in is no longer possible.
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={COLORS.primary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 8,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  code: {
    fontSize: 13,
    color: COLORS.primaryDark,
    letterSpacing: 1,
    marginBottom: 6,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
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
  badgeTextOpen: { color: COLORS.primary },
  badgeTextClosed: { color: COLORS.textSecondary },
  infoCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    width: 92,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  qrSection: {
    marginTop: 10,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  qrCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    gap: 12,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  qrMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  qrWarning: {
    fontSize: 11,
    color: COLORS.warning,
    textAlign: 'center',
    lineHeight: 16,
  },
  actions: {
    marginTop: 12,
    gap: 10,
  },
  error: {
    fontSize: 14,
    color: COLORS.danger,
    textAlign: 'center',
  },
  closedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
  },
  closedText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
