import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // Use the materialized view for faster queries
    const { data: statsData, error: statsError } = await supabase
      .from('attendees_stats')
      .select('*')
      .single();
    
    if (statsError) {
      console.log('Materialized view not available, falling back to direct query');
      // Fallback to direct query
      const { data, error } = await supabase
        .from('attendees')
        .select('status, check_in_time, check_out_time');
      
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
    }
    
    // If we have the materialized view, use it
    return NextResponse.json({
      total: statsData.total || 0,
      checked_in: statsData.checked_in || 0,
      checked_out: statsData.checked_out || 0,
      pending: statsData.pending || 0,
      currently_inside: (statsData.checked_in || 0) - (statsData.checked_out || 0),
      lastUpdated: statsData.last_updated || new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Stats error:', error);
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