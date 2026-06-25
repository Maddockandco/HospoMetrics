// app/api/reconciliation/route.ts
// POST  — receive a nightly till submission and write to Supabase
// GET   — return recent submissions for a venue (used by the dashboard card)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // service role — bypasses RLS safely server-side
)

// ── POST /api/reconciliation ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      date,
      till,
      submittedBy,
      note,
      previousNightCount,
      openCount,
      endOfShiftCount,
      eposCashTaken,
      withdrawals,
      pettyCash,
      cardReading1,
      cardReading2,
      eposnowCardTakings,
      venueId,          // pass this from the HTML form if you want venue-scoped data
    } = body

    // Basic validation
    if (!date || !till || !submittedBy) {
      return NextResponse.json(
        { error: 'date, till, and submittedBy are required' },
        { status: 400 }
      )
    }

    // Compute variances server-side (don't trust the client)
    const cashVar =
      endOfShiftCount != null && openCount != null && eposCashTaken != null
        ? (endOfShiftCount - openCount + (withdrawals ?? 0) + (pettyCash ?? 0)) - eposCashTaken
        : null

    const cardReaderTotal =
      cardReading1 != null || cardReading2 != null
        ? (cardReading1 ?? 0) + (cardReading2 ?? 0)
        : null

    const cardVar =
      cardReaderTotal != null && eposnowCardTakings != null
        ? cardReaderTotal - eposnowCardTakings
        : null

    const totalVar =
      cashVar != null && cardVar != null ? cashVar + cardVar : null

    const { data, error } = await supabase
      .from('nightly_reconciliations')
      .insert({
        date,
        till,
        submitted_by:          submittedBy,
        note:                  note || null,
        previous_night_count:  previousNightCount ?? null,
        open_count:            openCount ?? null,
        end_of_shift_count:    endOfShiftCount ?? null,
        epos_cash_taken:       eposCashTaken ?? null,
        withdrawals:           withdrawals ?? null,
        petty_cash:            pettyCash ?? null,
        card_reading_1:        cardReading1 ?? null,
        card_reading_2:        cardReading2 ?? null,
        eposnow_card_takings:  eposnowCardTakings ?? null,
        cash_variance:         cashVar,
        card_variance:         cardVar,
        total_variance:        totalVar,
        venue_id:              venueId ?? null,
      })
      .select()
      .single()

    if (error) {
      // Duplicate submission guard
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A submission for ${till} on ${date} already exists.` },
          { status: 409 }
        )
      }
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data.id }, { status: 201 })

  } catch (err) {
    console.error('Reconciliation POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── GET /api/reconciliation?venueId=xxx&limit=30 ─────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const limit   = parseInt(searchParams.get('limit') ?? '30', 10)

  let query = supabase
    .from('nightly_reconciliations')
    .select('*')
    .order('date', { ascending: false })
    .order('till', { ascending: true })
    .limit(limit)

  if (venueId) {
    query = query.eq('venue_id', venueId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 200 })
}
