import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SMSRequest {
  userId: string;
  message: string;
  latitude: number;
  longitude: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fast2smsApiKey = Deno.env.get("FAST2SMS_API_KEY");
    if (!fast2smsApiKey) {
      throw new Error("FAST2SMS_API_KEY not configured");
    }

    const { userId, message, latitude, longitude }: SMSRequest = await req.json();
    console.log("Received SMS request for user:", userId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch emergency contacts for the user
    const { data: contacts, error: contactsError } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("user_id", userId);

    if (contactsError) {
      console.error("Error fetching contacts:", contactsError);
      throw new Error("Failed to fetch emergency contacts");
    }

    if (!contacts || contacts.length === 0) {
      console.log("No emergency contacts found for user");
      return new Response(
        JSON.stringify({ success: true, message: "No emergency contacts to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get user profile for name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", userId)
      .single();

    const userName = profile?.full_name || "A user";
    const googleMapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;

    // Prepare SMS message
    const smsMessage = `EMERGENCY ALERT! ${userName} has triggered an emergency alert. Location: ${googleMapsLink}. Please check on them immediately.`;

    console.log("Sending SMS to", contacts.length, "contacts");

    // Send SMS to each contact
    const results = await Promise.allSettled(
      contacts.map(async (contact) => {
        // Clean phone number - remove country code if present, keep only digits
        let phoneNumber = contact.phone.replace(/\D/g, "");
        // Remove leading 91 if present (Indian country code)
        if (phoneNumber.startsWith("91") && phoneNumber.length > 10) {
          phoneNumber = phoneNumber.slice(2);
        }
        // Take last 10 digits
        phoneNumber = phoneNumber.slice(-10);

        console.log(`Sending SMS to ${contact.name} at ${phoneNumber}`);

        const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
          method: "POST",
          headers: {
            "authorization": fast2smsApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            route: "q", // Quick SMS route
            message: smsMessage,
            language: "english",
            flash: 0,
            numbers: phoneNumber,
          }),
        });

        const result = await response.json();
        console.log(`SMS result for ${contact.name}:`, result);

        return {
          contact: contact.name,
          phone: phoneNumber,
          success: result.return === true,
          response: result,
        };
      })
    );

    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;

    console.log(`SMS sent successfully to ${successCount}/${contacts.length} contacts`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `SMS sent to ${successCount}/${contacts.length} contacts`,
        results: results.map((r) =>
          r.status === "fulfilled" ? r.value : { error: r.reason }
        ),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-sms function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
