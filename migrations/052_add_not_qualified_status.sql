-- Migration 052: Adicionar NOT_QUALIFIED ao constraint de overall_status
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_overall_status_check;

ALTER TABLE workers ADD CONSTRAINT workers_overall_status_check
  CHECK (overall_status IN (
    'PRE_TALENTUM', 'QUALIFIED', 'NOT_QUALIFIED', 'IN_DOUBT',
    'MESSAGE_SENT', 'ACTIVE', 'INACTIVE', 'BLACKLISTED', 'HIRED'
  ));
