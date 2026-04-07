"use client";

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { Extension } from "@tiptap/core";
import Link from '@tiptap/extension-link';
import StarterKit from "@tiptap/starter-kit";
import { ListItem } from "@tiptap/extension-list-item";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { useEffect, useImperativeHandle, forwardRef, useRef, type MutableRefObject } from 'react';
import { CustomImage, imageDeleteRef, imageErrorRef, PLACEHOLDER_PREFIX } from '@/lib/customImage';
import MentionList, {
  type MentionItem,
  type MentionListHandle,
} from "./MentionList";

// Inserts a trailing space after any paste so the cursor escapes the link node.
const TrailingSpaceAfterPaste = Extension.create({
  name: "trailingSpaceAfterPaste",
  addProseMirrorPlugins() {
    const ext = this;
    return [
      new Plugin({
        props: {
          handlePaste: () => {
            setTimeout(() => {
              ext.editor.chain().focus().insertContent(" ").run();
            }, 0);
            return false;
          },
        },
      }),
    ];
  },
});

const codeFenceRe = /^```([a-z]*)$/;

// Handles Enter on a line matching ```.
//  - If a matching opening ``` exists above → wraps intervening paragraphs into
//    a codeBlock (closing-fence behaviour).
//  - Otherwise → clears the backticks and converts the paragraph to an empty
//    codeBlock (opening-fence behaviour).
//
// Uses a high-priority ProseMirror plugin so it fires before the list-item
// Enter handler that would otherwise split the list item.
const CodeFenceShortcut = Extension.create({
  name: "codeFenceShortcut",
  priority: 200,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("codeFenceShortcut"),
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== "Enter") return false;

            const { state } = view;
            const { $from, empty } = state.selection;
            if (!empty) return false;

            const node = $from.parent;
            if (node.type.name !== "paragraph") return false;

            const text = node.textContent;
            const match = text.match(codeFenceRe);
            if (!match) return false;

            const parent = $from.node(-1);
            const myIndex = $from.index(-1);

            // Try closing-fence: search backward for an opening ```
            for (
              let i = myIndex - 1;
              i >= 0 && i >= myIndex - 100;
              i--
            ) {
              const sibling = parent.child(i);
              if (sibling.type.name !== "paragraph") break;
              const m = sibling.textContent.match(codeFenceRe);
              if (m) {
                // Found opening fence → collect content lines between fences
                const language = m[1] || "";
                const lines: string[] = [];
                for (let j = i + 1; j < myIndex; j++) {
                  lines.push(parent.child(j).textContent);
                }
                const codeContent = lines.join("\n");

                // Calculate document range spanning opening → closing paragraphs
                let rangeStart = $from.start(-1);
                for (let k = 0; k < i; k++)
                  rangeStart += parent.child(k).nodeSize;
                let rangeEnd = rangeStart;
                for (let k = i; k <= myIndex; k++)
                  rangeEnd += parent.child(k).nodeSize;

                const codeBlockNode =
                  state.schema.nodes.codeBlock.create(
                    { language: language || null },
                    codeContent
                      ? state.schema.text(codeContent)
                      : null,
                  );

                view.dispatch(
                  state.tr.replaceWith(
                    rangeStart,
                    rangeEnd,
                    codeBlockNode,
                  ),
                );
                return true;
              }
            }

            // No opening fence found → opening-fence: create empty code block
            const language = match[1] || "";
            const { tr } = state;
            const start = $from.start();
            const end = $from.end();
            if (end > start) tr.delete(start, end);
            tr.setBlockType(
              tr.mapping.map(start),
              tr.mapping.map(start),
              state.schema.nodes.codeBlock,
              { language: language || null },
            );
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMarkdown(editor: { storage: any }): string {
  return editor.storage.markdown.getMarkdown();
}

/** Upload an image file: insert placeholder → upload → replace with real URL (or remove on failure). */
function uploadAndInsert(
  file: File,
  upload: (file: File) => Promise<string>,
  editorRef: MutableRefObject<Editor | null>,
  pos?: number,
) {
  const editor = editorRef.current;
  if (!editor) return;

  const placeholderSrc = `${PLACEHOLDER_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const placeholderContent = { type: 'image' as const, attrs: { src: placeholderSrc, alt: 'Uploading…' } };

  // Use Tiptap's insertContentAt which properly handles block insertion at any position
  if (pos != null) {
    // If dropping on an existing image (atomic block), insert after it instead
    const nodeAt = editor.state.doc.nodeAt(pos);
    const insertPos = nodeAt?.type.name === 'image' ? pos + nodeAt.nodeSize : pos;
    editor.chain().insertContentAt(insertPos, placeholderContent).run();
  } else {
    editor.chain().insertContent(placeholderContent).run();
  }

  upload(file)
    .then(url => {
      const ed = editorRef.current;
      if (!ed) return;
      // Find the placeholder node and replace its src with the real URL
      ed.state.doc.descendants((node, nodePos) => {
        if (node.type.name === 'image' && node.attrs.src === placeholderSrc) {
          ed.chain().setNodeSelection(nodePos).updateAttributes('image', { src: url, alt: '' }).run();
          return false;
        }
      });
    })
    .catch((err) => {
      console.error('Image upload failed:', err);
      const ed = editorRef.current;
      if (!ed) return;
      // Remove the placeholder node
      ed.state.doc.descendants((node, nodePos) => {
        if (node.type.name === 'image' && node.attrs.src === placeholderSrc) {
          const tr = ed.state.tr.delete(nodePos, nodePos + node.nodeSize);
          ed.view.dispatch(tr);
          return false;
        }
      });
      imageErrorRef.current?.(err instanceof Error ? err.message : 'Image upload failed');
    });
}

/** ProseMirror plugin that uploads dropped/pasted images and inserts them inline at the cursor. */
function createImageUploadPlugin(
  uploadRef: MutableRefObject<((file: File) => Promise<string>) | undefined>,
  editorRef: MutableRefObject<Editor | null>,
) {
  return new Plugin({
    props: {
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(f =>
          f.type.startsWith('image/'),
        );
        if (!files.length) return false;

        const upload = uploadRef.current;
        if (!upload) return false;

        event.preventDefault();

        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const dropPos = coords?.pos;

        for (const file of files) {
          uploadAndInsert(file, upload, editorRef, dropPos);
        }

        return true;
      },
      handlePaste(_view, event) {
        const upload = uploadRef.current;
        if (!upload) return false;

        const items = Array.from(event.clipboardData?.items ?? []);
        const imageFiles = items
          .filter(i => i.type.startsWith('image/'))
          .map(i => i.getAsFile())
          .filter((f): f is File => f !== null);
        if (!imageFiles.length) return false;

        event.preventDefault();

        for (const file of imageFiles) {
          uploadAndInsert(file, upload, editorRef);
        }

        return true;
      },
    },
  });
}

export interface TiptapEditorHandle {
  insertAtCursor: (text: string) => void;
}

interface TiptapEditorProps {
  content: string;
  onUpdate: (markdown: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string>;
  onDeleteImage?: (url: string) => Promise<void>;
  onUploadError?: (msg: string) => void;
}

let fetchController: AbortController | null = null;

async function fetchMentionItems(query: string): Promise<MentionItem[]> {
  // Cancel any previous in-flight request
  if (fetchController) fetchController.abort();
  if (!query) return [];

  const controller = new AbortController();
  fetchController = controller;

  try {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`/api/org-members?${params}`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.members ?? [];
  } catch {
    // Aborted or network error
    return [];
  }
}

const CustomMention = Mention.extend({
  // Render mentions as bold linked text in the editor HTML
  renderHTML({ node, HTMLAttributes }) {
    const login = node.attrs.label ?? node.attrs.id;
    return [
      "a",
      {
        ...HTMLAttributes,
        href: `https://github.com/${login}`,
        target: "_blank",
        rel: "noopener noreferrer",
        class: "mention-node",
        "data-type": "mention",
        "data-id": node.attrs.id,
        "data-label": node.attrs.label,
      },
      `@${login}`,
    ];
  },

  // Override markdown serialization via the tiptap-markdown storage hook
  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (text: string) => void },
          node: { attrs: { id: string; label?: string } },
        ) {
          const login = node.attrs.label ?? node.attrs.id;
          state.write(`**[@${login}](https://github.com/${login})**`);
        },
        parse: {},
      },
    };
  },
});

