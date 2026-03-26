"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Sparkles, X, Target } from "lucide-react";
import { DEMO_TODOS, DEMO_SUGGESTED_TODOS } from "@/lib/demo";

/** Render text with bare URLs and markdown links as clickable <a> tags */
function LinkifiedText({ text, className }: { text: string; className?: string }) {
  // Match markdown links [text](url) or bare URLs
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (mdMatch) {
          return (
            <a key={i} href={mdMatch[2]} target="_blank" rel="noopener noreferrer"
              className="text-primary underline decoration-primary/40 hover:decoration-primary"
              onClick={(e) => e.stopPropagation()}>{mdMatch[1]}</a>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer"
              className="text-primary underline decoration-primary/40 hover:decoration-primary"
              onClick={(e) => e.stopPropagation()}>{part}</a>
          );
        }
        return part;
      })}
    </span>
  );
}

type TodoItem = {
  id: string;
  title: string;
  done: boolean;
  source: "manual" | "suggested";
  createdAt: string;
};

export default function TodoList({ date, isDemo = false }: { date?: string, isDemo?: boolean }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  const fetchTodos = useCallback(async () => {
    if (isDemo) {
      setTodos(DEMO_TODOS);
      return;
    }
    const res = await fetch("/api/todos");
    setTodos(await res.json());
  }, [isDemo]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addTodo = async (title: string, source: "manual" | "suggested" = "manual") => {
    if (!title.trim()) return;

    if (isDemo) {
      const newTodo: TodoItem = {
        id: Math.random().toString(36).slice(2),
        title: title.trim(),
        done: false,
        source,
        createdAt: new Date().toISOString()
      };
      setTodos(prev => [...prev, newTodo]);
      if (source === "manual") setInput("");
      return;
    }

    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    let updated: TodoItem[] = await res.json();
    if (source === "suggested" && updated.length > 0) {
      const last = updated[updated.length - 1];
      const putRes = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: last.id, source: "suggested" }),
      });
      updated = await putRes.json();
    }
    setTodos(updated);
    if (source === "manual") setInput("");
  };

  const toggleTodo = async (id: string, done: boolean) => {
    if (isDemo) {
      // Allow optimistic toggle in demo mode for interactivity
      setTodos(prev => prev.map(t => t.id === id ? { ...t, done } : t));
      return;
    }
    const res = await fetch("/api/todos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, done }),
    });
    setTodos(await res.json());
  };

  const deleteTodo = async (id: string) => {
    if (isDemo) return;
    const res = await fetch("/api/todos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTodos(await res.json());
  };

  const suggest = async () => {
    setSuggesting(true);
    setSuggestions([]);

    if (isDemo) {
      setTimeout(() => {
        setSuggestions(DEMO_SUGGESTED_TODOS.map(t => t.title));
        setSuggesting(false);
      }, 1500);
      return;
    }

    try {
      const res = await fetch("/api/todos/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } finally {
      setSuggesting(false);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const startEdit = (todo: TodoItem) => {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
  };

  const commitEdit = async (id: string) => {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title) return;
    if (isDemo) {
      setTodos(prev => prev.map(t => t.id === id ? { ...t, title } : t));
      return;
    }
    const res = await fetch("/api/todos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
    setTodos(await res.json());
  };

  const cancelEdit = () => setEditingId(null);

  const dismissSuggestion = (title: string) => {
    setSuggestions((prev) => prev.filter((s) => s !== title));
  };

  const acceptSuggestion = (title: string) => {
    setSuggestions((prev) => prev.filter((s) => s !== title));
    addTodo(title, "suggested");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-primary flex items-center gap-2">
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
          TODOs
        </h2>
        <button
          onClick={suggest}
          disabled={suggesting}
          title={isDemo ? 'Suggest todos (Demo)' : 'Suggest todos'}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {suggesting ? 'Thinking…' : 'Suggest'}
        </button>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-4 pt-3 pb-2">
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo(input)}
            placeholder="Add a todo…"
            className="flex-1 rounded-xl border border-input bg-muted/50 px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
          />
          <button
            onClick={() => addTodo(input)}
            className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-80 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-semibold text-primary flex items-center gap-1">
              <Sparkles className="h-3 w-3" aria-hidden="true" /> AI Suggestions
            </p>
            <ul className="space-y-1">
              {suggestions.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 group">
                  <button
                    onClick={() => acceptSuggestion(s)}
                    className="flex-1 text-left text-sm text-foreground hover:text-primary transition-colors truncate"
                    title={s}
                  >
                    + {s}
                  </button>
                  <button
                    onClick={() => dismissSuggestion(s)}
                    aria-label="Dismiss suggestion"
                    className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {todos.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Target className="h-4 w-4" aria-hidden="true" /> No todos yet
            </div>
          ) : (
            <ul className="space-y-1">
              {todos.map((todo) => (
                <li
                  key={todo.id}
                  className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-accent/50 ${
                    todo.done ? "opacity-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => toggleTodo(todo.id, !todo.done)}
                    className="h-5 w-5 shrink-0 accent-primary rounded border-input"
                  />

                  {editingId === todo.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => commitEdit(todo.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(todo.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="flex-1 rounded-lg border border-input bg-background px-2 py-0.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                    />
                  ) : (
                    <span
                      onDoubleClick={() => !todo.done && startEdit(todo)}
                      className={`flex-1 min-w-0 cursor-text text-sm break-words ${todo.done ? "line-through text-muted-foreground opacity-50" : ""}`}
                      title="Double-click to edit"
                    >
                      <LinkifiedText text={todo.title} className="text-foreground" />
                    </span>
                  )}

                  {todo.source === 'suggested' && (
                    <span className="shrink-0 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">AI</span>
                  )}

                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
