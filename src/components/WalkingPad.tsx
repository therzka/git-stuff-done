'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Bluetooth, BluetoothOff, ChevronDown, ChevronRight, Minus, Footprints, Play, Plus, Square, Timer, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useWalkingPad } from '@/hooks/useWalkingPad';
import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';
import type { WalkSession } from '@/lib/files';

// ── Module cache ────────────────────────────────────────────────────
let _walksCache: WalkSession[] | null = null;

// ── Helpers ─────────────────────────────────────────────────────────

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDateFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Estimate calories: ~0.04 kcal per step (rough walking average). */
function estimateCalories(steps: number): number {
  return Math.round(steps * 0.04);
}

// ── Speed constants ─────────────────────────────────────────────────
const SPEED_MIN = 0.5;
const SPEED_MAX = 3.75;
const SPEED_STEP = 0.25;
const SPEED_DEFAULT = 0.8;

function normalizeSpeed(mph: number): number {
  const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, mph));
  return Math.round(clamped / SPEED_STEP) * SPEED_STEP;
}

// ── Tabs ────────────────────────────────────────────────────────────
type TabId = 'controls' | 'history' | 'stats';

// ── Chart helpers ───────────────────────────────────────────────────

function dailyData(walks: WalkSession[]): { day: string; miles: number }[] {
  const result: { day: string; miles: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    const miles = walks
      .filter((w) => w.startedAt.slice(0, 10) === key)
      .reduce((sum, w) => sum + w.distanceMi, 0);
    result.push({ day: label, miles: +miles.toFixed(2) });
  }
  return result;
}

function weeklyData(walks: WalkSession[]): { week: string; miles: number }[] {
  const result: { week: string; miles: number }[] = [];
  const now = new Date();
  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const miles = walks
      .filter((w) => {
        const d = new Date(w.startedAt);
        return d >= weekStart && d < weekEnd;
      })
      .reduce((sum, w) => sum + w.distanceMi, 0);
    result.push({ week: label, miles: +miles.toFixed(2) });
  }
  return result;
}

// ── Component ───────────────────────────────────────────────────────

