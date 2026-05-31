import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://sqjrspgoaqueaxxmhxvu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxanJzcGdvYXF1ZWF4eG1oeHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTU0MjAsImV4cCI6MjA4OTQ5MTQyMH0.MC1ZGKAtziQPETjGO5ivYlOd586i0iGaT8gaoD6wkpQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
