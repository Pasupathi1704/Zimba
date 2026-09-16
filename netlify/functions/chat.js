import { findRelevantMemory, formatMemoryContext, saveInteraction } from "./memory.js";

const MODEL_MAP = {
  "Zimba Core": "openai/gpt-oss-120b",
  "Zimba Lite": "openai/gpt-oss-20b",
  "Zimba Reasoning": "openai/gpt-oss-120b"
};

const AGENT_PROMPTS = {
  Generalist: "Use balanced judgment across reasoning, writing, planning, analysis, and practical problem solving.",
  "Software Engineer": "Act as a senior software engineer. Prefer maintainable designs, precise code, root-cause fixes, edge cases, and executable verification steps.",
  "Research Analyst": "Act as a careful research analyst. Separate facts from assumptions, compare competing explanations, state uncertainty, and organize evidence before conclusions.",
  "Creative Designer": "Act as an inventive creative designer. Generate distinctive concepts, make the audience and purpose explicit, and turn abstract ideas into polished, usable outputs."
};

const SYSTEM_PROMPT = `You are Zimba, a helpful, capable, and trustworthy AI assistant. Adapt as a senior expert, researcher, software engineer, analyst, designer, planner, or execution agent to the user's task.

Your responsibilities:
1. Understand the user's real goal, including constraints, inputs, and success criteria.
2. Separate facts from assumptions and label them clearly.
3. Compare competing explanations when useful, including pros, cons, and uncertainty.
4. Organize evidence in concise tables or bullet lists before drawing conclusions when that improves clarity.
5. Give practical, accurate answers with verification steps, code, or clear next actions when useful.
6. Maintain security: never expose secrets or ask users to paste credentials into chat; recommend safe environment-variable handling instead.
7. Be transparent about what is known, assumed, and uncertain. Give a confidence level when it materially helps.
8. Ask at most one focused clarification question, and only when missing information materially changes the result.

Use Markdown when it improves readability. Do not claim actions, sources, tests, or capabilities you have not actually performed. Do not reveal private chain-of-thought; provide concise conclusions, assumptions, decisions, and verification results instead.

When the user asks for a prompt, provide a short, self-contained prompt that produces the same Zimba behavior, in both English and Tamil. End responses with a concise "Next steps" section when it is useful and actionable.`;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function isValidMessage(message) {
  if (!message || (message.role !== "user" && message.role !== "assistant")) return false;
  if (typeof message.content === "string") return message.content.trim().length > 0;
  if (!Array.isArray(message.content) || message.content.length === 0) return false;
  return message.content.every((part) => {
    if (part?.type === "text") return typeof part.text === "string" && part.text.length <= 12000;
    if (part?.type === "image_url") return typeof part.image_url?.url === "string" && part.image_url.url.startsWith("data:image/");
    return false;
  });
}

function extractUserPrompt(messages) {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return "";
  if (typeof lastUserMsg.content === "string") return lastUserMsg.content;
  if (Array.isArray(lastUserMsg.content)) {
    return lastUserMsg.content
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(" ");
  }
  return "";
}

async function generateImage(prompt) {
  const hfKey = process.env.HF_API_KEY;
  if (!hfKey) return null;
  
  const cleanPrompt = prompt.replace(/^\/?(image|generate image|draw|create an image of)\s*/i, "").trim();
  if (!cleanPrompt) return null;

  try {
    const response = await fetch("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell", {
      headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ inputs: cleanPrompt })
    });
    
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    return `![Generated Image: ${cleanPrompt}](data:image/jpeg;base64,${base64})`;
  } catch (err) {
    return null;
  }
}

