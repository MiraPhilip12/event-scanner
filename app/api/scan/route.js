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
    const mode = body.mode;
    const deviceId = body.deviceId || null;
    const operatorName = body.operatorName || null;

    if (!qrPayload || !mode) {
      return NextResponse.json(
        { success: false, error: 'QR payload and mode are required' },
        { status: 400 }
      );
    }

    if (!['check_in', 'check_out'].includes(mode)) {
      return NextResponse.json(
        { success: false, error: 'Invalid scan mode' },
        { status: 400 }
      );
    }

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

    const now = new Date().toISOString();

    let updateData = {
      updated_at: now,
      device_id: deviceId,
      last_scanned_by: operatorName
    };

    let scanType = null;

    if (mode === 'check_in') {
      if (attendee.status === 'checked_in') {
        return NextResponse.json(
          { success: false, error: 'Ticket already inside. Entry denied.' },
          { status: 403 }
        );
      }

      updateData.status = 'checked_in';
      updateData.check_in_time = now;
      updateData.check_out_time = null;
      scanType = 'check_in';
    }

    else if (mode === 'check_out') {
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

      updateData.status = 'checked_out';
      updateData.check_out_time = now;
      scanType = 'check_out';
    }

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

    await supabase.from('scan_logs').insert({
      attendee_id: attendee.id,
      scan_type: scanType,
      device_id: deviceId,
      operator_name: operatorName
    });

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
