/**
 * Convert OpenAI format messages to Anthropic format
 * OpenAI: { role: "user|assistant|system", content: "text" }
 * Anthropic: { role: "user|assistant", content: [{ type: "text", text: "..." }] }
 */
export function openAIToAnthropic(body) {
  const { model, messages, stream, max_tokens, temperature, ...rest } = body;

  // Build Anthropic format messages
  const anthropicMessages = messages.map((msg) => {
    // Handle system messages - Anthropic uses system parameter instead of system role
    if (msg.role === "system") {
      return null;
    }

    // Convert content to array format if string
    let content = msg.content;
    if (typeof content === "string") {
      content = [{ type: "text", text: content }];
    } else if (Array.isArray(content)) {
      content = content.map((item) => {
        if (item.type === "text") {
          return { type: "text", text: item.text };
        }
        return item;
      });
    }

    return {
      role: msg.role === "assistant" ? "assistant" : "user",
      content,
    };
  }).filter(Boolean);

  // Extract system message if present
  const systemMessage = messages.find((msg) => msg.role === "system");

  const anthropicBody = {
    model,
    messages: anthropicMessages,
    stream: stream ?? false,
    max_tokens: max_tokens ?? 8192,
  };

  // Add system prompt if exists
  if (systemMessage && typeof systemMessage.content === "string") {
    anthropicBody.system = systemMessage.content;
  } else if (systemMessage?.content?.[0]?.text) {
    anthropicBody.system = systemMessage.content[0].text;
  }

  // Add thinking parameter for models that support it
  if (model?.includes("stepfun") || rest.thinking) {
    anthropicBody.thinking = rest.thinking ?? {
      type: "enabled",
      budget_tokens: rest.thinking?.budget_tokens ?? 10240,
    };
  }

  // Add other optional parameters
  if (temperature !== undefined) {
    anthropicBody.temperature = temperature;
  }

  return anthropicBody;
}

/**
 * Convert Anthropic format response to OpenAI format
 * Anthropic: { content: [{ type: "text", text: "..." }], usage: {...} }
 * OpenAI: { choices: [{ message: { content: "..." } }], usage: {...} }
 */
export function anthropicToOpenAI(anthropicData, model, id) {
  // Extract text content from Anthropic response
  let content = "";
  if (typeof anthropicData === "string") {
    content = anthropicData;
  } else if (anthropicData?.content) {
    if (Array.isArray(anthropicData.content)) {
      // Handle content array format
      const textParts = anthropicData.content
        .filter((item) => item.type === "text")
        .map((item) => item.text);
      content = textParts.join("");
    } else if (typeof anthropicData.content === "string") {
      content = anthropicData.content;
    }
  }

  return {
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
    usage: {
      prompt_tokens: anthropicData?.usage?.input_tokens ?? 0,
      completion_tokens: anthropicData?.usage?.output_tokens ?? 0,
      total_tokens: (anthropicData?.usage?.input_tokens ?? 0) + (anthropicData?.usage?.output_tokens ?? 0),
    },
  };
}

/**
 * Convert Anthropic SSE stream chunk to OpenAI format
 */
export function anthropicSSEToOpenAIChunk(chunk, model, id) {
  const parsed = typeof chunk === "string" ? JSON.parse(chunk) : chunk;

  // Anthropic SSE format: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
  // OpenAI SSE format: { choices: [{ delta: { content: "..." } }] }

  let content = "";

  if (parsed?.delta?.text) {
    content = parsed.delta.text;
  } else if (parsed?.content_block?.text) {
    content = parsed.content_block.text;
  }

  if (!content) return null;

  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null,
      },
    ],
  };
}