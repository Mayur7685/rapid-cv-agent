import React, { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, Cpu, Check, Edit2, Tag, X, Sparkles } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api';

// ── NLP class extraction from natural language ────────────────────────────────
function extractClasses(text) {
  // Remove common filler phrases
  const cleaned = text
    .replace(/i want to detect|detect|find|identify|recognize|look for|spot|locate|track/gi, '')
    .replace(/\bin\b|\bon\b|\bat\b|\ba\b|\ban\b|\bthe\b|\band\b|\bor\b|\bwith\b|\busing\b/gi, ',')
    .replace(/[.!?]/g, ',');

  const parts = cleaned
    .split(/[,\n]/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 1 && s.length < 40);

  // Deduplicate + sanitize
  const seen = new Set();
  const classes = [];
  for (const p of parts) {
    const clean = p.replace(/[^a-z0-9 \-_]/g, '').trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      classes.push(clean);
    }
  }
  return classes.slice(0, 8); // max 8 classes
}

// ── Conversation script ───────────────────────────────────────────────────────
const STEPS = {
  GREET:      'greet',
  ASK_GOAL:   'ask_goal',
  CONFIRM:    'confirm',
  ASK_NAME:   'ask_name',
  READY:      'ready',
};

// Simulate typing delay for AI messages
function useTypingEffect(text, speed = 22) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text]);

  return { displayed, done };
}

// ── Individual Message Component ──────────────────────────────────────────────
function AiMessage({ text, isTyping = false }) {
  const { displayed, done } = useTypingEffect(isTyping ? text : '');
  const content = isTyping ? displayed : text;

  return (
    <div className="chat-message flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-md">
        <Cpu className="w-4 h-4 text-white" />
      </div>
      <div className="chat-bubble-ai">
        {content}
        {isTyping && !done && <span className="typing-cursor" />}
      </div>
    </div>
  );
}

