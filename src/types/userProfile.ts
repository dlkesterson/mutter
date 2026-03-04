/**
 * User Profile Types
 *
 * Tracks user expertise and preferences.
 */

/**
 * User expertise level
 */
export type ExpertiseLevel = 'novice' | 'intermediate' | 'expert';

/**
 * User profile tracking experience and preferences
 */
export interface UserProfile {
  expertiseLevel: ExpertiseLevel;

  /** When the user started using Mutter */
  firstUseAt: number;

  /** Last activity timestamp */
  lastActiveAt: number;
}

/**
 * Create a default profile for new users
 */
export function createDefaultProfile(): UserProfile {
  return {
    expertiseLevel: 'novice',
    firstUseAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

/**
 * Get human-readable label for expertise level
 */
export function getExpertiseLabel(level: ExpertiseLevel): string {
  switch (level) {
    case 'novice':
      return 'Novice';
    case 'intermediate':
      return 'Intermediate';
    case 'expert':
      return 'Expert';
  }
}

/**
 * Get description for expertise level
 */
export function getExpertiseDescription(level: ExpertiseLevel): string {
  switch (level) {
    case 'novice':
      return 'Full confirmations for destructive actions';
    case 'intermediate':
      return 'Confirmations only for irreversible or high-risk actions';
    case 'expert':
      return 'Minimal confirmations';
  }
}
