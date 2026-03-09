'use client';

import { useEffect, useState } from 'react';
import { FALLBACK_MODELS, type ModelOption } from '@/lib/model-types';

let cachedModels: ModelOption[] | null = null;
let cachedAt = 0;
let fetchPromise: Promise<ModelOption[]> | null = null;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isCacheValid(): boolean {
  return cachedModels !== null && Date.now() - cachedAt < CACHE_TTL_MS;
}

async function fetchModels(): Promise<ModelOption[]> {
  try {
    const res = await fetch('/api/models');
    if (!res.ok) throw new Error('Failed to fetch');
    const data: ModelOption[] = await res.json();
    if (data.length > 0) {
      cachedModels = data;
      cachedAt = Date.now();
      return data;
    }
  } catch {
    // API unavailable — fall back
  }
  cachedModels = FALLBACK_MODELS;
  cachedAt = Date.now();
  return FALLBACK_MODELS;
}

export function useModels(enabled = true): { models: ModelOption[]; loading: boolean } {
  const [models, setModels] = useState<ModelOption[]>(cachedModels ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    if (isCacheValid()) {
      setModels(cachedModels!);
      return;
    }

    let cancelled = false;
    setLoading(true);

    if (!fetchPromise) {
      fetchPromise = fetchModels().finally(() => { fetchPromise = null; });
    }

    fetchPromise.then((result) => {
      if (!cancelled) {
        setModels(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [enabled]);

  return { models, loading };
}
