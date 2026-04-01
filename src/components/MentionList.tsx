'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
  useRef,
} from 'react';

export type MentionItem = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
};

export interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: MentionItem[];
  query: string;
  command: (item: MentionItem) => void;
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  ({ items, query, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => setSelectedIndex(0), [items]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const selected = container.children[selectedIndex] as HTMLElement | undefined;
      selected?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        if (event.key === 'Escape') {
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="mention-dropdown">
          <div className="mention-dropdown-item mention-dropdown-hint">
            <span className="mention-login">
              {query ? 'No results' : 'Type a name…'}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div ref={containerRef} className="mention-dropdown">
        {items.map((item, index) => (
          <button
            key={item.login}
            className={`mention-dropdown-item${index === selectedIndex ? ' is-selected' : ''}`}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.avatarUrl} alt="" className="mention-avatar" />
            <span className="mention-login">@{item.login}</span>
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = 'MentionList';
export default MentionList;
