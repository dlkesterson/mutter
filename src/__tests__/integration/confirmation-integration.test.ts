/**
 * Confirmation System Integration Tests
 *
 * Tests the progressive disclosure and confirmation system:
 * - User profile tracking
 * - Expertise level progression
 * - Risk-based confirmation logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  calculateExpertise,
  EXPERTISE_THRESHOLDS,
  createDefaultProfile,
} from '@/types/userProfile';

describe('User Profile System', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Profile Creation', () => {
    it('creates default profile for new users', () => {
      const profile = createDefaultProfile();

      expect(profile.expertiseLevel).toBe('novice');
      expect(profile.commandsExecuted).toBe(0);
      expect(profile.skipConfirmationFor).toEqual([]);
      expect(profile.firstUseAt).toBeGreaterThan(0);
    });

    it('persists profile to localStorage', () => {
      const { result } = renderHook(() => useUserProfile());

      act(() => {
        result.current.recordCommandExecution('test-cmd');
      });

      const stored = localStorage.getItem('mutter:user_profile');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.commandsExecuted).toBe(1);
    });

    it('loads existing profile from localStorage', () => {
      const existingProfile = {
        expertiseLevel: 'intermediate',
        commandsExecuted: 75,
        skipConfirmationFor: ['cmd-1'],
        firstUseAt: Date.now() - 86400000,
        lastActiveAt: Date.now(),
      };
      localStorage.setItem('mutter:user_profile', JSON.stringify(existingProfile));

      const { result } = renderHook(() => useUserProfile());

      expect(result.current.profile.expertiseLevel).toBe('intermediate');
      expect(result.current.profile.commandsExecuted).toBe(75);
    });
  });

  describe('Expertise Calculation', () => {
    it('starts as novice', () => {
      expect(calculateExpertise(0)).toBe('novice');
      expect(calculateExpertise(49)).toBe('novice');
    });

    it('becomes intermediate after threshold', () => {
      expect(calculateExpertise(EXPERTISE_THRESHOLDS.intermediate)).toBe('intermediate');
      expect(calculateExpertise(100)).toBe('intermediate');
    });

    it('becomes expert after threshold', () => {
      expect(calculateExpertise(EXPERTISE_THRESHOLDS.expert)).toBe('expert');
      expect(calculateExpertise(500)).toBe('expert');
    });
  });

  describe('Command Execution Tracking', () => {
    it('increments command count', () => {
      const { result } = renderHook(() => useUserProfile());

      expect(result.current.profile.commandsExecuted).toBe(0);

      act(() => {
        result.current.recordCommandExecution('cmd-1');
      });

      expect(result.current.profile.commandsExecuted).toBe(1);
    });

    it('auto-upgrades expertise level', () => {
      const { result } = renderHook(() => useUserProfile());

      // Execute enough commands to reach intermediate
      act(() => {
        for (let i = 0; i < EXPERTISE_THRESHOLDS.intermediate; i++) {
          result.current.recordCommandExecution(`cmd-${i}`);
        }
      });

      expect(result.current.profile.expertiseLevel).toBe('intermediate');
    });

    it('updates lastActiveAt timestamp', () => {
      const { result } = renderHook(() => useUserProfile());
      const before = Date.now();

      act(() => {
        result.current.recordCommandExecution('cmd-1');
      });

      expect(result.current.profile.lastActiveAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('Skip Confirmation', () => {
    it('adds command to skip list', () => {
      const { result } = renderHook(() => useUserProfile());

      act(() => {
        result.current.skipConfirmationForCommand('cmd-to-skip');
      });

      expect(result.current.profile.skipConfirmationFor).toContain('cmd-to-skip');
    });

    it('persists skip list', () => {
      const { result } = renderHook(() => useUserProfile());

      act(() => {
        result.current.skipConfirmationForCommand('cmd-1');
        result.current.skipConfirmationForCommand('cmd-2');
      });

      const stored = localStorage.getItem('mutter:user_profile');
      const parsed = JSON.parse(stored!);
      expect(parsed.skipConfirmationFor).toContain('cmd-1');
      expect(parsed.skipConfirmationFor).toContain('cmd-2');
    });
  });

  describe('shouldConfirm Logic', () => {
    describe('novice user', () => {
      it('confirms medium destructiveness', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'medium', true);
        expect(should).toBe(true);
      });

      it('confirms high destructiveness', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'high', true);
        expect(should).toBe(true);
      });

      it('does not confirm low destructiveness', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'low', true);
        expect(should).toBe(false);
      });

      it('does not confirm none destructiveness', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'none', true);
        expect(should).toBe(false);
      });
    });

    describe('intermediate user', () => {
      beforeEach(() => {
        localStorage.setItem(
          'mutter:user_profile',
          JSON.stringify({
            expertiseLevel: 'intermediate',
            commandsExecuted: 100,
            skipConfirmationFor: [],
            firstUseAt: Date.now(),
            lastActiveAt: Date.now(),
          })
        );
      });

      it('confirms high destructiveness', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'high', true);
        expect(should).toBe(true);
      });

      it('confirms irreversible medium actions', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'medium', false);
        expect(should).toBe(true);
      });

      it('does not confirm reversible medium actions', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'medium', true);
        expect(should).toBe(false);
      });
    });

    describe('expert user', () => {
      beforeEach(() => {
        localStorage.setItem(
          'mutter:user_profile',
          JSON.stringify({
            expertiseLevel: 'expert',
            commandsExecuted: 250,
            skipConfirmationFor: [],
            firstUseAt: Date.now(),
            lastActiveAt: Date.now(),
          })
        );
      });

      it('confirms high destructiveness', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'high', true);
        expect(should).toBe(true);
      });

      it('confirms irreversible medium actions', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'medium', false);
        expect(should).toBe(true);
      });

      it('does not confirm reversible medium actions', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'medium', true);
        expect(should).toBe(false);
      });

      it('does not confirm low destructiveness', () => {
        const { result } = renderHook(() => useUserProfile());

        const should = result.current.shouldConfirm('cmd', 'low', true);
        expect(should).toBe(false);
      });
    });

    describe('skipped commands', () => {
      it('does not confirm if command is in skip list', () => {
        localStorage.setItem(
          'mutter:user_profile',
          JSON.stringify({
            expertiseLevel: 'novice',
            commandsExecuted: 5,
            skipConfirmationFor: ['skip-me'],
            firstUseAt: Date.now(),
            lastActiveAt: Date.now(),
          })
        );

        const { result } = renderHook(() => useUserProfile());

        // Normally would confirm for novice + high destructiveness
        const should = result.current.shouldConfirm('skip-me', 'high', true);
        expect(should).toBe(false);
      });
    });
  });

  describe('Manual Expertise Override', () => {
    it('allows setting expertise level manually', () => {
      const { result } = renderHook(() => useUserProfile());

      expect(result.current.profile.expertiseLevel).toBe('novice');

      act(() => {
        result.current.setExpertiseLevel('expert');
      });

      expect(result.current.profile.expertiseLevel).toBe('expert');
    });

    it('persists manual override', () => {
      const { result } = renderHook(() => useUserProfile());

      act(() => {
        result.current.setExpertiseLevel('intermediate');
      });

      const stored = localStorage.getItem('mutter:user_profile');
      const parsed = JSON.parse(stored!);
      expect(parsed.expertiseLevel).toBe('intermediate');
    });
  });
});
