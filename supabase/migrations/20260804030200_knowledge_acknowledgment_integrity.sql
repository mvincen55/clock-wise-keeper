-- Acknowledgments are exact-version employment records. The composite employee
-- reference includes required org_id, so ON DELETE SET NULL could not safely
-- null only employee_id. Preserve the historical link instead.

ALTER TABLE public.knowledge_acknowledgments
  DROP CONSTRAINT IF EXISTS knowledge_acknowledgments_employee_fk;
ALTER TABLE public.knowledge_acknowledgments
  ADD CONSTRAINT knowledge_acknowledgments_employee_fk
  FOREIGN KEY (employee_id, org_id)
  REFERENCES public.employees(id, org_id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT knowledge_acknowledgments_employee_fk
  ON public.knowledge_acknowledgments IS
  'Preserves the employee identity tied to an exact-version acknowledgment record.';
