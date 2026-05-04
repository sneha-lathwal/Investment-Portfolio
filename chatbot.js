/**
 * VAULTEX — AI Portfolio Assistant
 * chatbot.js  |  Powered by Claude (Anthropic)
 *
 * HOW TO USE:
 * 1. Paste your Anthropic API key where indicated below (ANTHROPIC_API_KEY).
 * 2. Add the HTML snippet from the instructions into index.html.
 * 3. Add the CSS snippet from the instructions into style.css.
 * 4. Include this file at the bottom of index.html:
 *       <script src="chatbot.js"></script>
 */

/* ── CONFIG ─────────────────────────────────────────────────── */
// ⚠️  Replace with your actual Anthropic API key.
// Get one at https://console.anthropic.com/
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY_HERE';

const CHAT_STORAGE_KEY = 'vaultex_chat_history';
const MAX_HISTORY      = 20;   // messages kept in memory (rolling window)

/* ── STATE ──────────────────────────────────────────────────── */
let chatOpen    = false;
let chatHistory = [];   // [{role, content}]
let isStreaming = false;

/* ── DOM REFS ────────────────────────────────────────────────── */
const chatToggleBtn  = () => document.getElementById('chat-toggle-btn');
const chatPanel      = () => document.getElementById('chat-panel');
const chatMessages   = () => document.getElementById('chat-messages');
const chatInput      = () => document.getElementById('chat-input');
const chatSendBtn    = () => document.getElementById('chat-send-btn');
const chatCloseBtn   = () => document.getElementById('chat-close-btn');
const chatClearBtn   = () => document.getElementById('chat-clear-btn');

/* ── PORTFOLIO CONTEXT ───────────────────────────────────────── */
/**
 * Reads the portfolio from localStorage (same key used by script.js)
 * and formats it into a concise text block for the AI system prompt.
 */
