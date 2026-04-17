import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import InlineImageView from '../components/InlineImageView';

/** Prefix used for placeholder image src while upload is in progress. */
export const PLACEHOLDER_PREFIX = 'data:placeholder/';

/** Shared ref for the image-delete callback so the NodeView can call it without mutating editor storage. */
export const imageDeleteRef: { current?: (url: string) => Promise<void> } = { current: undefined };

/** Shared ref for the upload-error callback. */
export const imageErrorRef: { current?: (msg: string) => void } = { current: undefined };

export const CustomImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InlineImageView);
  },
});
