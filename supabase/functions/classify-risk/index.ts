import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_VERTEX_AI_API_KEY = Deno.env.get('GOOGLE_VERTEX_AI_API_KEY');
    if (!GOOGLE_VERTEX_AI_API_KEY) {
      console.error('GOOGLE_VERTEX_AI_API_KEY is not configured');
      throw new Error('Google Vertex AI service not configured');
    }

    const accidentData: AccidentData = await req.json();
    console.log('Received accident data for classification:', accidentData);

    // Calculate additional metrics
    let locationChange = 0;
    if (accidentData.previousLatitude && accidentData.previousLongitude) {
      const R = 6371; // Earth's radius in km
      const dLat = (accidentData.latitude - accidentData.previousLatitude) * Math.PI / 180;
      const dLon = (accidentData.longitude - accidentData.previousLongitude) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(accidentData.previousLatitude * Math.PI / 180) * 
        Math.cos(accidentData.latitude * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      locationChange = R * c * 1000; // Distance in meters
    }

    const hour = new Date(accidentData.timestamp).getHours();
    const isNightTime = hour < 6 || hour >= 22;
    const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

    const prompt = `You are an AI accident risk classifier for an emergency monitoring system. Analyze the following accident data and classify the risk level.

Accident Data:
- Speed at detection: ${accidentData.speed || 0} km/h
- Location change: ${locationChange.toFixed(2)} meters
- Time of incident: ${new Date(accidentData.timestamp).toLocaleTimeString()}
- Night time: ${isNightTime ? 'Yes' : 'No'}
- Rush hour: ${isRushHour ? 'Yes' : 'No'}
- Coordinates: ${accidentData.latitude}, ${accidentData.longitude}

Risk Classification Criteria:
- HIGH: Speed > 60 km/h, or large sudden location change (>50m), or night time with speed > 40 km/h
- MEDIUM: Speed between 30-60 km/h, or moderate location change (20-50m), or rush hour conditions
- LOW: Speed < 30 km/h, minor location change, daytime, non-rush hour

Respond with ONLY a JSON object in this exact format:
{"risk_level": "low|medium|high", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

    console.log('Sending request to Google Vertex AI (Gemini)...');

    // Using Google Gemini API - gemini-2.0-flash is the current available model
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_VERTEX_AI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are an accident risk classification AI. Always respond with valid JSON only.\n\n${prompt}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 256,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE"
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Vertex AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'API key invalid or quota exceeded. Please check your Google Cloud configuration.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Google Vertex AI error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log('Google Vertex AI response:', JSON.stringify(aiResponse));

    // Extract content from Gemini response format
    const content = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      console.error('No content in AI response:', aiResponse);
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    let classification;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        classification = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      // Fallback to rule-based classification
      const speed = accidentData.speed || 0;
      classification = {
        risk_level: speed > 60 ? 'high' : speed > 30 ? 'medium' : 'low',
        confidence: 0.7,
        reasoning: 'Fallback classification based on speed data'
      };
    }

    console.log('Classification result:', classification);

    return new Response(
      JSON.stringify({
        risk_level: classification.risk_level,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        analyzed_at: new Date().toISOString(),
        powered_by: 'Google Vertex AI (Gemini)'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in classify-risk function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Classification failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
