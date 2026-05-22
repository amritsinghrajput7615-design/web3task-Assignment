import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  disabled: boolean;
  placeholder: string;
  onSend: (text: string, isGuess: boolean) => void;
}

export function ChatPanel({ messages, disabled, placeholder, onSend }: Props) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, true);
    setText('');
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div
            key={`${msg.playerId}-${i}-${msg.text}`}
            className={`chat-msg ${msg.system ? 'system' : ''} ${msg.isGuess ? 'guess' : ''} ${msg.text.includes('guessed') ? 'correct' : ''}`}
          >
            {!msg.system && <span className="name">{msg.playerName}:</span>}
            {msg.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-row" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={80}
        />
        <button type="submit" disabled={disabled || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
