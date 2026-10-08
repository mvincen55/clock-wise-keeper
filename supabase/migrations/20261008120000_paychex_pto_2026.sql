-- ============================================================
-- Paychex PTO used, from two pay-stub reports uploaded Oct 8, 2026.
--
--   A  11003934_Paychex_PDF_Reports_10-08-2026_2.pdf, 57 stubs, checks
--      Apr 15 – May 13 (sha256 eb67f669…274444)
--   B  11003934_Paychex_PDF_Reports_10-08-2026.pdf, 5 stubs for Jillian
--      Craveiro, checks Sep 9 – Oct 7 (sha256 53834cf1…03e3e5)
--
-- Every stub with PTO hours in the current period is recorded once, as
-- weekly payroll evidence. The stubs with 0 current PTO are left out: their
-- PTO year-to-date totals agree with the rows below, and leaving them out
-- keeps them from overriding PTO recorded in the app.
--
-- Never counted twice:
--   * The live ledger lets a payroll week replace the PTO recorded in the
--     app for that same week; it never adds the two.
--   * A row is skipped when the person already has a payroll record for
--     that week, whatever its check number, and on the (org, payroll id,
--     check date, check #) key, so a rerun adds nothing.
--   * Weeks before a person's starting balance are recorded, not deducted.
--
-- Worked hours are the Regular hours. Paychex's "Total Hrs Worked" counts
-- PTO, and in report B a Training line that repeats the same hours, so that
-- total is not used. Marjorie Vincent's Apr 19-25 week was paid on two
-- checks, 5716 (14.55 regular, no PTO) and 5717 (10 PTO); the week's worked
-- hours sit on the PTO row so the weekly total is right.
-- Hours only; no pay rates or amounts.
--
-- Harelick Dental Associates only (verified org id); no-op elsewhere.
-- ============================================================

DO $$
DECLARE
  org uuid := '852fc8e0-4071-499b-b655-f86d6f789cd5';
  r record;
  v_emp uuid;
  v_matches int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = org AND name ILIKE 'HARELICK DENTAL%') THEN RETURN; END IF;

  FOR r IN
    SELECT t.*, s.file AS src_file, s.sha AS src_sha
      FROM (VALUES
      -- report, payroll id, Paychex name, first, last names to try, period, check date, check #, PTO, PTO YTD, regular hours, holiday, page
      ('A', '81', 'Jennie L Barbosa',   'Jennie',   ARRAY['Barbosa'],   date '2026-04-19', date '2026-04-25', date '2026-04-29', '5706',  7.14, 30.70, 13.73, 0.00, 21),
      ('A', '47', 'Lucia A Bizarro',    'Lucia',    ARRAY['Bizarro'],   date '2026-04-19', date '2026-04-25', date '2026-04-29', '5707', 24.00, 64.00,  0.00, 8.00, 22),
      ('A', '78', 'Jillian Craveiro',   'Jillian',  ARRAY['Craveiro'],  date '2026-04-19', date '2026-04-25', date '2026-04-29', '5708',  7.42, 25.40,  0.00, 0.00, 23),
      ('A', '57', 'Gina Dias Correia',  'Gina',     ARRAY['Dias Correia', 'Correia', 'Dias'], date '2026-04-19', date '2026-04-25', date '2026-04-29', '5709', 23.00, 31.00,  7.77, 0.00, 24),
      ('A', '77', 'Cori Fernandes',     'Cori',     ARRAY['Fernandes'], date '2026-04-19', date '2026-04-25', date '2026-04-29', '5711',  8.00, 28.00, 15.28, 0.00, 26),
      ('A', '71', 'Marjorie A Vincent', 'Marjorie', ARRAY['Vincent'],   date '2026-04-19', date '2026-04-25', date '2026-04-29', '5717', 10.00, 40.00, 14.55, 0.00, 31),
      ('A', '47', 'Lucia A Bizarro',    'Lucia',    ARRAY['Bizarro'],   date '2026-04-12', date '2026-04-18', date '2026-04-22', '5695',  8.00, 40.00, 27.00, 0.00, 36),
      ('A', '71', 'Marjorie A Vincent', 'Marjorie', ARRAY['Vincent'],   date '2026-04-12', date '2026-04-18', date '2026-04-22', '5704',  4.00, 30.00, 27.67, 0.00, 45),
      ('A', '71', 'Marjorie A Vincent', 'Marjorie', ARRAY['Vincent'],   date '2026-04-05', date '2026-04-11', date '2026-04-15', '5691',  4.00, 26.00, 30.18, 0.00, 57),
      ('B', '78', 'Jillian Craveiro',   'Jillian',  ARRAY['Craveiro'],  date '2026-09-20', date '2026-09-26', date '2026-09-30', '6008',  5.10, 60.22, 20.90, 0.00, 2),
      ('B', '78', 'Jillian Craveiro',   'Jillian',  ARRAY['Craveiro'],  date '2026-09-06', date '2026-09-12', date '2026-09-16', '5982',  3.69, 55.12, 16.89, 0.00, 4),
      ('B', '78', 'Jillian Craveiro',   'Jillian',  ARRAY['Craveiro'],  date '2026-08-30', date '2026-09-05', date '2026-09-09', '5970',  3.00, 51.43, 22.50, 0.00, 5)
      ) AS t(report, payroll_id, payroll_name, first_name, last_names, period_start, period_end, check_date, check_number, pto, pto_ytd, regular, holiday, page)
      JOIN (VALUES
        ('A', '11003934_Paychex_PDF_Reports_10-08-2026_2.pdf', 'eb67f669acd98fb765f220f41484b7bd30751606ae4db54dd1e87fd530274444'),
        ('B', '11003934_Paychex_PDF_Reports_10-08-2026.pdf',   '53834cf1adde413cf66155922d145ff0d3cede74a254c650c43f2f643203e3e5')
      ) AS s(report, file, sha) ON s.report = t.report
  LOOP
    -- One roster match on first and last name, else left unassigned for review.
    SELECT count(*), min(e.id::text)::uuid INTO v_matches, v_emp
      FROM public.employees e
     WHERE e.org_id = org
       AND lower(btrim(coalesce(e.first_name, split_part(e.display_name, ' ', 1)))) = lower(r.first_name)
       AND (lower(btrim(e.last_name)) = ANY (SELECT lower(x) FROM unnest(r.last_names) x)
            OR EXISTS (SELECT 1 FROM unnest(r.last_names) x WHERE e.display_name ILIKE '%' || x));
    IF v_matches <> 1 THEN
      RAISE NOTICE 'Paychex PTO: % (EE %) matched % roster rows; recorded unassigned', r.payroll_name, r.payroll_id, v_matches;
      v_emp := NULL;
    END IF;

    -- This week is already on file from payroll: leave it as entered.
    IF EXISTS (SELECT 1 FROM public.payroll_pto_records p
                WHERE p.org_id = org
                  AND (p.payroll_employee_id = r.payroll_id OR (v_emp IS NOT NULL AND p.employee_id = v_emp))
                  AND p.period_start = r.period_start AND p.period_end = r.period_end) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.payroll_pto_records
      (org_id, employee_id, payroll_employee_id, payroll_employee_name, period_start, period_end,
       check_date, check_number, pto_hours, pto_ytd_hours, worked_hours,
       source_file, source_sha256, source_page, earnings, review_note, entered_by_label)
    VALUES
      (org, v_emp, r.payroll_id, r.payroll_name, r.period_start, r.period_end,
       r.check_date, r.check_number, r.pto, r.pto_ytd, r.regular,
       r.src_file, r.src_sha, r.page,
       jsonb_build_array(
         jsonb_build_object('description', 'Regular', 'hours', r.regular),
         jsonb_build_object('description', 'PTO', 'hours', r.pto, 'ytd_hours', r.pto_ytd))
       || CASE WHEN r.holiday > 0 THEN jsonb_build_array(jsonb_build_object('description', 'Holiday', 'hours', r.holiday)) ELSE '[]'::jsonb END,
       CASE WHEN r.check_number = '5717' THEN 'Paychex stub: current-period PTO hours. Worked hours are from check 5716, same week.'
            ELSE 'Paychex stub: current-period PTO hours.' END,
       'Paychex payroll report')
    ON CONFLICT (org_id, payroll_employee_id, check_date, check_number) DO NOTHING;
  END LOOP;
END $$;
