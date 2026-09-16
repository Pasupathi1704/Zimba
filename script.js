const sidebar = document.querySelector("#sidebar");
const mobileScrim = document.querySelector("#mobileScrim");
const promptInput = document.querySelector("#promptInput");
const conversation = document.querySelector("#conversation");
const suggestions = document.querySelector("#suggestions");
const modelPicker = document.querySelector("#modelPicker");
const modelMenu = document.querySelector("#modelMenu");
const composer = document.querySelector("#composer");
const fileInput = document.querySelector("#fileInput");
const attachmentList = document.querySelector("#attachmentList");
const composerNote = document.querySelector("#composerNote");
const sendButton = document.querySelector("#sendButton");
const characterCount = document.querySelector("#characterCount");
const imageButton = document.querySelector("#imageButton");
const voiceButton = document.querySelector(".voice-button");
const voiceOutputToggle = document.querySelector("#voiceOutputToggle");
const searchDialogBackdrop = document.querySelector("#searchDialogBackdrop");
const conversationSearch = document.querySelector("#conversationSearch");
const searchResults = document.querySelector("#searchResults");
const sidebarSearch = document.querySelector("#sidebarSearch");
const sidebarSearchInput = document.querySelector("#sidebarSearchInput");
const sidebarSearchEmpty = document.querySelector("#sidebarSearchEmpty");
const storedHistory = document.querySelector("#storedHistory");
const historyStorageKey = "zimba-conversations";
let selectedModel = "Zimba Core";
let selectedAgent = "Generalist";
let messages = [];
let attachments = [];
let isSending = false;
let isListening = false;
let isVoiceOutputEnabled = true;
let recognition = null;
let voiceBasePrompt = "";
let shouldSendVoiceTranscript = false;
let hasVoiceTranscript = false;
let currentConversationId = null;
const sessionId = getSessionId();
let savedConversations = loadSavedConversations();

