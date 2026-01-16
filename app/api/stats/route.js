import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('attendees')
      .select('status');
    
    if (error) throw error;
    
    const total = data.length;
    const checked_in = data.filter(a => a.status === 'checked_in').length;
    const checked_out = data.filter(a => a.status === 'checked_out').length;
    const pending = data.filter(a => a.status === 'not_checked_in').length;
    
    return NextResponse.json({
      total,
      checked_in,
      checked_out,
      pending,
      currently_inside: checked_in - checked_out,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json(
      { 
        error: error.message,
        total: 0,
        checked_in: 0,
        checked_out: 0,
        pending: 0,
        currently_inside: 0,
        lastUpdated: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}