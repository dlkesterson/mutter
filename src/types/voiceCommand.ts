/**
 * Voice Command Types for Mutter
 *
 * Defines the structure for voice commands, their execution requirements,
 * risk assessment, and scoring for the command ranking system.
 */

import type { IntentBucket, CursorLocation, ViewMode, VoicePhase } from './editorContext';

export type CommandId = string;

/**
 * Destructiveness level for risk assessment
 * Affects command scoring (safer = higher score)
 */
export type Destructiveness = 'none' | 'low' | 'medium' | 'high';

/**
 * Scope of the command's effect
 */
export type CommandScope = 'inline' | 'block' | 'document' | 'vault';

/**
 * Voice command definition
 * Contains all metadata needed for:
 * - Execution requirements checking
 * - Command scoring/ranking
 * - Risk assessment
 */
export interface VoiceCommand {
  id: CommandId;
  name: string;                          // Display name: "Bold selection"
  examples: string[];                    // Voice triggers: ["bold", "make bold", "bold this"]
  bucket: IntentBucket;                  // Intent bucket for tracking

  // Execution requirements
  requiresSelection: boolean;            // Needs text selected?
  requiresNote: boolean;                 // Needs note open?
  allowedLocations: CursorLocation[];    // Where cursor can be
  allowedViewModes: ViewMode[];          // Which view modes
  allowedVoicePhases: VoicePhase[];      // Which voice phases

  // Risk assessment
  destructiveness: Destructiveness;
  scope: CommandScope;
  reversible: boolean;

  // Execution
  action: () => void | Promise<void>;
}

/**
 * Score breakdown for debugging and transparency
 */
export interface ScoreBreakdown {
  contextRelevance: number;    // Selection + cursor location match (0-1)
  recentIntentMatch: number;   // Same bucket as recent commands (0-1)
  voicePhaseMatch: number;     // Allowed in current voice phase (0-1)
  commandCostWeight: number;   // Destructive = lower (0-1)
  userAffinity: number;        // Future: learned preferences (0-1)
}

/**
 * Scored command with ranking information
 */
export interface ScoredCommand {
  command: VoiceCommand;
  score: number;               // Final weighted score (0-1)
  breakdown: ScoreBreakdown;   // Individual component scores
}

/**
 * Scoring weights for the ranking formula
 * Total should equal 1.0
 */
export interface ScoringWeights {
  contextRelevance: number;    // 0.40 - highest weight
  recentIntentMatch: number;   // 0.25
  voicePhaseMatch: number;     // 0.20
  commandCostWeight: number;   // 0.10
  userAffinity: number;        // 0.05 - lowest (future)
}

/**
 * Default scoring weights
 * Based on research from voice-mode-editor-context.md
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  contextRelevance: 0.40,
  recentIntentMatch: 0.25,
  voicePhaseMatch: 0.20,
  commandCostWeight: 0.10,
  userAffinity: 0.05,
};

/**
 * Threshold constants for tiered display
 */
export const TIER_THRESHOLDS = {
  PRIMARY: 0.7,    // Score >= 0.7 → primary tier
  SECONDARY: 0.4,  // Score >= 0.4 → secondary tier
} as const;
