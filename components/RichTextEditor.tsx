"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import Highlight from "@tiptap/extension-highlight"
import { Button } from "@/components/ui/button"
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Highlighter, 
  List, ListOrdered, Heading2, Heading3, Link as LinkIcon, RemoveFormatting, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Quote, Minus, Undo, Redo, GripVertical
} from "lucide-react"

export default function RichTextEditor({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "text-indigo-600 dark:text-indigo-400 underline" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    onUpdate: ({ editor }) => { onChange(editor.getHTML()) },
    editorProps: {
      attributes: {
        class: "prose dark:prose-invert max-w-none p-4 focus:outline-none min-h-[150px] overflow-y-auto"
      }
    }
  })

  if (!editor) return null

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href
    const url = window.prompt("URL", previousUrl)
    if (url === null) return
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  const btnClass = (isActive: boolean) => `h-8 w-8 p-0 ${isActive ? "bg-slate-200 dark:bg-slate-800 text-indigo-600" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`
  const sep = <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

  return (
    <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("highlight"))} onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter className="h-4 w-4" /></Button>
        
        {sep}
        
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Button>
        
        {sep}
        
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive({ textAlign: "left" }))} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive({ textAlign: "center" }))} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive({ textAlign: "right" }))} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive({ textAlign: "justify" }))} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify className="h-4 w-4" /></Button>
        
        {sep}
        
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Button>
        
        {sep}
        
        <Button type="button" size="icon" variant="ghost" className={btnClass(editor.isActive("link"))} onClick={setLink}><LinkIcon className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => editor.chain().focus().unsetAllMarks().run()}><RemoveFormatting className="h-4 w-4" /></Button>
        
        <div className="flex-1" />
        
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo className="h-4 w-4" /></Button>
      </div>
      
      {/* Editor Area (Native CSS Resize) */}
      <div className="resize-y overflow-y-auto bg-white dark:bg-slate-950" style={{ minHeight: "150px", height: "200px" }}>
        <EditorContent editor={editor} />
      </div>
      
      {/* Drag Handle Indicator */}
      <div className="flex items-center justify-center py-1 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 cursor-ns-resize">
        <GripVertical className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  )
}