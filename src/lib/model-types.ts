export interface ModelOption {
  id: string;
  name: string;
}

export const FALLBACK_MODELS: ModelOption[] = [
  { id: 'gpt-5.2', name: 'GPT 5.2' },
  { id: 'gpt-4.1', name: 'GPT 4.1' },
  { id: 'claude-sonnet-4.6', name: 'Claude 4.6 Sonnet' },
];
