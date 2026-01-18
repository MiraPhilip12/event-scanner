'use server';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    // 🔐 Environment variables (server-only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase environment variables are missing');
    }

    // ✅ Create Supabase client INSIDE handler (build-safe)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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
    const { data: attendee, error: fetchError } = await supabase
      .from('attendees')
      .select('*')
      .eq('qr_payload', qrPayload)
      .single();

    if (fetchError || !attendee) {
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

    let scanType = null;

    /**
     * 🎯 STRICT ACCESS RULES
     *
     * not_checked_in → check_in
     * checked_in     → check_out
     * checked_out    → check_in (re-entry)
     *
     * ❌ checked_in → check_in (refused automatically)
     */

    if (attendee.status === 'not_checked_in') {
      // ✅ First entry
      updateData.status = 'checked_in';
      updateData.check_in_time = new Date().toISOString();
      updateData.check_out_time = null;
      scanType = 'check_in';

    } else if (attendee.status === 'checked_in') {
      // ✅ Exit
      updateData.status = 'checked_out';
      updateData.check_out_time = new Date().toISOString();
      scanType = 'check_out';

    } else if (attendee.status === 'checked_out') {
      // ✅ Re-entry
      updateData.status = 'checked_in';
      updateData.check_in_time = new Date().toISOString();
      updateData.check_out_time = null;
      scanType = 'check_in';

    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid ticket state' },
        { status: 400 }
      );
    }

    // 2️⃣ Update attendee
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

    // 3️⃣ Insert scan log (ALWAYS)
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
      console.warn('Scan log failed:', logError.message);
    }

    // 4️⃣ Refresh stats (non-blocking)
    try {
      await supabase.rpc('refresh_attendees_stats');
    } catch (_) {}

    // 5️⃣ Final response
    return NextResponse.json({
      success: true,
      action: scanType,
      attendee: updatedAttendee,
      scanLog: scanLog
    });

  } catch (error) {
    console.error('Scan API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
