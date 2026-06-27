import config, { getModelsList } from "../config/index.js";
import { forwardChat, forwardChatStream } from "../services/upstreamService.js";
import { generateId, formatSSEChunk, formatSSEDone } from "../utils/sse.js";

const FORCE_NO_STREAM = process.env.FORCE_NO_STREAM === "true";

export function listModels(req, res) {
  res.json({ object: "list", data: getModelsList() });
}

export async function chatCompletions(req, res) {
  const { messages, stream = true } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: { message: "messages array is required", type: "invalid_request_error" },
    });
  }

  const useStream = FORCE_NO_STREAM ? false : stream;

  try {
    if (useStream) {
      return await handleStream(req, res, req.body);
    }
    return await handleNonStream(req, res, req.body);
  } catch (err) {
    console.error("upstream error:", err.message);
    const status = err.response?.status ?? 500;
    return res.status(status).json({
      error: { message: err.message, type: "upstream_error" },
    });
  }
}

async function handleNonStream(req, res, body) {
  const id = generateId();
  const upstreamModel = config.modelMap[body.model] ?? body.model ?? config.defaultModel;
  const content = await forwardChat(body);

  return res.json({
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: upstreamModel,
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

async function handleStream(req, res, body) {
  const id = generateId();
  const upstreamModel = config.modelMap[body.model] ?? body.model ?? config.defaultModel;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const upstreamRes = await forwardChatStream(body);
    let buffer = "";

    upstreamRes.data.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed === "data: [DONE]") {
          res.write(formatSSEDone(id, upstreamModel));
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
            if (content) res.write(formatSSEChunk(content, upstreamModel, id));
          } catch {
            const text = trimmed.slice(6);
            if (text) res.write(formatSSEChunk(text, upstreamModel, id));
          }
        }
      }
    });

    upstreamRes.data.on("end", () => {
      if (buffer.trim() === "data: [DONE]" || !buffer.trim()) {
        res.write(formatSSEDone(id, upstreamModel));
      }
      res.end();
    });

    upstreamRes.data.on("error", (err) => {
      console.error("upstream stream error:", err.message);
      res.write(formatSSEDone(id, upstreamModel));
      res.end();
    });

    req.on("close", () => upstreamRes.data.destroy());
  } catch (err) {
    console.error("stream setup error:", err.message);
    res.write(formatSSEDone(id, upstreamModel));
    res.end();
  }
}