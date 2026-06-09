"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useLoadingPulse(durationMs = 350) {
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const nestedFrameRef = useRef<number | null>(null);
  const visibleSinceRef = useRef<number>(0);
  const [isActive, setIsActive] = useState(false);

  const clearTimeoutRef = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearFrameRefs = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (nestedFrameRef.current !== null) {
      window.cancelAnimationFrame(nestedFrameRef.current);
      nestedFrameRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimeoutRef();
    visibleSinceRef.current = performance.now();
    setIsActive(true);
  }, [clearTimeoutRef]);

  const hide = useCallback((nextDurationMs?: number) => {
    clearTimeoutRef();

    const elapsed = performance.now() - visibleSinceRef.current;
    const remainingDuration = Math.max(0, (nextDurationMs ?? durationMs) - elapsed);

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setIsActive(false);
    }, remainingDuration);
  }, [clearTimeoutRef, durationMs]);

  const trigger = useCallback((nextDurationMs?: number) => {
    show();
    hide(nextDurationMs);
  }, [hide, show]);

  const run = useCallback((action: () => void | Promise<void>, nextDurationMs?: number) => {
    show();
    clearFrameRefs();

    const execute = () => {
      void Promise.resolve()
        .then(action)
        .finally(() => {
          hide(nextDurationMs);
        });
    };

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      nestedFrameRef.current = window.requestAnimationFrame(() => {
        nestedFrameRef.current = null;
        execute();
      });
    });
  }, [clearFrameRefs, hide, show]);

  useEffect(() => {
    return () => {
      clearTimeoutRef();
      clearFrameRefs();
    };
  }, [clearFrameRefs, clearTimeoutRef]);

  return { isActive, trigger, run };
}
