import { createClient } from "@supabase/supabase-js";

// Use the anon/public key here — NOT the service role key.
// The service role key bypasses RLS and must never be exposed in frontend code.
// Find both keys at: Supabase Dashboard → Settings → API
const supabase = createClient(
  "https://sqjrspgoaqueaxxmhxvu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxanJzcGdvYXF1ZWF4eG1oeHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTU0MjAsImV4cCI6MjA4OTQ5MTQyMH0.MC1ZGKAtziQPETjGO5ivYlOd586i0iGaT8gaoD6wkpQ"
);

export default supabase;