ALTER TABLE leal_creditor.quotes DROP CONSTRAINT quotes_state_check;
ALTER TABLE leal_creditor.quotes ADD CONSTRAINT quotes_state_check
  CHECK(state IN ('prepared','processing','unknown','changed','failed','created','cancelled'));
ALTER TABLE leal_creditor.quotes ADD COLUMN cancelled_at timestamptz;
