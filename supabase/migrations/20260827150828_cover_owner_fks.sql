-- Cover composite ownership foreign keys in FK column order.
create index projects_goal_owner_fk_idx on public.projects(goal_id, user_id);
create index tasks_project_owner_fk_idx on public.tasks(project_id, user_id);

create index daily_plan_items_plan_owner_fk_idx on public.daily_plan_items(plan_id, user_id);
create index daily_plan_items_task_owner_fk_idx on public.daily_plan_items(task_id, user_id);
create index daily_plan_items_carryover_owner_fk_idx on public.daily_plan_items(carryover_from_item_id, user_id);

create index task_events_task_owner_fk_idx on public.task_events(task_id, user_id);
create index task_events_plan_item_owner_fk_idx on public.task_events(plan_item_id, user_id);

create index user_feedback_task_owner_fk_idx on public.user_feedback(task_id, user_id);
create index user_feedback_plan_owner_fk_idx on public.user_feedback(plan_id, user_id);
create index user_feedback_plan_item_owner_fk_idx on public.user_feedback(plan_item_id, user_id);

create index source_links_task_owner_fk_idx on public.source_links(task_id, user_id);
create index source_links_project_owner_fk_idx on public.source_links(project_id, user_id);
create index source_links_goal_owner_fk_idx on public.source_links(goal_id, user_id);
create index source_links_inbox_owner_fk_idx on public.source_links(inbox_item_id, user_id);
