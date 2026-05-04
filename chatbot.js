/**
 * VAULTEX — AI Portfolio Assistant
 * chatbot.js  |  Powered by Groq
 */

/* ── CONFIG ─────────────────────────────────────────────────── */
const GROQ_API_KEY = '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';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const MAX_HISTORY  = 20;

/* ── STATE ──────────────────────────────────────────────────── */
let chatOpen    = false;
let chatHistory = [];
let isStreaming = false;

/* ── DOM HELPERS ─────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
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

    if (!raw) return 'STATUS: NO_DATA — The user has not added any investments yet.';

    const portfolio = JSON.parse(raw);

    if (!Array.isArray(portfolio) || portfolio.length === 0)
      return 'STATUS: NO_DATA — The user has not added any investments yet.';

    const totalInvested = portfolio.reduce((s, i) => s + (i.invested || 0), 0);
    const totalValue    = portfolio.reduce((s, i) => s + (i.current  || 0), 0);
    const totalPL       = totalValue - totalInvested;
    const returnPct     = totalInvested > 0
      ? ((totalPL / totalInvested) * 100).toFixed(2)
      : '0.00';

    const rows = portfolio.map(inv => {
      const pl  = (inv.current || 0) - (inv.invested || 0);
      const ret = inv.invested > 0 ? ((pl / inv.invested) * 100).toFixed(2) : '0.00';
      const sign = pl >= 0 ? '+' : '';
      return `  • ${inv.name} (${inv.type || 'Asset'}) | Invested: $${inv.invested.toFixed(2)} | Current: $${inv.current.toFixed(2)} | P&L: ${sign}$${pl.toFixed(2)} (${sign}${ret}%) | Added: ${inv.date || 'N/A'}`;
    }).join('\n');

    return `STATUS: DATA_AVAILABLE

Portfolio Summary:
  Total Invested  : $${totalInvested.toFixed(2)}
  Current Value   : $${totalValue.toFixed(2)}
  Total P&L       : ${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(2)} (${totalPL >= 0 ? '+' : ''}${returnPct}%)
  Number of Assets: ${portfolio.length}

Individual Holdings:
${rows}`;

  } catch (e) {
    return 'STATUS: ERROR — Could not read portfolio data.';
  }
}

/* ── SYSTEM PROMPT ───────────────────────────────────────────── */
// Called fresh on every message so portfolio data is always current
function buildSystemPrompt() {
  const portfolioData = buildPortfolioContext();
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return `You are Vaultex AI, a financial portfolio assistant embedded in the Vaultex investment dashboard.

BEHAVIOR RULES:
1. Always use the portfolio data below to answer questions. Never say you cannot see the user's portfolio.
2. If STATUS is NO_DATA, tell the user they haven't added investments yet and guide them to do so.
3. If STATUS is DATA_AVAILABLE, reference the exact numbers from the data in your answers.
4. Keep responses concise and clear — 2 to 4 sentences for simple questions, more only when detail is genuinely needed.
5. Format all currency as $X,XXX.XX and percentages as +X.XX% or -X.XX%.
6. Only add a financial disclaimer when you are explicitly suggesting the user take a financial action (buy, sell, rebalance). Do NOT add disclaimers to informational or analytical responses.
7. Be friendly, direct, and professional.

Today's Date: ${today}

LIVE PORTFOLIO DATA:
${portfolioData}`;
}

/* ── GROQ API CALL ───────────────────────────────────────────── */
async function callGroq(userMessage) {
  chatHistory.push({ role: 'user', content: userMessage });

  // Rolling window
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
      // System prompt rebuilt here every time = always fresh portfolio data
      messages : [
        { role: 'system', content: buildSystemPrompt() },
        ...chatHistory,
      ],
      max_tokens  : 1024,
      temperature : 0.5,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${response.status}`);
  }

  const data          = await response.json();
  const assistantText = data.choices?.[0]?.message?.content?.trim() || '';

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
    appendMessage('assistant', `⚠️ Error: ${err.message}. Please check your API key or try again.`);
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

  if (el.messages().children.length === 0) {
    try {
      const raw     = localStorage.getItem('vaultex_portfolio');
      const hasData = raw && JSON.parse(raw).length > 0;
      const greeting = hasData
        ? `👋 Hi! I'm **Vaultex AI**. I can see your portfolio — ask me anything about your investments!`
        : `👋 Hi! I'm **Vaultex AI**. You haven't added any investments yet. Head to your dashboard to add some and I'll help you analyse them!`;
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
    console.warn('Vaultex Chatbot: #chat-toggle-btn not found.');
    return;
  }

  toggle.addEventListener('click', toggleChat);
  el.closeBtn().addEventListener('click', closeChat);
  el.clearBtn().addEventListener('click', clearChat);
  el.sendBtn().addEventListener('click', sendMessage);

  el.input().addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  el.input().addEventListener('input', () => autoResize(el.input()));

  document.addEventListener('click', (e) => {
    if (chatOpen && !el.panel().contains(e.target) && !toggle.contains(e.target)) {
      closeChat();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatOpen) closeChat();
  });

  attachSuggestionChips();
}

document.addEventListener('DOMContentLoaded', initChatbot);
