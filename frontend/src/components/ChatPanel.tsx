import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  disabled: boolean;
  placeholder: string;
  myId: string;
  onSend: (text: string, isGuess: boolean) => void;
  logTitle?: string;
}

export function ChatPanel({ messages, disabled, placeholder, myId, onSend, logTitle }: Props) {
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
      {logTitle && (
        <div className="chat-log-header">
          <span className="chat-log-dot" aria-hidden />
          <span className="chat-log-title">{logTitle}</span>
        </div>
      )}
      <div className="chat-messages">
        {messages.map((msg, i) => {
          const isMyCorrect = msg.isCorrect && msg.playerId === myId;
          const classNames = [
            'chat-msg',
            msg.system ? 'system' : '',
            msg.isGuess && !msg.isCorrect ? 'guess' : '',
            msg.isCorrect ? 'correct-guess' : '',
            msg.wordMissed ? 'missed-word' : '',
            isMyCorrect ? 'my-correct' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={`${msg.playerId}-${i}-${msg.text}`} className={classNames}>
              {msg.isCorrect ? (
                <div className="correct-guess-content">
                  <span className="name">{msg.playerName}</span>
                  <span className="correct-label">guessed correctly!</span>
                  <span className="points-badge">+{msg.points} pts</span>
                  {/* ✅ maskedWord shows "____" — msg.text is never rendered here */}
                  {msg.maskedWord && (
                    <span className="guess-word">"{msg.maskedWord}"</span>
                  )}
                </div>
              ) : msg.wordMissed && msg.revealedWord ? (
                <div className="missed-word-content">
                  <span>{msg.text}</span>
                  <span className="word-reveal-missed">{msg.revealedWord}</span>
                </div>
              ) : (
                <>
                  {!msg.system && <span className="name">{msg.playerName}:</span>}
                  {msg.text}
                </>
              )}
            </div>
          );
        })}
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