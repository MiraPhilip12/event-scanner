import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request) {
  try {
    const { qrPayload, scanType, deviceId, operator } = await request.json();
    
    console.log('📱 Scan attempt:', { qrPayload, scanType, operator });
    
    // Find attendee
    const { data: attendee, error: findError } = await supabase
      .from('attendees')
      .select('*')
      .eq('qr_payload', qrPayload)
      .single();
    
    if (findError || !attendee) {
      console.log('❌ Attendee not found:', qrPayload);
      return NextResponse.json(
        { 
          success: false,
          error: 'Attendee not found in database' 
        },
        { status: 404 }
      );
    }
    
    console.log('👤 Found attendee:', attendee.name, 'Status:', attendee.status);
    
    // VALIDATION LOGIC
    if (scanType === 'check_in') {
      // Prevent duplicate check-in
      if (attendee.status === 'checked_in') {
        console.log('❌ Already checked in:', attendee.name);
        return NextResponse.json(
          { 
            success: false, 
            error: `${attendee.name} is already checked in`,
            attendee: attendee
          },
          { status: 400 }
        );
      }
      
      // Prevent checking in if already checked out
      if (attendee.status === 'checked_out') {
        console.log('❌ Already checked out:', attendee.name);
        return NextResponse.json(
          { 
            success: false, 
            error: `${attendee.name} has already checked out. Cannot check in again.`,
            attendee: attendee
          },
          { status: 400 }
        );
      }
    }
    
    if (scanType === 'check_out') {
      console.log('🔍 Check-out validation:', {
        name: attendee.name,
        currentStatus: attendee.status,
        checkInTime: attendee.check_in_time,
        checkOutTime: attendee.check_out_time
      });
      
      // Must be checked in to check out
      if (attendee.status !== 'checked_in') {
        console.log('❌ Cannot check out - status is:', attendee.status);
        return NextResponse.json(
          { 
            success: false, 
            error: `Cannot check out ${attendee.name}. Current status: ${attendee.status || 'not checked in'}`,
            attendee: attendee
          },
          { status: 400 }
        );
      }
      
      // Additional safety: must have check_in_time
      if (!attendee.check_in_time) {
        console.log('❌ No check-in time found');
        return NextResponse.json(
          { 
            success: false, 
            error: `Cannot check out ${attendee.name}. No check-in time recorded.`,
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
      updateData.check_out_time = null; // Clear any previous checkout
      console.log('✅ Check-in update data:', updateData);
    } else if (scanType === 'check_out') {
      updateData.check_out_time = new Date().toISOString();
      updateData.status = 'checked_out';
      console.log('✅ Check-out update data:', updateData);
    }
    
    // Update attendee
    const { data: updatedAttendee, error: updateError } = await supabase
      .from('attendees')
      .update(updateData)
      .eq('id', attendee.id)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Database update error:', updateError);
      
      // Handle duplicate check-in error
      if (updateError.code === '23505') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Already checked in (database constraint prevented)',
            attendee: attendee
          },
          { status: 400 }
        );
      }
      
      // Handle check constraint violation
      if (updateError.code === '23514') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid status transition. Please check attendee current status.',
            attendee: attendee
          },
          { status: 400 }
        );
      }
      
      throw updateError;
    }
    
    console.log('✅ Database update successful:', updatedAttendee.name, 'New status:', updatedAttendee.status);
    
    // Create scan log
    const { error: logError } = await supabase
      .from('scan_logs')
      .insert({
        attendee_id: attendee.id,
        scan_type: scanType,
        device_id: deviceId,
        operator_name: operator
      });
    
    if (logError) {
      console.error('⚠️ Log error (non-fatal):', logError);
    }
    
    return NextResponse.json({
      success: true,
      attendee: updatedAttendee,
      action: scanType,
      message: `${updatedAttendee.name} ${scanType === 'check_in' ? 'checked in' : 'checked out'} successfully!`
    });
    
  } catch (error) {
    console.error('💥 Scan endpoint error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message 
      },
      { status: 500 }
    );
  }
}