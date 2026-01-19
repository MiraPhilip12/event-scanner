'use server';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const mode = body.mode; // MUST be 'check_in' or 'check_out'
    const deviceId = body.deviceId || null;
    const operatorName = body.operatorName || null;

    // 🔒 HARD VALIDATION
    if (!qrPayload) {
      return NextResponse.json(
        { success: false, error: 'QR payload is required' },
        { status: 400 }
      );
    }

    if (mode !== 'check_in' && mode !== 'check_out') {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing scan mode' },
        { status: 400 }
      );
    }

    // Fetch attendee
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

    const now = new Date().toISOString();

    let updateData = {
      updated_at: now,
      device_id: deviceId,
      last_scanned_by: operatorName
    };

    let scanType = null;

    // ==================================================
    // 🔐 ABSOLUTE MODE LOCK (NO AUTO TOGGLE POSSIBLE)
    // ==================================================

    if (mode === 'check_in') {
      // ❌ If already inside → refuse
      if (attendee.status === 'checked_in') {
        return NextResponse.json(
          { success: false, error: 'Ticket already inside. Entry denied.' },
          { status: 403 }
        );
      }

      // ✅ Allow entry ONLY here
      updateData.status = 'checked_in';
      updateData.check_in_time = now;
      updateData.check_out_time = null;
      scanType = 'check_in';
    }

    if (mode === 'check_out') {
      // ❌ HARD BLOCK: check-out can NEVER check in
      if (attendee.status !== 'checked_in') {
        return NextResponse.json(
          {
            success: false,
            error:
              attendee.status === 'checked_out'
                ? 'Ticket already checked out.'
                : 'Ticket has not been checked in yet.'
          },
          { status: 403 }
        );
      }

      // ✅ Exit ONLY here
      updateData.status = 'checked_out';
      updateData.check_out_time = now;
      scanType = 'check_out';
    }

    // 🔥 FINAL SAFETY ASSERTION
    if (
      (mode === 'check_out' && scanType !== 'check_out') ||
      (mode === 'check_in' && scanType !== 'check_in')
    ) {
      return NextResponse.json(
        { success: false, error: 'Internal logic violation detected' },
        { status: 500 }
      );
    }

    // Update attendee
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

    // Log scan
    await supabase.from('scan_logs').insert({
      attendee_id: attendee.id,
      scan_type: scanType,
      device_id: deviceId,
      operator_name: operatorName
    });

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