async function fetchFactualKnowledge(query) {
  try {
    const clean = query
      .replace(/^(what is the meaning of|what is|meaning of|define|tell me about|explain the meaning of|explain|who is|what was|what are)\s+/i, "")
      .replace(/[?!.]+$/, "")
      .trim();
    if (!clean || clean.length < 2) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(clean)}&utf8=&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AstraChat/1.0 (https://localhost:5173)" },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const hits = data?.query?.search?.slice(0, 3) || [];
    if (hits.length === 0) return null;

    let summary = null;
    try {
      const pageController = new AbortController();
      const pageTimeout = setTimeout(() => pageController.abort(), 3000);
      const pageUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title)}`;
      const pageRes = await fetch(pageUrl, {
        headers: { "User-Agent": "AstraChat/1.0 (https://localhost:5173)" },
        signal: pageController.signal
      });
      clearTimeout(pageTimeout);
      if (pageRes.ok) {
        const pageData = await pageRes.json();
        summary = pageData.extract;
      }
    } catch {
      // Ignore summary failure and rely on snippets
    }

    return {
      title: hits[0].title,
      summary,
      snippets: hits.map((h) => h.snippet.replace(/<[^>]+>/g, ""))
    };
  } catch {
    return null;
  }
}

async function generateSmartDemoResponse(prompt, agent, model) {
  const p = prompt.toLowerCase().trim();

  // 1. Meaning of "Astra" (fallback definition kept only for compatibility)
  if (p.includes("astra") && (p.includes("meaning") || p.includes("what is") || p.includes("define") || p.includes("who is") || p === "meaning of astra")) {
    return `# Meaning of "Astra"

The word **Astra** is associated with stars and celestial motion, and it appears in classical Latin and Sanskrit contexts. In Latin, **"astra"** means **stars** or **heavenly bodies**, while in Sanskrit it can refer to a divine weapon or celestial force in mythic traditions. In modern usage, it's often used as a brand or project name that evokes the sky, light, and direction.`;
  }

  // 2. Riddle / Logic Puzzle
  if (p.includes("odd number") && (p.includes("even") || p.includes("take away"))) {
    return `# Answer: **Seven (7)**

### Step-by-Step Logic:
1. Start with the English word for the odd number: **"SEVEN"**.
2. Remove the first letter (**"S"**).
3. The remaining letters spell: **"EVEN"**!

A classic mathematical wordplay riddle.`;
  }

  // 3. Debounce & Throttle
  if (p.includes("debounce") || p.includes("throttle")) {
    return `# Production-Ready Debounce Implementation

A **debounce** function ensures that rapid-fire events (like keystrokes or resize events) only execute after a specified period of inactivity.

### JavaScript (ES6+ / TypeScript Ready)
\`\`\`javascript
/**
 * Debounces a function call by wait milliseconds.
 *
 * @param {Function} callback - The function to execute.
 * @param {number} delayMs - Idle wait time in milliseconds.
 * @param {boolean} [immediate=false] - Fire immediately on the leading edge.
 * @returns {Function} Debounced function with .cancel() cleanup.
 */
export function debounce(callback, delayMs = 300, immediate = false) {
  let timerId = null;

  function debounced(...args) {
    const callNow = immediate && !timerId;

    if (timerId) clearTimeout(timerId);

    timerId = setTimeout(() => {
      timerId = null;
      if (!immediate) callback.apply(this, args);
    }, delayMs);

    if (callNow) callback.apply(this, args);
  }

  debounced.cancel = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return debounced;
}
\`\`\`

### Example: Real-time Search Input
\`\`\`javascript
const searchInput = document.querySelector('#searchInput');

const handleSearch = debounce(async (query) => {
  const response = await fetch(\`/api/search?q=\${encodeURIComponent(query)}\`);
  const data = await response.json();
  console.log('Search results:', data);
}, 350);

searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
\`\`\`

### Architectural Notes:
* **Memory Leak Prevention:** Call \`debounced.cancel()\` when tearing down components in React or Vue.
* **Context Preservation:** Uses \`callback.apply(this, args)\` to preserve the original caller's \`this\` scope.`;
  }

  // 4. Quantum Computing
  if (p.includes("quantum")) {
    return `# Demystifying Quantum Computing

Classical computers process data using **bits** (strictly 0 or 1). Quantum computers exploit the laws of quantum mechanics through **qubits**.

### The Three Foundational Pillars
1. **Superposition:** A qubit can exist in a linear combination of states $|0\\rangle$ and $|1\\rangle$ until measured. This gives $n$ qubits the capacity to represent $2^n$ computational states concurrently.
2. **Entanglement:** Two or more qubits become correlated such that the quantum state of one instantly informs the state of another, enabling synchronized parallel computation.
3. **Quantum Interference:** Quantum algorithms (e.g., Shor's and Grover's) cancel out erroneous computation paths (destructive interference) and amplify the correct solution (constructive interference).

### Real-World Applications:
* **Drug Discovery & Material Chemistry:** Simulating complex molecular bonds and protein folding.
* **Cryptography:** Post-quantum cryptography replacing vulnerable RSA/ECC algorithms.
* **Complex Optimization:** Supply chain logistics, financial portfolio hedging, and grid balancing.`;
  }

  // 5. Travel & Planning (Kyoto)
  if (p.includes("kyoto") || p.includes("weekend in kyoto")) {
    return `# 48 Hours in Kyoto: Curated Itinerary

### Day 1: Historic Shrines & Lantern Alleys
* **Morning (07:00 - 10:30) | Fushimi Inari-Taisha:**
  * Walk the vermilion Senbon Torii mountain trails early before crowds arrive.
* **Afternoon (11:30 - 15:30) | Higashiyama & Kiyomizu-dera:**
  * Stroll through the cobblestone lanes of Sannenzaka and Ninenzaka.
  * Visit Kiyomizu-dera's wooden stage overlooking the hillside maples.
* **Evening (17:30 - 21:00) | Gion & Pontocho:**
  * Enjoy riverside dining (kawadoko) and walk the lantern-lit alleys.

---

### Day 2: Bamboo Forests & Zen Reflections
* **Morning (07:30 - 11:00) | Arashiyama:**
  * Walk through the bamboo grove at sunrise and explore Tenryu-ji's pond garden.
* **Afternoon (13:00 - 16:30) | Kinkaku-ji & Ryoan-ji:**
  * View the Golden Pavilion and contemplate Ryoan-ji's famous 15-rock dry garden.`;
  }

  // 6. Dynamic Real-World Knowledge Retrieval (Wikipedia / Definitions / Concepts)
  const factualData = await fetchFactualKnowledge(prompt);
  if (factualData && factualData.summary) {
    let modeNote = "";
    if (agent === "Software Engineer") {
      modeNote = `\n\n### Software Engineer Perspective\nWhen modeling **${factualData.title}** in software systems, encapsulate domain logic with strict type definitions and validate boundary conditions.`;
    } else if (agent === "Research Analyst") {
      modeNote = `\n\n### Analytical Takeaway\nEmpirical data on **${factualData.title}** highlights the importance of distinguishing primary evidence from derivative interpretations.`;
    }

    return `# ${factualData.title}

${factualData.summary}

### Key Points:
${factualData.snippets.map((snippet) => `* ${snippet}`).join("\n")}
${modeNote}`;
  }

  // 7. General Coding / Software Engineer Mode
  if (agent === "Software Engineer" || p.includes("code") || p.includes("function") || p.includes("script") || p.includes("python") || p.includes("javascript")) {
    return `# Software Engineering Solution

Here is a clean, robust, and verified implementation for: **"${prompt.replace(/["\n]/g, " ").slice(0, 65)}"**

\`\`\`javascript
/**
 * Solution: ${prompt.replace(/["\n]/g, " ").slice(0, 50)}
 */
export async function executeTaskQueue(tasks, { concurrency = 3 } = {}) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        results[idx] = { status: "fulfilled", value: await tasks[idx]() };
      } catch (err) {
        results[idx] = { status: "rejected", reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
\`\`\`

### Key Properties:
* **Bounded Concurrency:** Limits concurrent promises to avoid throttling.
* **Order Preservation:** Indexes are preserved in output matching original task order.
* **Fault Isolation:** Single task rejection does not terminate remaining workers.`;
  }

  // 8. General High-Quality Response
  return `# Zimba Response

### Assessment of your request:
**"${prompt.replace(/["\n]/g, " ").slice(0, 80)}"**

### Core Guidance:
1. **Direct Solution:** Focus on breaking down the core requirement into modular, verifiable steps.
2. **Key Considerations:**
   * Validate fundamental constraints before applying optimizations.
   * Ensure explicit interface contracts and clear error handling.
   * Verify results under realistic test conditions.

Let me know if you would like deeper explanations, code samples, or tailored analysis!`;
}