function getSessionId() {
  const storageKey = "zimba-session-id";
  let value = window.localStorage.getItem(storageKey);
  if (!value) {
    value = window.crypto?.randomUUID?.() || `zimba-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(storageKey, value);
  }
  return value;
}

function toggleSidebar(isOpen) {
  sidebar.classList.toggle("open", isOpen);
  mobileScrim.classList.toggle("open", isOpen);
}

document.querySelector("#openSidebar").addEventListener("click", () => toggleSidebar(true));
document.querySelector("#closeSidebar").addEventListener("click", () => toggleSidebar(false));
mobileScrim.addEventListener("click", () => toggleSidebar(false));

let historyItems = [];
renderSavedHistory();
refreshHistoryItems();
document.querySelector("#searchConversations").addEventListener("click", openSidebarSearch);
document.querySelector("#closeSidebarSearch").addEventListener("click", closeSidebarSearch);
sidebarSearchInput.addEventListener("input", () => filterSidebarHistory(sidebarSearchInput.value));
document.querySelector("#closeSearch").addEventListener("click", closeSearch);
searchDialogBackdrop.addEventListener("click", (event) => {
  if (event.target === searchDialogBackdrop) closeSearch();
});
conversationSearch.addEventListener("input", () => renderSearchResults(conversationSearch.value));
conversationSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSearch();
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSidebarSearch();
  }
  if (event.key === "Escape" && !searchDialogBackdrop.hidden) closeSearch();
  if (event.key === "Escape" && !sidebarSearch.hidden) closeSidebarSearch();
});

function openSidebarSearch() {
  sidebarSearch.hidden = false;
  sidebarSearchInput.value = "";
  filterSidebarHistory("");
  if (window.matchMedia("(max-width: 800px)").matches) toggleSidebar(true);
  sidebarSearchInput.focus();
}

function closeSidebarSearch() {
  sidebarSearch.hidden = true;
  sidebarSearchInput.value = "";
  filterSidebarHistory("");
}

function filterSidebarHistory(query) {
  const normalizedQuery = query.trim().toLowerCase();
  let visibleCount = 0;
  historyItems.forEach((item) => {
    const isMatch = !normalizedQuery || item.textContent.toLowerCase().includes(normalizedQuery);
    item.hidden = !isMatch;
    if (isMatch) visibleCount += 1;
  });
  document.querySelectorAll(".history .section-label").forEach((label) => {
    label.hidden = Boolean(normalizedQuery);
  });
  sidebarSearchEmpty.hidden = visibleCount > 0;
}

function loadSavedConversations() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(historyStorageKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function persistConversations() {
  window.localStorage.setItem(historyStorageKey, JSON.stringify(savedConversations.slice(0, 30)));
}

function refreshHistoryItems() {
  historyItems = Array.from(document.querySelectorAll(".history-item"));
}

function renderSavedHistory() {
  storedHistory.innerHTML = "";
  savedConversations.forEach((saved) => {
    const item = document.createElement("button");
    item.className = "history-item stored-history-item";
    item.dataset.conversationId = saved.id;
    item.innerHTML = `<span class="history-icon">◌</span><span></span><span class="more">•••</span>`;
    item.querySelector("span:nth-child(2)").textContent = saved.title;
    item.addEventListener("click", () => openSavedConversation(saved.id));
    storedHistory.appendChild(item);
  });
  refreshHistoryItems();
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((part) => part?.type === "text").map((part) => part.text).join(" ");
  return "";
}

function saveCurrentConversation() {
  const userMessage = messages.find((message) => message.role === "user");
  if (!userMessage) return;
  const title = contentToText(userMessage.content).replace(/\s+/g, " ").trim().slice(0, 42) || "New conversation";
  const record = { id: currentConversationId || `conversation-${Date.now()}`, title, messages: messages.map((message) => ({ role: message.role, content: contentToText(message.content) })), updatedAt: Date.now() };
  currentConversationId = record.id;
  savedConversations = [record, ...savedConversations.filter((saved) => saved.id !== record.id)].slice(0, 30);
  persistConversations();
  renderSavedHistory();
}

function openSavedConversation(id) {
  const saved = savedConversations.find((item) => item.id === id);
  if (!saved) return;
  currentConversationId = saved.id;
  messages = saved.messages.map((message) => ({ role: message.role, content: message.content }));
  conversation.querySelectorAll(".message-row").forEach((message) => message.remove());
  suggestions.hidden = true;
  messages.forEach((message) => {
    const row = document.createElement("div");
    row.className = `message-row ${message.role}`;
    if (message.role === "user") {
      row.innerHTML = `<div class="message-bubble"></div>`;
      row.querySelector(".message-bubble").textContent = message.content;
    } else {
      row.innerHTML = `<span class="assistant-mark">Z</span><div class="message-bubble markdown-body"></div>`;
      row.querySelector(".message-bubble").innerHTML = renderMarkdown(message.content);
    }
    conversation.appendChild(row);
  });
  historyItems.forEach((item) => item.classList.toggle("active", item.dataset.conversationId === id));
  toggleSidebar(false);
}

function openSearch() {
  searchDialogBackdrop.hidden = false;
  conversationSearch.value = "";
  renderSearchResults("");
  conversationSearch.focus();
}

function closeSearch() {
  searchDialogBackdrop.hidden = true;
}

function renderSearchResults(query) {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = historyItems.filter((item) => item.textContent.toLowerCase().includes(normalizedQuery));
  searchResults.innerHTML = "";
  if (matches.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "search-empty";
    emptyState.textContent = "No conversations found.";
    searchResults.appendChild(emptyState);
    return;
  }
  matches.forEach((item) => {
    const result = document.createElement("button");
    result.className = "search-result";
    result.setAttribute("role", "option");
    result.innerHTML = `<span class="history-icon">◌</span><span></span><span class="arrow">↗</span>`;
    result.querySelector("span:nth-child(2)").textContent = item.querySelector("span:nth-child(2)").textContent;
    result.addEventListener("click", () => {
      historyItems.forEach((historyItem) => historyItem.classList.remove("active"));
      item.classList.add("active");
      closeSearch();
    });
    searchResults.appendChild(result);
  });
}

document.querySelector("#newChat").addEventListener("click", () => {
  conversation.querySelectorAll(".message-row").forEach((message) => message.remove());
  suggestions.hidden = false;
  promptInput.value = "";
  messages = [];
  currentConversationId = null;
  attachments = [];
  renderAttachments();
  promptInput.focus();
  toggleSidebar(false);
});

modelPicker.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = modelMenu.classList.toggle("open");
  modelPicker.setAttribute("aria-expanded", String(isOpen));
});

document.addEventListener("click", () => {
  modelMenu.classList.remove("open");
  modelPicker.setAttribute("aria-expanded", "false");
});

document.querySelectorAll(".model-option").forEach((option) => {
  option.addEventListener("click", () => {
    document.querySelectorAll(".model-option").forEach((item) => item.classList.remove("selected"));
    option.classList.add("selected");
    selectedModel = option.querySelector("strong").textContent;
    modelPicker.querySelector("span:nth-child(2)").textContent = selectedModel;
    modelMenu.classList.remove("open");
  });
});

document.querySelectorAll(".agent-option").forEach((option) => {
  option.addEventListener("click", () => {
    document.querySelectorAll(".agent-option").forEach((item) => item.classList.remove("selected"));
    option.classList.add("selected");
    selectedAgent = option.querySelector("strong").textContent;
    modelMenu.classList.remove("open");
  });
});

document.querySelectorAll(".suggestion").forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    promptInput.value = suggestion.dataset.prompt || suggestion.querySelector("strong").textContent;
    promptInput.focus();
    resizeInput();
    updateComposerState();
  });
});

document.querySelector("#attachButton").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const nextFiles = Array.from(fileInput.files || []);
  for (const file of nextFiles) {
    if (file.size > 4 * 1024 * 1024) {
      showError(`${file.name} is larger than the 4 MB attachment limit.`);
      continue;
    }
    if (!file.type.startsWith("image/") && !["text/plain", "text/markdown", "text/csv", "application/json"].includes(file.type)) {
      showError(`${file.name} is not a supported image or text file.`);
      continue;
    }
    const data = await readFile(file);
    attachments.push({ name: file.name, type: file.type, data });
  }
  fileInput.value = "";
  renderAttachments();
});

function resizeInput() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 110)}px`;
}

function updateComposerState() {
  const length = promptInput.value.length;
  characterCount.textContent = `${length.toLocaleString()} / 4,000`;
  characterCount.classList.toggle("visible", length > 0);
  sendButton.disabled = isSending || (!promptInput.value.trim() && attachments.length === 0);
}

promptInput.addEventListener("input", () => {
  resizeInput();
  updateComposerState();
});
promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

sendButton.addEventListener("click", sendMessage);
updateComposerState();
imageButton?.addEventListener("click", generateImage);
if (voiceOutputToggle) {
  voiceOutputToggle.addEventListener("click", () => {
    isVoiceOutputEnabled = !isVoiceOutputEnabled;
    updateVoiceOutputToggle();
    if (!isVoiceOutputEnabled) {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      composerNote.textContent = "Voice output muted.";
      return;
    }
    composerNote.textContent = "Voice output enabled.";
    window.setTimeout(() => {
      if (!isSending) {
        composerNote.textContent = "Zimba can make mistakes. Check important information.";
      }
    }, 1200);
  });
}
updateVoiceOutputToggle();
setupVoiceChat();

function updateVoiceOutputToggle() {
  if (!voiceOutputToggle) return;
  voiceOutputToggle.textContent = isVoiceOutputEnabled ? "🔊" : "🔇";
  voiceOutputToggle.setAttribute("aria-label", isVoiceOutputEnabled ? "Disable voice output" : "Enable voice output");
  voiceOutputToggle.title = isVoiceOutputEnabled ? "Voice output on" : "Voice output off";
}

function setupVoiceChat() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!("speechSynthesis" in window) && voiceOutputToggle) {
    isVoiceOutputEnabled = false;
    voiceOutputToggle.disabled = true;
    voiceOutputToggle.title = "Voice output is not supported by this browser";
    updateVoiceOutputToggle();
  }

  if (!SpeechRecognition || !voiceButton) {
    if (voiceButton) {
      voiceButton.disabled = true;
      voiceButton.title = "Voice input is not supported by this browser";
      voiceButton.setAttribute("aria-label", "Voice input is not supported by this browser");
    }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isListening = true;
    shouldSendVoiceTranscript = true;
    hasVoiceTranscript = false;
    voiceBasePrompt = promptInput.value.trim();
    voiceButton.classList.add("listening");
    voiceButton.setAttribute("aria-label", "Stop voice input");
    composerNote.textContent = "Listening... speak now.";
  };

  recognition.onresult = (event) => {
    let transcript = "";
    let hasFinalTranscript = false;
    for (let i = 0; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
      hasFinalTranscript ||= event.results[i].isFinal;
    }
    hasVoiceTranscript = Boolean(transcript.trim());
    promptInput.value = [voiceBasePrompt, transcript.trim()].filter(Boolean).join(" ");
    resizeInput();
    if (hasFinalTranscript && hasVoiceTranscript) recognition.stop();
  };

  recognition.onerror = (event) => {
    shouldSendVoiceTranscript = false;
    if (event.error !== "aborted") {
      const errorMessage = event.error === "not-allowed"
        ? "Microphone access was blocked. Please allow it and try again."
        : "Voice input is unavailable right now. Please try again.";
      showError(errorMessage);
    }
  };

  recognition.onend = () => {
    isListening = false;
    voiceButton.classList.remove("listening");
    voiceButton.setAttribute("aria-label", "Use voice");
    const shouldSend = shouldSendVoiceTranscript;
    shouldSendVoiceTranscript = false;
    if (!hasVoiceTranscript || !promptInput.value.trim() || !shouldSend) {
      composerNote.textContent = "No speech detected. Tap the microphone and speak clearly.";
      return;
    }
    window.setTimeout(() => {
      if (!isSending) sendMessage();
    }, 200);
  };

  voiceButton.addEventListener("click", () => {
    if (isListening) {
      stopVoiceInput();
      return;
    }
    if (recognition) {
      try {
        recognition.start();
      } catch {
        // Ignore repeated start calls while recognition is already active.
      }
    }
  });
}

