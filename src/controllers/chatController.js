import config, { getModelsList } from "../config/index.js";
import { forwardChat, forwardChatStream, isZenMuxModel, isOvhModel } from "../services/upstreamService.js";
import { generateId, formatSSEChunk, formatSSEDone } from "../utils/sse.js";
import { anthropicToOpenAI } from "../utils/formatConverter.js";

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

  // console.log("Incoming request body:", JSON.stringify(req.body, null, 2));
  const { model, messages, stream = true } = req.body;

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
  const model2 = req.body.model;
  const raw = await forwardChat(upstreamBody,model2);
  const id = generateId();
  const model = upstreamBody.model;

  // Check if response came from ZenMux (Anthropic format)
  if (isZenMuxModel(model)) {
    const result = anthropicToOpenAI(raw, model, id);
    return res.json(result);
  }

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
    model,
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
  const model = upstreamBody.model;
  const model2 = req.body.model;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  
  try {
    const upstreamRes = await forwardChatStream(upstreamBody,model2);

    if (isZenMuxModel(model2)) {
      return handleZenMuxStream(req, res, upstreamRes, id, model);
    }
    else{
      return handleTheOldLlmStream(req, res, upstreamRes, id, model);
    }

   
  } catch (err) {
    // If stream connection fails, send SSE error and close
    console.error("stream setup error:", err.message);
    res.write(formatSSEDone(id, model));
    res.end();
  }
}

/**
 * Handle streaming from theoldllm (OpenAI SSE format)
 */
function handleTheOldLlmStream(req, res, upstreamRes, id, model) {
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
        res.write(formatSSEDone(id, model));
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
            res.write(formatSSEChunk(content, model, id));
          }
        } catch {
          // If upstream sends plain text instead of JSON SSE, forward as-is
          const text = trimmed.slice(6);
          if (text) {
            res.write(formatSSEChunk(text, model, id));
          }
        }
      }
    }
  });

  upstreamRes.data.on("end", () => {
    // Flush remaining buffer
    if (buffer.trim() === "data: [DONE]" || !buffer.trim()) {
      res.write(formatSSEDone(id, model));
    }
    res.end();
  });

  upstreamRes.data.on("error", (err) => {
    console.error("upstream stream error:", err.message);
    res.write(formatSSEDone(id, model));
    res.end();
  });

  // Handle client disconnect
  req.on("close", () => {
    upstreamRes.data.destroy();
  });
}

/**
 * Handle streaming from ZenMux (Anthropic SSE format)
 * Anthropic SSE uses event: + data: pairs with different structure
 */
function handleZenMuxStream(req, res, upstreamRes, id, model) {
  let buffer = "";
  let lastEvent = "";

  upstreamRes.data.on("data", (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Track event type
      if (trimmed.startsWith("event: ")) {
        lastEvent = trimmed.slice(7).trim();
        continue;
      }

      // Process data lines
      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6).trim();

        // Skip ping events
        if (!dataStr || dataStr === "[DONE]" || lastEvent === "ping") {
          continue;
        }

        try {
          const parsed = JSON.parse(dataStr);

          // Anthropic SSE types we care about:
          // content_block_delta: has delta.text
          // message_stop: stream ended
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            res.write(formatSSEChunk(parsed.delta.text, model, id));
          } else if (parsed.type === "message_stop") {
            res.write(formatSSEDone(id, model));
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  });

  upstreamRes.data.on("end", () => {
    // Ensure we send done if not already sent
    res.write(formatSSEDone(id, model));
    res.end();
  });

  upstreamRes.data.on("error", (err) => {
    console.error("zenmux stream error:", err.message);
    res.write(formatSSEDone(id, model));
    res.end();
  });

  req.on("close", () => {
    upstreamRes.data.destroy();
  });
}
