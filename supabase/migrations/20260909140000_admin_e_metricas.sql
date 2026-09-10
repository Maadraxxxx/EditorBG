-- Cargo de administrador, registro de pagamentos e contagem de visitas.
-- Aplicada com: supabase db push

/* ------------------------------------------------------------------ *
 * 1. Cargo e presença no perfil
 * ------------------------------------------------------------------ */
alter table public.perfis add column if not exists admin boolean not null default false;
alter table public.perfis add column if not exists ultimo_acesso timestamptz;

-- Continua sem política de UPDATE para o cliente. Isso vale principalmente
-- para `admin`: se o navegador pudesse escrever nesta tabela, qualquer pessoa
-- se promoveria a administrador pelo console. Quem escreve é só o servidor,
-- com a service role key, depois de conferir quem está pedindo.

/* ------------------------------------------------------------------ *
 * 2. Pagamentos aprovados
 * ------------------------------------------------------------------ *
 * O perfil guarda só o último pagamento que liberou o VIP. Para saber quanto
 * foi faturado é preciso a lista inteira, com valor e data — daí esta tabela.
 *
 * VIP dado à mão pelo painel NÃO entra aqui: é cortesia, não faturamento, e
 * misturar os dois faria o total mentir.
 */
create table if not exists public.pagamentos (
  id         text primary key,        -- id do Mercado Pago; repetido não duplica
  usuario_id uuid references auth.users on delete set null,
  email      text,
  valor      numeric(10, 2) not null default 0,
  moeda      text not null default 'BRL',
  meio       text,                    -- pix, credit_card, debit_card...
  status     text not null,
  criado_em  timestamptz not null default now()
);

alter table public.pagamentos enable row level security;

-- Nenhuma política: nem anon nem authenticated enxergam esta tabela. Só o
-- service_role, que ignora RLS, e é ele quem atende o painel do admin.

/* ------------------------------------------------------------------ *
 * 3. Visitas
 * ------------------------------------------------------------------ *
 * Duas tabelas, com propósitos diferentes:
 *
 *   visitas     — uma linha por dia. É o que o painel lê: não cresce sem
 *                 limite e a soma sai instantânea.
 *   visitantes  — quem já foi contado hoje, para não contar a mesma pessoa
 *                 duas vezes quando ela recarrega a página.
 *
 * `marca` é um hash de IP + navegador, feito no servidor com a service key
 * como sal. O IP em si nunca é gravado: o site promete que nada sai do
 * computador de quem usa, e guardar endereço de rede iria contra isso.
 */
create table if not exists public.visitas (
  dia   date primary key,
  total bigint not null default 0
);

create table if not exists public.visitantes (
  dia   date not null,
  marca text not null,
  primary key (dia, marca)
);

alter table public.visitas enable row level security;
alter table public.visitantes enable row level security;

-- A versão sem argumento não conta pessoas, só recarregamentos.
drop function if exists public.registrar_visita();

create or replace function public.registrar_visita(p_marca text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.visitantes (dia, marca)
  values (current_date, p_marca)
  on conflict do nothing;

  -- FOUND só é verdadeiro quando a linha entrou de fato, ou seja, quando esta
  -- pessoa ainda não tinha sido contada hoje.
  if not found then
    return false;
  end if;

  insert into public.visitas (dia, total)
  values (current_date, 1)
  on conflict (dia) do update set total = public.visitas.total + 1;

  return true;
end;
$$;

-- Fechada para o navegador. Uma função security definer fica exposta em
-- /rest/v1/rpc/ por padrão, e aberta ela deixaria qualquer visitante inflar o
-- contador em looping. Quem chama é a função serverless, com a service key.
revoke execute on function public.registrar_visita(text) from public;
revoke execute on function public.registrar_visita(text) from anon;
revoke execute on function public.registrar_visita(text) from authenticated;

/* ------------------------------------------------------------------ *
 * 4. Resumo do painel
 * ------------------------------------------------------------------ *
 * Tudo o que o painel mostra em cima sai daqui, numa ida só ao banco. Fazer
 * isso com contagens separadas pelo PostgREST daria seis requisições e ainda
 * assim não somaria o faturamento.
 */
create or replace function public.resumo_admin()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'visitasHoje',  coalesce((select total from visitas where dia = current_date), 0),
    'visitas7',     coalesce((select sum(total) from visitas where dia > current_date - 7), 0),
    'visitasTotal', coalesce((select sum(total) from visitas), 0),
    'contas',       (select count(*) from perfis),
    'contasHoje',   (select count(*) from perfis where criado_em >= current_date),
    'online',       (select count(*) from perfis where ultimo_acesso > now() - interval '15 minutes'),
    'vips',         (select count(*) from perfis where vip),
    'assinaturas',  (select count(*) from pagamentos where status = 'approved'),
    'assinaturasMes', (select count(*) from pagamentos
                         where status = 'approved'
                           and criado_em >= date_trunc('month', now())),
    'faturado',     coalesce((select sum(valor) from pagamentos where status = 'approved'), 0),
    'faturadoMes',  coalesce((select sum(valor) from pagamentos
                                where status = 'approved'
                                  and criado_em >= date_trunc('month', now())), 0)
  );
$$;

-- Mesma trava da registrar_visita: só o service_role chama.
revoke execute on function public.resumo_admin() from public;
revoke execute on function public.resumo_admin() from anon;
revoke execute on function public.resumo_admin() from authenticated;