function stopVoiceInput() {
  if (!recognition || !isListening) return;
  shouldSendVoiceTranscript = false;
  recognition.stop();
  isListening = false;
  voiceButton.classList.remove("listening");
  voiceButton.setAttribute("aria-label", "Use voice");
}

function speakAssistantText(text) {
  if (!isVoiceOutputEnabled || !text || !("speechSynthesis" in window)) return;
  const cleanedText = text
    .replace(/[#`*_>\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleanedText) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanedText);
  utterance.lang = "en-US";
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function sendMessage() {
  if (isSending) return;
  const text = promptInput.value.trim();
  if (!text && attachments.length === 0) {
    composer.animate([{ transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 220 });
    return;
  }

  isSending = true;
  setComposerBusy(true);
  suggestions.hidden = true;
  const userMessage = document.createElement("div");
  userMessage.className = "message-row user";
  userMessage.innerHTML = `<div class="message-bubble"></div>`;
  userMessage.querySelector(".message-bubble").textContent = text || "Please analyze the attached files.";
  conversation.appendChild(userMessage);
  const requestContent = await buildRequestContent(text);
  messages.push({ role: "user", content: requestContent });
  promptInput.value = "";
  attachments = [];
  renderAttachments();
  resizeInput();

  const assistantMessage = document.createElement("div");
  assistantMessage.className = "message-row assistant";
  assistantMessage.innerHTML = `<span class="assistant-mark">Z</span><div class="message-bubble markdown-body"><span class="typing-indicator" aria-label="Zimba is thinking"><i></i><i></i><i></i></span></div>`;
  conversation.appendChild(assistantMessage);
  const assistantBubble = assistantMessage.querySelector(".message-bubble");

  try {
    let response;
    try {
      response = await fetchChatEndpoint({ sessionId, model: selectedModel, agent: selectedAgent, messages });
    } catch (fetchError) {
      const fallbackReply = generateFallbackReply(text, selectedAgent, selectedModel);
      assistantBubble.innerHTML = renderMarkdown(fallbackReply);
      assistantMessage.scrollIntoView({ behavior: "smooth", block: "center" });
      messages.push({ role: "assistant", content: fallbackReply });
      saveCurrentConversation();
      speakAssistantText(fallbackReply);
      return;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Zimba could not complete that request.");
    }
    if (!response.body) throw new Error("The response stream was unavailable.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    assistantBubble.textContent = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      assistantBubble.innerHTML = renderMarkdown(answer);
      assistantMessage.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    messages.push({ role: "assistant", content: answer });
    if (!answer) throw new Error("Zimba returned an empty response.");
    saveCurrentConversation();
    speakAssistantText(answer);
  } catch (error) {
    assistantBubble.innerHTML = `<span class="error-copy"></span><button class="retry-button">Retry</button>`;
    assistantBubble.querySelector(".error-copy").textContent = error.message;
    assistantBubble.querySelector(".retry-button").addEventListener("click", () => {
      assistantMessage.remove();
      promptInput.value = text;
      resizeInput();
      sendMessage();
    });
    messages.pop();
  } finally {
    isSending = false;
    setComposerBusy(false);
  }
}

async function generateImage() {
  if (isSending) return;
  const prompt = promptInput.value.trim();
  if (!prompt) {
    showError("Describe the image you want Zimba to create first.");
    promptInput.focus();
    return;
  }

  isSending = true;
  setComposerBusy(true);
  suggestions.hidden = true;
  const userMessage = document.createElement("div");
  userMessage.className = "message-row user";
  userMessage.innerHTML = `<div class="message-bubble"></div>`;
  userMessage.querySelector(".message-bubble").textContent = `Generate an image: ${prompt}`;
  conversation.appendChild(userMessage);

  const imageMessage = document.createElement("div");
  imageMessage.className = "message-row assistant";
  imageMessage.innerHTML = `<span class="assistant-mark">Z</span><div class="message-bubble image-result"><span class="typing-indicator" aria-label="Zimba is creating an image"><i></i><i></i><i></i></span></div>`;
  conversation.appendChild(imageMessage);
  const imageBubble = imageMessage.querySelector(".message-bubble");

  try {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.imageUrl) throw new Error(result.error || "Zimba could not generate that image.");

    imageBubble.innerHTML = `<img alt="Generated image" /><a download="zimba-image.png">Download image</a>`;
    const image = imageBubble.querySelector("img");
    const download = imageBubble.querySelector("a");
    image.src = result.imageUrl;
    download.href = result.imageUrl;
    promptInput.value = "";
    resizeInput();
  } catch (error) {
    imageBubble.innerHTML = `<span class="error-copy"></span>`;
    imageBubble.querySelector(".error-copy").textContent = error.message;
  } finally {
    isSending = false;
    setComposerBusy(false);
  }
}

function setComposerBusy(busy) {
  promptInput.disabled = busy;
  sendButton.disabled = busy;
  if (imageButton) imageButton.disabled = busy;
  sendButton.textContent = busy ? "…" : "↑";
  composerNote.textContent = busy ? "Zimba is thinking..." : "Zimba can make mistakes. Check important information.";
  if (!busy) updateComposerState();
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fetchChatEndpoint(payload) {
  const candidates = ["/api/chat"];
  const currentOrigin = window.location.origin;
  const localOrigins = Array.from({ length: 11 }, (_, index) => `http://127.0.0.1:${3000 + index}`);
  if (currentOrigin.includes("127.0.0.1") || currentOrigin.includes("localhost")) {
    localOrigins.forEach((origin) => candidates.push(`${origin}/api/chat`));
  }
  const uniqueCandidates = [...new Set(candidates)];

  let lastError;
  for (const url of uniqueCandidates) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok || response.status !== 404) {
        return response;
      }

      lastError = new Error(`Chat endpoint unavailable at ${url}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Zimba could not complete that request.");
}

function generateFallbackReply(prompt, agent, model) {
  const safePrompt = (prompt || "the current task").replace(/\s+/g, " ").trim();
  const modeLabel = agent || "Generalist";
  const modelLabel = model || "Zimba Core";
  return `# Local fallback response

I’m running in local fallback mode because the chat backend isn’t reachable from this preview page.

### Context
- Mode: **${modeLabel}**
- Model: **${modelLabel}**
- Prompt: **${safePrompt.slice(0, 180)}**

### Helpful answer
For this request, the best next step is to keep the work focused and validate the expected outcome with one clear check.

1. State the actual goal and constraints.
2. Break the task into a minimal set of testable steps.
3. Confirm the result with a quick verification pass.

If you start the Vite app with **npm run dev** and open the Vite URL shown in the terminal, the live API route will be available again.`;
}

async function buildRequestContent(text) {
  if (attachments.length === 0) return text;
  const parts = [{ type: "text", text: text || "Please analyze these attachments." }];
  for (const attachment of attachments) {
    if (attachment.type.startsWith("image/")) {
      parts.push({ type: "image_url", image_url: { url: attachment.data } });
    } else {
      const encoded = attachment.data.split(",")[1] || "";
      const decoded = atob(encoded);
      parts[0].text += `\n\nAttached file: ${attachment.name}\n${decoded.slice(0, 12000)}`;
    }
  }
  return parts;
}

function renderAttachments() {
  attachmentList.innerHTML = "";
  attachments.forEach((attachment, index) => {
    const chip = document.createElement("span");
    chip.className = "attachment-chip";
    chip.innerHTML = `<span></span><button aria-label="Remove ${escapeHtml(attachment.name)}">×</button>`;
    chip.querySelector("span").textContent = attachment.name;
    chip.querySelector("button").addEventListener("click", () => {
      attachments.splice(index, 1);
      renderAttachments();
    });
    attachmentList.appendChild(chip);
  });
  updateComposerState();
}

function renderMarkdown(markdown) {
  let text = escapeHtml(markdown);

  // Normalize common line-break text returned by models before block parsing.
  text = text.replace(/&lt;br\s*\/?&gt;/gi, "<br>");

  // Preserve and format code blocks
  text = text.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, language, code) => `<pre><code data-language="${language}">${code.replace(/\\n/g, "\n").trim()}</code></pre>`);

  // Parse Markdown Tables
  text = text.replace(/(?:(?:^|\n)\|[^\n]+\|\r?\n(?:\|(?:\s*:?-+:?\s*\|)+)\r?\n(?:\|[^\n]+\|\r?\n?)+)/g, (tableMatch) => {
    const rows = tableMatch.trim().split(/\r?\n/).map((r) => r.trim());
    if (rows.length < 2) return tableMatch;
    const headerCols = rows[0].split("|").slice(1, -1).map((c) => `<th>${c.trim()}</th>`).join("");
    const thead = `<thead><tr>${headerCols}</tr></thead>`;
    const tbodyRows = rows.slice(2).map((row) => {
      const cols = row.split("|").slice(1, -1).map((c) => `<td>${c.trim()}</td>`).join("");
      return `<tr>${cols}</tr>`;
    }).join("");
    return `<table>${thead}<tbody>${tbodyRows}</tbody></table>`;
  });

  // Blockquotes and dividers
  text = text.replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>");
  text = text.replace(/^(?:---|___|\*\*\*)$/gm, "<hr>");

  // Headings
  text = text.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  text = text.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  text = text.replace(/^# (.*)$/gm, "<h1>$1</h1>");

  // Markdown Links
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bold and Italics
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, "$1<em>$2</em>$3");

  // Lists
  text = text.replace(/^(\d+)\. (.*)$/gm, "<li><strong>$1.</strong> $2</li>");
  text = text.replace(/^[-*] (.*)$/gm, "<li>$1</li>");

  // Inline Code
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Paragraphs and Line Breaks
  text = text.replace(/\n{2,}/g, "</p><p>");
  text = text.replace(/\n/g, "<br>");
  text = text.replace(/^(?!<h|<li|<pre|<blockquote|<table|<hr|<p)(.+)$/gm, "<p>$1</p>");

  return text;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function showError(message) {
  composerNote.textContent = message;
  composerNote.classList.add("error-note");
  window.setTimeout(() => {
    composerNote.textContent = "Zimba can make mistakes. Check important information.";
    composerNote.classList.remove("error-note");
  }, 4500);
}

const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  const setTheme = (isLight) => {
    document.documentElement.classList.toggle("light-theme", isLight);
    document.body.classList.toggle("light-theme", isLight);
    document.querySelector(".app-shell").classList.toggle("light-theme", isLight);
    themeToggle.setAttribute("aria-label", isLight ? "Use dark theme" : "Use light theme");
    themeToggle.title = isLight ? "Use dark theme" : "Use light theme";
  };
  setTheme(window.localStorage.getItem("zimba-theme") === "light");
  themeToggle.addEventListener("click", () => {
    const isLight = !document.documentElement.classList.contains("light-theme");
    setTheme(isLight);
    window.localStorage.setItem("zimba-theme", isLight ? "light" : "dark");
  });
}
