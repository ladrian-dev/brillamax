-- 0011 — Notas de Entrega (NE).
--
-- Espejo del spec features/notas-de-entrega.md con adaptaciones MVP:
--  - Correlativo 'NE-YYYY-NNNN' vía next_doc_number('NE') (ADR: reutilizar
--    doc_sequences en lugar de delivery_number_sequences separado).
--  - PDF generation via Edge Function queda para sprint 9-10; el MVP almacena
--    sólo la metadata (NE emitida sí/no + timestamps + firma opcional).
--  - 1 NE por venta: unique (tenant_id, sale_id). Regenerar bumpea
--    pdf_version pero preserva el delivery_number.

create table public.delivery_notes (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  sale_id              uuid not null references public.sales(id) on delete cascade,
  delivery_number      text not null,
  issued_at            timestamptz not null default now(),
  pdf_path             text,
  pdf_version          int not null default 1,
  customer_signature_url text,
  received_by_name     text,
  delivered_at         timestamptz,
  delivered_by         uuid references auth.users(id) on delete set null,
  shared_whatsapp_at   timestamptz,
  created_at           timestamptz not null default now(),
  unique (tenant_id, delivery_number),
  unique (tenant_id, sale_id)
);

create index delivery_notes_tenant_date_idx
  on public.delivery_notes(tenant_id, issued_at desc);

alter table public.delivery_notes enable row level security;
create policy "delivery_notes_tenant_isolation" on public.delivery_notes
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

---------- RPC: issue_delivery_note ----------
-- Emite (o regenera) la NE de una venta. Si no existe asigna correlativo;
-- si existe bumpea pdf_version y actualiza received_by_name/firma.
create or replace function public.issue_delivery_note(
  p_sale_id              uuid,
  p_received_by_name     text,
  p_customer_signature_url text
)
returns table (
  id              uuid,
  delivery_number text,
  pdf_version     int,
  issued_at       timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_sale public.sales%rowtype;
  v_existing public.delivery_notes%rowtype;
  v_number text;
  v_new_id uuid;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  select * into v_sale from public.sales
    where id = p_sale_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'venta no encontrada';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'no se puede emitir NE de venta anulada';
  end if;

  select * into v_existing from public.delivery_notes
    where sale_id = p_sale_id and tenant_id = v_tenant for update;

  if found then
    update public.delivery_notes
       set pdf_version = v_existing.pdf_version + 1,
           issued_at = now(),
           received_by_name = coalesce(nullif(p_received_by_name, ''), v_existing.received_by_name),
           customer_signature_url = coalesce(nullif(p_customer_signature_url, ''), v_existing.customer_signature_url),
           delivered_at = coalesce(v_existing.delivered_at, now()),
           delivered_by = coalesce(v_existing.delivered_by, auth.uid())
     where id = v_existing.id;
    if v_sale.delivered_at is null then
      update public.sales
         set delivered_at = now(),
             status = case when status = 'confirmed' then 'delivered'::public.sale_status else status end
       where id = p_sale_id;
    end if;
    return query
      select dn.id, dn.delivery_number, dn.pdf_version, dn.issued_at
        from public.delivery_notes dn where dn.id = v_existing.id;
    return;
  end if;

  v_number := public.next_doc_number('NE');
  insert into public.delivery_notes (
    tenant_id, sale_id, delivery_number,
    received_by_name, customer_signature_url,
    delivered_at, delivered_by
  ) values (
    v_tenant, p_sale_id, v_number,
    nullif(p_received_by_name, ''),
    nullif(p_customer_signature_url, ''),
    now(), auth.uid()
  ) returning id into v_new_id;

  update public.sales
     set delivered_at = now(),
         status = case when status = 'confirmed' then 'delivered'::public.sale_status else status end
   where id = p_sale_id and delivered_at is null;

  return query
    select dn.id, dn.delivery_number, dn.pdf_version, dn.issued_at
      from public.delivery_notes dn where dn.id = v_new_id;
end;
$$;

revoke execute on function public.issue_delivery_note(uuid, text, text) from public, anon;
grant  execute on function public.issue_delivery_note(uuid, text, text) to authenticated;

---------- RPC: mark_delivery_note_shared ----------
create or replace function public.mark_delivery_note_shared(p_delivery_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  update public.delivery_notes
     set shared_whatsapp_at = now()
   where id = p_delivery_note_id
     and tenant_id = v_tenant;
end;
$$;

revoke execute on function public.mark_delivery_note_shared(uuid) from public, anon;
grant  execute on function public.mark_delivery_note_shared(uuid) to authenticated;
