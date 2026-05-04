/**
 * VAULTEX — AI Portfolio Assistant
 * chatbot.js  |  Powered by Groq (llama-3.3-70b-versatile)
 *
 * HOW TO USE:
 * 1. Paste your Groq API key below (GROQ_API_KEY).
 *    Get one free at https://console.groq.com/
 * 2. Include this file at the bottom of index.html:
 *       <script src="chatbot.js"></script>
 */

/* ── CONFIG ─────────────────────────────────────────────────── */
const GROQ_API_KEY  = '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'; // ← your Groq key
const GROQ_MODEL    = 'llama-3.3-70b-versatile';  // fast & capable; change to 'mixtral-8x7b-32768' if preferred
const MAX_HISTORY   = 20;   // rolling message window sent to the API

/* ── STATE ──────────────────────────────────────────────────── */
let chatOpen    = false;
let chatHistory = [];   // [{ role: 'user'|'assistant', content: '...' }]
let isStreaming = false;

/* ── DOM HELPERS ─────────────────────────────────────────────── */
const $  = (id) => document.getElementById(id);
const el = {
  toggle   : () => $('chat-toggle-btn'),
  panel    : () => $('chat-panel'),
  messages : () => $('chat-messages'),
  input    : () => $('chat-input'),
  sendBtn  : () => $('chat-send-btn'),
  closeBtn : () => $('chat-close-btn'),
  clearBtn : () => $('chat-clear-btn'),
};

/* ── PORTFOLIO CONTEXT ───────────────────────────────────────── */
function buildPortfolioContext() {
  try {
    const raw = localStorage.getItem('vaultex_portfolio');
    if (!raw) return 'The user has no investments added yet.';

    const portfolio = JSON.parse(raw);
    if (!Array.isArray(portfolio) || portfolio.length === 0)
      return 'The user has no investments added yet.';

    const totalInvested = portfolio.reduce((s, i) => s + i.invested, 0);
    const totalValue    = portfolio.reduce((s, i) => s + i.current,  0);
    const totalPL       = totalValue - totalInvested;
    const returnPct     = totalInvested > 0
      ? ((totalPL / totalInvested) * 100).toFixed(2)
      : '0.00';

    const rows = portfolio.map(inv => {
      const pl  = inv.current - inv.invested;
      const ret = inv.invested > 0 ? ((pl / inv.invested) * 100).toFixed(2) : '0.00';
      return `  • ${inv.name} (${inv.type}) — Invested: $${inv.invested.toFixed(2)}, Current: $${inv.current.toFixed(2)}, P&L: $${pl.toFixed(2)} (${ret}%), Date: ${inv.date}`;
    }).join('\n');

    return `
Portfolio Summary:
  Total Invested  : $${totalInvested.toFixed(2)}
  Current Value   : $${totalValue.toFixed(2)}
  Total P&L       : $${totalPL.toFixed(2)} (${returnPct}%)
  Number of Assets: ${portfolio.length}

Individual Holdings:
${rows}
    `.trim();
  } catch {
    return 'Unable to read portfolio data.';
  }
}

/* ── SYSTEM PROMPT ───────────────────────────────────────────── */
function buildSystemPrompt() {
  return `You are Vaultex AI, a smart and concise financial portfolio assistant embedded in the Vaultex dashboard.

Your role:
- Help users understand their portfolio performance, diversification, and risk.
- Answer questions about their specific investments using the live data provided below.
- Offer general investment education and insights when asked.
- Be direct, friendly, and professional. Keep responses concise (2–4 sentences unless detail is needed).
- Format numbers clearly (e.g. $1,234.56, +12.5%).
- Do NOT give personalised regulated financial advice. Always add a brief disclaimer when recommending actions.

Current Portfolio Data (live from user's dashboard):
${buildPortfolioContext()}

Today's Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

If the portfolio is empty, help the user understand how to get started with investing.`;
}

/* ── GROQ API CALL ───────────────────────────────────────────── */
async function callGroq(userMessage) {
  // Add user message to history
  chatHistory.push({ role: 'user', content: userMessage });

  // Keep rolling window
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory = chatHistory.slice(chatHistory.length - MAX_HISTORY);
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method  : 'POST',
    headers : {
      'Content-Type'  : 'application/json',
      'Authorization' : `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model    : GROQ_MODEL,
      messages : [
        { role: 'system', content: buildSystemPrompt() },
        ...chatHistory,
      ],
      max_tokens  : 1024,
      temperature : 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${response.status}`);
  }

  const data          = await response.json();
  const assistantText = data.choices?.[0]?.message?.content || '';

  // Save reply to history
  chatHistory.push({ role: 'assistant', content: assistantText });

  return assistantText;
}

