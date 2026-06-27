import config, { getModelsList } from "../config/index.js";
import { forwardChat, forwardChatStream, isZenMuxModel, isOvhModel } from "../services/upstreamService.js";
import { generateId, formatSSEChunk, formatSSEDone } from "../utils/sse.js";
import { anthropicToOpenAI } from "../utils/formatConverter.js";

const FORCE_NO_STREAM = process.env.FORCE_NO_STREAM === "true";

export function listModels(req, res) {
  res.json({ object: "list", data: getModelsList() });
}

export async function chatCompletions(req, res) {
  const { model, messages, stream = true } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: { message: "messages array is required", type: "invalid_request_error" },
    });
  }

  const upstreamModel = config.modelMap[model] ?? model ?? config.defaultModel;
  const useStream = FORCE_NO_STREAM ? false : stream;

  try {
    if (useStream) {
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

async function handleNonStream(req, res, upstreamBody) {
  const model2 = req.body.model;
  const raw = await forwardChat(upstreamBody, model2);
  const id = generateId();
  const model = upstreamBody.model;

  // ZenMux returns Anthropic-shaped object
  if (isZenMuxModel(model2)) {
    const result = anthropicToOpenAI(raw, model, id);
    return res.json(result);
  }

  // OVH returns standard OpenAI format — pass through
  if (isOvhModel(model2)) {
    return res.json(raw);
  }

  // theoldllm: forwardChat now returns a plain string (SSE parsed) or OpenAI object
  const content =
    typeof raw === "string"
      ? raw
      : raw?.choices?.[0]?.message?.content ??
        raw?.response ??
        raw?.content ??
        JSON.stringify(raw);

  return res.json({
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
  });
}

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
    const upstreamRes = await forwardChatStream(upstreamBody, model2);

    if (isZenMuxModel(model2)) {
      return handleZenMuxStream(req, res, upstreamRes, id, model);
    } else {
      return handleTheOldLlmStream(req, res, upstreamRes, id, model);
    }
  } catch (err) {
    console.error("stream setup error:", err.message);
    res.write(formatSSEDone(id, model));
    res.end();
  }
}

function handleTheOldLlmStream(req, res, upstreamRes, id, model) {
  let buffer = "";

  upstreamRes.data.on("data", (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split("\n");
    buffer = lines.pop();

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
          const text = trimmed.slice(6);
          if (text) {
            res.write(formatSSEChunk(text, model, id));
          }
        }
      }
    }
  });

  upstreamRes.data.on("end", () => {
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

  req.on("close", () => {
    upstreamRes.data.destroy();
  });
}

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

      if (trimmed.startsWith("event: ")) {
        lastEvent = trimmed.slice(7).trim();
        continue;
      }

      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6).trim();

        if (!dataStr || dataStr === "[DONE]" || lastEvent === "ping") {
          continue;
        }

        try {
          const parsed = JSON.parse(dataStr);

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