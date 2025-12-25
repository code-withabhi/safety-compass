import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AccidentData {
  speed: number;
  latitude: number;
  longitude: number;
  previousLatitude?: number;
  previousLongitude?: number;
  timestamp: string;
  timeOfDay?: string;
}

type RiskLevel = "low" | "medium" | "high";

type Classification = {
  risk_level: RiskLevel;
  confidence: number;
  reasoning: string;
};

// Simple in-memory cache (helps avoid repeated calls during demos / retries)
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: Classification; expiresAt: number }>();

function calcLocationChangeMeters(data: AccidentData): number {
  if (!data.previousLatitude || !data.previousLongitude) return 0;
  const R = 6371; // km
  const dLat = (data.latitude - data.previousLatitude) * Math.PI / 180;
  const dLon = (data.longitude - data.previousLongitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(data.previousLatitude * Math.PI / 180) *
    Math.cos(data.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

function ruleBasedClassification(args: {
  speed: number;
  locationChange: number;
  isNightTime: boolean;
  isRushHour: boolean;
}): Classification {
  const { speed, locationChange, isNightTime, isRushHour } = args;

  const high = speed > 60 || locationChange > 50 || (isNightTime && speed > 40);
  const medium = (speed >= 30 && speed <= 60) || (locationChange >= 20 && locationChange <= 50) || isRushHour;

  const risk_level: RiskLevel = high ? "high" : medium ? "medium" : "low";

  let reasoning = "Rule-based fallback";
  if (high) reasoning = "High risk based on speed/location/time heuristics";
  else if (medium) reasoning = "Medium risk based on speed/location/traffic heuristics";
  else reasoning = "Low risk based on speed/location/time heuristics";

  return {
    risk_level,
    confidence: 0.55,
    reasoning,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      throw new Error("AI service not configured");
    }

    const accidentData: AccidentData = await req.json();
    console.log("Received accident data for classification:", accidentData);

    const locationChange = calcLocationChangeMeters(accidentData);
    const ts = new Date(accidentData.timestamp);
    const hour = ts.getHours();
    const isNightTime = hour < 6 || hour >= 22;
    const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

    // Cache key (rounded to reduce cardinality)
    const cacheKey = [
      Math.round((accidentData.speed || 0) * 10) / 10,
      Math.round((accidentData.latitude || 0) * 1000) / 1000,
      Math.round((accidentData.longitude || 0) * 1000) / 1000,
      hour,
      Math.round(locationChange),
    ].join("|");

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log("Returning cached classification");
      return new Response(
        JSON.stringify({
          ...cached.value,
          analyzed_at: new Date().toISOString(),
          powered_by: "cache",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = `You are an AI accident risk classifier for an emergency monitoring system. Analyze the following accident data and classify the risk level.

Accident Data:
- Speed at detection: ${accidentData.speed || 0} km/h
- Location change: ${locationChange.toFixed(2)} meters
- Time of incident: ${ts.toLocaleTimeString()}
- Night time: ${isNightTime ? "Yes" : "No"}
- Rush hour: ${isRushHour ? "Yes" : "No"}
- Coordinates: ${accidentData.latitude}, ${accidentData.longitude}

Risk Classification Criteria:
- HIGH: Speed > 60 km/h, or large sudden location change (>50m), or night time with speed > 40 km/h
- MEDIUM: Speed between 30-60 km/h, or moderate location change (20-50m), or rush hour conditions
- LOW: Speed < 30 km/h, minor location change, daytime, non-rush hour

Respond with ONLY a JSON object in this exact format:
{"risk_level": "low|medium|high", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

    console.log("Calling Lovable AI (gemini-2.5-flash)...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are an accident risk classification AI. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 256,
      }),
    });

    // Handle rate limits and errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);

      if (response.status === 429) {
        console.log("Rate limited - using rule-based fallback");
        const fb = ruleBasedClassification({
          speed: accidentData.speed || 0,
          locationChange,
          isNightTime,
          isRushHour,
        });
        cache.set(cacheKey, { value: fb, expiresAt: Date.now() + CACHE_TTL_MS });

        return new Response(
          JSON.stringify({
            ...fb,
            analyzed_at: new Date().toISOString(),
            powered_by: "fallback",
            ai_error: "rate_limited",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (response.status === 402) {
        console.log("Payment required - using rule-based fallback");
        const fb = ruleBasedClassification({
          speed: accidentData.speed || 0,
          locationChange,
          isNightTime,
          isRushHour,
        });
        cache.set(cacheKey, { value: fb, expiresAt: Date.now() + CACHE_TTL_MS });

        return new Response(
          JSON.stringify({
            ...fb,
            analyzed_at: new Date().toISOString(),
            powered_by: "fallback",
            ai_error: "payment_required",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // For other errors, use fallback
      const fb = ruleBasedClassification({
        speed: accidentData.speed || 0,
        locationChange,
        isNightTime,
        isRushHour,
      });
      cache.set(cacheKey, { value: fb, expiresAt: Date.now() + CACHE_TTL_MS });

      return new Response(
        JSON.stringify({
          ...fb,
          analyzed_at: new Date().toISOString(),
          powered_by: "fallback",
          ai_error: "api_error",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiResponse = await response.json();
    console.log("Lovable AI response received");

    const content = aiResponse?.choices?.[0]?.message?.content as string | undefined;
    if (!content) {
      throw new Error("No response text from AI");
    }

    let classification: Classification;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      const parsed = JSON.parse(jsonMatch[0]);
      classification = {
        risk_level: parsed.risk_level,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "AI classification",
      };
    } catch (e) {
      console.error("Failed to parse AI response; using rule fallback. Content:", content);
      classification = ruleBasedClassification({
        speed: accidentData.speed || 0,
        locationChange,
        isNightTime,
        isRushHour,
      });
    }

    cache.set(cacheKey, { value: classification, expiresAt: Date.now() + CACHE_TTL_MS });

    return new Response(
      JSON.stringify({
        ...classification,
        analyzed_at: new Date().toISOString(),
        powered_by: "lovable_ai",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in classify-risk function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Classification failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
