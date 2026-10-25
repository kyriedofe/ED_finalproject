import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import HomeAdmin from '@/components/HomeAdmin';
import HomeStudent from '@/components/HomeStudent';
import HomeTeacher from '@/components/HomeTeacher';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';

// HOME = the dashboard of the signed-in user's role.
export default function HomeScreen() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  if (role === 'admin') return <HomeAdmin />;
  if (role === 'teacher') return <HomeTeacher />;

  // No profile found (offline or brand new): show the student
  // dashboard and let the database policies decide what is allowed.
  if (role === null) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Profile could not be loaded"
        message="Check your internet connection and reopen the app."
      />
    );
  }

  return <HomeStudent />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});
