-- Test RLS anti-leak. Correr con `supabase test db`.
-- Simula dos tenants y verifica que el usuario A no ve datos del tenant B.
-- Ampliar a cada tabla de negocio en sprints posteriores.

begin;

select plan(3);

-- Setup: dos tenants, dos usuarios, un miembro por tenant.
insert into public.tenants (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'tenant-a'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'tenant-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@brillamax.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@brillamax.test');

insert into public.tenant_members (tenant_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Test 1: usuario A con JWT de tenant A ve solo su tenant.
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","tenant_id":"11111111-1111-1111-1111-111111111111"}';

select is(
  (select count(*)::int from public.tenants),
  1,
  'Usuario A solo ve su propio tenant (1 fila)'
);

-- Test 2: usuario A NO ve tenant B.
select is(
  (select count(*)::int from public.tenants where slug = 'tenant-b'),
  0,
  'Usuario A no puede leer tenant-b (fuga bloqueada)'
);

-- Test 3: current_tenant_id() devuelve el del JWT.
select is(
  public.current_tenant_id()::text,
  '11111111-1111-1111-1111-111111111111',
  'current_tenant_id() coincide con custom claim'
);

select * from finish();
rollback;
