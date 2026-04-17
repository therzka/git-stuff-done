'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface CalendarPickerProps {
  date: string;
  onChange: (date: string) => void;
}

function getTodayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function CalendarPicker({ date, onChange }: CalendarPickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseInt(date.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => parseInt(date.slice(5, 7)) - 1);
  const [datesWithContent, setDatesWithContent] = useState<Set<string>>(new Set());
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = getTodayISO();

  // Fetch dates with content
  useEffect(() => {
    fetch('/api/log/dates')
      .then((r) => r.json())
      .then((data) => setDatesWithContent(new Set(data.dates ?? [])))
      .catch((err) => {
        if (process.env.NODE_ENV !== 'production') console.warn('Failed to fetch log dates:', err);
      });
  }, []);



  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  }

  function buildCalendarDays() {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }

  function isoFor(day: number) {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${viewYear}-${m}-${d}`;
  }

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const popover = open ? (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, transform: 'translateX(-50%)', zIndex: 9999 }}
      className="w-72 max-w-[90vw] rounded-2xl border border-border bg-popover shadow-xl p-4 select-none"
    >
      {/* Month/Year Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-foreground">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          ›
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {buildCalendarDays().map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const iso = isoFor(day);
          const isSelected = iso === date;
          const isToday = iso === today;
          const hasContent = datesWithContent.has(iso);
          const isFuture = iso > today;

          return (
            <button
              key={iso}
              disabled={isFuture}
              onClick={() => {
                onChange(iso);
                setOpen(false);
              }}
              className={[
                'relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : isToday
                    ? 'bg-accent/50 text-accent-foreground ring-1 ring-accent'
                    : isFuture
                      ? 'text-muted-foreground/30 cursor-not-allowed'
                      : 'text-foreground hover:bg-muted cursor-pointer',
              ].join(' ')}
            >
              {day}
              {hasContent && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/50" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer: Today shortcut */}
      {date !== today && (
        <div className="mt-3 pt-3 border-t border-border flex justify-center">
          <button
            onClick={() => { onChange(today); setOpen(false); }}
            className="text-xs text-accent-foreground hover:underline"
          >
            Jump to Today
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => {
          if (!open && triggerRef.current) {
            const [y, m] = date.split('-').map(Number);
            setViewYear(y);
            setViewMonth(m - 1);
            const rect = triggerRef.current.getBoundingClientRect();
            setPopoverPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
          }
          setOpen((o) => !o);
        }}
        className="text-sm font-bold text-foreground hover:text-primary transition-colors cursor-pointer"
        title="Click to open calendar"
      >
        {displayDate}
      </button>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </>
  );
}
