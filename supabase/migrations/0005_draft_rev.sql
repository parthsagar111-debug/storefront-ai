-- IQA-01 / QA-08: optimistic concurrency for draft writes. Every draft write sets draft_rev = draft_rev + 1
-- WHERE draft_rev = <the revision it read>; a lost race re-reads and re-applies once, then 409.
alter table stores add column if not exists draft_rev int not null default 0;
