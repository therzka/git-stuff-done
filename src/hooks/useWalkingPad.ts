'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalkingPadBLEManager, WalkingPadState, ConnectionState } from 'walkingpad-js';

const MPH_TO_KMH = 1.60934;
const KMH_TO_MPH = 0.621371;
const KM_TO_MI = 0.621371;

const MIN_SPEED_KMH = 0.5;
const MAX_SPEED_KMH = 6.0;

interface Session {
  startedAt: string;
  maxSpeedMph: number;
}

type SessionProtocol = 'standard' | 'ftms' | null;
type ControlMode = 0 | 1 | 2 | null;
type SpeedCommandStatus = 'idle' | 'sending' | 'sent' | 'error';

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
  controlMode: ControlMode;
  protocol: SessionProtocol;

  start: () => Promise<void>;
  stop: () => Promise<void>;
  setSpeedMph: (mph: number) => Promise<void>;
  speedCommandStatus: SpeedCommandStatus;
  speedCommandError: string | null;
  lastRequestedSpeedMph: number | null;
  lastRequestedSpeedKmh: number | null;

  currentSession: Session | null;
  logs: string[];
}

const loadLib = () => import('walkingpad-js');

// Module-level ref so the manager survives remounts
let sharedManager: WalkingPadBLEManager | null = null;

function toControlMode(mode: number): ControlMode {
  if (mode === 0 || mode === 1 || mode === 2) return mode;
  return null;
}

