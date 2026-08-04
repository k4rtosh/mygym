/**
 * MyGym coach-enrich — rewrite rule-coach card title/body from JSON facts.
 * Same card ids; never invents new cards; no free chat.
 *
 * Deploy: supabase functions deploy coach-enrich
 * Secrets (optional): OPENAI_API_KEY — when unset, echoes input (passthrough stub).
 *
 * Request: { facts, cards: [{ id, title, body, severity?, kind? }] }
 * Response: { cards: [{ id, title, body }] }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CardIn = {
  id?: string;
  title?: string;
  body?: string;
  severity?: string;
  kind?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function passthrough(cards: CardIn[]) {
  return {
    cards: cards
      .filter((c) => c && c.id)
      .map((c) => ({
        id: String(c.id),
        title: String(c.title || ""),
        body: String(c.body || ""),
      })),
  };
}

async function rewriteWithOpenAI(
  apiKey: string,
  facts: unknown,
  cards: CardIn[],
): Promise<{ cards: { id: string; title: string; body: string }[] }> {
  const system = [
    "Ты редактор текстов для фитнес-коуча MyGym.",
    "Перепиши title и body карточек короче и живее на русском.",
    "Не меняй смысл и факты. Не добавляй новые карточки или id.",
    "Не давай медицинских советов. Не выдумывай веса/даты.",
    "Ответ — только JSON: {\"cards\":[{\"id\",\"title\",\"body\"}]}.",
  ].join(" ");

  const user = JSON.stringify({ facts, cards });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("COACH_LLM_MODEL") || "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    console.error("openai error", res.status, await res.text());
    return passthrough(cards);
  }

  const payload = await res.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) return passthrough(cards);

  try {
    const parsed = JSON.parse(text);
    const out = Array.isArray(parsed?.cards) ? parsed.cards : [];
    const byId = new Map(
      cards.filter((c) => c?.id).map((c) => [String(c.id), c]),
    );
    const merged = out
      .filter((c: CardIn) => c?.id && byId.has(String(c.id)))
      .map((c: CardIn) => {
        const orig = byId.get(String(c.id))!;
        return {
          id: String(c.id),
          title: String(c.title || orig.title || "").slice(0, 120),
          body: String(c.body || orig.body || "").slice(0, 600),
        };
      });
    // Ensure every input id is present
    for (const [id, orig] of byId) {
      if (!merged.some((m: { id: string }) => m.id === id)) {
        merged.push({
          id,
          title: String(orig.title || ""),
          body: String(orig.body || ""),
        });
      }
    }
    return { cards: merged };
  } catch (e) {
    console.error("parse error", e);
    return passthrough(cards);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: { facts?: unknown; cards?: CardIn[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const cards = Array.isArray(body.cards) ? body.cards : [];
  if (!cards.length) return json({ cards: [] });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    // Stub / offline: echo rules text so clients can exercise the pipeline.
    return json(passthrough(cards));
  }

  try {
    const result = await rewriteWithOpenAI(apiKey, body.facts ?? null, cards);
    return json(result);
  } catch (e) {
    console.error(e);
    return json(passthrough(cards));
  }
});
