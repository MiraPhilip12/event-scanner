import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// Create Supabase client directly
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }
    
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    console.log('Excel data loaded:', data.length, 'rows');
    
    const attendees = data.map(row => ({
      name: row.Name || row.name || '',
      phone: row.Phone || row.phone || '',
      qr_payload: row['QR Payload'] || row.qr_payload || row['QR Payload'.toLowerCase()] || '',
      seat_id: row.SeatID || row.seat_id || row.SeatID?.toString() || '',
      category: row.Category || row.category || '',
      status: 'not_checked_in'
    })).filter(attendee => attendee.qr_payload);
    
    console.log('Processed attendees:', attendees.length);
    
    // Upsert attendees
    const { error } = await supabase
      .from('attendees')
      .upsert(attendees, {
        onConflict: 'qr_payload',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      imported: attendees.length,
      message: 'Data imported successfully'
    });
    
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}