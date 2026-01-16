import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client directly
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('attendees')
      .select('status');
    
    if (error) throw error;
    
    const stats = {
      total: data.length,
      checked_in: data.filter(a => a.status === 'checked_in').length,
      checked_out: data.filter(a => a.status === 'checked_out').length,
      pending: data.filter(a => a.status === 'not_checked_in').length
    };
    
    return NextResponse.json(stats);
    
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}