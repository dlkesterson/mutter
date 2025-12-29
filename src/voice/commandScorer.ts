/**
 * Command Scorer
 *
 * Implements the scoring formula for ranking voice commands:
 *
 * score =
 *   contextRelevance * 0.40 +   // Selection + cursor location match
 *   recentIntentMatch * 0.25 +  // Same bucket as recent commands
 *   voicePhaseMatch * 0.20 +    // Allowed in current voice phase
 *   commandCostWeight * 0.10 +  // Destructive = lower unless explicit
 *   userAffinity * 0.05         // Future: learned preferences
 */

import type {
  VoiceCommand,
  ScoredCommand,
  ScoreBreakdown,
  ScoringWeights,
} from '@/types/voiceCommand';
import { DEFAULT_SCORING_WEIGHTS } from '@/types/voiceCommand';
import type { EditorContext } from '@/types/editorContext';

/**
 * Score and rank a list of commands based on context
 * Returns commands sorted by score (highest first)
 */
export function scoreCommands(
  commands: VoiceCommand[],
  context: EditorContext,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): ScoredCommand[] {
  return commands
    .map((command) => {
      const breakdown = calculateBreakdown(command, context);
      const score = calculateScore(breakdown, weights);
      return { command, score, breakdown };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Calculate individual component scores
 */
function calculateBreakdown(
  command: VoiceCommand,
  context: EditorContext
): ScoreBreakdown {
  return {
    contextRelevance: calculateContextRelevance(command, context),
    recentIntentMatch: calculateRecentIntentMatch(command, context),
    voicePhaseMatch: calculateVoicePhaseMatch(command, context),
    commandCostWeight: calculateCommandCostWeight(command),
    userAffinity: calculateUserAffinity(command, context),
  };
}

/**
 * Calculate final weighted score from breakdown
 */
function calculateScore(
  breakdown: ScoreBreakdown,
  weights: ScoringWeights
): number {
  return (
    breakdown.contextRelevance * weights.contextRelevance +
    breakdown.recentIntentMatch * weights.recentIntentMatch +
    breakdown.voicePhaseMatch * weights.voicePhaseMatch +
    breakdown.commandCostWeight * weights.commandCostWeight +
    breakdown.userAffinity * weights.userAffinity
  );
}

/**
 * Context Relevance (40% weight)
 *
 * Scores based on:
 * - Selection match (highest impact)
 * - Cursor location match
 * - View mode match
 */
function calculateContextRelevance(
  command: VoiceCommand,
  context: EditorContext
): number {
  let score = 0.0;

  // Selection match (highest weight within context relevance)
  if (command.requiresSelection) {
    if (
      context.cursor.type === 'inline-selection' ||
      context.cursor.type === 'block-selection'
    ) {
      score += 0.5; // Strong boost - command matches what user is doing
    } else {
      // Command requires selection but user doesn't have one
      // This shouldn't happen if canExecute filtered properly, but score low
      return 0;
    }
  } else {
    // Command doesn't need selection
    if (
      context.cursor.type === 'inline-selection' ||
      context.cursor.type === 'block-selection'
    ) {
      // User has selection but command doesn't need it
      // Mild penalty - user likely wants selection-based command
      score += 0.2;
    } else {
      // No selection, command doesn't need it - neutral match
      score += 0.35;
    }
  }

  // Cursor location match
  if (command.allowedLocations.length === 0) {
    // Command works anywhere - slight boost
    score += 0.25;
  } else if (command.allowedLocations.includes(context.cursorLocation)) {
    score += 0.3; // Good match
  } else {
    // Location mismatch - shouldn't happen if canExecute filtered
    score += 0.1;
  }

  // View mode match
  if (command.allowedViewModes.length === 0) {
    // Command works in any view - slight boost
    score += 0.2;
  } else if (command.allowedViewModes.includes(context.viewMode)) {
    score += 0.2; // Good match
  } else {
    // View mode mismatch
    score += 0.05;
  }

  return Math.min(score, 1.0);
}

/**
 * Recent Intent Match (25% weight)
 *
 * Boosts commands in the same bucket as recent actions.
 * Logic: If user just formatted text, they likely want more formatting.
 */
function calculateRecentIntentMatch(
  command: VoiceCommand,
  context: EditorContext
): number {
  if (context.recentIntents.length === 0) {
    // No recent intents - neutral score
    return 0.5;
  }

  // Weight recent intents: most recent = 1.0, second = 0.6, third = 0.3
  const intentWeights = [1.0, 0.6, 0.3];
  let matchScore = 0;
  let totalWeight = 0;

  for (let i = 0; i < context.recentIntents.length && i < intentWeights.length; i++) {
    const weight = intentWeights[i];
    totalWeight += weight;

    if (context.recentIntents[i] === command.bucket) {
      matchScore += weight;
    }
  }

  if (totalWeight === 0) return 0.5;
  return matchScore / totalWeight;
}

/**
 * Voice Phase Match (20% weight)
 *
 * Binary check - command allowed in current phase or not.
 */
function calculateVoicePhaseMatch(
  command: VoiceCommand,
  context: EditorContext
): number {
  if (command.allowedVoicePhases.length === 0) {
    // Command works in any phase
    return 1.0;
  }

  if (command.allowedVoicePhases.includes(context.voicePhase)) {
    return 1.0;
  }

  // Not allowed in this phase - should have been filtered by canExecute
  return 0.0;
}

/**
 * Command Cost Weight (10% weight)
 *
 * Higher score = safer command.
 * Inverse of destructiveness.
 */
function calculateCommandCostWeight(command: VoiceCommand): number {
  // Reversible commands get a boost
  const reversibleBonus = command.reversible ? 0.1 : 0;

  // Base score by destructiveness
  let baseScore: number;
  switch (command.destructiveness) {
    case 'none':
      baseScore = 1.0;
      break;
    case 'low':
      baseScore = 0.8;
      break;
    case 'medium':
      baseScore = 0.5;
      break;
    case 'high':
      baseScore = 0.2;
      break;
  }

  return Math.min(baseScore + reversibleBonus, 1.0);
}

/**
 * User Affinity (5% weight)
 *
 * Future: Learn from user's command history.
 * For now, returns neutral 0.5.
 */
function calculateUserAffinity(
  _command: VoiceCommand,
  _context: EditorContext
): number {
  // TODO: Implement learned preferences
  // Could track:
  // - Frequency of command usage
  // - Time of day patterns
  // - Document type preferences
  return 0.5;
}

/**
 * Get a human-readable explanation of a score
 * Useful for debugging and the voice log
 */
export function explainScore(scored: ScoredCommand): string {
  const { score, breakdown } = scored;
  const lines = [
    `Score: ${(score * 100).toFixed(0)}%`,
    `  Context: ${(breakdown.contextRelevance * 100).toFixed(0)}% (40% weight)`,
    `  Recent: ${(breakdown.recentIntentMatch * 100).toFixed(0)}% (25% weight)`,
    `  Phase: ${(breakdown.voicePhaseMatch * 100).toFixed(0)}% (20% weight)`,
    `  Safety: ${(breakdown.commandCostWeight * 100).toFixed(0)}% (10% weight)`,
    `  Affinity: ${(breakdown.userAffinity * 100).toFixed(0)}% (5% weight)`,
  ];
  return lines.join('\n');
}

// Debug helper
if (typeof window !== 'undefined') {
  (window as any).__MUTTER_DEBUG__ = (window as any).__MUTTER_DEBUG__ || {};
  (window as any).__MUTTER_DEBUG__.scoreCommands = scoreCommands;
  (window as any).__MUTTER_DEBUG__.explainScore = explainScore;
}
