'use server';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ⏱️ Minimum seconds between check-in and checkout
const CHECKOUT_COOLDOWN_SECONDS = 10;

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase environment variables are missing');
    }

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

    const now = new Date();
    let scanType = null;

    let updateData = {
      updated_at: now.toISOString(),
      device_id: deviceId,
      last_scanned_by: operatorName
    };

    /**
     * 🎯 FINAL STATE MACHINE (NO INTENT REQUIRED)
     */

    // FIRST ENTRY
    if (attendee.status === 'not_checked_in') {
      updateData.status = 'checked_in';
      updateData.check_in_time = now.toISOString();
      updateData.check_out_time = null;
      scanType = 'check_in';
    }

    // INSIDE → POSSIBLE FRAUD OR EXIT
    else if (attendee.status === 'checked_in') {
      const lastCheckIn = new Date(attendee.check_in_time);
      const secondsSinceCheckIn =
        (now.getTime() - lastCheckIn.getTime()) / 1000;

      // 🚫 Too fast → ticket sharing attempt
      if (secondsSinceCheckIn < CHECKOUT_COOLDOWN_SECONDS) {
        return NextResponse.json(
          {
            success: false,
            error: 'Ticket already inside. Entry denied.'
          },
          { status: 403 }
        );
      }

      // ✅ Legitimate exit
      updateData.status = 'checked_out';
      updateData.check_out_time = now.toISOString();
      scanType = 'check_out';
    }

    // RE-ENTRY
    else if (attendee.status === 'checked_out') {
      updateData.status = 'checked_in';
      updateData.check_in_time = now.toISOString();
      updateData.check_out_time = null;
      scanType = 'check_in';
    }

    else {
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

    // 3️⃣ Log scan (always)
    await supabase.from('scan_logs').insert({
      attendee_id: attendee.id,
      scan_type: scanType,
      device_id: deviceId,
      operator_name: operatorName
    });

    // 4️⃣ Refresh stats (non-blocking)
    try {
      await supabase.rpc('refresh_attendees_stats');
    } catch (_) {}

    return NextResponse.json({
      success: true,
      action: scanType,
      attendee: updatedAttendee
    });

  } catch (error) {
    console.error('Scan API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
