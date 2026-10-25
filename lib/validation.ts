// Tiny validation helpers used by the forms.
// Keeping them here means the screens only show messages,
// and the rules live in one place (easy to explain and test).

export function isValidEmail(email: string): boolean {
  // Simple but reliable pattern: something@something.something
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateSignup(input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): string | null {
  if (!input.fullName.trim()) return 'Full name is required.';
  if (input.fullName.trim().length < 2) return 'Full name is too short.';
  if (!input.email.trim()) return 'Email is required.';
  if (!isValidEmail(input.email)) return 'Please enter a valid email address.';
  if (!input.password) return 'Password is required.';
  if (input.password.length < 6) return 'Password must be at least 6 characters.';
  if (input.password !== input.confirmPassword) return 'Passwords do not match.';
  return null;
}

export function validateLogin(input: {
  email: string;
  password: string;
}): string | null {
  if (!input.email.trim()) return 'Email is required.';
  if (!isValidEmail(input.email)) return 'Please enter a valid email address.';
  if (!input.password) return 'Password is required.';
  return null;
}

// Event form rules: title/date required, end after start.
export function validateEvent(input: {
  title: string;
  eventDate: string;
  startTime: string;
  endTime: string;
}): string | null {
  if (!input.title.trim()) return 'Event title is required.';
  if (input.title.trim().length < 3) return 'Event title is too short.';
  if (!input.eventDate) return 'Event date is required.';

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(input.eventDate)) return 'Event date must be YYYY-MM-DD.';

  const timePattern = /^\d{2}:\d{2}$/;
  if (input.startTime && !timePattern.test(input.startTime)) {
    return 'Start time must look like 08:00.';
  }
  if (input.endTime && !timePattern.test(input.endTime)) {
    return 'End time must look like 17:00.';
  }
  if (input.startTime && input.endTime && input.startTime >= input.endTime) {
    return 'End time must be later than start time.';
  }
  return null;
}
