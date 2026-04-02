'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalkingPadBLEManager, WalkingPadState, ConnectionState } from 'walkingpad-js';

const MPH_TO_KMH = 1.60934;
const KMH_TO_MPH = 0.621371;
const KM_TO_MI = 0.621371;

const MIN_SPEED_KMH = 0.5;
const MAX_SPEED_KMH = 6.0;

// FTMS service UUID for fitness equipment — used as a BLE filter so Chrome's
// device picker shows fitness treadmills regardless of their advertised name.
const FTMS_SERVICE_UUID = '00001826-0000-1000-8000-00805f9b34fb';

interface Session {
  startedAt: string;
  maxSpeedMph: number;
}

export interface UseWalkingPadReturn {
  connectionState: ConnectionState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  error: string | null;

  speedMph: number;
  distanceMi: number;
  timeSec: number;
  steps: number;
  isRunning: boolean;

  start: () => Promise<void>;
  stop: () => Promise<void>;
  setSpeedMph: (mph: number) => void;

  currentSession: Session | null;
}

const loadLib = () => import('walkingpad-js');

// Module-level ref so the manager survives remounts
let sharedManager: WalkingPadBLEManager | null = null;
let sharedThrottledSetSpeed: ((kmh: number) => void) | null = null;

export function useWalkingPad(): UseWalkingPadReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [speedMph, _setSpeedMph] = useState(0);
  const [distanceMi, setDistanceMi] = useState(0);
  const [timeSec, setTimeSec] = useState(0);
  const [steps, setSteps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

  const prevIsRunning = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  const getManager = useCallback(async (): Promise<WalkingPadBLEManager> => {
    if (sharedManager) return sharedManager;
    const lib = await loadLib();
    // Use service-based filter (FTMS UUID) instead of name prefixes so the
    // Chrome BLE picker shows the device even if its name doesn't start with
    // "Walking" or "KS". This matches any FTMS-compatible fitness treadmill.
    const adapter = lib.createWalkingPadAdapter({
      namePrefixes: [],
      defaultFilters: [{ services: [FTMS_SERVICE_UUID] }],
    });
    sharedManager = lib.createManager(adapter);
    const throttled = lib.createThrottledSetSpeed(
      (kmh: number) => sharedManager!.setSpeed(kmh),
      { intervalMs: 300 },
    );
    sharedThrottledSetSpeed = throttled;
    return sharedManager;
  }, []);

  // Event handlers — stable refs so we can attach/detach cleanly
  const handleState = useCallback((state: WalkingPadState) => {
    const mph = state.speed * KMH_TO_MPH;
    _setSpeedMph(mph);
    setDistanceMi(state.distance * KM_TO_MI);
    setTimeSec(state.time);
    setSteps(state.steps);
    setIsRunning(state.isRunning);

    // Track max speed within current session
    if (state.isRunning && sessionRef.current) {
      if (mph > sessionRef.current.maxSpeedMph) {
        sessionRef.current = { ...sessionRef.current, maxSpeedMph: mph };
        setCurrentSession({ ...sessionRef.current });
      }
    }
  }, []);

  const handleConnectionStateChange = useCallback(({ to }: { from: ConnectionState; to: ConnectionState }) => {
    setConnectionState(to);
    if (to === 'connected') setError(null);
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  // Session tracking: detect running transitions
  useEffect(() => {
    const wasRunning = prevIsRunning.current;
    prevIsRunning.current = isRunning;

    if (!wasRunning && isRunning) {
      // Started a new session
      const session: Session = { startedAt: new Date().toISOString(), maxSpeedMph: speedMph };
      sessionRef.current = session;
      setCurrentSession(session);
    } else if (wasRunning && !isRunning) {
      // Session ended — keep currentSession so the consumer can read & POST it,
      // then clear our internal ref so the next run starts fresh
      sessionRef.current = null;
    }
  }, [isRunning, speedMph]);

  // Attach event listeners on mount, attempt silent reconnect
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const pad = await getManager();
        if (cancelled) return;

        pad.events.on('state', handleState);
        pad.events.on('connectionStateChange', handleConnectionStateChange);
        pad.events.on('error', handleError);

        // Sync current connection state
        setConnectionState(pad.getConnectionState());

        // Silent reconnect attempt
        try {
          await pad.reconnect();
        } catch {
          // Expected to fail if no remembered device — ignore
        }
      } catch {
        // Dynamic import or BLE init failure — not critical during mount
      }
    }

    init();

    return () => {
      cancelled = true;
      // Remove listeners but do NOT disconnect — keep BLE alive across remounts
      if (sharedManager) {
        sharedManager.events.off('state', handleState);
        sharedManager.events.off('connectionStateChange', handleConnectionStateChange);
        sharedManager.events.off('error', handleError);
      }
    };
  }, [getManager, handleState, handleConnectionStateChange, handleError]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const pad = await getManager();
      await pad.connect({ rememberDevice: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [getManager]);

  const disconnect = useCallback(async () => {
    try {
      const pad = await getManager();
      await pad.disconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }, [getManager]);

  const start = useCallback(async () => {
    try {
      const pad = await getManager();
      await pad.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    }
  }, [getManager]);

  const stop = useCallback(async () => {
    try {
      const pad = await getManager();
      await pad.stop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop');
    }
  }, [getManager]);

  const setSpeedMph = useCallback((mph: number) => {
    const kmh = Math.min(MAX_SPEED_KMH, Math.max(MIN_SPEED_KMH, mph * MPH_TO_KMH));
    sharedThrottledSetSpeed?.(kmh);
  }, []);

  return {
    connectionState,
    connect,
    disconnect,
    error,
    speedMph,
    distanceMi,
    timeSec,
    steps,
    isRunning,
    start,
    stop,
    setSpeedMph,
    currentSession,
  };
}
