import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request) {
  try {
    const { qrPayload, scanType, deviceId, operator } = await request.json();
    
    console.log('Scan received:', { qrPayload, scanType, operator });
    
    // Find attendee
    const { data: attendee, error: findError } = await supabase
      .from('attendees')
      .select('*')
      .eq('qr_payload', qrPayload)
      .single();
    
    if (findError || !attendee) {
      return NextResponse.json(
        { error: 'Attendee not found' },
        { status: 404 }
      );
    }
    
    // VALIDATION LOGIC
    if (scanType === 'check_in') {
      // Prevent duplicate check-in
      if (attendee.status === 'checked_in') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Already checked in',
            attendee: attendee
          },
          { status: 400 }
        );
      }
      
      // Prevent checking in if already checked out
      if (attendee.status === 'checked_out') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Already checked out. Cannot check in again.',
            attendee: attendee
          },
          { status: 400 }
        );
      }
    }
    
    if (scanType === 'check_out') {
      // Must be checked in to check out
      if (attendee.status !== 'checked_in') {
        return NextResponse.json(
          { 
            success: false, 
            error: `Cannot check out. Current status: ${attendee.status || 'not checked in'}`,
            attendee: attendee
          },
          { status: 400 }
        );
      }
    }
    
    let updateData = {
      last_scanned_by: operator,
      device_id: deviceId,
      updated_at: new Date().toISOString()
    };
    
    if (scanType === 'check_in') {
      updateData.check_in_time = new Date().toISOString();
      updateData.status = 'checked_in';
      updateData.check_out_time = null; // Reset checkout if exists
    } else if (scanType === 'check_out') {
      updateData.check_out_time = new Date().toISOString();
      updateData.status = 'checked_out';
    }
    
    // Update attendee
    const { data: updatedAttendee, error: updateError } = await supabase
      .from('attendees')
      .update(updateData)
      .eq('id', attendee.id)
      .select()
      .single();
    
    if (updateError) {
      console.error('Update error:', updateError);
      
      // Handle duplicate check-in error
      if (updateError.code === '23505') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Already checked in (duplicate prevented)',
            attendee: attendee
          },
          { status: 400 }
        );
      }
      
      throw updateError;
    }
    
    // Create scan log
    await supabase
      .from('scan_logs')
      .insert({
        attendee_id: attendee.id,
        scan_type: scanType,
        device_id: deviceId,
        operator_name: operator
      });
    
    // Force stats refresh by invalidating cache
    await supabase
      .rpc('refresh_stats_cache');
    
    return NextResponse.json({
      success: true,
      attendee: updatedAttendee,
      action: scanType,
      message: `${scanType === 'check_in' ? 'Checked in' : 'Checked out'} successfully`
    });
    
  } 
    // Refresh the materialized view after scan
    try {
      await supabase.rpc('refresh_attendees_stats');
    } catch (refreshError) {
      console.log('Could not refresh stats view, but scan was successful:', refreshError.message);
    }
    catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}