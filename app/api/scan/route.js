import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client directly
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
    
    let updateData = {
      last_scanned_by: operator,
      device_id: deviceId,
      updated_at: new Date().toISOString()
    };
    
    if (scanType === 'check_in') {
      updateData.check_in_time = new Date().toISOString();
      updateData.status = 'checked_in';
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
    
    return NextResponse.json({
      success: true,
      attendee: updatedAttendee,
      action: scanType
    });
    
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}