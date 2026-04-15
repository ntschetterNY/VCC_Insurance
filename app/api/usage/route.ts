import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Use admin client to bypass RLS — user is already authenticated above
    const supabase = createSupabaseAdmin()
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') ?? '30') || 30

    const since = new Date()
    since.setDate(since.getDate() - days)

    // Fetch raw usage logs
    const { data: logs, error } = await supabase
      .from('ai_usage_log')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Usage log query error:', error)
      // Return empty data instead of 500 so the page still renders
      return NextResponse.json({
        period_days: days,
        total_calls: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        estimated_cost_usd: 0,
        by_model: {},
        by_function: {},
        by_day: {},
        recent_logs: [],
      })
    }

    // Aggregate by model
    const byModel: Record<string, { calls: number; input_tokens: number; output_tokens: number }> = {}
    // Aggregate by function
    const byFunction: Record<string, { calls: number; input_tokens: number; output_tokens: number }> = {}
    // Daily totals
    const byDay: Record<string, { calls: number; input_tokens: number; output_tokens: number }> = {}

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCalls = 0

    for (const log of logs ?? []) {
      const model = log.model as string
      const fn = log.function_name as string
      const inputT = (log.input_tokens as number) || 0
      const outputT = (log.output_tokens as number) || 0
      const day = (log.created_at as string).slice(0, 10)

      totalInputTokens += inputT
      totalOutputTokens += outputT
      totalCalls++

      if (!byModel[model]) byModel[model] = { calls: 0, input_tokens: 0, output_tokens: 0 }
      byModel[model].calls++
      byModel[model].input_tokens += inputT
      byModel[model].output_tokens += outputT

      if (!byFunction[fn]) byFunction[fn] = { calls: 0, input_tokens: 0, output_tokens: 0 }
      byFunction[fn].calls++
      byFunction[fn].input_tokens += inputT
      byFunction[fn].output_tokens += outputT

      if (!byDay[day]) byDay[day] = { calls: 0, input_tokens: 0, output_tokens: 0 }
      byDay[day].calls++
      byDay[day].input_tokens += inputT
      byDay[day].output_tokens += outputT
    }

    // Estimate costs (approximate pricing per 1M tokens)
    const PRICING: Record<string, { input: number; output: number }> = {
      'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
      'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
    }

    let estimatedCost = 0
    for (const [model, usage] of Object.entries(byModel)) {
      const pricing = PRICING[model] ?? { input: 3.00, output: 15.00 }
      estimatedCost += (usage.input_tokens / 1_000_000) * pricing.input
      estimatedCost += (usage.output_tokens / 1_000_000) * pricing.output
    }

    return NextResponse.json({
      period_days: days,
      total_calls: totalCalls,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      estimated_cost_usd: Math.round(estimatedCost * 100) / 100,
      by_model: byModel,
      by_function: byFunction,
      by_day: byDay,
      recent_logs: (logs ?? []).slice(0, 50),
    })
  } catch (err) {
    console.error('Usage API error:', err)
    // Return empty data so the page renders gracefully
    const days = 30
    return NextResponse.json({
      period_days: days,
      total_calls: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      estimated_cost_usd: 0,
      by_model: {},
      by_function: {},
      by_day: {},
      recent_logs: [],
    })
  }
}
