const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "Request failed");
  }
  return body;
}

export async function streamRequest(path, body, onEvent, signal) {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Request failed");
    }
    if (!response.body) throw new Error("Streaming is not supported by this browser");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const rawEvent of events) {
          const eventName = rawEvent.match(/^event: (.+)$/m)?.[1] || "message";
          const data = rawEvent.match(/^data: (.+)$/m)?.[1];
          if (data) onEvent(eventName, JSON.parse(data));
        }
        if (done) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
}
