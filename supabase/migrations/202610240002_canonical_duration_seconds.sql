begin;

-- Convert legacy JSON payloads in place. The local app keeps a pre-migration IndexedDB backup.
update public.activities
set data = (data - 'defaultDuration' - 'dailyTargetMinutes') || jsonb_build_object(
  'defaultDurationSeconds', coalesce((data->>'defaultDurationSeconds')::numeric, (data->>'defaultDuration')::numeric * 60),
  'dailyTargetSeconds', case
    when data ? 'dailyTargetSeconds' then data->'dailyTargetSeconds'
    when data->>'dailyTargetMinutes' is null then 'null'::jsonb
    else to_jsonb((data->>'dailyTargetMinutes')::numeric * 60)
  end
)
where data ? 'defaultDuration' or data ? 'dailyTargetMinutes';

update public.focus_sessions
set data = (data - 'plannedMs' - 'actualMs') || jsonb_build_object(
  'plannedSeconds', coalesce((data->>'plannedSeconds')::numeric, (data->>'plannedMs')::numeric / 1000),
  'actualSeconds', coalesce((data->>'actualSeconds')::numeric, (data->>'actualMs')::numeric / 1000)
)
where data ? 'plannedMs' or data ? 'actualMs';

update public.user_settings
set data = (data - 'dailyGoalMinutes') || jsonb_build_object(
  'dailyGoalSeconds', coalesce((data->>'dailyGoalSeconds')::numeric, (data->>'dailyGoalMinutes')::numeric * 60),
  'defaultInputUnit', coalesce(data->'defaultInputUnit', '"minutes"'::jsonb),
  'timerDisplayFormat', coalesce(data->'timerDisplayFormat', '"adaptive"'::jsonb),
  'timerPresetsSeconds', coalesce(data->'timerPresetsSeconds', '[900,1500,2700,3600]'::jsonb),
  'joyLevel', coalesce(data->'joyLevel', '"full"'::jsonb)
)
where data ? 'dailyGoalMinutes';

create or replace function public.study_atlas_timer_seconds(value jsonb)
returns jsonb
language sql
immutable
as $$
  select (value - 'elapsedMs' - 'targetMs') || jsonb_build_object(
    'elapsedSeconds', coalesce((value->>'elapsedSeconds')::numeric, coalesce((value->>'elapsedMs')::numeric, 0) / 1000),
    'targetSeconds', coalesce((value->>'targetSeconds')::numeric, coalesce((value->>'targetMs')::numeric, 0) / 1000)
  );
$$;

update public.timer_state as timer
set data = case
  when timer.data ? 'active' then jsonb_set(
    timer.data,
    '{active}',
    public.study_atlas_timer_seconds(timer.data->'active'),
    true
  ) || jsonb_build_object(
    'pausedTimers', coalesce((
      select jsonb_agg(public.study_atlas_timer_seconds(paused.value))
      from jsonb_array_elements(coalesce(timer.data->'pausedTimers', '[]'::jsonb)) as paused(value)
    ), '[]'::jsonb)
  )
  else public.study_atlas_timer_seconds(timer.data)
end;

drop function public.study_atlas_timer_seconds(jsonb);

commit;
