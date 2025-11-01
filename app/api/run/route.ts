import { NextResponse } from 'next/server';
import { parseInput } from '../../../utils/input';
import { processRows } from '../../../lib/processor';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const batchSize = Number(formData.get('batchSize')) || 20;
    const rows = await parseInput(formData);
    if (!rows.length) {
      return NextResponse.json({ error: 'No input rows provided', logs: [], rows: [] }, { status: 400 });
    }

    const response = await processRows(rows, {
      batchSize,
      maxQps: Number(process.env.NEXT_PUBLIC_MAX_QPS ?? '1'),
      waccFloor: Number(process.env.NEXT_PUBLIC_WACC_FLOOR ?? '0.06'),
      waccCeiling: Number(process.env.NEXT_PUBLIC_WACC_CEILING ?? '0.14'),
      terminalGrowth: Number(process.env.NEXT_PUBLIC_TERMINAL_GROWTH ?? '0.02')
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return NextResponse.json({ error: message, logs: [], rows: [] }, { status: 500 });
  }
}
