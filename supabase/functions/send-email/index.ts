import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  userId: string;
  message: string;
  latitude: number;
  longitude: number;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, message, latitude, longitude }: EmailRequest = await req.json();

    console.log(`Processing email notification for user: ${userId}`);

    // Get SMTP credentials from environment
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      console.error("Missing SMTP credentials");
      return new Response(
        JSON.stringify({ error: "SMTP credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch emergency contacts for this user
    const { data: contacts, error: contactsError } = await supabase
      .from("emergency_contacts")
      .select("id, name, phone, email")
      .eq("user_id", userId);

    if (contactsError) {
      console.error("Error fetching contacts:", contactsError);
      throw new Error(`Failed to fetch contacts: ${contactsError.message}`);
    }

    if (!contacts || contacts.length === 0) {
      console.log("No emergency contacts found for user");
      return new Response(
        JSON.stringify({ success: true, message: "No emergency contacts to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's profile for their name
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", userId)
      .single();

    if (profileError) {
      console.warn("Could not fetch user profile:", profileError);
    }

    const userName = profile?.full_name || "A SafeGuard user";
    const userPhone = profile?.phone || "Not available";
    const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

    // Filter contacts with email addresses
    const emailContacts = contacts.filter((contact: { email?: string }) => contact.email && contact.email.trim() !== "");

    if (emailContacts.length === 0) {
      console.log("No contacts have email addresses");
      return new Response(
        JSON.stringify({ success: true, message: "No contacts with email addresses to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create SMTP client
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: parseInt(smtpPort),
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    });

    const results: { contact: string; status: string; error?: string }[] = [];

    for (const contact of emailContacts) {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
              .alert-box { background: #fef2f2; border: 2px solid #dc2626; padding: 15px; border-radius: 8px; margin: 15px 0; }
              .location-btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
              .footer { background: #1f2937; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚨 EMERGENCY ALERT</h1>
              </div>
              <div class="content">
                <div class="alert-box">
                  <h2 style="color: #dc2626; margin-top: 0;">Emergency Notification</h2>
                  <p><strong>${userName}</strong> has triggered an emergency alert and may need immediate assistance!</p>
                </div>
                
                <h3>📍 Location Details</h3>
                <p>Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}</p>
                <a href="${mapsLink}" class="location-btn">📍 View Location on Google Maps</a>
                
                <h3>📞 Contact Information</h3>
                <p>User's Phone: ${userPhone}</p>
                
                <h3>⚠️ What to do</h3>
                <ul>
                  <li>Try to contact ${userName} immediately</li>
                  <li>If unable to reach them, consider calling emergency services</li>
                  <li>Share the location with authorities if needed</li>
                </ul>
              </div>
              <div class="footer">
                <p>This is an automated emergency alert from SafeGuard</p>
                <p>Time sent: ${new Date().toISOString()}</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await client.send({
          from: smtpUser,
          to: contact.email,
          subject: `🚨 EMERGENCY ALERT: ${userName} needs help!`,
          content: `EMERGENCY ALERT!\n\n${userName} has triggered an emergency alert.\n\nLocation: ${mapsLink}\n\nPlease try to contact them immediately or call emergency services.`,
          html: emailHtml,
        });

        console.log(`Email sent successfully to ${contact.name} (${contact.email})`);
        results.push({ contact: contact.name, status: "sent" });
      } catch (emailError) {
        console.error(`Failed to send email to ${contact.name}:`, emailError);
        results.push({ 
          contact: contact.name, 
          status: "failed", 
          error: emailError instanceof Error ? emailError.message : "Unknown error" 
        });
      }
    }

    await client.close();

    const successCount = results.filter((r) => r.status === "sent").length;
    console.log(`Email notifications complete: ${successCount}/${results.length} sent`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Emails sent to ${successCount} of ${results.length} contacts`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