function buildPortfolioContext() {
  try {
    const raw = localStorage.getItem('vaultex_portfolio');
    if (!raw) return 'The user has no investments added yet.';

    const portfolio = JSON.parse(raw);
    if (!Array.isArray(portfolio) || portfolio.length === 0)
      return 'The user has no investments added yet.';

    const totalInvested = portfolio.reduce((s, i) => s + i.invested, 0);
    const totalValue    = portfolio.reduce((s, i) => s + i.current, 0);
    const totalPL       = totalValue - totalInvested;
    const returnPct     = totalInvested > 0
      ? ((totalPL / totalInvested) * 100).toFixed(2)
      : '0.00';

    const rows = portfolio.map(inv => {
      const pl    = inv.current - inv.invested;
      const ret   = inv.invested > 0 ? ((pl / inv.invested) * 100).toFixed(2) : '0.00';
      return `  • ${inv.name} (${inv.type}) — Invested: $${inv.invested.toFixed(2)}, Current: $${inv.current.toFixed(2)}, P&L: $${pl.toFixed(2)} (${ret}%), Date: ${inv.date}`;
    }).join('\n');

    return `
Portfolio Summary:
  Total Invested : $${totalInvested.toFixed(2)}
  Current Value  : $${totalValue.toFixed(2)}
  Total P&L      : $${totalPL.toFixed(2)} (${returnPct}%)
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
- Be direct, friendly, and professional. Keep responses concise (2-4 sentences unless detail is needed).
- Format numbers clearly (e.g., $1,234.56, +12.5%).
- Do NOT give personalised regulated financial advice. Always add a brief disclaimer when recommending actions.

Current Portfolio Data (live from user's dashboard):
${buildPortfolioContext()}

Today's Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

If the portfolio is empty, help the user understand how to get started.`;
}

/* ── API CALL ─────────────────────────────────────────────────── */
async function callClaude(userMessage) {
  // Add user message to history
  chatHistory.push({ role: 'user', content: userMessage });

  // Keep rolling window
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory = chatHistory.slice(chatHistory.length - MAX_HISTORY);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type'      : 'application/json',
      'x-api-key'         : ANTHROPIC_API_KEY,
      'anthropic-version' : '2023-06-01',
      // Required header for browser-side calls:
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model      : 'claude-sonnet-4-20250514',
      max_tokens : 1024,
      system     : buildSystemPrompt(),
      messages   : chatHistory,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const assistantText = data.content?.[0]?.text || '';

  // Save assistant reply to history
  chatHistory.push({ role: 'assistant', content: assistantText });

  return assistantText;
}

/* ── RENDER HELPERS ──────────────────────────────────────────── */
function appendMessage(role, text) {
  const container = chatMessages();
  const wrap = document.createElement('div');
  wrap.className = `chat-msg chat-msg--${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  // Simple markdown-like formatting: **bold**, `code`, newlines
  bubble.innerHTML = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function showTypingIndicator() {
  const container = chatMessages();
  const wrap = document.createElement('div');
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
  document.getElementById('typing-indicator')?.remove();
}

/* ── SEND MESSAGE ────────────────────────────────────────────── */
async function sendMessage() {
  const input = chatInput();
  const text  = input.value.trim();
  if (!text || isStreaming) return;

  isStreaming = true;
  input.value = '';
  input.style.height = 'auto';
  chatSendBtn().disabled = true;

  appendMessage('user', text);
  showTypingIndicator();

  try {
    const reply = await callClaude(text);
    removeTypingIndicator();
    appendMessage('assistant', reply);
  } catch (err) {
    removeTypingIndicator();
    appendMessage('assistant', `⚠️ Sorry, I ran into an error: ${err.message}. Please check your API key or try again.`);
  } finally {
    isStreaming = false;
    chatSendBtn().disabled = false;
    input.focus();
  }
}

/* ── PANEL TOGGLE ────────────────────────────────────────────── */
function openChat() {
  chatOpen = true;
  chatPanel().classList.add('chat-panel--open');
  chatToggleBtn().setAttribute('aria-expanded', 'true');
  chatToggleBtn().classList.add('chat-toggle--active');

  // Show welcome message on first open
  if (chatMessages().children.length === 0) {
    const portfolio = localStorage.getItem('vaultex_portfolio');
    const hasData   = portfolio && JSON.parse(portfolio).length > 0;
    const greeting  = hasData
      ? `👋 Hi! I'm **Vaultex AI**. I can see your portfolio — ask me anything about your investments, performance, or diversification!`
      : `👋 Hi! I'm **Vaultex AI**. It looks like you haven't added any investments yet. Add some via the dashboard and I can help you analyse them!`;
    appendMessage('assistant', greeting);
  }

  setTimeout(() => chatInput().focus(), 300);
}

function closeChat() {
  chatOpen = false;
  chatPanel().classList.remove('chat-panel--open');
  chatToggleBtn().setAttribute('aria-expanded', 'false');
  chatToggleBtn().classList.remove('chat-toggle--active');
}

function toggleChat() {
  chatOpen ? closeChat() : openChat();
}

/* ── CLEAR HISTORY ───────────────────────────────────────────── */
function clearChat() {
  chatHistory = [];
  chatMessages().innerHTML = '';
  openChat(); // re-trigger greeting
}

/* ── AUTO-RESIZE TEXTAREA ────────────────────────────────────── */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/* ── INIT ─────────────────────────────────────────────────────── */
function initChatbot() {
  const toggle = chatToggleBtn();
  const close  = chatCloseBtn();
  const clear  = chatClearBtn();
  const send   = chatSendBtn();
  const input  = chatInput();

  if (!toggle) {
    console.warn('Vaultex Chatbot: #chat-toggle-btn not found. Did you add the HTML snippet?');
    return;
  }

  toggle.addEventListener('click', toggleChat);
  close.addEventListener('click', closeChat);
  clear.addEventListener('click', clearChat);
  send.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener('input', () => autoResize(input));

  // Close on overlay click
  document.addEventListener('click', (e) => {
    if (chatOpen && !chatPanel().contains(e.target) && !toggle.contains(e.target)) {
      closeChat();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatOpen) closeChat();
  });
}

// Wait for DOM
document.addEventListener('DOMContentLoaded', initChatbot);
