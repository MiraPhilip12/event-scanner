import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        total: 0,
        checked_in: 0,
        checked_out: 0,
        pending: 0,
        message: 'Supabase not configured'
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase
      .from('attendees')
      .select('status')
      .limit(100);
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({
        total: 0,
        checked_in: 0,
        checked_out: 0,
        pending: 0,
        error: 'Database error'
      });
    }
    
    const total = data?.length || 0;
    const checked_in = data?.filter(a => a.status === 'checked_in').length || 0;
    const checked_out = data?.filter(a => a.status === 'checked_out').length || 0;
    const pending = data?.filter(a => a.status === 'not_checked_in').length || 0;
    
    return NextResponse.json({
      total,
      checked_in,
      checked_out,
      pending,
      currently_inside: checked_in - checked_out,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({
      total: 0,
      checked_in: 0,
      checked_out: 0,
      pending: 0,
      error: 'Server error'
    });
  }
}