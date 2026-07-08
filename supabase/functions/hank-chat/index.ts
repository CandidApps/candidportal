// Hank chat — Anthropic Claude via Supabase Edge Function.
// Secret: ANTHROPIC_API_KEY (Dashboard → Edge Functions → Secrets)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
};

function estimateCostUsd(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): number {
  const input = Number(usage.input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  const cacheWrite = Number(usage.cache_creation_input_tokens) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens) || 0;
  return (
    (input / 1_000_000) * 3 +
    (output / 1_000_000) * 15 +
    (cacheWrite / 1_000_000) * 3.75 +
    (cacheRead / 1_000_000) * 0.3
  );
}

async function logUsage(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  } | undefined,
): Promise<void> {
  if (!usage) return;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    const admin = createClient(url, key);
    const estimated = estimateCostUsd(usage);
    const row = {
      route_label: "hank-edge",
      feature_area: "Other",
      feature_name: "Hank edge function",
      model: "claude-sonnet-4-6",
      input_tokens: Number(usage.input_tokens) || 0,
      output_tokens: Number(usage.output_tokens) || 0,
      cache_creation_input_tokens: Number(usage.cache_creation_input_tokens) || 0,
      cache_read_input_tokens: Number(usage.cache_read_input_tokens) || 0,
      max_tokens: 1000,
      estimated_cost_usd: Math.round(estimated * 1_000_000) / 1_000_000,
    };
    const { error } = await admin.from("claude_usage_events").insert(row);
    if (error && !/feature_area|feature_name/.test(error.message)) {
      await admin.from("claude_usage_events").insert({
        route_label: row.route_label,
        model: row.model,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        cache_creation_input_tokens: row.cache_creation_input_tokens,
        cache_read_input_tokens: row.cache_read_input_tokens,
        max_tokens: row.max_tokens,
        estimated_cost_usd: row.estimated_cost_usd,
      });
    }
  } catch {
    /* best-effort */
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const { messages, systemPrompt } = await req.json();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages
      })
    });

    const data = await response.json();
    if (response.ok) {
      await logUsage(data.usage);
    }

    return new Response(JSON.stringify(data), {
      status: response.ok ? 200 : response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
