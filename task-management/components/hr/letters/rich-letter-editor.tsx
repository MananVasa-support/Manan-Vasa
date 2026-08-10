"use client";

/**
 * RICH LETTER EDITOR — the "Edit freely" Google-Docs style TipTap editor that
 * lives INSIDE the frozen Altus letterhead frame.
 *
 * ⚠️ WEBPACK-HANG RULE (critical, do not break): EVERY `@tiptap/*` import lives
 * in THIS ONE "use client" leaf. The parent imports it ONLY through
 * `next/dynamic(() => import(...), { ssr:false })`. Never import this file from a
 * server component or a shared module — it is a pure client leaf.
 *
 * The editable ProseMirror surface is rendered as the child of <Letterhead>, so
 * the HR user types directly within the real A4 letterhead (header ribbon +
 * footer address bar frozen around the body). A premium, keyboard-accessible
 * Google-Docs style toolbar sits above the sheet and is excluded from print.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Extension, Mark, mergeAttributes, type CommandProps } from "@tiptap/core";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextAlign } from "@tiptap/extension-text-align";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import {
  Undo2,
  Redo2,
  Printer,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Baseline,
  Highlighter,
  Link as LinkIcon,
  ImagePlus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  RemoveFormatting,
  Minus,
  Plus,
  Loader2,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Quote,
  SeparatorHorizontal,
  Table as TableIcon,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  PanelTopClose,
  Rows3 as LineHeightIcon,
} from "lucide-react";

import { Letterhead } from "@/components/hr/letterhead/letterhead";
import { uploadLetterImage } from "@/app/(app)/hr/candidate-actions";
import { fireToast } from "@/lib/toast";

/* ------------------------------------------------------------------ */
/* Custom marks / extensions (kept inline — no extra deps)              */
/* ------------------------------------------------------------------ */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    altusTextStyleExtras: {
      /** Set an inline font-size (e.g. "12px"). */
      setFontSize: (size: string) => ReturnType;
      /** Clear the inline font-size. */
      unsetFontSize: () => ReturnType;
      /** Set a highlight (background) colour on the selection. */
      setHighlightColor: (color: string) => ReturnType;
      /** Clear the highlight (background) colour. */
      unsetHighlightColor: () => ReturnType;
    };
  }
}

/**
 * A tiny mark that piggy-backs on the `textStyle` mark to add `fontSize` +
 * `backgroundColor` inline styles — avoids pulling in @tiptap/extension-font-size
 * or @tiptap/extension-highlight as separate deps.
 */
const TextStyleExtras = Extension.create({
  name: "textStyleExtras",
  addOptions() {
    return { types: ["textStyle"] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
          backgroundColor: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.backgroundColor
                ? { style: `background-color: ${attrs.backgroundColor}` }
                : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).run(),
      setHighlightColor:
        (color: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { backgroundColor: color }).run(),
      unsetHighlightColor:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { backgroundColor: null }).run(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    altusIndent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const INDENT_STEP = 32; // px per indent level
const MAX_INDENT = 8;

/** Paragraph / heading left-indent via a numeric `indent` node attribute. */
const Indent = Extension.create({
  name: "altusIndent",
  addOptions() {
    return { types: ["paragraph", "heading"] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el: HTMLElement) => {
              const ml = parseInt(el.style.marginLeft || "0", 10);
              return ml ? Math.min(Math.round(ml / INDENT_STEP), MAX_INDENT) : 0;
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const level = Number(attrs.indent) || 0;
              return level > 0
                ? { style: `margin-left: ${level * INDENT_STEP}px` }
                : {};
            },
          },
        },
      },
    ];
  },
  addCommands() {
    const types = this.options.types;
    const shift =
      (dir: 1 | -1) =>
      ({ state, tr, dispatch }: CommandProps) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!types.includes(node.type.name)) return;
          const cur = Number(node.attrs.indent) || 0;
          const next = Math.max(0, Math.min(MAX_INDENT, cur + dir));
          if (next !== cur) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            changed = true;
          }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    return {
      indent: () => shift(1),
      outdent: () => shift(-1),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    altusLineHeight: {
      /** Set a `line-height` on the selected paragraphs / headings. */
      setLineHeight: (value: string) => ReturnType;
      /** Clear the `line-height` (back to the frame default). */
      unsetLineHeight: () => ReturnType;
    };
  }
}

