import type { Editor } from "@tiptap/react";
import { useEffect, useReducer } from "react";

type BlockType = "paragraph" | "h1" | "h2" | "h3";

function currentBlock(editor: Editor): BlockType {
  for (const level of [1, 2, 3] as const) {
    if (editor.isActive("heading", { level })) return `h${level}`;
  }
  return "paragraph";
}

export function Toolbar({ editor }: { editor: Editor }) {
  // Re-render on selection/transaction so active states stay in sync.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);

  const chain = () => editor.chain().focus();

  function setBlock(value: BlockType) {
    if (value === "paragraph") chain().setParagraph().run();
    else chain().toggleHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run();
  }

  const button = (label: string, title: string, active: boolean, onClick: () => void, className = "") => (
    <button
      type="button"
      className={`tool ${active ? "active" : ""} ${className}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {button("↶", "Undo (Ctrl+Z)", false, () => chain().undo().run())}
      {button("↷", "Redo (Ctrl+Shift+Z)", false, () => chain().redo().run())}
      <span className="sep" />
      <select
        className="tool-select"
        aria-label="Text style"
        value={currentBlock(editor)}
        onChange={(e) => setBlock(e.target.value as BlockType)}
      >
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="sep" />
      {button("B", "Bold (Ctrl+B)", editor.isActive("bold"), () => chain().toggleBold().run(), "bold")}
      {button("I", "Italic (Ctrl+I)", editor.isActive("italic"), () => chain().toggleItalic().run(), "italic")}
      {button("U", "Underline (Ctrl+U)", editor.isActive("underline"), () => chain().toggleUnderline().run(), "underline")}
      {button("S", "Strikethrough", editor.isActive("strike"), () => chain().toggleStrike().run(), "strike")}
      <span className="sep" />
      {button("• List", "Bulleted list", editor.isActive("bulletList"), () => chain().toggleBulletList().run())}
      {button("1. List", "Numbered list", editor.isActive("orderedList"), () => chain().toggleOrderedList().run())}
      {button("❝", "Quote", editor.isActive("blockquote"), () => chain().toggleBlockquote().run())}
      {button("</>", "Code block", editor.isActive("codeBlock"), () => chain().toggleCodeBlock().run())}
    </div>
  );
}
