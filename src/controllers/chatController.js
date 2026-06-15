import config, { getModelsList } from "../config/index.js";
import { forwardChat, forwardChatStream } from "../services/upstreamService.js";
import { generateId, formatSSEChunk, formatSSEDone } from "../utils/sse.js";

/**
 * GET /v1/models
 */
export function listModels(req, res) {
  res.json({ object: "list", data: getModelsList() });
}

/**
 * POST /v1/chat/completions
 */
export async function chatCompletions(req, res) {
  const { model, messages, stream = false } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: { message: "messages array is required", type: "invalid_request_error" },
    });
  }

  const upstreamModel = config.modelMap[model] ?? model ?? config.defaultModel;

  try {
    if (stream) {
      return await handleStream(req, res, { ...req.body, model: upstreamModel });
    }
    return await handleNonStream(req, res, { ...req.body, model: upstreamModel });
  } catch (err) {
    console.error("upstream error:", err.message);
    const status = err.response?.status ?? 500;
    return res.status(status).json({
      error: { message: err.message, type: "upstream_error" },
    });
  }
}

/* ---------- non-stream ---------- */
async function handleNonStream(req, res, upstreamBody) {
  const raw = await forwardChat(upstreamBody);
  const id = generateId();

  // theoldllm may return { response: "..." } or an array of chunks
  // Normalise into OpenAI format
  const content =
    typeof raw === "string"
      ? raw
      : raw?.response ?? raw?.content ?? raw?.choices?.[0]?.message?.content ?? JSON.stringify(raw);

  const result = {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: upstreamBody.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };

  return res.json(result);
}

/* ---------- stream ---------- */
async function handleStream(req, res, upstreamBody) {
  const id = generateId();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const upstreamRes = await forwardChatStream(upstreamBody);
    let buffer = "";

    upstreamRes.data.on("data", (chunk) => {
      buffer += chunk.toString();

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed === "data: [DONE]") {
          res.write(formatSSEDone(id, upstreamBody.model));
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const content =
              parsed?.choices?.[0]?.delta?.content ??
              parsed?.response ??
              parsed?.content ??
              "";

            if (content) {
              res.write(formatSSEChunk(content, upstreamBody.model, id));
            }
          } catch {
            // If upstream sends plain text instead of JSON SSE, forward as-is
            const text = trimmed.slice(6);
            if (text) {
              res.write(formatSSEChunk(text, upstreamBody.model, id));
            }
          }
        }
      }
    });

    upstreamRes.data.on("end", () => {
      // Flush remaining buffer
      if (buffer.trim() === "data: [DONE]" || !buffer.trim()) {
        res.write(formatSSEDone(id, upstreamBody.model));
      }
      res.end();
    });

    upstreamRes.data.on("error", (err) => {
      console.error("upstream stream error:", err.message);
      res.write(formatSSEDone(id, upstreamBody.model));
      res.end();
    });

    // Handle client disconnect
    req.on("close", () => {
      upstreamRes.data.destroy();
    });
  } catch (err) {
    // If stream connection fails, send SSE error and close
    console.error("stream setup error:", err.message);
    res.write(formatSSEDone(id, upstreamBody.model));
    res.end();
  }
}
