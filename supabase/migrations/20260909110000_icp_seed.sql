-- Seed the Product ICP module with the 3 products from the ICP doc. Owner = the
-- admin account. Each INSERT is guarded by name so re-running is safe.

-- 1) Canteen Management System
INSERT INTO public.icp_profiles (user_id, name, category, summary, industries, headcount, personas, use_cases, customers, competitors)
SELECT
  (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at LIMIT 1),
  'Canteen Management System', 'Software',
  'Meal / canteen counting and management for high-volume dining operations.',
  ARRAY['Hospitality (Hotels & Resorts)','Industrial Catering','Labor Camps / Worker Accommodations','Construction & Contracting','Manufacturing Plants','Schools & Universities'],
  '150 to 10,000+ daily dining staff or workers (Middle East).',
  '[{"title":"Hotel HR & Operations Managers"},{"title":"Catering & Camp Operations Directors"},{"title":"IT & Systems Managers"}]'::jsonb,
  '[]'::jsonb,
  '[{"name":"The Lana, Dubai (Dorchester Collection)","segment":"Hotels"},{"name":"Dusit Thani Abu Dhabi","segment":"Hotels"},{"name":"MEHN Labor Camp","segment":"Catering & Labor Camps"},{"name":"Innovative Catering","segment":"Catering & Labor Camps"},{"name":"Intercat","segment":"Catering & Labor Camps"}]'::jsonb,
  '[{"name":"NexGen Technologies","url":"https://nexgenme.com/canteen-management-system"},{"name":"Microhard Infotech","url":"https://www.microhard.ae/2021/04/29/meal-management-solution-in-dubai-uae/"},{"name":"CUBES International","url":"https://www.cubes-intl.com/products/canteen-management/"},{"name":"ACIX ME","url":"https://www.acixme.com/solution/canteen-management-system/"},{"name":"eKemp","url":"https://www.ekemp.com.cn/canteen-management-system"},{"name":"Brio","url":"https://brio.ae/meal-counting-system/"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.icp_profiles WHERE name = 'Canteen Management System');

-- 2) EID Reader Software
INSERT INTO public.icp_profiles (user_id, name, category, summary, industries, headcount, personas, use_cases, customers, competitors)
SELECT
  (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at LIMIT 1),
  'EID Reader Software', 'Software + Hardware',
  'Emirates ID reader software for fast, error-free KYC capture at front desks.',
  ARRAY['Healthcare (Clinics & Hospitals)','Banking & Financial','Real Estate','Legal & Compliance','Telecom Outlets','Government Service Centers','Hotel Front Desks','Corporate HR'],
  'Front-desk / service counters needing fast onboarding, KYC compliance, automated form-fill and digital visitor registration.',
  '[{"title":"Reception & Front Desk Supervisors / Clinic Managers","description":"2-second check-in, no manual typing errors, zero scanning backlogs"},{"title":"Compliance & Legal Officers (KYC/AML)","description":"Accurate capture of name, EID number, nationality, DOB and expiry from the smart chip"},{"title":"IT & Integration Managers","description":"Plug-and-play USB (OMNIKEY 3121) + easy API/SDK/CSV export to Web Apps, ERPs, SQL"}]'::jsonb,
  '[{"title":"Healthcare & Clinics","description":"Rapid KYC data capture"},{"title":"Real Estate & Exchange Houses","description":"KYC for tenancy contracts, viewing logs, transactions"},{"title":"Corporate HR & Security","description":"Employee onboarding, access-control programming, visitor logs"},{"title":"Hotel Check-In Desks","description":"Swift guest ID and age verification"}]'::jsonb,
  '[{"name":"ADNOC Technical Academy"},{"name":"ICT Real Estate Development - Sole proprietorship L.L.C"},{"name":"Al Marwan Real Estate Development"}]'::jsonb,
  '[{"name":"Jacky''s Business Solutions (Grabba)","url":"https://www.jackys.com/grabba/"},{"name":"Glass-Reader","url":"https://glass-reader.io/"},{"name":"Ebrsoftware","url":"https://ebrsoftware.com/benefits-of-emirates-id-reader-software-for-uae-businesses/"},{"name":"EID Link (Microsoft Store)","url":"https://apps.microsoft.com/detail/9p865b2l7cw2"},{"name":"Cardlineuae","url":"https://cardlineuae.com/emirates-id-reading-solution.html"},{"name":"Simple Logic","url":"https://simplelogicit.com/solutions/emirates-id-card-reader-software/"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.icp_profiles WHERE name = 'EID Reader Software');

-- 3) UBio Biometric Access Control & Time Attendance (TNA)
INSERT INTO public.icp_profiles (user_id, name, category, summary, industries, headcount, personas, use_cases, customers, competitors)
SELECT
  (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at LIMIT 1),
  'UBio Biometric Access Control & Time Attendance', 'Hardware + Software',
  'Biometric access control and time & attendance across single or multi-branch sites.',
  ARRAY['Hospitality & Luxury Resorts','Industrial & Manufacturing (Steel, Pharma, Packaging, Oil & Gas)','Financial Institutions & Exchange Houses','Retail Chains & Supermarkets','Large Contracting & Corporate Hubs'],
  '200 to 10,000+ employees across single or multi-branch sites (Middle East).',
  '[{"title":"Security & Facility Managers"},{"title":"HR & Payroll Directors"},{"title":"IT & Systems Managers"}]'::jsonb,
  '[]'::jsonb,
  '[{"name":"Al Hamra Fort Hotel and Beach Resort LLC","segment":"Hotels"},{"name":"Al Maha Arjaan Hotel Apartments by Rotana","segment":"Hotels"},{"name":"The H Hotel L.L.C / Carlton Downtown Hotel L.L.C","segment":"Hotels"},{"name":"Gulf Pharmaceutical Industries (Julphar)","segment":"Manufacturing / Industrial"},{"name":"Denholm Yam Steel Factory LLC / Denholm Yam Contracting Company LLC","segment":"Manufacturing / Industrial"},{"name":"National Fire Fighting Manufacturing FZCO (NAFFCO)","segment":"Manufacturing / Industrial"},{"name":"Nestle Waters Factory H&O LLC","segment":"Manufacturing / Industrial"},{"name":"Vega Digital IT Solution","segment":"System Integrators"},{"name":"AL JADEED EXCHANGE LLC","segment":"Exchange & Financial"},{"name":"The First Investor LLC","segment":"Exchange & Financial"},{"name":"Trolleys Supermarket L.L.C / Istanbul Food Stuff Tr. Co. LLC","segment":"Retail & Trading"},{"name":"Bafleh Jewellery Company / Blue Rhine General Trading (L.L.C)","segment":"Retail & Trading"}]'::jsonb,
  '[{"name":"DLI-IT Solutions (Nitgen & Virdi)","url":"https://www.dli-it.com/nitgen-biometric-device/"},{"name":"LogIT","url":"https://www.logitme.com/solutions-category/time-attendance/virdi/"},{"name":"CAD GULF","url":"https://cadgulf.com/virdi-access-control-in-uae/"},{"name":"AL Asas","url":"https://alasasit.com/products?brand=UBIO"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.icp_profiles WHERE name = 'UBio Biometric Access Control & Time Attendance');
