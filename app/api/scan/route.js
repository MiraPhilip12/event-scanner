'use server';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables missing');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await request.json();
    const qrPayload = body.qrPayload;
    const deviceId = body.deviceId || null;
    const operatorName = body.operatorName || null;

    if (!qrPayload) {
      return NextResponse.json(
        { success: false, error: 'QR payload is required' },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch attendee
    const { data: attendee, error } = await supabase
      .from('attendees')
      .select('*')
      .eq('qr_payload', qrPayload)
      .single();

    if (error || !attendee) {
      return NextResponse.json(
        { success: false, error: 'Invalid ticket' },
        { status: 404 }
      );
    }

    let updateData = {
      updated_at: new Date().toISOString(),
      device_id: deviceId,
      last_scanned_by: operatorName
    };

    let scanType = '';

    // 2️⃣ STATUS-BASED ACTION (RE-ENTRY ENABLED)
    if (attendee.status === 'not_checked_in' || attendee.status === 'checked_out') {
      // ✅ CHECK IN (first time or re-entry)
      updateData.status = 'checked_in';
      updateData.check_in_time = new Date().toISOString();
      updateData.check_out_time = null;
      scanType = 'check_in';

    } else if (attendee.status === 'checked_in') {
      // ✅ CHECK OUT
      updateData.status = 'checked_out';
      updateData.check_out_time = new Date().toISOString();
      scanType = 'check_out';
    }

    // 3️⃣ Update attendee
    const { data: updatedAttendee, error: updateError } = await supabase
      .from('attendees')
      .update(updateData)
      .eq('id', attendee.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 400 }
      );
    }

    // 4️⃣ INSERT SCAN LOG (VISIBLE FOR BOTH IN & OUT)
    const { data: scanLog, error: logError } = await supabase
      .from('scan_logs')
      .insert({
        attendee_id: attendee.id,
        scan_type: scanType,
        device_id: deviceId,
        operator_name: operatorName
      })
      .select()
      .single();

    if (logError) {
      console.warn('Scan log insert failed:', logError.message);
    }

    // 5️⃣ Refresh stats (non-blocking)
    try {
      await supabase.rpc('refresh_attendees_stats');
    } catch (_) {}

    return NextResponse.json({
      success: true,
      action: scanType,
      attendee: updatedAttendee,
      scanLog: scanLog
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
