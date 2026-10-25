import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import AppButton from './AppButton';
import { COLORS } from '@/constants/colors';
import { validateEvent } from '@/lib/validation';
import type { EventInput, SchoolEvent } from '@/lib/events';

type Props = {
  initial?: SchoolEvent | null; // present = edit mode
  submitting: boolean;
  serverError: string | null;
  submitLabel: string;
  onSubmit: (input: EventInput) => void;
};

// --- tiny date/time conversion helpers -------------------------
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateOnlyString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeString(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateFromString(text: string | null, fallback: Date): Date {
  if (!text) return fallback;
  const [year, month, day] = text.split('-').map(Number);
  if (!year || !month || !day) return fallback;
  return new Date(year, month - 1, day);
}

function timeFromString(text: string | null, base: Date): Date {
  const result = new Date(base);
  if (!text) {
    result.setHours(8, 0, 0, 0);
    return result;
  }
  const [hour, minute] = text.split(':').map(Number);
  result.setHours(hour || 0, minute || 0, 0, 0);
  return result;
}

// The create and the edit screen share this single form.
export default function EventForm({
  initial,
  submitting,
  serverError,
  submitLabel,
  onSubmit,
}: Props) {
  const today = new Date();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [eventDate, setEventDate] = useState(initial?.event_date ?? toDateOnlyString(today));
  const [startTime, setStartTime] = useState(initial?.start_time ?? '');
  const [endTime, setEndTime] = useState(initial?.end_time ?? '');
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  // Which date/time picker is open: 'date' | 'start' | 'end'
  const [picker, setPicker] = useState<{
    target: 'date' | 'start' | 'end';
    value: Date;
  } | null>(null);

  const openPicker = (target: 'date' | 'start' | 'end') => {
    const base = new Date();
    const value =
      target === 'date'
        ? dateFromString(eventDate, base)
        : timeFromString(target === 'start' ? startTime : endTime, base);
    setPicker({ target, value });
  };

  const handlePickerChange = (_event: any, selected?: Date) => {
    if (Platform.OS === 'android') setPicker(null); // dialog closes itself
    if (!selected || !picker) return;

    if (picker.target === 'date') setEventDate(toDateOnlyString(selected));
    if (picker.target === 'start') setStartTime(toTimeString(selected));
    if (picker.target === 'end') setEndTime(toTimeString(selected));
  };

  const handleSubmit = () => {
    const problem = validateEvent({ title, eventDate, startTime, endTime });
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      event_date: eventDate,
      start_time: startTime || null,
      end_time: endTime || null,
      venue: venue.trim(),
    });
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Event Title *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          setLocalError(null);
        }}
        placeholder="Founders Day Assembly"
        placeholderTextColor={COLORS.textSecondary}
        editable={!submitting}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="What happens at this event?"
        placeholderTextColor={COLORS.textSecondary}
        multiline
        numberOfLines={3}
        editable={!submitting}
      />

      <Text style={styles.label}>Date *</Text>
      <Pressable style={styles.input} onPress={() => openPicker('date')}>
        <Text style={styles.inputText}>{eventDate}</Text>
      </Pressable>

      <View style={styles.timeRow}>
        <View style={styles.timeField}>
          <Text style={styles.label}>Start Time</Text>
          <Pressable style={styles.input} onPress={() => openPicker('start')}>
            <Text style={styles.inputText}>{startTime || 'Not set'}</Text>
          </Pressable>
        </View>
        <View style={styles.timeField}>
          <Text style={styles.label}>End Time</Text>
          <Pressable style={styles.input} onPress={() => openPicker('end')}>
            <Text style={styles.inputText}>{endTime || 'Not set'}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.label}>Venue</Text>
      <TextInput
        style={styles.input}
        value={venue}
        onChangeText={setVenue}
        placeholder="School Gymnasium"
        placeholderTextColor={COLORS.textSecondary}
        editable={!submitting}
      />

      {/* Native date / time picker */}
      {picker && (
        <View style={styles.pickerBox}>
          <DateTimePicker
            value={picker.value}
            mode={picker.target === 'date' ? 'date' : 'time'}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handlePickerChange}
          />
          {Platform.OS === 'ios' && (
            <AppButton
              title="Done"
              icon="checkmark-outline"
              onPress={() => setPicker(null)}
            />
          )}
        </View>
      )}

      {localError ? <Text style={styles.error}>{localError}</Text> : null}
      {serverError ? <Text style={styles.error}>{serverError}</Text> : null}

      <AppButton
        theme="primary"
        title={submitLabel}
        icon="save-outline"
        onPress={handleSubmit}
        disabled={submitting}
      />
      {submitting ? <Text style={styles.hint}>Saving to the database...</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  inputText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  pickerBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 8,
    marginTop: 8,
    gap: 8,
  },
  error: {
    fontSize: 14,
    color: COLORS.danger,
    marginTop: 12,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
