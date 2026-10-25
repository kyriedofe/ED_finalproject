import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: 'primary' | 'secondary' | 'danger';
  onPress: () => void;
  disabled?: boolean;
};

// One button used by the whole app so every screen looks the same.
export default function AppButton({
  title,
  icon,
  theme = 'secondary',
  onPress,
  disabled,
}: Props) {
  const textColor =
    theme === 'primary'
      ? COLORS.textOnPrimary
      : theme === 'danger'
        ? COLORS.danger
        : COLORS.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        theme === 'primary' && styles.primary,
        theme === 'secondary' && styles.secondary,
        theme === 'danger' && styles.danger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        <Ionicons name={icon} size={20} color={textColor} />
        <Text style={[styles.label, { color: textColor }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  primary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  danger: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});
