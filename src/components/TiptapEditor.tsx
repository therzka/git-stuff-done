"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { useEffect, useImperativeHandle, forwardRef, useRef } from "react";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMarkdown(editor: { storage: any }): string {
  return editor.storage.markdown.getMarkdown();
}

export interface TiptapEditorHandle {
  insertAtCursor: (text: string) => void;
}

interface TiptapEditorProps {
  content: string;
  onUpdate: (markdown: string) => void;
  placeholder?: string;
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
  ({ content, onUpdate, placeholder }, ref) => {
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => {
      onUpdateRef.current = onUpdate;
    }, [onUpdate]);
    // Track whether we're doing an external content reset to avoid echoing it back
    const externalUpdateRef = useRef(false);

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit,
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
      ],
      content,
      onUpdate: ({ editor }) => {
        if (externalUpdateRef.current) return;
        const md = getMarkdown(editor);
        onUpdateRef.current(md);
      },
    });

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
