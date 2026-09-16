CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE base_username TEXT; final_username TEXT; n INT := 0;
BEGIN
  base_username := lower(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)));
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    n := n + 1; final_username := base_username || n::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, full_name, class, language, requested_canteen)
  VALUES (NEW.id, final_username,
          coalesce(NEW.raw_user_meta_data->>'full_name',''),
          coalesce(NEW.raw_user_meta_data->>'class',''),
          coalesce(NEW.raw_user_meta_data->>'language','id'),
          coalesce(NEW.raw_user_meta_data->>'requested_canteen',''));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, (coalesce(NEW.raw_user_meta_data->>'role','student'))::public.app_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $function$;