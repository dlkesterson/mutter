/**
 * useUserProfile Hook
 *
 * Manages user expertise tracking and confirmation preferences.
 * Persists to localStorage and auto-levels expertise based on usage.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  ExpertiseLevel,
  createDefaultProfile,
  calculateExpertise,
} from '@/types/userProfile';
import type { Destructiveness } from '@/types/voiceCommand';

const STORAGE_KEY = 'mutter:user_profile';

/**
 * Hook for managing user profile and expertise tracking
 */
export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return createDefaultProfile();
      }
    }
    return createDefaultProfile();
  });

  // Persist changes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  /**
   * Record a command execution and potentially level up expertise
   */
  const recordCommandExecution = useCallback((_commandId: string) => {
    setProfile((prev) => {
      const newCount = prev.commandsExecuted + 1;
      return {
        ...prev,
        commandsExecuted: newCount,
        expertiseLevel: calculateExpertise(newCount),
        lastActiveAt: Date.now(),
      };
    });
  }, []);

  /**
   * Mark a command to skip confirmation in the future
   */
  const skipConfirmationForCommand = useCallback((commandId: string) => {
    setProfile((prev) => {
      // Don't add duplicates
      if (prev.skipConfirmationFor.includes(commandId)) return prev;
      return {
        ...prev,
        skipConfirmationFor: [...prev.skipConfirmationFor, commandId],
      };
    });
  }, []);

  /**
   * Determine if a command should require confirmation based on:
   * - User's expertise level
   * - Command's destructiveness
   * - Whether the command is reversible
   * - User's "skip" preferences
   */
  const shouldConfirm = useCallback(
    (
      commandId: string,
      destructiveness: Destructiveness,
      reversible: boolean
    ): boolean => {
      // User explicitly opted out
      if (profile.skipConfirmationFor.includes(commandId)) return false;

      // Non-destructive actions never need confirmation
      if (destructiveness === 'none') return false;

      // Low destructiveness never needs confirmation
      if (destructiveness === 'low') return false;

      // Expert: only confirm high destructiveness or irreversible
      if (profile.expertiseLevel === 'expert') {
        return destructiveness === 'high' || !reversible;
      }

      // Intermediate: confirm if not reversible or high destructiveness
      if (profile.expertiseLevel === 'intermediate') {
        return !reversible || destructiveness === 'high';
      }

      // Novice: always confirm medium+ destructiveness
      return true;
    },
    [profile.skipConfirmationFor, profile.expertiseLevel]
  );

  /**
   * Manually set expertise level (e.g., from settings)
   */
  const setExpertiseLevel = useCallback((level: ExpertiseLevel) => {
    setProfile((prev) => ({ ...prev, expertiseLevel: level }));
  }, []);

  /**
   * Reset profile to defaults (for testing or fresh start)
   */
  const resetProfile = useCallback(() => {
    setProfile(createDefaultProfile());
  }, []);

  /**
   * Remove a command from the skip list
   */
  const removeSkipConfirmation = useCallback((commandId: string) => {
    setProfile((prev) => ({
      ...prev,
      skipConfirmationFor: prev.skipConfirmationFor.filter(
        (id) => id !== commandId
      ),
    }));
  }, []);

  return {
    profile,
    recordCommandExecution,
    skipConfirmationForCommand,
    removeSkipConfirmation,
    shouldConfirm,
    setExpertiseLevel,
    resetProfile,
  };
}
