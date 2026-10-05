'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

type Item = { key: string; t: string; text: string };

function List({ items, desktop }: { items: Item[]; desktop?: boolean }) {
  return (
    <ol className="m-0 list-none p-0">
      {items.map((e) => (
        <li
          key={e.key}
          className={`grid border-b border-divider ${desktop ? 'gap-4 py-2.5' : 'gap-2 py-2'}`}
          style={{ gridTemplateColumns: `${desktop ? '9em' : '8.5em'} minmax(0,1fr)` }}
        >
          <span className={`t-mono text-ink-muted ${desktop ? 'pt-0.5' : ''}`}>{e.t}</span>
          <span className={desktop ? 't-body' : 't-body-sm'}>{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** Phone: collapsible. Desktop: always expanded. */
export function History({ items, desktop }: { items: Item[]; desktop?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (desktop) {
    return (
      <div className="flex flex-col gap-2">
        <h4 className="t-h2 m-0">History</h4>
        <List items={items} desktop />
      </div>
    );
  }
  return (
    <div className="flex flex-col border-t border-divider pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-3 border-0 bg-transparent p-0 text-start text-ink"
      >
        <span className="t-h3">
          Delivery history · {items.length} {items.length === 1 ? 'update' : 'updates'}
        </span>
        <ChevronDown size={20} strokeWidth={2.5} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      <div id={id} hidden={!open}>
        <List items={items} />
      </div>
    </div>
  );
}
