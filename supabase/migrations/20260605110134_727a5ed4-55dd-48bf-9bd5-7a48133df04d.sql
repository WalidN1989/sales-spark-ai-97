
-- learning category enum
CREATE TYPE public.learning_category AS ENUM ('writing_style', 'business_rule', 'objection', 'negotiation');

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand text,
  name text NOT NULL,
  part_number text,
  category text,
  cost_price_cents bigint,
  selling_price_cents bigint,
  margin_l1_pct numeric,
  margin_l2_pct numeric,
  currency text NOT NULL DEFAULT 'AED',
  warranty text,
  stock_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_user_part_idx ON public.products (user_id, upper(part_number));
CREATE INDEX products_user_idx ON public.products (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_owner_all ON public.products FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- LEARNING ENTRIES
CREATE TABLE public.learning_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category public.learning_category NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  situation text,
  tags text[] NOT NULL DEFAULT '{}',
  engine text,
  original_input text,
  ai_response text,
  final_response text,
  company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learning_user_cat_idx ON public.learning_entries (user_id, category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_entries TO authenticated;
GRANT ALL ON public.learning_entries TO service_role;
ALTER TABLE public.learning_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_owner_all ON public.learning_entries FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE TRIGGER learning_updated_at BEFORE UPDATE ON public.learning_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RESPONSES
CREATE TABLE public.responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  engine text NOT NULL,
  input_text text NOT NULL DEFAULT '',
  input_notes text,
  ocr_text text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_part_numbers text[] NOT NULL DEFAULT '{}',
  draft text,
  final text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX responses_user_company_idx ON public.responses (user_id, company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responses TO authenticated;
GRANT ALL ON public.responses TO service_role;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY responses_owner_all ON public.responses FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE TRIGGER responses_updated_at BEFORE UPDATE ON public.responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
