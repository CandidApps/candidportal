-- Custom themes: only primary + accent are user-defined (2 colors).

begin;

alter table public.user_custom_themes
  drop constraint if exists user_custom_themes_colors_check;

alter table public.user_custom_themes
  add constraint user_custom_themes_colors_check check (array_length(colors, 1) = 2);

commit;
