# HospoMetrics — Project Scaffold

Built for Tangerine Trees first, designed to generalise into a multi-client product later.

## Data strategy (per our discussion)

- **March 2026 → now**: actuals. EPOS exports give true stream-level sales (Bar/Restaurant/Hotel
  split). Xero GL gives cost-side data (dry stock, wet stock, direct hotel cost).
- **May 2025 → Feb 2026**: Xero only, bar+restaurant lumped together. We retrofit an estimated
  stream split using the sales-mix ratio observed in the March–May 2026 EPOS data, stored as an
  `allocation_rules` row with `is_estimated = true`. Every report and snapshot built on this period
  carries `is_estimated = true` so the UI can clearly label it (e.g. "estimated split" badge).
- Wages: still one lump journal from the payroll PDF → Xero. Split via `allocation_rules`
  (`rule_type = 'wages'`) using agreed fixed percentages until/unless payroll is itemised by stream.

## Schema (schema.sql)

Multi-tenant from the start (`clients` table), even though only Tangerine Trees exists right now.
Two raw data tables (`gl_transactions`, `epos_sales`) feed a mapping/allocation layer
(`stream_mappings`, `allocation_rules`), which produces cached `report_snapshots` for fast
dashboard reads and an audit trail of what was reported at the time.

## Suggested build order

1. **Xero sync** — pull GL into `gl_transactions` (reuse VATwatchHQ's OAuth/sync pattern)
2. **EPOS import** — manual CSV upload to start (March 2026 exports), parse into `epos_sales`
3. **Mapping/allocation config UI** — let you set up `stream_mappings` and `allocation_rules`
   for Tangerine Trees once real account codes/categories are visible from the synced data
4. **Retrofit calculation** — script to compute the March–May 2026 sales-mix ratio and backfill
   `allocation_rules` for the pre-March period
5. **Weekly report** — revenue/COGS/margin by stream + spend spike detection + wage % of revenue
6. **Monthly snapshot** — same metrics rolled up, MoM/YoY once enough history exists
7. **Forecasting engine** — build the pipes now, let accuracy mature as data accumulates past
   the first full 12-month cycle (~May 2027 for genuinely reliable seasonality)

## Repo recommendation

Separate project from VATwatchHQ. Share the Xero OAuth/sync logic by porting the pattern over
(copy-and-adapt now, extract into a shared package later once both projects stabilise).

## Open question for Tangerine Trees

Worth checking what their EPOS export/Xero integration actually supports — if EPOS can push
sales to Xero already split by revenue stream, that removes the need for the retrofit/estimate
logic going forward entirely.

