import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import EventForm from '@/components/EventForm';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  createEvent,
  getEventById,
  updateEvent,
  type EventInput,
  type SchoolEvent,
} from '@/lib/events';

// ONE screen for both jobs:
//   /event/form            -> create a new event
//   /event/form?id=<uuid>   -> edit an existing event
export default function EventFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { role, loading } = useAuth();
  const navigation = useNavigation();
  const router = useRouter();

  const [initial, setInitial] = useState<SchoolEvent | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Edit Event' : 'Create Event' });
  }, [navigation, isEdit]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!isEdit) return;

      getEventById(id as string).then((row) => {
        if (!active) return;
        setInitial(row);
        setLoadingEvent(false);
      });
      return () => {
        active = false;
      };
    }, [id, isEdit])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // ROLE GUARD (the database policy is the real protection -
  // students cannot insert events even with a modified app).
  if (role !== 'teacher' && role !== 'admin') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Teachers only"
        message="Only teachers and administrators can create or edit events."
      />
    );
  }

  if (loadingEvent) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isEdit && !initial) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Event not found"
        message="It may have been deleted."
      />
    );
  }

  // EVENT: the form is submitted (create or edit).
  const handleSubmit = async (input: EventInput) => {
    if (submitting) return; // prevent double submission
    setSubmitting(true);
    setServerError(null);

    const result = isEdit
      ? await updateEvent(id as string, input)
      : await createEvent(input);

    setSubmitting(false);

    if (result.error) {
      setServerError(result.error);
      return;
    }

    Alert.alert(
      'Event saved',
      isEdit
        ? 'Your changes were saved.'
        : 'The event was created. Open it to generate the attendance QR code.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <EventForm
        initial={initial}
        submitting={submitting}
        serverError={serverError}
        submitLabel={isEdit ? 'Save Changes' : 'Create Event'}
        onSubmit={handleSubmit}
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
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
