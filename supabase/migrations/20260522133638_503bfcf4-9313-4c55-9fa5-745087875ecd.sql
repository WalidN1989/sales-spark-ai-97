
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'sales_rep');
CREATE TYPE public.activity_type AS ENUM ('note', 'call', 'visit', 'email');
CREATE TYPE public.user_status AS ENUM ('active', 'inactive');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  status user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Per-user, per-module, per-tab overrides
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  tab TEXT NOT NULL DEFAULT '*',
  enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id, module, tab)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- "My Company" — used as system context for AI later
CREATE TABLE public.my_company (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  industry TEXT,
  products_services TEXT,
  strengths TEXT,
  target_niche TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.my_company ENABLE ROW LEVEL SECURITY;

-- Companies (prospects)
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  country TEXT DEFAULT 'UAE',
  industry TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  product_service TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  research_data JSONB,
  last_research_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE INDEX companies_user_id_idx ON public.companies(user_id);

-- Activity log
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type activity_type NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX activity_log_company_idx ON public.activity_log(company_id);

-- Stubs
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  brand TEXT,
  product TEXT,
  model TEXT,
  value NUMERIC(12,2),
  order_ref TEXT,
  order_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact TEXT,
  location TEXT,
  scheduled_at TIMESTAMPTZ,
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _module TEXT, _tab TEXT DEFAULT '*')
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_admin(_user_id)
    OR COALESCE(
      (SELECT enabled FROM public.user_permissions WHERE user_id = _user_id AND module = _module AND tab = _tab),
      (SELECT enabled FROM public.user_permissions WHERE user_id = _user_id AND module = _module AND tab = '*'),
      true
    )
$$;

-- RLS Policies

-- profiles
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));

-- user_roles
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_permissions
CREATE POLICY "user_permissions_self_select" ON public.user_permissions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "user_permissions_admin_all" ON public.user_permissions FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- my_company
CREATE POLICY "my_company_owner_all" ON public.my_company FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- companies
CREATE POLICY "companies_owner_all" ON public.companies FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- activity_log
CREATE POLICY "activity_log_owner_all" ON public.activity_log FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- sales
CREATE POLICY "sales_owner_all" ON public.sales FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- meetings
CREATE POLICY "meetings_owner_all" ON public.meetings FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Auto-create profile + default role on new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INT;
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );

  -- First user becomes admin, everyone else is a sales_rep
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'sales_rep';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