function UserMessage({ text }) {
  return (
    <div className="chat-message flex items-start gap-3 justify-end">
      <div className="chat-bubble-user">{text}</div>
      <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">U</span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="chat-message flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-md">
        <Cpu className="w-4 h-4 text-white" />
      </div>
      <div className="chat-bubble-ai py-3 px-4">
        <div className="typing-dots flex items-center gap-1">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

// ── Main Chat Onboarding ──────────────────────────────────────────────────────
export default function ChatOnboarding({ onComplete, onCancel }) {
  const [messages, setMessages] = useState([]);
  const [step, setStep] = useState(STEPS.GREET);
  const [input, setInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);

  // Extracted data
  const [detectedClasses, setDetectedClasses] = useState([]);
  const [editingClasses, setEditingClasses] = useState(false);
  const [newClassInput, setNewClassInput] = useState('');
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const greetedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages, isAiTyping]);

  // Start conversation immediately
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    setTimeout(() => {
      addAiMessage("Hi! 👋 I'll help you build a custom computer vision model. What do you want to detect?", true);
      setStep(STEPS.ASK_GOAL);
    }, 400);
  }, []);

  const addAiMessage = (text, isFirst = false) => {
    if (!isFirst) setIsAiTyping(false);
    setMessages(prev => [...prev, { role: 'ai', text, isTyping: isFirst || !isFirst }]);
  };

  const addUserMessage = (text) => {
    setMessages(prev => [...prev, { role: 'user', text }]);
  };

  const showAiTyping = (delay, cb) => {
    setIsAiTyping(true);
    setTimeout(() => {
      setIsAiTyping(false);
      cb();
    }, delay);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isAiTyping || creating) return;
    setInput('');

    if (step === STEPS.ASK_GOAL) {
      addUserMessage(text);
      setIsAiTyping(true);
      try {
        const res = await fetch(`${API_BASE}/projects/nlp/extract-classes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error("NLP extraction failed");
        const data = await res.json();
        const classes = data.classes || [];
        setDetectedClasses(classes);

        setIsAiTyping(false);
        if (classes.length === 0) {
          addAiMessage("Hmm, I couldn't identify specific object classes. Could you be more specific? For example: 'detect helmets and safety vests'");
        } else {
          addAiMessage(
            `Got it! I found these object classes:\n${classes.map(c => `• ${c}`).join('\n')}\n\nI'll use Grounding DINO to automatically find them in your images. Does this look right?`
          );
          setStep(STEPS.CONFIRM);
        }
      } catch (e) {
        setIsAiTyping(false);
        addAiMessage("Hmm, I encountered a connection issue analyzing that text. Let's try describing the target objects in a different way.");
      }

    } else if (step === STEPS.ASK_NAME) {
      addUserMessage(text);
      setProjectName(text);
      showAiTyping(600, () => {
        addAiMessage(`Perfect! "${text}" is ready. Let's move on to uploading your images — I'll take care of the annotation automatically.`);
        setStep(STEPS.READY);
        // Auto-proceed after 1.5s
        setTimeout(() => handleCreateProject(text, detectedClasses), 1800);
      });
    }
  };

  const handleConfirmClasses = () => {
    addUserMessage('Yes, continue ✓');
    showAiTyping(700, () => {
      addAiMessage(`Great! Now give your project a name. Something like "Helmet Detection" or "Safety Vest Monitor".`);
      setStep(STEPS.ASK_NAME);
      setTimeout(() => inputRef.current?.focus(), 100);
    });
  };

  const handleCreateProject = async (name, classes) => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || projectName, classes: classes || detectedClasses })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onComplete(data.id, data.name, data.classes);
    } catch (e) {
      setError('Failed to create project. Is the backend running?');
      setCreating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAddClass = () => {
    const c = newClassInput.trim().toLowerCase();
    if (c && !detectedClasses.includes(c)) {
      setDetectedClasses(prev => [...prev, c]);
    }
    setNewClassInput('');
  };

  const handleRemoveClass = (cls) => {
    setDetectedClasses(prev => prev.filter(c => c !== cls));
  };

  const suggestionPhrases = [
    'I want to detect helmets and safety vests',
    'Find cars and trucks on the road',
    'Detect cracks and defects in pipes',
    'Identify fire and smoke in images',
  ];

  return (
    <div className="theme-light flex flex-col min-h-[calc(100vh-48px)]">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-6 gap-4">

        {/* Back button */}
        <button
          onClick={onCancel}
          className="self-start flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
        </button>

        {/* Chat window */}
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((msg, i) => (
            msg.role === 'ai'
              ? <AiMessage key={i} text={msg.text} isTyping={msg.isTyping} />
              : <UserMessage key={i} text={msg.text} />
          ))}

          {isAiTyping && <TypingIndicator />}

          {/* Class confirmation widget */}
          {step === STEPS.CONFIRM && !isAiTyping && detectedClasses.length > 0 && (
            <div className="chat-message animate-slideInUp ml-11">
              <div className="bg-white border border-purple-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Detected Classes
                  </span>
                  <button
                    onClick={() => setEditingClasses(!editingClasses)}
                    className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition-colors font-semibold"
                  >
                    <Edit2 className="w-3 h-3" />
                    {editingClasses ? 'Done' : 'Edit'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {detectedClasses.map(cls => (
                    <span
                      key={cls}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-sm font-semibold text-purple-700"
                    >
                      <span className="w-2 h-2 rounded-full bg-purple-400" />
                      {cls}
                      {editingClasses && (
                        <button onClick={() => handleRemoveClass(cls)} className="ml-0.5 text-purple-400 hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {editingClasses && (
                  <div className="flex gap-2 mb-4">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-purple-200 rounded-xl bg-purple-50/50">
                      <Tag className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={newClassInput}
                        onChange={e => setNewClassInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddClass()}
                        placeholder="Add class..."
                        className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder-gray-400"
                      />
                    </div>
                    <button
                      onClick={handleAddClass}
                      className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmClasses}
                    disabled={detectedClasses.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#7c3aed] text-white rounded-xl text-sm font-bold hover:bg-[#6d28d9] transition-colors disabled:opacity-50 shadow-md shadow-purple-500/20"
                  >
                    <Check className="w-4 h-4" />
                    Yes, continue
                  </button>
                  <button
                    onClick={() => {
                      setStep(STEPS.ASK_GOAL);
                      setMessages(prev => prev.filter((_, i) => i === 0));
                      setDetectedClasses([]);
                    }}
                    className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Creating spinner */}
          {step === STEPS.READY && creating && (
            <div className="chat-message animate-slideInUp ml-11 flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 border border-purple-200 rounded-2xl text-sm font-semibold text-purple-700">
                <Sparkles className="w-4 h-4 animate-pulse" />
                Creating your project...
              </div>
            </div>
          )}

          {error && (
            <div className="ml-11 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">
              ⚠ {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion chips (only on first step) */}
        {step === STEPS.ASK_GOAL && messages.length <= 1 && !isAiTyping && (
          <div className="flex flex-wrap gap-2">
            {suggestionPhrases.map((phrase) => (
              <button
                key={phrase}
                onClick={() => { setInput(phrase); setTimeout(() => inputRef.current?.focus(), 0); }}
                className="px-3 py-2 bg-white border border-purple-100 rounded-full text-xs text-gray-600 hover:border-purple-300 hover:text-purple-700 transition-all font-medium shadow-sm"
              >
                {phrase}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        {(step === STEPS.ASK_GOAL || step === STEPS.ASK_NAME) && (
          <div className="chat-input-bar">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                step === STEPS.ASK_GOAL
                  ? 'Describe what you want to detect...'
                  : 'Enter a project name...'
              }
              disabled={isAiTyping || creating}
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isAiTyping || creating}
              className="w-9 h-9 bg-[#7c3aed] disabled:bg-purple-300 text-white rounded-full flex items-center justify-center transition-all hover:bg-[#6d28d9] active:scale-95 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
