CREATE TABLE public.canteen_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id uuid NOT NULL REFERENCES public.canteens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canteen_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canteen_managers TO authenticated;
GRANT SELECT ON public.canteen_managers TO anon;
GRANT ALL ON public.canteen_managers TO service_role;

ALTER TABLE public.canteen_managers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.manages_canteen(_canteen_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.canteens c WHERE c.id = _canteen_id AND c.owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.canteen_managers m WHERE m.canteen_id = _canteen_id AND m.user_id = _user_id);
$$;

CREATE POLICY "canteen managers public read" ON public.canteen_managers FOR SELECT USING (true);
CREATE POLICY "owner manages canteen managers" ON public.canteen_managers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.canteens c WHERE c.id = canteen_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.canteens c WHERE c.id = canteen_id AND c.owner_id = auth.uid()));
CREATE POLICY "admin manages canteen managers" ON public.canteen_managers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- extend staff permissions to managers
DROP POLICY IF EXISTS "owner manages menu" ON public.menu_items;
CREATE POLICY "staff manages menu" ON public.menu_items FOR ALL TO authenticated
  USING (public.manages_canteen(canteen_id, auth.uid()))
  WITH CHECK (public.manages_canteen(canteen_id, auth.uid()));

DROP POLICY IF EXISTS "owner manages promos" ON public.promos;
CREATE POLICY "staff manages promos" ON public.promos FOR ALL TO authenticated
  USING (public.manages_canteen(canteen_id, auth.uid()))
  WITH CHECK (public.manages_canteen(canteen_id, auth.uid()));

DROP POLICY IF EXISTS "owner manages canteen debts" ON public.debts;
CREATE POLICY "staff manages canteen debts" ON public.debts FOR ALL TO authenticated
  USING (public.manages_canteen(canteen_id, auth.uid()))
  WITH CHECK (public.manages_canteen(canteen_id, auth.uid()));

DROP POLICY IF EXISTS "student reads own orders" ON public.orders;
CREATE POLICY "student or staff reads orders" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.manages_canteen(canteen_id, auth.uid()));

DROP POLICY IF EXISTS "student or owner updates order" ON public.orders;
CREATE POLICY "student or staff updates order" ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.manages_canteen(canteen_id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.manages_canteen(canteen_id, auth.uid()));

DROP POLICY IF EXISTS "order items visible to participants" ON public.order_items;
CREATE POLICY "order items visible to participants" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.manages_canteen(o.canteen_id, auth.uid()))));

DROP POLICY IF EXISTS "owner updates canteen" ON public.canteens;
CREATE POLICY "staff updates canteen" ON public.canteens FOR UPDATE TO authenticated
  USING (public.manages_canteen(id, auth.uid()))
  WITH CHECK (public.manages_canteen(id, auth.uid()));
