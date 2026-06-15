/**
 * Generate a random chat completion ID like "chatcmpl-xxxx"
 */
export function generateId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `chatcmpl-${id}`;
}

/**
 * Format a text chunk as an OpenAI-compatible SSE line
 */
export function formatSSEChunk(text, model, id) {
  return (
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: { content: text },
          finish_reason: null,
        },
      ],
    })}\n\n`
  );
}

/**
 * Format the final SSE chunk (finish_reason: "stop")
 */
export function formatSSEDone(id, model) {
  return (
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
    })}\n\n` + "data: [DONE]\n\n"
  );
}