/**
 * Line spacing via a numeric `line-height` node attribute on paragraphs +
 * headings — mirrors the `Indent` extension pattern (a global attribute whose
 * renderHTML emits an inline `style`, which `mergeAttributes` concatenates with
 * indent's margin-left + text-align cleanly). The toolbar offers 1.0 / 1.15 /
 * 1.5 / 2.0.
 */
const LineHeight = Extension.create({
  name: "altusLineHeight",
  addOptions() {
    return { types: ["paragraph", "heading"] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => el.style.lineHeight || null,
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    const types = this.options.types;
    const apply =
      (value: string | null) =>
      ({ state, tr, dispatch }: CommandProps) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!types.includes(node.type.name)) return;
          if ((node.attrs.lineHeight ?? null) !== value) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: value });
            changed = true;
          }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    return {
      setLineHeight: (value: string) => apply(value),
      unsetLineHeight: () => apply(null),
    };
  },
});

/**
 * A mark that PRESERVES the empty-field placeholder spans carried over from the
 * structured → rich seed (`<span class="letter-field-empty" data-field-id="…">`).
 * Without it, TipTap's DOM parser would drop the unknown class-only span on
 * `setContent`, so the highlighted "[Field]" marker (styled by `.rle-prose
 * .letter-field-empty` here, and by the matching CSS on every preview + PDF
 * surface) would silently flatten into plain body text. Non-inclusive so typing
 * immediately after a marker does NOT extend the placeholder styling.
 */
const FieldPlaceholder = Mark.create({
  name: "fieldPlaceholder",
  inclusive: false,
  addAttributes() {
    return {
      fieldId: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-field-id"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.fieldId ? { "data-field-id": String(attrs.fieldId) } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span.letter-field-empty" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "letter-field-empty" }), 0];
  },
});

/** Image node that also persists a `data-path` attribute (the stored value). */
const ImageWithPath = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      dataPath: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-path"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.dataPath ? { "data-path": String(attrs.dataPath) } : {},
      },
    };
  },
});

/* ------------------------------------------------------------------ */
/* Toolbar building blocks                                              */
/* ------------------------------------------------------------------ */

const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Letterhead", value: "" }, // "" → unset → inherits the serif frame
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Garamond", value: '"EB Garamond", Garamond, serif' },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", value: "Calibri, Candara, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Courier New", value: '"Courier New", monospace' },
];

const TEXT_COLORS = [
  "#111114", "#374151", "#6b7280", "#E10600", "#A80400",
  "#b45309", "#047857", "#1d4ed8", "#6d28d9", "#be185d",
];

const HIGHLIGHTS = [
  "#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e9d5ff",
];

/** Block-type (paragraph vs heading) options for the Style dropdown. */
const BLOCK_TYPES: { label: string; value: string }[] = [
  { label: "Normal text", value: "p" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
];

/** Line-spacing options for the line-height dropdown. */
const LINE_HEIGHTS: { label: string; value: string }[] = [
  { label: "Single", value: "" }, // "" → unset → the frame default
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
];

interface ToolButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}

