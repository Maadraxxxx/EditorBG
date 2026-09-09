-- Estrutura de contas do EditorBG.
-- Aplicada com: supabase db push

-- Perfil de cada conta. O campo `vip` é a fonte da verdade do plano.
create table if not exists public.perfis (
  id            uuid primary key references auth.users on delete cascade,
  email         text,
  vip           boolean not null default false,
  pagamento_id  text unique,          -- impede o mesmo pagamento liberar várias contas
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

-- A pessoa lê só o próprio perfil.
drop policy if exists "le o proprio perfil" on public.perfis;
create policy "le o proprio perfil"
  on public.perfis for select
  using (auth.uid() = id);

-- NENHUMA política de update para o cliente: `vip` só muda pelo servidor, com a
-- service role key. Sem isso, qualquer pessoa se promoveria a VIP pelo console.

-- Cria o perfil junto com a conta.
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Perfis para contas que já existiam antes desta tabela.
insert into public.perfis (id, email)
select id, email from auth.users
on conflict (id) do nothing;