export function useWalkingPad(): UseWalkingPadReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [speedMph, _setSpeedMph] = useState(0);
  const [distanceMi, setDistanceMi] = useState(0);
  const [timeSec, setTimeSec] = useState(0);
  const [steps, setSteps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>(null);
  const [protocol, setProtocol] = useState<SessionProtocol>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [speedCommandStatus, setSpeedCommandStatus] = useState<SpeedCommandStatus>('idle');
  const [speedCommandError, setSpeedCommandError] = useState<string | null>(null);
  const [lastRequestedSpeedMph, setLastRequestedSpeedMph] = useState<number | null>(null);
  const [lastRequestedSpeedKmh, setLastRequestedSpeedKmh] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const prevIsRunning = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = `[${ts}] ${msg}`;
    console.log(`[WalkingPad] ${msg}`);
    setLogs((prev) => [...prev.slice(-99), entry]);
  }, []);

  const getManager = useCallback(async (): Promise<WalkingPadBLEManager> => {
    if (sharedManager) return sharedManager;
    log('Loading walkingpad-js library…');
    const lib = await loadLib();
    log('Enabling walkingpad-js debug logging…');
    lib.enableDebugLogging();

    log('Creating BLE adapter (name prefix: KS-BLC2, KS, Walking)…');
    // Filter by known WalkingPad name prefixes for a cleaner picker.
    // C2 advertises as "KS-BLC2"; other models use "Walking" or "KS".
    // Include a broad optionalServices list so Chrome grants access to any
    // service the device exposes (needed to call getPrimaryServices()).
    const adapter = lib.createWalkingPadAdapter({
      namePrefixes: ['KS-BLC2', 'KS', 'Walking'],
      optionalServices: [
        // FTMS (standard fitness treadmill — C2 should use this)
        '00001826-0000-1000-8000-00805f9b34fb',
        // Standard WalkingPad vendor services
        '0000fe00-0000-1000-8000-00805f9b34fb',
        '0000fff0-0000-1000-8000-00805f9b34fb',
        // Additional vendor-specific ranges sometimes used by KingSmith
        '0000fe01-0000-1000-8000-00805f9b34fb',
        '0000fe02-0000-1000-8000-00805f9b34fb',
        '0000fff1-0000-1000-8000-00805f9b34fb',
        '0000fff2-0000-1000-8000-00805f9b34fb',
      ],
    });
    sharedManager = lib.createManager(adapter);
    log('Manager created');
    return sharedManager;
  }, [log]);

  // Event handlers — stable refs so we can attach/detach cleanly
  const handleState = useCallback((state: WalkingPadState) => {
    const mph = state.speed * KMH_TO_MPH;
    _setSpeedMph(mph);
    setDistanceMi(state.distance * KM_TO_MI);
    setTimeSec(state.time);
    setSteps(state.steps);
    setIsRunning(state.isRunning);
    setControlMode(toControlMode(Number(state.mode)));

    // Track max speed within current session
    if (state.isRunning && sessionRef.current) {
      if (mph > sessionRef.current.maxSpeedMph) {
        sessionRef.current = { ...sessionRef.current, maxSpeedMph: mph };
        setCurrentSession({ ...sessionRef.current });
      }
    }

    const wasRunning = prevIsRunning.current;
    prevIsRunning.current = state.isRunning;
    if (!wasRunning && state.isRunning) {
      const session: Session = { startedAt: new Date().toISOString(), maxSpeedMph: mph };
      sessionRef.current = session;
      setCurrentSession(session);
      setSpeedCommandStatus('idle');
      setSpeedCommandError(null);
    } else if (wasRunning && !state.isRunning) {
      // Keep currentSession for consumer auto-log, clear internal ref for next run.
      sessionRef.current = null;
      setSpeedCommandStatus('idle');
    }
  }, []);

  const handleConnectionStateChange = useCallback(({ from, to }: { from: ConnectionState; to: ConnectionState }) => {
    log(`Connection: ${from} → ${to}`);
    setConnectionState(to);
    if (to === 'connected') {
      setError(null);
      setProtocol(sharedManager?.getSessionInfo()?.protocol ?? null);
      return;
    }

    setProtocol(null);
    setControlMode(null);
    setSpeedCommandStatus('idle');
    setSpeedCommandError(null);
  }, [log]);

  const handleError = useCallback((err: Error) => {
    log(`Error: ${err.message}`);
    setError(err.message);
  }, [log]);

  // Attach event listeners on mount, attempt silent reconnect
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        log('Initializing BLE manager…');
        const pad = await getManager();
        if (cancelled) return;

        pad.events.on('state', handleState);
        pad.events.on('connectionStateChange', handleConnectionStateChange);
        pad.events.on('error', handleError);

        const state = pad.getConnectionState();
        log(`Current state: ${state}`);
        setConnectionState(state);

        // Silent reconnect attempt
        try {
          log('Attempting auto-reconnect to remembered device…');
          const ok = await pad.reconnect();
          log(ok ? 'Auto-reconnect successful' : 'No remembered device found');
          if (ok) {
            setProtocol(pad.getSessionInfo()?.protocol ?? null);
          }
        } catch {
          log('Auto-reconnect skipped (no saved device)');
        }
      } catch (err) {
        log(`Init failed: ${err instanceof Error ? err.message : 'unknown error'}`);
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
      log('Opening BLE device picker…');
      const pad = await getManager();
      await pad.connect({ rememberDevice: true });
      setProtocol(pad.getSessionInfo()?.protocol ?? null);
      log('Connected (device remembered for next time)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      log(`Connect failed: ${msg}`);
      setError(msg);
    }
  }, [getManager, log]);

  const disconnect = useCallback(async () => {
    try {
      log('Disconnecting…');
      const pad = await getManager();
      await pad.disconnect();
      setProtocol(null);
      setControlMode(null);
      log('Disconnected');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect';
      log(`Disconnect failed: ${msg}`);
      setError(msg);
    }
  }, [getManager, log]);

  const start = useCallback(async () => {
    try {
      log('Starting treadmill…');
      const pad = await getManager();
      await pad.start();
      log('Start command sent');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start';
      log(`Start failed: ${msg}`);
      setError(msg);
    }
  }, [getManager, log]);

  const stop = useCallback(async () => {
    try {
      log('Stopping treadmill…');
      const pad = await getManager();
      await pad.stop();
      log('Stop command sent');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop';
      log(`Stop failed: ${msg}`);
      setError(msg);
    }
  }, [getManager, log]);

  const setSpeedMph = useCallback(async (mph: number): Promise<void> => {
    const kmh = Math.min(MAX_SPEED_KMH, Math.max(MIN_SPEED_KMH, mph * MPH_TO_KMH));
    const normalizedMph = kmh * KMH_TO_MPH;

    setLastRequestedSpeedMph(normalizedMph);
    setLastRequestedSpeedKmh(kmh);
    setSpeedCommandStatus('sending');
    setSpeedCommandError(null);

    try {
      const pad = await getManager();
      await pad.setSpeed(kmh);
      setSpeedCommandStatus('sent');
      setError(null);
      _setSpeedMph(normalizedMph);
      log(`Set speed: ${normalizedMph.toFixed(2)} mph (${kmh.toFixed(2)} km/h)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to set speed';
      setSpeedCommandStatus('error');
      setSpeedCommandError(msg);
      setError(msg);
      log(`Set speed failed: ${msg}`);
      throw err instanceof Error ? err : new Error(msg);
    }
  }, [getManager, log]);

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
    controlMode,
    protocol,
    start,
    stop,
    setSpeedMph,
    speedCommandStatus,
    speedCommandError,
    lastRequestedSpeedMph,
    lastRequestedSpeedKmh,
    currentSession,
    logs,
  };
}
