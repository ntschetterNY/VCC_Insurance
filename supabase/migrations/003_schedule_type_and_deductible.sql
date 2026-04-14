-- ============================================================================
-- Migration 003 — Add schedule_type, deductible to schedule table
-- Adds Schedule A/B/C classification per Attachment 1
-- ============================================================================

-- Add new columns
ALTER TABLE public.schedule
  ADD COLUMN IF NOT EXISTS schedule_type TEXT CHECK (schedule_type IN ('A', 'B', 'C')),
  ADD COLUMN IF NOT EXISTS deductible INTEGER;

-- Clear existing seed data and replace with Attachment 1 trades
DELETE FROM public.schedule;

-- ---------------------------------------------------------------------------
-- Schedule A — $75,000 deductible, $3M / $3M / $3M min limits
-- ---------------------------------------------------------------------------
INSERT INTO public.schedule (trade, schedule_type, deductible, gl_per_occurrence, gl_aggregate, umbrella, notes) VALUES
  ('Carpentry - Framing (interior)',           'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('Carpentry - All Other (interior)',         'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('Carpeting/Flooring (interior)',            'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('Concrete - All Other (interior)',          'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('Demolition (interior-non-structural)',     'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('Door Installation (interior)',             'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('Drywall',                                  'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('Electrical (exterior < 3 stories)',        'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Exterior < 3 stories'),
  ('Electrical (interior)',                    'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('HVAC (exterior < 3 stories)',              'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Exterior < 3 stories'),
  ('HVAC (interior)',                          'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('Landscaping - Ground Level',               'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Ground level'),
  ('Landscaping - Rooftop (exterior < 3 stories)', 'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Exterior < 3 stories'),
  ('Security System',                          'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Interior'),
  ('All Other Interior < 3 Stories',           'A', 75000, 3000000, 3000000, 3000000, 'Schedule A — Catch-all interior < 3 stories');

-- ---------------------------------------------------------------------------
-- Schedule B — $100,000 deductible, $5M / $5M / $5M min limits
-- ---------------------------------------------------------------------------
INSERT INTO public.schedule (trade, schedule_type, deductible, gl_per_occurrence, gl_aggregate, umbrella, notes) VALUES
  ('Carpentry - Framing',                     'B', 100000, 5000000, 5000000, 5000000, 'Schedule B'),
  ('Concrete - All Other (exterior < 3 stories)', 'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior < 3 stories'),
  ('Demolition (exterior < 3 stories)',        'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior < 3 stories'),
  ('Door Installation',                        'B', 100000, 5000000, 5000000, 5000000, 'Schedule B'),
  ('Electrical (exterior > 3 stories)',        'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior > 3 stories'),
  ('HVAC (exterior > 3 stories)',              'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior > 3 stories'),
  ('Landscaping - Rooftop (exterior > 3 stories)', 'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior > 3 stories'),
  ('Masonry/Facade (exterior < 3 stories)',    'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior < 3 stories'),
  ('Plumbing',                                 'B', 100000, 5000000, 5000000, 5000000, 'Schedule B'),
  ('Roofing (exterior < 3 stories)',           'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior < 3 stories'),
  ('Steel - Ornamental (exterior < 3 stories)', 'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior < 3 stories'),
  ('Window Installation (exterior < 3 stories)', 'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Exterior < 3 stories'),
  ('All Other Interior > 3 Stories',           'B', 100000, 5000000, 5000000, 5000000, 'Schedule B — Catch-all interior > 3 stories');

-- ---------------------------------------------------------------------------
-- Schedule C — $75,000 deductible, $10M / $10M / $10M min limits
-- ---------------------------------------------------------------------------
INSERT INTO public.schedule (trade, schedule_type, deductible, gl_per_occurrence, gl_aggregate, umbrella, notes) VALUES
  ('Concrete - All Other (exterior > 3 stories)', 'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Exterior > 3 stories'),
  ('Concrete - Foundation',                    'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Structural'),
  ('Concrete - Structural',                    'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Structural'),
  ('Crane',                                    'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Heavy equipment'),
  ('Demolition (exterior > 3 stories)',        'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Exterior > 3 stories'),
  ('EIFS',                                     'C', 75000, 10000000, 10000000, 10000000, 'Schedule C'),
  ('Excavation',                               'C', 75000, 10000000, 10000000, 10000000, 'Schedule C'),
  ('Hoist/Elevator',                           'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Heavy equipment'),
  ('Masonry/Facade (exterior > 3 stories)',    'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Exterior > 3 stories'),
  ('Pile Driving',                             'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Heavy equipment'),
  ('Roofing (exterior > 3 stories)',           'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Exterior > 3 stories'),
  ('Scaffold/Sidewalk Bridge',                 'C', 75000, 10000000, 10000000, 10000000, 'Schedule C'),
  ('Shoring/Underpinning',                     'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Structural'),
  ('Steel - Ornamental (exterior > 3 stories)', 'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Exterior > 3 stories'),
  ('Steel - Superstructure',                   'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Structural'),
  ('Window Installation (exterior > 3 stories)', 'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Exterior > 3 stories'),
  ('All Other Exterior > 3 Stories',           'C', 75000, 10000000, 10000000, 10000000, 'Schedule C — Catch-all exterior > 3 stories');
