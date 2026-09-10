-- VIP deixa de ser "tem ou não tem" e passa a ter prazo.
-- Aplicada com: supabase db push
--
-- Esta migração é a que faz os três planos existirem no banco. Ela vem depois
-- de 20260909140000_admin_e_metricas.sql e redefine `resumo_admin`, então a
-- versão daqui é a que vale.

/* ------------------------------------------------------------------ *
 * 1. Prazo e nome do plano no perfil
 * ------------------------------------------------------------------ *
 * vip_ate null COM vip=true significa vitalício — não "sem acesso". A conta
 * de quem tem VIP valendo é sempre:
 *
 *     vip AND (vip_ate IS NULL OR vip_ate > now())
 *
 * `vip` sozinho não responde nada: ele continua true depois do vencimento,
 * porque não existe nada rodando de tempos em tempos para virar a chave.
 */
alter table public.perfis add column if not exists vip_ate timestamptz;
alter table public.perfis add column if not exists plano text;

-- Quem já era VIP comprou antes de existirem planos com prazo: era vitalício.
update public.perfis set plano = 'vitalicio' where vip and plano is null;

/* ------------------------------------------------------------------ *
 * 2. Qual plano cada pagamento comprou
 * ------------------------------------------------------------------ */
alter table public.pagamentos add column if not exists plano text;
update public.pagamentos set plano = 'vitalicio' where plano is null;

/* ------------------------------------------------------------------ *
 * 3. Resumo do painel, agora ciente de vencimento e de plano
 * ------------------------------------------------------------------ */
create or replace function public.resumo_admin()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'visitasHoje',    coalesce((select total from visitas where dia = current_date), 0),
    'visitas7',       coalesce((select sum(total) from visitas where dia > current_date - 7), 0),
    'visitasTotal',   coalesce((select sum(total) from visitas), 0),
    'contas',         (select count(*) from perfis),
    'contasHoje',     (select count(*) from perfis where criado_em >= current_date),
    'online',         (select count(*) from perfis where ultimo_acesso > now() - interval '15 minutes'),
    -- So conta quem tem VIP VALENDO: `vip` sozinho continua true depois do
    -- vencimento, porque nada roda periodicamente para virar a chave.
    'vips',           (select count(*) from perfis
                         where vip and (vip_ate is null or vip_ate > now())),
    'vipsVencidos',   (select count(*) from perfis
                         where vip and vip_ate is not null and vip_ate <= now()),
    'assinaturas',    (select count(*) from pagamentos where status = 'approved'),
    'assinaturasMes', (select count(*) from pagamentos
                         where status = 'approved'
                           and criado_em >= date_trunc('month', now())),
    'faturado',       coalesce((select sum(valor) from pagamentos where status = 'approved'), 0),
    'faturadoMes',    coalesce((select sum(valor) from pagamentos
                                  where status = 'approved'
                                    and criado_em >= date_trunc('month', now())), 0),
    'porPlano',       coalesce((select json_agg(t) from (
                         select plano, count(*) as vendas, sum(valor) as total
                         from pagamentos where status = 'approved'
                         group by plano order by sum(valor) desc
                       ) t), '[]'::json)
  );
$$;

-- Mesma trava de sempre: uma função security definer fica exposta em
-- /rest/v1/rpc/ por padrão, e esta devolve o faturamento do site inteiro.
revoke execute on function public.resumo_admin() from public;
revoke execute on function public.resumo_admin() from anon;
revoke execute on function public.resumo_admin() from authenticated;
