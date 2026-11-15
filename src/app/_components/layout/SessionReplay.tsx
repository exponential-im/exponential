'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { PostHog } from 'posthog-js';
import { env } from '~/env';

/**
 * Pages recorded by PostHog session replay. Kept deliberately narrow: the
 * signup path, and our own workspace. Customer workspaces are never recorded.
 * A bare entry covers the page and everything under it, on a segment
 * boundary, so `/welcome` never matches a sibling like `/welcome-back`.
 */
export const REPLAY_PATHS = ['/onboarding', '/welcome', '/w/exponential'];

export function shouldRecord(pathname: string): boolean {
  return REPLAY_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// posthog-js is loaded on the first recorded page, so other pages never
// download it.
let client: Promise<PostHog> | null = null;

function loadPostHog(key: string): Promise<PostHog> {
  client ??= import('posthog-js').then(({ default: posthog }) => {
    initPostHog(posthog, key);
    return posthog;
  });
  return client;
}

function initPostHog(posthog: PostHog, key: string) {
  posthog.init(key, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    // Replay only: no events, no profiles, nothing stored on the device.
    persistence: 'memory',
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    disable_web_experiments: true,
    enable_recording_console_log: false,
    // Recording starts only on a REPLAY_PATHS page (see the effect below).
    disable_session_recording: true,
    session_recording: {
      // Full masking: every text node and input renders as asterisks, and
      // images, video and canvas are replaced by same-sized placeholders, so a
      // recording shows layout and interaction, never content.
      maskAllInputs: true,
      maskTextSelector: '*',
      blockSelector: 'img, video, canvas, picture, iframe',
      recordHeaders: false,
      recordBody: false,
    },
  });
}

/**
 * Masked PostHog session replay on REPLAY_PATHS pages. Does nothing until
 * NEXT_PUBLIC_POSTHOG_KEY is set.
 */
export function SessionReplay() {
  const pathname = usePathname();
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;

  useEffect(() => {
    if (!key) return;
    if (shouldRecord(pathname)) {
      void loadPostHog(key).then((posthog) => {
        if (!posthog.sessionRecordingStarted()) posthog.startSessionRecording();
      });
    } else if (client) {
      void client.then((posthog) => {
        if (posthog.sessionRecordingStarted()) posthog.stopSessionRecording();
      });
    }
  }, [key, pathname]);

  return null;
}