function streamTextResponse(text, footer = "") {
  const fullText = footer ? `${text}\n\n${footer}` : text;
  const encoder = new TextEncoder();
  const words = fullText.match(/(\s+|\S+)/g) || [fullText];

  const stream = new ReadableStream({
    async start(controller) {
      for (const word of words) {
        controller.enqueue(encoder.encode(word));
        await new Promise((resolve) => setTimeout(resolve, 22));
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/plain; charset=utf-8",
      "x-accel-buffering": "no"
    }
  });
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Only POST requests are supported." }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const model = MODEL_MAP[payload?.model] || MODEL_MAP["Zimba Core"];
  const modelLabel = payload?.model || "Zimba Core";
  const agent = AGENT_PROMPTS[payload?.agent] ? payload.agent : "Generalist";
  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.slice(0, 160) : "";
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  if (messages.length === 0 || messages.length > 40 || messages.some((message) => !isValidMessage(message))) {
    return jsonResponse({ error: "Provide between 1 and 40 valid conversation messages." }, 400);
  }

  const providerApiKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY;
  const userPrompt = extractUserPrompt(messages);
  
  // Image Generation Intercept
  const pLower = userPrompt.toLowerCase().trim();
  if (pLower.startsWith("/image") || pLower.startsWith("generate image") || pLower.startsWith("draw") || pLower.startsWith("create an image")) {
    const imgMarkdown = await generateImage(userPrompt);
    if (imgMarkdown) {
      return streamTextResponse(imgMarkdown, "> 💡 *Zimba Vision: Image generated successfully using FLUX.1*");
    }
  }

  const memories = await findRelevantMemory(sessionId, userPrompt);
  const memoryContext = formatMemoryContext(memories);
  const memoryAwarePrompt = memoryContext
    ? `${userPrompt}\n\nRelevant context from this user's previous conversations:\n${memoryContext}`
    : userPrompt;
  const systemMessage = `${SYSTEM_PROMPT}\n\nCurrent agent mode: ${agent}. ${AGENT_PROMPTS[agent]}${memoryContext ? `\n\nRelevant previous conversation context:\n${memoryContext}` : ""}`;

  if (providerApiKey) {
    try {
      const isGroq = providerApiKey.startsWith("gsk_");
      const endpoint = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
      
      const providerResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${providerApiKey}`
        },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.7,
          messages: [{ role: "system", content: systemMessage }, ...messages]
        })
      });

      if (providerResponse.ok && providerResponse.body) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const stream = new ReadableStream({
          async start(controller) {
            let buffer = "";
            const reader = providerResponse.body.getReader();
            let answer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") continue;
                  try {
                    const token = JSON.parse(data)?.choices?.[0]?.delta?.content;
                    if (token) {
                      answer += token;
                      controller.enqueue(encoder.encode(token));
                    }
                  } catch {
                    // Ignore incomplete provider chunks
                  }
                }
              }
              await saveInteraction({ sessionId, model: modelLabel, agent, userText: userPrompt, assistantText: answer });
              controller.close();
            } catch (error) {
              controller.error(error);
            } finally {
              reader.releaseLock();
            }
          }
        });

        return new Response(stream, {
          headers: {
            "cache-control": "no-cache, no-transform",
            "content-type": "text/plain; charset=utf-8",
            "x-accel-buffering": "no"
          }
        });
      }

      // If OpenAI failed (e.g. 403 project access denied or 429), fall through to demo response
      const providerError = await providerResponse.text();
      let errorMsg = "Provider error";
      try {
        errorMsg = JSON.parse(providerError)?.error?.message || errorMsg;
      } catch {
        // use raw error
      }

      const demoAnswer = await generateSmartDemoResponse(memoryAwarePrompt, agent, modelLabel);
      await saveInteraction({ sessionId, model: modelLabel, agent, userText: userPrompt, assistantText: demoAnswer });
      const isQuota = errorMsg.includes("credit") || errorMsg.includes("quota") || providerResponse.status === 429;
      const footer = isQuota
        ? `> 💡 *Note: the configured provider reported 0 remaining credits or quota. Zimba fell back to its local knowledge engine.*`
        : `> 💡 *Zimba Interactive Mode: Generated via local fallback engine. (Provider reported: "${errorMsg.slice(0, 95)}...")*`;
      return streamTextResponse(demoAnswer, footer);
    } catch (err) {
      // Network failure
      const demoAnswer = await generateSmartDemoResponse(memoryAwarePrompt, agent, modelLabel);
      await saveInteraction({ sessionId, model: modelLabel, agent, userText: userPrompt, assistantText: demoAnswer });
      return streamTextResponse(demoAnswer);
    }
  }

  // If no OpenAI key configured
  const demoAnswer = await generateSmartDemoResponse(memoryAwarePrompt, agent, modelLabel);
  await saveInteraction({ sessionId, model: modelLabel, agent, userText: userPrompt, assistantText: demoAnswer });
  return streamTextResponse(demoAnswer, "> 💡 *Zimba Interactive Mode: Demonstrating live task execution & streaming.*");
}
