/**
 * User Profile Types
 *
 * Tracks user expertise and preferences for progressive disclosure
 * in the confirmation UI system.
 */

/**
 * User expertise level for progressive disclosure
 * Affects which actions require confirmation
 */
export type ExpertiseLevel = 'novice' | 'intermediate' | 'expert';

/**
 * User profile tracking experience and preferences
 */
export interface UserProfile {
  /** How experienced the user is with voice commands */
  expertiseLevel: ExpertiseLevel;

  /** Total commands executed (used to auto-level expertise) */
  commandsExecuted: number;

  /** Commands that should skip confirmation (user opted out) */
  skipConfirmationFor: string[];

  /** When the user started using Mutter */
  firstUseAt: number;

  /** Last activity timestamp */
  lastActiveAt: number;
}

/**
 * Thresholds for auto-leveling expertise based on command count
 */
export const EXPERTISE_THRESHOLDS = {
  novice: 0,
  intermediate: 50, // After 50 commands
  expert: 200, // After 200 commands
} as const;

/**
 * Create a default profile for new users
 */
export function createDefaultProfile(): UserProfile {
  return {
    expertiseLevel: 'novice',
    commandsExecuted: 0,
    skipConfirmationFor: [],
    firstUseAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

/**
 * Calculate expertise level from command count
 * Automatically levels up users based on their usage
 */
export function calculateExpertise(commandCount: number): ExpertiseLevel {
  if (commandCount >= EXPERTISE_THRESHOLDS.expert) return 'expert';
  if (commandCount >= EXPERTISE_THRESHOLDS.intermediate) return 'intermediate';
  return 'novice';
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
      return 'Confirmations for most destructive actions';
    case 'intermediate':
      return 'Confirmations only for irreversible or high-risk actions';
    case 'expert':
      return 'Minimal confirmations, only for critical operations';
  }
}
