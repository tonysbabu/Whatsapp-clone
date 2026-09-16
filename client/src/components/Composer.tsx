import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useChat } from "../context/ChatContext";

export function Composer({ conversationId }: { conversationId: string }) {
  const { sendMessage, startTyping, stopTyping, networkOnline } = useChat();
  const [body, setBody] = useState("");
  const typing = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  function pingTyping() {
    if (!typing.current) {
      typing.current = true;
      startTyping(conversationId);
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      typing.current = false;
      stopTyping(conversationId);
    }, 1200);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody("");
    typing.current = false;
    stopTyping(conversationId);
    await sendMessage(conversationId, text);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        rows={1}
        value={body}
        placeholder={networkOnline ? "Type a message" : "Offline — message will send when you're back"}
        onChange={(e) => {
          setBody(e.target.value);
          pingTyping();
        }}
        onKeyDown={onKey}
      />
      <button type="submit" disabled={!body.trim()}>
        Send
      </button>
    </form>
  );
}
