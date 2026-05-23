// Minimal wrapper for the Anthropic Messages API used by moderation + patch generation.
// Pinned to a stable API version. No streaming — small JSON outputs only.

const URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicResult {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function anthropic(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}): Promise<AnthropicResult> {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`anthropic ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = await res.json();
  const text: string =
    data?.content?.find?.((c: { type: string }) => c.type === "text")?.text ?? "";
  return { text, usage: data?.usage ?? { input_tokens: 0, output_tokens: 0 } };
}
