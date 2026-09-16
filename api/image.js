function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
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

  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt || prompt.length > 4000) {
    return jsonResponse({ error: "Provide an image description between 1 and 4,000 characters." }, 400);
  }

  const configuredOpenAiKey = process.env.OPENAI_API_KEY || "";
  const nvidiaApiKey = process.env.NVIDIA_API_KEY || (configuredOpenAiKey.startsWith("nvapi-") ? configuredOpenAiKey : "");
  const openAiApiKey = configuredOpenAiKey.startsWith("sk-") ? configuredOpenAiKey : "";
  const apiKey = nvidiaApiKey || openAiApiKey;
  if (!apiKey) {
    return jsonResponse({ error: "Image generation needs a server-side NVIDIA_API_KEY or OPENAI_API_KEY. Add it to .env and restart the app." }, 503);
  }

  try {
    const usesNvidia = Boolean(nvidiaApiKey);
    const providerResponse = await fetch(
      usesNvidia
        ? "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell"
        : "https://api.openai.com/v1/images/generations",
      {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(usesNvidia
        ? { prompt, width: 1024, height: 1024, samples: 1, steps: 4, seed: 0 }
        : { model: "gpt-image-1", prompt, size: "1024x1024", quality: "low", output_format: "png" })
      }
    );

    if (!providerResponse.ok) {
      const errorData = await providerResponse.json().catch(() => ({}));
      return jsonResponse({ error: errorData?.detail || errorData?.error?.message || "The image provider rejected the request." }, providerResponse.status);
    }

    const data = await providerResponse.json().catch(() => ({}));
    const imageData = usesNvidia
      ? data?.artifacts?.[0]?.base64 || data?.image
      : data?.data?.[0]?.b64_json;
    if (!imageData) return jsonResponse({ error: "The image provider returned no image data." }, 502);
    return jsonResponse({ imageUrl: `data:image/${usesNvidia ? "jpeg" : "png"};base64,${imageData}` });
  } catch (error) {
    return jsonResponse({ error: `Could not reach the image provider: ${error.message}` }, 502);
  }
}