function ToolButton({ onClick, active, disabled, label, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`rle-btn${active ? " is-active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="rle-sep" aria-hidden />;
}

/* ------------------------------------------------------------------ */
/* Public component                                                     */
/* ------------------------------------------------------------------ */

export interface RichLetterEditorProps {
  /** Paying entity that brands the letterhead frame. */
  entity: string;
  /** Seed HTML (from templateToRichHtml or a stored RichLetterDoc). */
  initialHtml: string;
  /** Fired on every edit with the current editor.getHTML(). */
  onChange?: (html: string) => void;
  /** Called once the editor is ready with a stable getter for the HTML. */
  onReady?: (getHtml: () => string) => void;
}

export function RichLetterEditor({
  entity,
  initialHtml,
  onChange,
  onReady,
}: RichLetterEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const seededRef = useRef<string>("");

  const editor = useEditor({
    immediatelyRender: false, // required for Next SSR
    extensions: [
      StarterKit.configure({
        // StarterKit v3 bundles Underline + Link; disable to add our own configs.
        underline: false,
        link: false,
      }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      TextStyleExtras,
      Indent,
      LineHeight,
      FieldPlaceholder,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      ImageWithPath.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "rle-table" } }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: "rle-prose",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Letter body",
      },
    },
    onUpdate: ({ editor: ed }) => onChange?.(ed.getHTML()),
  });

  // Seed / reseed content when the initialHtml prop changes identity.
  useEffect(() => {
    if (!editor) return;
    if (seededRef.current === initialHtml) return;
    seededRef.current = initialHtml;
    // Avoid clobbering while the user is actively editing the same seed.
    if (editor.getHTML() !== initialHtml) {
      editor.commands.setContent(initialHtml, { emitUpdate: false });
    }
  }, [editor, initialHtml]);

  // Expose a stable getHtml() once ready.
  useEffect(() => {
    if (editor && onReady) onReady(() => editor.getHTML());
  }, [editor, onReady]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null;
      const ts = ed.getAttributes("textStyle");
      const blockType = ed.isActive("heading", { level: 1 })
        ? "h1"
        : ed.isActive("heading", { level: 2 })
          ? "h2"
          : ed.isActive("heading", { level: 3 })
            ? "h3"
            : "p";
      const lineHeight =
        (ed.getAttributes("paragraph").lineHeight as string) ||
        (ed.getAttributes("heading").lineHeight as string) ||
        "";
      return {
        bold: ed.isActive("bold"),
        italic: ed.isActive("italic"),
        underline: ed.isActive("underline"),
        subscript: ed.isActive("subscript"),
        superscript: ed.isActive("superscript"),
        blockquote: ed.isActive("blockquote"),
        bulletList: ed.isActive("bulletList"),
        orderedList: ed.isActive("orderedList"),
        link: ed.isActive("link"),
        inTable: ed.isActive("table"),
        blockType,
        lineHeight,
        alignLeft: ed.isActive({ textAlign: "left" }),
        alignCenter: ed.isActive({ textAlign: "center" }),
        alignRight: ed.isActive({ textAlign: "right" }),
        alignJustify: ed.isActive({ textAlign: "justify" }),
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
        fontFamily: (ts.fontFamily as string) ?? "",
        fontSize: parseInt((ts.fontSize as string) ?? "", 10) || 11,
      };
    },
  });

  const insertImageClick = useCallback(() => fileInputRef.current?.click(), []);

  const onFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-selecting the same file later
      if (!file || !editor) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await uploadLetterImage(fd);
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        editor
          .chain()
          .focus()
          .setImage({ src: res.signedUrl, alt: file.name, dataPath: res.path } as {
            src: string;
            alt?: string;
            dataPath?: string;
          })
          .run();
      } catch (err) {
        fireToast({
          message: `Image upload failed: ${(err as Error)?.message ?? "unknown error"}`,
          type: "error",
        });
      } finally {
        setUploading(false);
      }
    },
    [editor],
  );

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = (editor.getAttributes("link").href as string) ?? "";
    const url = window.prompt("Link URL", prev);
    if (url === null) return; // cancelled
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  }, [editor]);

  const stepFont = useCallback(
    (dir: 1 | -1) => {
      if (!editor || !state) return;
      const next = Math.max(6, Math.min(96, state.fontSize + dir));
      editor.chain().focus().setFontSize(`${next}px`).run();
    },
    [editor, state],
  );

  const setFont = useCallback(
    (value: string) => {
      if (!editor) return;
      if (value === "") editor.chain().focus().unsetFontFamily().run();
      else editor.chain().focus().setFontFamily(value).run();
    },
    [editor],
  );

  const setBlockType = useCallback(
    (value: string) => {
      if (!editor) return;
      const chain = editor.chain().focus();
      if (value === "p") chain.setParagraph().run();
      else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
    },
    [editor],
  );

  const setLineHeight = useCallback(
    (value: string) => {
      if (!editor) return;
      if (value === "") editor.chain().focus().unsetLineHeight().run();
      else editor.chain().focus().setLineHeight(value).run();
    },
    [editor],
  );

  const clearFormatting = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .unsetAllMarks()
      .unsetFontSize()
      .unsetHighlightColor()
      .unsetColor()
      .unsetFontFamily()
      .clearNodes()
      .run();
  }, [editor]);

  return (
    <div className="rle-root">
      <style>{RLE_CSS}</style>

      {/* ── TOOLBAR (never prints) ─────────────────────────────── */}
      <div className="rle-toolbar no-print" role="toolbar" aria-label="Formatting">
        <ToolButton
          label="Undo (Ctrl+Z)"
          disabled={!state?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 size={17} />
        </ToolButton>
        <ToolButton
          label="Redo (Ctrl+Y)"
          disabled={!state?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 size={17} />
        </ToolButton>
        <ToolButton label="Print" onClick={() => window.print()}>
          <Printer size={17} />
        </ToolButton>

        <Sep />

        {/* Paragraph style (Normal / Heading 1–3) */}
        <select
          className="rle-select rle-select--style"
          aria-label="Paragraph style"
          value={state?.blockType ?? "p"}
          onChange={(e) => setBlockType(e.target.value)}
        >
          {BLOCK_TYPES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        {/* Font family */}
        <select
          className="rle-select"
          aria-label="Font family"
          value={state?.fontFamily ?? ""}
          onChange={(e) => setFont(e.target.value)}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {/* Font-size stepper */}
        <div className="rle-stepper" role="group" aria-label="Font size">
          <button
            type="button"
            className="rle-btn rle-btn--tight"
            aria-label="Decrease font size"
            title="Decrease font size"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => stepFont(-1)}
          >
            <Minus size={15} />
          </button>
          <span className="rle-size" aria-live="polite">
            {state?.fontSize ?? 11}
          </span>
          <button
            type="button"
            className="rle-btn rle-btn--tight"
            aria-label="Increase font size"
            title="Increase font size"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => stepFont(1)}
          >
            <Plus size={15} />
          </button>
        </div>

        <Sep />

        <ToolButton
          label="Bold (Ctrl+B)"
          active={state?.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <BoldIcon size={17} />
        </ToolButton>
        <ToolButton
          label="Italic (Ctrl+I)"
          active={state?.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon size={17} />
        </ToolButton>
        <ToolButton
          label="Underline (Ctrl+U)"
          active={state?.underline}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={17} />
        </ToolButton>
        <ToolButton
          label="Subscript (Ctrl+,)"
          active={state?.subscript}
          onClick={() => editor?.chain().focus().toggleSubscript().run()}
        >
          <SubscriptIcon size={17} />
        </ToolButton>
        <ToolButton
          label="Superscript (Ctrl+.)"
          active={state?.superscript}
          onClick={() => editor?.chain().focus().toggleSuperscript().run()}
        >
          <SuperscriptIcon size={17} />
        </ToolButton>

        {/* Text colour */}
        <div className="rle-pop-wrap">
          <ToolButton
            label="Text colour"
            active={colorOpen}
            onClick={() => {
              setColorOpen((v) => !v);
              setHlOpen(false);
            }}
          >
            <Baseline size={17} />
          </ToolButton>
          {colorOpen && (
            <div className="rle-pop" role="menu" aria-label="Text colour">
              <div className="rle-swatches">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="rle-swatch"
                    style={{ background: c }}
                    aria-label={`Text colour ${c}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor?.chain().focus().setColor(c).run();
                      setColorOpen(false);
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                className="rle-pop-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor?.chain().focus().unsetColor().run();
                  setColorOpen(false);
                }}
              >
                Automatic
              </button>
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="rle-pop-wrap">
          <ToolButton
            label="Highlight colour"
            active={hlOpen}
            onClick={() => {
              setHlOpen((v) => !v);
              setColorOpen(false);
            }}
          >
            <Highlighter size={17} />
          </ToolButton>
          {hlOpen && (
            <div className="rle-pop" role="menu" aria-label="Highlight colour">
              <div className="rle-swatches">
                {HIGHLIGHTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="rle-swatch"
                    style={{ background: c }}
                    aria-label={`Highlight ${c}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor?.chain().focus().setHighlightColor(c).run();
                      setHlOpen(false);
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                className="rle-pop-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor?.chain().focus().unsetHighlightColor().run();
                  setHlOpen(false);
                }}
              >
                No highlight
              </button>
            </div>
          )}
        </div>

        <Sep />

        <ToolButton label="Insert link (Ctrl+K)" active={state?.link} onClick={setLink}>
          <LinkIcon size={17} />
        </ToolButton>
        <ToolButton label="Insert image" disabled={uploading} onClick={insertImageClick}>
          {uploading ? <Loader2 size={17} className="rle-spin" /> : <ImagePlus size={17} />}
        </ToolButton>

        <Sep />

        <ToolButton
          label="Align left"
          active={state?.alignLeft}
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft size={17} />
        </ToolButton>
        <ToolButton
          label="Align centre"
          active={state?.alignCenter}
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter size={17} />
        </ToolButton>
        <ToolButton
          label="Align right"
          active={state?.alignRight}
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight size={17} />
        </ToolButton>
        <ToolButton
          label="Justify"
          active={state?.alignJustify}
          onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify size={17} />
        </ToolButton>

        {/* Line spacing */}
        <div className="rle-lh" role="group" aria-label="Line spacing">
          <LineHeightIcon size={16} aria-hidden />
          <select
            className="rle-select rle-select--lh"
            aria-label="Line spacing"
            value={state?.lineHeight ?? ""}
            onChange={(e) => setLineHeight(e.target.value)}
          >
            {LINE_HEIGHTS.map((l) => (
              <option key={l.label} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <Sep />

        <ToolButton
          label="Bullet list"
          active={state?.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={17} />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={state?.orderedList}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={17} />
        </ToolButton>
        <ToolButton
          label="Decrease indent"
          onClick={() => {
            if (!editor) return;
            if (editor.isActive("listItem")) editor.chain().focus().liftListItem("listItem").run();
            else editor.chain().focus().outdent().run();
          }}
        >
          <IndentDecrease size={17} />
        </ToolButton>
        <ToolButton
          label="Increase indent"
          onClick={() => {
            if (!editor) return;
            if (editor.isActive("listItem")) editor.chain().focus().sinkListItem("listItem").run();
            else editor.chain().focus().indent().run();
          }}
        >
          <IndentIncrease size={17} />
        </ToolButton>

        <Sep />

        <ToolButton
          label="Block quote"
          active={state?.blockquote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={17} />
        </ToolButton>
        <ToolButton
          label="Horizontal line"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          <SeparatorHorizontal size={17} />
        </ToolButton>

        {/* Table insert + editing menu */}
        <div className="rle-pop-wrap">
          <ToolButton
            label={state?.inTable ? "Table tools" : "Insert table"}
            active={tableOpen || state?.inTable}
            onClick={() => {
              setTableOpen((v) => !v);
              setColorOpen(false);
              setHlOpen(false);
            }}
          >
            <TableIcon size={17} />
          </ToolButton>
          {tableOpen && (
            <div className="rle-pop rle-pop--menu" role="menu" aria-label="Table">
              {!state?.inTable ? (
                <button
                  type="button"
                  className="rle-menu-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor
                      ?.chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                      .run();
                    setTableOpen(false);
                  }}
                >
                  <TableIcon size={15} /> Insert 3 × 3 table
                </button>
              ) : (
                <>
                  <button type="button" className="rle-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().addRowBefore().run()}>
                    <ArrowUpToLine size={15} /> Insert row above
                  </button>
                  <button type="button" className="rle-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().addRowAfter().run()}>
                    <ArrowDownToLine size={15} /> Insert row below
                  </button>
                  <button type="button" className="rle-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().addColumnBefore().run()}>
                    <ArrowLeftToLine size={15} /> Insert column left
                  </button>
                  <button type="button" className="rle-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().addColumnAfter().run()}>
                    <ArrowRightToLine size={15} /> Insert column right
                  </button>
                  <div className="rle-menu-div" aria-hidden />
                  <button type="button" className="rle-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleHeaderRow().run()}>
                    <PanelTopClose size={15} /> Toggle header row
                  </button>
                  <button type="button" className="rle-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().deleteRow().run()}>
                    <Trash2 size={15} /> Delete row
                  </button>
                  <button type="button" className="rle-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().deleteColumn().run()}>
                    <Trash2 size={15} /> Delete column
                  </button>
                  <div className="rle-menu-div" aria-hidden />
                  <button type="button" className="rle-menu-item rle-menu-item--danger" onMouseDown={(e) => e.preventDefault()} onClick={() => { editor?.chain().focus().deleteTable().run(); setTableOpen(false); }}>
                    <Trash2 size={15} /> Delete table
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <Sep />

        <ToolButton label="Clear formatting" onClick={clearFormatting}>
          <RemoveFormatting size={17} />
        </ToolButton>
      </div>

      {/* hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="rle-hidden-file"
        onChange={onFilePicked}
      />

      {/* ── The frozen letterhead + editable body ──────────────── */}
      <div className="rle-page-scroll">
        <Letterhead entity={entity}>
          <EditorContent editor={editor} className="rle-editor" />
        </Letterhead>
      </div>
    </div>
  );
}

export default RichLetterEditor;

/* ------------------------------------------------------------------ */
/* Local styles                                                         */
/* ------------------------------------------------------------------ */

const RLE_CSS = `
.rle-root{
  --rle-red:var(--color-altus-red,#E10600);
  --rle-ink:#111114;
  --rle-line:rgba(15,23,42,.12);
  --rle-bg:#f4f5f7;
  display:flex;flex-direction:column;gap:16px;
}
/* Toolbar — sticky, premium Google-Docs pill bar */
.rle-toolbar{
  position:sticky;top:8px;z-index:40;
  display:flex;flex-wrap:nowrap;overflow-x:auto;align-items:center;justify-content:safe center;gap:2px;
  padding:6px 8px;
  background:rgba(255,255,255,.92);
  backdrop-filter:saturate(1.4) blur(8px);
  -webkit-backdrop-filter:saturate(1.4) blur(8px);
  border:1px solid var(--rle-line);
  border-radius:14px;
  box-shadow:0 12px 30px -20px rgba(15,23,42,.45),0 2px 6px -3px rgba(15,23,42,.18);
}
.rle-btn{
  display:inline-flex;align-items:center;justify-content:center;
  width:32px;height:32px;border-radius:8px;
  border:1px solid transparent;background:transparent;color:#374151;
  cursor:pointer;transition:background .12s ease,color .12s ease,box-shadow .12s ease;
}
.rle-btn--tight{width:26px;height:26px;border-radius:6px;}
.rle-btn:hover:not(:disabled){background:rgba(15,23,42,.06);color:var(--rle-ink);}
.rle-btn:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px color-mix(in srgb,var(--rle-red) 60%,transparent);}
.rle-btn.is-active{
  background:color-mix(in srgb,var(--rle-red) 12%,transparent);
  color:var(--rle-red);border-color:color-mix(in srgb,var(--rle-red) 26%,transparent);
}
.rle-btn:disabled{opacity:.38;cursor:default;}
.rle-sep{width:1px;height:22px;margin:0 5px;background:var(--rle-line);}
.rle-select{
  height:32px;min-width:132px;max-width:150px;padding:0 8px;
  border:1px solid var(--rle-line);border-radius:8px;background:#fff;color:var(--rle-ink);
  font-size:13px;cursor:pointer;
}
.rle-select:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px color-mix(in srgb,var(--rle-red) 55%,transparent);}
.rle-stepper{display:inline-flex;align-items:center;gap:2px;
  border:1px solid var(--rle-line);border-radius:8px;padding:2px 3px;background:#fff;}
.rle-size{min-width:24px;text-align:center;font-size:13px;font-variant-numeric:tabular-nums;color:var(--rle-ink);}
.rle-pop-wrap{position:relative;display:inline-flex;}
.rle-pop{
  position:absolute;top:calc(100% + 8px);left:0;z-index:60;
  padding:10px;background:#fff;border:1px solid var(--rle-line);border-radius:12px;
  box-shadow:0 20px 44px -22px rgba(15,23,42,.5);
}
.rle-swatches{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;}
.rle-swatch{width:22px;height:22px;border-radius:6px;border:1px solid rgba(15,23,42,.15);cursor:pointer;}
.rle-swatch:hover{transform:scale(1.08);}
.rle-swatch:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--rle-red);}
.rle-pop-clear{margin-top:8px;width:100%;padding:6px 8px;font-size:12px;
  border:1px solid var(--rle-line);border-radius:8px;background:#fafafa;color:#374151;cursor:pointer;}
.rle-pop-clear:hover{background:#f0f0f1;}
.rle-select--style{min-width:112px;max-width:132px;font-weight:600;}
.rle-select--lh{min-width:78px;max-width:96px;padding:0 6px;}
.rle-lh{display:inline-flex;align-items:center;gap:4px;color:#374151;}
/* Popover menu (table tools) */
.rle-pop--menu{padding:6px;min-width:186px;}
.rle-menu-item{display:flex;align-items:center;gap:9px;width:100%;padding:7px 9px;
  font-size:13px;color:var(--rle-ink);background:transparent;border:0;border-radius:8px;cursor:pointer;text-align:left;}
.rle-menu-item:hover{background:rgba(15,23,42,.06);}
.rle-menu-item:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px color-mix(in srgb,var(--rle-red) 55%,transparent);}
.rle-menu-item--danger{color:var(--rle-red);}
.rle-menu-item--danger:hover{background:color-mix(in srgb,var(--rle-red) 10%,transparent);}
.rle-menu-div{height:1px;margin:5px 4px;background:var(--rle-line);}
.rle-hidden-file{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);border:0;}
.rle-spin{animation:rle-spin 1s linear infinite;}
@keyframes rle-spin{to{transform:rotate(360deg);}}

/* Page scroller */
.rle-page-scroll{overflow:auto;padding:4px 0 40px;display:flex;justify-content:center;}

/* Editable ProseMirror surface — inherits the letterhead serif frame */
.rle-editor{outline:none;}
.rle-prose{outline:none;min-height:760px;}
.rle-prose:focus{outline:none;}
.rle-prose p{margin:0 0 14px;}
.rle-prose h1{font-size:26px;line-height:1.25;margin:0 0 12px;font-weight:700;}
.rle-prose h2{font-size:21px;line-height:1.3;margin:0 0 10px;font-weight:700;}
.rle-prose h3{font-size:17px;line-height:1.35;margin:0 0 8px;font-weight:700;}
/* Lists — the marker MUST be restored explicitly.
 *
 * Tailwind v4's preflight (pulled in by the tailwindcss import in globals.css)
 * ships "ol, ul, menu { list-style: none }". So Bullet list / Numbered list were
 * never broken: TipTap toggled real ul/ol markup and the buttons lit up, but
 * every marker was blanked by a global reset and the items looked like plain
 * indented paragraphs — indistinguishable from "the button does nothing".
 *
 * The PDF path (lib/hr/letters/render-rich.ts) renders in a standalone Chromium
 * document with no Tailwind, so UA defaults applied and the SAME letter printed
 * with correct bullets. That asymmetry is the fingerprint of a preflight reset,
 * not an editor bug.
 *
 * The nested levels are spelled out because one ul rule set to disc beats the
 * UA's depth-based defaults at equal specificity and would flatten every nested
 * list to the same marker — losing the visual step that Increase indent
 * (sinkListItem) exists to create. */
.rle-prose ul,.rle-prose ol{margin:0 0 14px;padding-left:26px;}
.rle-prose ul{list-style:disc outside;}
.rle-prose ul ul{list-style-type:circle;}
.rle-prose ul ul ul{list-style-type:square;}
.rle-prose ol{list-style:decimal outside;}
.rle-prose ol ol{list-style-type:lower-alpha;}
.rle-prose ol ol ol{list-style-type:lower-roman;}
.rle-prose li{margin:0 0 4px;}
/* TipTap wraps each item's content in a <p>, which would otherwise inherit the
 * 14px paragraph gap and space a tight list like loose paragraphs. */
.rle-prose li p{margin:0;}
.rle-prose li>ul,.rle-prose li>ol{margin:4px 0 0;}
.rle-prose blockquote{margin:0 0 14px;padding-left:14px;border-left:3px solid color-mix(in srgb,var(--rle-red) 55%,transparent);color:#374151;}
.rle-prose a{color:var(--rle-red);text-decoration:underline;}
.rle-prose img{max-width:100%;height:auto;border-radius:4px;}
.rle-prose img.ProseMirror-selectednode{outline:2px solid var(--rle-red);outline-offset:2px;}
.rle-prose sub,.rle-prose sup{font-size:.72em;line-height:0;}
.rle-prose hr{border:0;border-top:1px solid var(--rle-line);margin:16px 0;}
/* Tables — match the bordered/padded letter-body term-table look */
.rle-prose .rle-table,.rle-prose table{
  border-collapse:collapse;width:100%;margin:12px 0;
  font-variant-numeric:tabular-nums;table-layout:fixed;overflow:hidden;
}
.rle-prose .rle-table td,.rle-prose .rle-table th,
.rle-prose table td,.rle-prose table th{
  border:1px solid #cbd5e1;padding:7px 11px;vertical-align:top;position:relative;
  box-sizing:border-box;min-width:1em;
}
.rle-prose .rle-table th,.rle-prose table th{
  background:#f2f3f6;font-weight:700;text-align:left;color:#334155;
}
.rle-prose .rle-table p,.rle-prose table p{margin:0;}
.rle-prose .selectedCell:after{
  content:"";position:absolute;inset:0;pointer-events:none;z-index:2;
  background:color-mix(in srgb,var(--rle-red) 12%,transparent);
}
.rle-prose .column-resize-handle{
  position:absolute;right:-2px;top:0;bottom:-2px;width:4px;z-index:20;
  background:color-mix(in srgb,var(--rle-red) 60%,transparent);pointer-events:none;
}
.rle-prose.ProseMirror .tableWrapper{overflow-x:auto;margin:12px 0;}
.rle-prose .resize-cursor{cursor:col-resize;}
/* Empty fillable markers carried over from the structured seed. The
   FieldPlaceholder mark preserves the class through TipTap so this styling —
   a subtly highlighted, red-underlined "[Field]" chip — survives free-edit. */
.rle-prose .letter-field-empty{
  background:color-mix(in srgb,var(--rle-red) 8%,transparent);
  border-bottom:1px dashed color-mix(in srgb,var(--rle-red) 55%,transparent);
  color:color-mix(in srgb,var(--rle-red) 88%,#333);
  border-radius:2px;padding:0 2px;cursor:text;white-space:nowrap;
}
/* Placeholder-ish look when empty */
.rle-prose p.is-editor-empty:first-child::before{
  content:attr(data-placeholder);color:#9ca3af;float:left;height:0;pointer-events:none;
}

@media print{
  .no-print{display:none !important;}
  .rle-root{gap:0;}
  .rle-page-scroll{overflow:visible;padding:0;display:block;}
}
`;
