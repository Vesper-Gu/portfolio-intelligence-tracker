insert into kols (id, handle, platform, display_name, tags, trust_score)
values
  ('00000000-0000-0000-0000-000000000101', '@Investor_X', 'twitter', 'Investor X', array['AI','growth'], 0.910),
  ('00000000-0000-0000-0000-000000000102', '@TechFund_A', 'substack', 'TechFund A', array['tech','semis'], 0.870),
  ('00000000-0000-0000-0000-000000000103', '@Macro_Z', 'twitter', 'Macro Z', array['macro','hedge'], 0.780)
on conflict (handle) do nothing;

insert into sources (id, name, source_type, platform, url, trust_level)
values
  ('00000000-0000-0000-0000-000000000201', '@Investor_X X account', 'twitter', 'twitter', 'https://x.example/investor_x', 'high'),
  ('00000000-0000-0000-0000-000000000202', 'TechFund A Substack', 'substack', 'substack', 'https://substack.example/techfund', 'high'),
  ('00000000-0000-0000-0000-000000000203', 'Manual entry', 'manual', 'app', null, 'medium')
on conflict (id) do nothing;

insert into holdings (id, kol_id, source_id, ticker, asset_type, action, weight_pct, source_text, extraction_confidence, field_confidence, is_verified, note, starred, user_tags, recorded_at)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'NVDA', 'stock', 'add', 27.0, 'Added to NVDA again after earnings.', 0.940, '{"ticker":0.99,"weightPct":0.94,"action":0.86}', true, 'AI backlog', true, array['AI'], '2026-05-12T08:00:00Z'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'TSLA', 'stock', 'trim', 8.0, 'Trimmed TSLA on valuation risk.', 0.820, '{"ticker":0.98,"weightPct":0.72,"action":0.84}', true, 'valuation risk', false, array['EV'], '2026-05-08T08:00:00Z'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'NVDA', 'stock', 'add', 22.0, 'AI capex cycle remains early.', 0.910, '{"ticker":0.99,"weightPct":0.88,"action":0.83}', true, 'AI capex', false, array['AI'], '2026-05-10T08:00:00Z'),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000203', 'SMH', 'etf', 'hold', 12.0, 'Semis basket for AI infra.', 0.780, '{"ticker":0.96,"weightPct":0.70,"action":0.77}', false, 'semis basket', false, array['ETF'], '2026-05-08T08:00:00Z')
on conflict (id) do nothing;

