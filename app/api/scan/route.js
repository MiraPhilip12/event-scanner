import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    // 🔐 Create Supabase client INSIDE handler (build-safe)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const body = await request.json();
    const { qrPayload, deviceId, operatorName } = body;

    if (!qrPayload) {
      return NextResponse.json(
        { success: false, error: 'QR payload is required' },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch attendee by QR
    const { data: attendee, error: fetchError } = await supabase
      .from('attendees')
      .select('*')
      .eq('qr_payload', qrPayload)
      .single();

    if (fetchError || !attendee) {
      return NextResponse.json(
        { success: false, error: 'Invalid or unknown ticket' },
        { status: 404 }
      );
    }

    let updateData = {
      updated_at: new Date().toISOString(),
      device_id: deviceId || null,
      last_scanned_by: operatorName || null
    };

    let scanType = null;

    // 2️⃣ Decide action BASED ON CURRENT STATUS
    if (attendee.status === 'not_checked_in') {
      // ✅ CHECK IN
      updateData.status = 'checked_in';
      updateData.check_in_time = new Date().toISOString();
      updateData.check_out_time = null;
      scanType = 'check_in';

    } else if (attendee.status === 'checked_in') {
      // ✅ CHECK OUT
      updateData.status = 'checked_out';
      updateData.check_out_time = new Date().toISOString();
      scanType = 'check_out';

    } else {
      // ❌ Already checked out
      return NextResponse.json(
        {
          success: false,
          error: 'Ticket already checked out',
          attendee
        },
        { status: 409 }
      );
    }

    // 3️⃣ Update attendee
    const { data: updatedAttendee, error: updateError } = await supabase
      .from('attendees')
      .update(updateData)
      .eq('id', attendee.id)
      .select()
      .single();

    if (updateError) {
      // Constraint safety
      if (updateError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'Duplicate scan detected' },
          { status: 409 }
        );
      }

      if (updateError.code === '23514') {
        return NextResponse.json(
          { success: false, error: 'Invalid status transition' },
          { status: 400 }
        );
      }

      throw updateError;
    }

    // 4️⃣ Insert scan log (non-fatal)
    const { error: logError } = await supabase
      .from('scan_logs')
      .insert({
        attendee_id: attendee.id,
        scan_type: scanType,
        device_id: deviceId || null,
        operator_name: operatorName || null
      });

    if (logError) {
      console.warn('Scan log failed:', logError.message);
    }

    // 5️⃣ Refresh stats view (non-blocking)
    try {
      await supabase.rpc('refresh_attendees_stats');
    } catch (refreshError) {
      console.warn(
        'Stats refresh failed (non-fatal):',
        refreshError.message
      );
    }

    // 6️⃣ Success response
    return NextResponse.json({
      success: true,
      action: scanType,
      attendee: updatedAttendee,
      message:
        scanType === 'check_in'
          ? `${updatedAttendee.name} checked in successfully`
          : `${updatedAttendee.name} checked out successfully`
    });

  } catch (error) {
    console.error('Scan API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