/* ── RENDER HELPERS ──────────────────────────────────────────── */
function appendMessage(role, text) {
  const container = el.messages();
  const wrap   = document.createElement('div');
  wrap.className = `chat-msg chat-msg--${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  // Basic markdown: **bold**, `code`, line breaks
  bubble.innerHTML = text
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g,     '<code>$1</code>')
    .replace(/\n/g,            '<br>');

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function showTypingIndicator() {
  const container = el.messages();
  const wrap   = document.createElement('div');
  wrap.className = 'chat-msg chat-msg--assistant';
  wrap.id = 'typing-indicator';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-typing';
  bubble.innerHTML = '<span></span><span></span><span></span>';

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  $('typing-indicator')?.remove();
}

/* ── SEND MESSAGE ────────────────────────────────────────────── */
async function sendMessage() {
  const input = el.input();
  const text  = input.value.trim();
  if (!text || isStreaming) return;

  isStreaming = true;
  input.value = '';
  input.style.height = 'auto';
  el.sendBtn().disabled = true;

  appendMessage('user', text);
  showTypingIndicator();

  try {
    const reply = await callGroq(text);
    removeTypingIndicator();
    appendMessage('assistant', reply);
  } catch (err) {
    removeTypingIndicator();
    appendMessage('assistant', `⚠️ Error: ${err.message}. Please check your Groq API key or try again.`);
  } finally {
    isStreaming = false;
    el.sendBtn().disabled = false;
    input.focus();
  }
}

/* ── SUGGESTION CHIPS ────────────────────────────────────────── */
function attachSuggestionChips() {
  document.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (isStreaming) return;
      el.input().value = chip.textContent.trim();
      sendMessage();
    });
  });
}

/* ── PANEL OPEN / CLOSE ──────────────────────────────────────── */
function openChat() {
  chatOpen = true;
  el.panel().classList.add('chat-panel--open');
  el.toggle().classList.add('chat-toggle--active');
  el.toggle().setAttribute('aria-expanded', 'true');

  // Welcome message on first open
  if (el.messages().children.length === 0) {
    try {
      const raw     = localStorage.getItem('vaultex_portfolio');
      const hasData = raw && JSON.parse(raw).length > 0;
      const greeting = hasData
        ? `👋 Hi! I'm **Vaultex AI**. I can see your portfolio — ask me anything about your investments, performance, or diversification!`
        : `👋 Hi! I'm **Vaultex AI**. It looks like you haven't added any investments yet. Add some via the dashboard and I'll help you analyse them!`;
      appendMessage('assistant', greeting);
    } catch {
      appendMessage('assistant', `👋 Hi! I'm **Vaultex AI**. How can I help you today?`);
    }
  }

  setTimeout(() => el.input().focus(), 300);
}

function closeChat() {
  chatOpen = false;
  el.panel().classList.remove('chat-panel--open');
  el.toggle().classList.remove('chat-toggle--active');
  el.toggle().setAttribute('aria-expanded', 'false');
}

function toggleChat() {
  chatOpen ? closeChat() : openChat();
}

/* ── CLEAR HISTORY ───────────────────────────────────────────── */
function clearChat() {
  chatHistory = [];
  el.messages().innerHTML = '';
  openChat();
}

/* ── AUTO-RESIZE TEXTAREA ────────────────────────────────────── */
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

/* ── INIT ─────────────────────────────────────────────────────── */
function initChatbot() {
  const toggle = el.toggle();

  if (!toggle) {
    console.warn('Vaultex Chatbot: #chat-toggle-btn not found. Did you add the HTML snippet?');
    return;
  }

  // Button events
  toggle.addEventListener('click', toggleChat);
  el.closeBtn().addEventListener('click', closeChat);
  el.clearBtn().addEventListener('click', clearChat);
  el.sendBtn().addEventListener('click', sendMessage);

  // Textarea: send on Enter, resize on input
  el.input().addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  el.input().addEventListener('input', () => autoResize(el.input()));

  // Close when clicking outside the panel
  document.addEventListener('click', (e) => {
    if (chatOpen && !el.panel().contains(e.target) && !toggle.contains(e.target)) {
      closeChat();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatOpen) closeChat();
  });

  // Wire up suggestion chips
  attachSuggestionChips();
}

document.addEventListener('DOMContentLoaded', initChatbot);