export default function WalkingPad({
  isDemo = false,
  onInsert,
}: {
  isDemo?: boolean;
  onInsert?: (text: string) => void;
}) {
  void onInsert;
  const pad = useWalkingPad();
  const [walks, setWalks] = useState<WalkSession[]>(_walksCache ?? []);
  const [walksLoading, setWalksLoading] = useState(_walksCache === null);
  const [tab, setTab] = useState<TabId>('controls');
  const [targetSpeed, setTargetSpeed] = useState(SPEED_DEFAULT);
  const [logsOpen, setLogsOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevSessionRef = useRef<typeof pad.currentSession>(null);

  // ── Fetch walk history ──────────────────────────────────────────
  const refreshWalks = useCallback(async (showLoading = false) => {
    if (isDemo) { setWalksLoading(false); return; }
    if (showLoading) setWalksLoading(true);
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch('/api/walking-pad', { signal: controller.signal });
      const data: WalkSession[] = res.ok ? await res.json() : [];
      setWalks(data);
      _walksCache = data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    } finally {
      setWalksLoading(false);
    }
  }, [isDemo]);

  // Stable ref so the auto-log effect doesn't need refreshWalks in its deps
  const refreshWalksRef = useRef(refreshWalks);
  useEffect(() => { refreshWalksRef.current = refreshWalks; }, [refreshWalks]);

  useVisibilityPolling(refreshWalks, 60_000);
  useEffect(() => { refreshWalks(_walksCache === null); }, [refreshWalks]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsOpen) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pad.logs, logsOpen]);

  useEffect(() => {
    if (pad.connectionState !== 'connected' || !pad.isRunning) return;
    setTargetSpeed(normalizeSpeed(pad.speedMph));
  }, [pad.connectionState, pad.isRunning, pad.speedMph]);

  // ── Auto-log session when treadmill stops ───────────────────────
  useEffect(() => {
    const prev = prevSessionRef.current;
    prevSessionRef.current = pad.currentSession;

    // Detect: had a session → treadmill stopped (isRunning went false) → session still set
    if (prev && !pad.isRunning && pad.currentSession && pad.timeSec > 0 && pad.distanceMi > 0) {
      const session = {
        startedAt: pad.currentSession.startedAt,
        endedAt: new Date().toISOString(),
        durationSec: pad.timeSec,
        distanceMi: +pad.distanceMi.toFixed(3),
        steps: pad.steps,
        avgSpeedMph: pad.timeSec > 0 ? +((pad.distanceMi / (pad.timeSec / 3600)).toFixed(2)) : 0,
        maxSpeedMph: +pad.currentSession.maxSpeedMph.toFixed(2),
      };
      fetch('/api/walking-pad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      }).then(() => refreshWalksRef.current());
    }
  }, [pad.isRunning, pad.currentSession, pad.timeSec, pad.distanceMi, pad.steps]);

  // ── Speed control helpers ───────────────────────────────────────
  const handleSpeedStep = useCallback(async (delta: number) => {
    const base = pad.isRunning ? pad.speedMph : targetSpeed;
    const next = normalizeSpeed(base + delta);
    setTargetSpeed(next);
    try {
      await pad.setSpeedMph(next);
    } catch {
      // Error message is already surfaced by useWalkingPad.
    }
  }, [pad, targetSpeed]);

  // ── Connection indicator ────────────────────────────────────────
  const connColor =
    pad.connectionState === 'connected' ? 'bg-emerald-500' :
    pad.connectionState === 'connecting' ? 'bg-amber-400 animate-pulse' :
    'bg-zinc-400';

  const isConnected = pad.connectionState === 'connected';
  const isAutoMode = pad.protocol === 'standard' && pad.controlMode === 2;
  const roundedLiveSpeed = normalizeSpeed(pad.speedMph > 0 ? pad.speedMph : targetSpeed);
  const canChangeSpeed = isConnected && !isAutoMode;
  const canDecrease = canChangeSpeed && roundedLiveSpeed > SPEED_MIN;
  const canIncrease = canChangeSpeed && roundedLiveSpeed < SPEED_MAX;

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold text-primary flex items-center gap-2">
          <Activity className="h-4 w-4" aria-hidden="true" />
          WalkingPad
          <span className={`inline-block h-2 w-2 rounded-full ${connColor}`} title={pad.connectionState} />
        </h2>
        <div className="flex items-center gap-1">
          {/* Connect / Disconnect */}
          {isConnected ? (
            <button
              onClick={pad.disconnect}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Disconnect"
            >
              <BluetoothOff className="h-3.5 w-3.5" />
              Disconnect
            </button>
          ) : (
            <button
              onClick={pad.connect}
              disabled={pad.connectionState === 'connecting'}
              className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              title="Connect via Bluetooth"
            >
              <Bluetooth className="h-3.5 w-3.5" />
              {pad.connectionState === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {pad.error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs text-destructive">
          {pad.error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border text-xs">
        {(['controls', 'history', 'stats'] as TabId[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-center capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-primary text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'controls' && (
          <div className="p-4 space-y-4">
            {/* Live speed */}
            <div className="text-center">
              <div className="text-5xl font-bold tabular-nums text-foreground">
                {pad.speedMph.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">mph</div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-muted/50 p-2">
                <Footprints className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                <div className="text-sm font-semibold tabular-nums">{pad.distanceMi.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">miles</div>
              </div>
              <div className="rounded-xl bg-muted/50 p-2">
                <Timer className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                <div className="text-sm font-semibold tabular-nums">{fmtTime(pad.timeSec)}</div>
                <div className="text-[10px] text-muted-foreground">time</div>
              </div>
              <div className="rounded-xl bg-muted/50 p-2">
                <Activity className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                <div className="text-sm font-semibold tabular-nums">{pad.steps.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">steps</div>
              </div>
              <div className="rounded-xl bg-muted/50 p-2">
                <Zap className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                <div className="text-sm font-semibold tabular-nums">{estimateCalories(pad.steps)}</div>
                <div className="text-[10px] text-muted-foreground">cal</div>
              </div>
            </div>

            {/* Start / Stop */}
            <div className="flex justify-center">
              {pad.isRunning ? (
                <button
                  onClick={pad.stop}
                  disabled={!isConnected}
                  className="flex items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
                >
                  <Square className="h-4 w-4" /> Stop
                </button>
              ) : (
                <button
                  onClick={pad.start}
                  disabled={!isConnected}
                  className="flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
                >
                  <Play className="h-4 w-4" /> Start
                </button>
              )}
            </div>

            {/* Speed control */}
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => handleSpeedStep(-SPEED_STEP)}
                disabled={!canDecrease}
                className="rounded-full bg-muted p-4 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
                aria-label="Decrease speed"
              >
                <Minus className="h-6 w-6" />
              </button>
              <div className="w-24 text-center">
                <span className="text-4xl font-bold tabular-nums">{targetSpeed.toFixed(1)}</span>
                <div className="text-xs text-muted-foreground mt-0.5">mph</div>
              </div>
              <button
                onClick={() => handleSpeedStep(SPEED_STEP)}
                disabled={!canIncrease}
                className="rounded-full bg-muted p-4 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
                aria-label="Increase speed"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>

            {isConnected && (
              <p className="text-center text-[11px] text-muted-foreground">
                Protocol: {pad.protocol ?? 'unknown'} · Mode:{' '}
                {pad.controlMode === null
                  ? 'n/a'
                  : pad.controlMode === 0
                    ? 'standby'
                    : pad.controlMode === 1
                      ? 'manual'
                      : 'auto'}
              </p>
            )}

            {isAutoMode && (
              <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                Speed buttons are disabled in auto mode. Switch the treadmill to manual mode to set speed directly.
              </p>
            )}

            {pad.speedCommandError && (
              <p className="text-center text-xs text-destructive">
                Speed command failed: {pad.speedCommandError}
              </p>
            )}

            {/* Not connected hint */}
            {!isConnected && !pad.error && (
              <p className="text-center text-xs text-muted-foreground">
                Connect your WalkingPad via Bluetooth to get started.
                <br />
                <span className="text-[10px]">Requires Chrome or Edge.</span>
              </p>
            )}

            {/* Connection log */}
            <div className="border-t border-border pt-2">
              <button
                onClick={() => setLogsOpen((v) => !v)}
                className="flex w-full items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {logsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                BLE Log {pad.logs.length > 0 && <span className="tabular-nums">({pad.logs.length})</span>}
              </button>
              {logsOpen && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {pad.logs.length === 0 ? (
                    <span className="italic">No logs yet</span>
                  ) : (
                    pad.logs.map((entry, i) => (
                      <div key={i} className={entry.includes('Error') || entry.includes('failed') ? 'text-destructive' : ''}>
                        {entry}
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div>
            {walksLoading && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading…</div>
            )}
            {!walksLoading && walks.length === 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No walk sessions yet
              </div>
            )}
            {!walksLoading && walks.length > 0 && (
              <ul className="divide-y divide-border">
                {walks.map((w) => (
                  <li key={w.id} className="px-4 py-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-medium text-foreground">
                            {w.distanceMi.toFixed(2)} mi
                          </span>
                          <span className="text-xs text-muted-foreground">{fmtDateFull(w.startedAt)}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>{fmtTime(w.durationSec)}</span>
                          <span>{w.steps.toLocaleString()} steps</span>
                          <span>avg {w.avgSpeedMph.toFixed(1)} mph</span>
                          <span>max {w.maxSpeedMph.toFixed(1)} mph</span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'stats' && (
          <div className="p-4 space-y-6">
            {walks.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Complete a walk to see stats
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="text-lg font-bold tabular-nums">
                      {walks.reduce((s, w) => s + w.distanceMi, 0).toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">total miles</div>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="text-lg font-bold tabular-nums">{walks.length}</div>
                    <div className="text-[10px] text-muted-foreground">sessions</div>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="text-lg font-bold tabular-nums">
                      {walks.reduce((s, w) => s + w.steps, 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground">total steps</div>
                  </div>
                </div>

                {/* Daily chart */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2">Last 7 Days (miles)</h3>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={dailyData(walks)} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                        labelStyle={{ color: 'var(--color-foreground)' }}
                        formatter={(v) => [`${v} mi`, 'Distance']}
                      />
                      <Bar dataKey="miles" radius={[4, 4, 0, 0]}>
                        {dailyData(walks).map((entry, i) => (
                          <Cell key={i} fill={entry.miles > 0 ? 'var(--color-primary)' : 'var(--color-muted)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Weekly chart */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2">Last 4 Weeks (miles)</h3>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={weeklyData(walks)} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                        labelStyle={{ color: 'var(--color-foreground)' }}
                        formatter={(v) => [`${v} mi`, 'Distance']}
                      />
                      <Bar dataKey="miles" radius={[4, 4, 0, 0]}>
                        {weeklyData(walks).map((entry, i) => (
                          <Cell key={i} fill={entry.miles > 0 ? 'var(--color-primary)' : 'var(--color-muted)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
