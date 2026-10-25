import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';
import { getProfile, type Profile, type Role } from './profiles';

// ------------------------------------------------------------------
// A very small "auth store": the current session + profile are kept
// in module variables, and every screen that uses useAuth() re-renders
// when notify() is called. No external state library needed.
// ------------------------------------------------------------------

let currentSession: Session | null = null;
let currentProfile: Profile | null = null;
let isRestoringSession = true;
let isLoadingProfile = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

// Loads the signed-in user's profile (role, name, student id...).
async function refreshProfile() {
  if (!currentSession) {
    currentProfile = null;
    isLoadingProfile = false;
    notify();
    return;
  }
  // Only show the global loading screen the FIRST time a profile is
  // loaded. Later refreshes (e.g. opening the Profile tab) update the
  // data quietly in the background - if they flipped the global
  // `loading` flag, the root layout would unmount the whole tab tree
  // and the app would crash.
  const isFirstLoad = currentProfile === null;
  if (isFirstLoad) {
    isLoadingProfile = true;
    notify();
  }

  const profile = await getProfile(currentSession.user.id);
  currentProfile = profile;

  isLoadingProfile = false;
  notify();
}

function handleSession(session: Session | null) {
  currentSession = session;
  currentProfile = null;
  isRestoringSession = false;
  notify();

  if (session) {
    void refreshProfile(); // role decides which dashboard is shown
  } else {
    isLoadingProfile = false;
    notify();
  }
}

// RESTORE THE SAVED SESSION when the app starts (runs once).
// getSession() reads the token that AsyncStorage stored last time.
void supabase.auth.getSession().then(({ data }) => handleSession(data.session));

// SESSION PERSISTENCE: this listener runs on every sign-in,
// sign-out and token refresh, so the whole app stays in sync.
supabase.auth.onAuthStateChange((_event, session) => handleSession(session));

// ROLE CHANGES APPLY WITHOUT RE-LOGIN.
// An administrator (or the Supabase dashboard) may change this
// user's role or deactivate the account at any moment. Re-read the
// profile every time the app returns to the foreground so the new
// role takes effect immediately - no sign-out/sign-in needed.
// (If the fetch fails offline we keep the last known profile.)
AppState.addEventListener('change', (state) => {
  if (state !== 'active' || !currentSession) return;
  void getProfile(currentSession.user.id).then((profile) => {
    if (profile) {
      currentProfile = profile;
      notify();
    }
  });
});

export type AuthState = {
  session: Session | null;
  user: Session['user'] | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
};

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    session: currentSession,
    user: currentSession?.user ?? null,
    profile: currentProfile,
    role: currentProfile?.role ?? null,
    loading: isRestoringSession || isLoadingProfile,
  };
}

// Re-reads the profile (used after editing the profile screen).
export function refreshAuthProfile() {
  return refreshProfile();
}

// REGISTRATION.
// The role is NOT sent from the app: the database trigger
// handle_new_user() always creates a 'student' profile.
// Full name travels as user metadata and is copied by the same trigger.
export async function signUp(
  email: string,
  password: string,
  fullName: string
): Promise<{ needsConfirmation: boolean; error: string | null }> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName.trim() },
    },
  });

  if (error) return { needsConfirmation: false, error: error.message };
  // If there is no session, email confirmation is ON in Supabase.
  return { needsConfirmation: !data.session, error: null };
}

// LOGIN
export async function signIn(
  email: string,
  password: string
): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  // On success the onAuthStateChange listener loads the session+profile.
  return error ? error.message : null;
}

// LOGOUT
export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Network problems must not stop the user from logging out locally.
  }
  handleSession(null);
}
