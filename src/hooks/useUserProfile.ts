/**
 * useUserProfile Hook
 *
 * Manages user expertise tracking.
 * Persists to localStorage and auto-levels expertise based on usage.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  ExpertiseLevel,
  createDefaultProfile,
} from '@/types/userProfile';

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

  return {
    profile,
    setExpertiseLevel,
    resetProfile,
  };
}