const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  ({ content, onUpdate, placeholder, onImageUpload, onDeleteImage, onUploadError }, ref) => {
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

    const uploadRef = useRef(onImageUpload);
    useEffect(() => { uploadRef.current = onImageUpload; }, [onImageUpload]);

    const onDeleteRef = useRef(onDeleteImage);
    useEffect(() => {
      onDeleteRef.current = onDeleteImage;
      imageDeleteRef.current = onDeleteImage
        ? async (url: string) => { if (onDeleteRef.current) await onDeleteRef.current(url); }
        : undefined;
    }, [onDeleteImage]);

    const onErrorRef = useRef(onUploadError);
    useEffect(() => {
      onErrorRef.current = onUploadError;
      imageErrorRef.current = (msg: string) => onErrorRef.current?.(msg);
    }, [onUploadError]);

    // Ref to the Tiptap editor instance — used by the upload plugin for proper content insertion
    const tiptapRef = useRef<Editor | null>(null);

    // Track whether we're doing an external content reset to avoid echoing it back
    const externalUpdateRef = useRef(false);

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          dropcursor: {
            color: 'currentColor',
            width: 2,
            class: 'tiptap-drop-cursor',
          },
          listItem: false
        }),
        CustomImage,
        ListItem.extend({ content: "(paragraph | codeBlock) block*" }),
        Link.configure({
          openOnClick: true,
          autolink: true,
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
          },
        }),
        Placeholder.configure({
          placeholder: placeholder ?? "Start typing...",
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        // eslint-disable-next-line react-hooks/refs -- refs are read at event time, not during render
        Extension.create({
          name: 'imageUpload',
          addProseMirrorPlugins() {
            return [createImageUploadPlugin(uploadRef, tiptapRef)];
          },
        }),
        CustomMention.configure({
          HTMLAttributes: { class: "mention-node" },
          renderText({ node }) {
            return `@${node.attrs.label ?? node.attrs.id}`;
          },
          suggestion: {
            char: "@",
            allowSpaces: false,
            items: async ({ query }: { query: string }) => {
              return fetchMentionItems(query);
            },
            render: () => {
              let renderer: ReactRenderer<MentionListHandle> | null = null;
              let popup: HTMLDivElement | null = null;

              return {
                onStart(props) {
                  renderer = new ReactRenderer(MentionList, {
                    props: {
                      items: props.items,
                      query: props.query,
                      command: (item: MentionItem) => {
                        props.command({ id: item.login, label: item.login });
                      },
                    },
                    editor: props.editor,
                  });

                  popup = document.createElement("div");
                  popup.style.cssText = "position:fixed;z-index:9999;";
                  popup.appendChild(renderer.element);
                  document.body.appendChild(popup);

                  const rect = props.clientRect?.();
                  if (rect && popup) {
                    popup.style.left = `${rect.left}px`;
                    popup.style.top = `${rect.bottom + 4}px`;
                  }
                },
                onUpdate(props) {
                  renderer?.updateProps({
                    items: props.items,
                    query: props.query,
                    command: (item: MentionItem) => {
                      props.command({ id: item.login, label: item.login });
                    },
                  });

                  const rect = props.clientRect?.();
                  if (rect && popup) {
                    popup.style.left = `${rect.left}px`;
                    popup.style.top = `${rect.bottom + 4}px`;
                  }
                },
                onKeyDown(props) {
                  if (props.event.key === "Escape") {
                    popup?.remove();
                    popup = null;
                    renderer?.destroy();
                    renderer = null;
                    return true;
                  }
                  return renderer?.ref?.onKeyDown(props) ?? false;
                },
                onExit() {
                  popup?.remove();
                  popup = null;
                  renderer?.destroy();
                  renderer = null;
                },
              };
            },
          },
        }),
        Markdown.configure({
          tightLists: true,
          linkify: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        TrailingSpaceAfterPaste,
        CodeFenceShortcut,
      ],
      content,
      onUpdate: ({ editor }) => {
        if (externalUpdateRef.current) return;
        const md = getMarkdown(editor);
        onUpdateRef.current(md);
      },
    });

    // Keep editor ref in sync
    useEffect(() => { tiptapRef.current = editor; }, [editor]);

    // Update editor when content prop changes externally (initial load, linkify)
    useEffect(() => {
      if (!editor) return;
      const currentMd = getMarkdown(editor);
      if (content !== currentMd) {
        externalUpdateRef.current = true;
        editor.commands.setContent(content);
        externalUpdateRef.current = false;
      }
    }, [content, editor]);

    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor: (text: string) => {
          if (!editor) return;
          const textWithSpace = /\s$/.test(text) ? text : text + " ";
          editor.chain().focus().insertContent(textWithSpace).run();
        },
      }),
      [editor],
    );

    return (
      <EditorContent
        editor={editor}
        className="tiptap-editor flex-1 w-full overflow-auto"
      />
    );
  },
);

TiptapEditor.displayName = "TiptapEditor";
export default TiptapEditor;
