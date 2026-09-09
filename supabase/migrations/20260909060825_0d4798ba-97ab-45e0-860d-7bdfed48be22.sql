-- profiles: requested canteen name for owner signups
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_canteen text NOT NULL DEFAULT '';

-- reviews: anonymous + images
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

-- forum anonymity (legacy forum retained)
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE public.forum_comments ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

-- ============ PROMOS ============
CREATE TABLE public.promos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id uuid NOT NULL REFERENCES public.canteens(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  banner_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promos TO authenticated;
GRANT ALL ON public.promos TO service_role;
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promos public read" ON public.promos FOR SELECT USING (true);
CREATE POLICY "owner manages promos" ON public.promos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.canteens c WHERE c.id = promos.canteen_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.canteens c WHERE c.id = promos.canteen_id AND c.owner_id = auth.uid()));
CREATE POLICY "admin manages promos" ON public.promos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER promos_updated BEFORE UPDATE ON public.promos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER promos_filter BEFORE INSERT OR UPDATE ON public.promos FOR EACH ROW EXECUTE FUNCTION public.reject_banned_words();
CREATE INDEX promos_canteen_idx ON public.promos(canteen_id, created_at DESC);

CREATE TABLE public.promo_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id uuid NOT NULL REFERENCES public.promos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promo_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_comments TO authenticated;
GRANT ALL ON public.promo_comments TO service_role;
ALTER TABLE public.promo_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo comments public read" ON public.promo_comments FOR SELECT USING (true);
CREATE POLICY "insert own promo comment" ON public.promo_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own promo comment" ON public.promo_comments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete own or moderated promo comment" ON public.promo_comments FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.promos p JOIN public.canteens c ON c.id = p.canteen_id
      WHERE p.id = promo_comments.promo_id AND c.owner_id = auth.uid()
    )
  );
CREATE TRIGGER promo_comments_filter BEFORE INSERT OR UPDATE ON public.promo_comments FOR EACH ROW EXECUTE FUNCTION public.reject_banned_words();
CREATE INDEX promo_comments_promo_idx ON public.promo_comments(promo_id, created_at);

-- ============ REPORTS ============
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('message','promo','promo_comment','review','forum_post','forum_comment','user')),
  target_id uuid NOT NULL,
  context text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own report" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "read own report" ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());
CREATE POLICY "admin manages reports" ON public.reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER reports_updated BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ DEBTS ============
CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id uuid NOT NULL REFERENCES public.canteens(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount integer NOT NULL CHECK (amount > 0),
  note text NOT NULL DEFAULT '',
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debts TO authenticated;
GRANT ALL ON public.debts TO service_role;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student reads own debts" ON public.debts FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "owner manages canteen debts" ON public.debts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.canteens c WHERE c.id = debts.canteen_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.canteens c WHERE c.id = debts.canteen_id AND c.owner_id = auth.uid()));
CREATE POLICY "admin manages debts" ON public.debts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER debts_updated BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX debts_student_idx ON public.debts(student_id, paid);
CREATE INDEX debts_canteen_idx ON public.debts(canteen_id, paid);

-- ============ CHAT RULE: no student-to-student DMs ============
CREATE OR REPLACE FUNCTION public.enforce_dm_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.peer_id IS NOT NULL AND NEW.canteen_id IS NULL THEN
    IF NOT (
      public.has_role(NEW.student_id, 'canteen_owner') OR public.has_role(NEW.student_id, 'admin')
      OR public.has_role(NEW.peer_id, 'canteen_owner') OR public.has_role(NEW.peer_id, 'admin')
    ) THEN
      RAISE EXCEPTION 'DM_NOT_ALLOWED';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_dm_rules() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER conversations_dm_rules BEFORE INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.enforce_dm_rules();