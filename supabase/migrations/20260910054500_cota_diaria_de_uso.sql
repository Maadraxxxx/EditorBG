-- Cota diária das ferramentas com limite. Hoje só a de melhorar qualidade.
-- Aplicada com: supabase db push

/* ------------------------------------------------------------------ *
 * Contador por dia, por pessoa, por ferramenta
 * ------------------------------------------------------------------ *
 * `marca` é 'u:<id da conta>' para quem está logado e 'v:<hash>' para quem
 * não está — o hash é feito no servidor a partir de IP + navegador, com a
 * service key como sal. O IP não é gravado, pelo mesmo motivo da contagem de
 * visitas: o site promete que nada sai do computador de quem usa.
 */
create table if not exists public.usos (
  dia        date not null default current_date,
  marca      text not null,
  ferramenta text not null,
  total      int  not null default 0,
  primary key (dia, marca, ferramenta)
);

alter table public.usos enable row level security;

-- Nenhuma política: só o service_role enxerga. Se o navegador pudesse escrever
-- aqui, o contador não valeria nada.

/**
 * Soma um uso e diz se pode. As duas coisas juntas, de propósito: separadas em
 * "consulta" e "incrementa" haveria uma janela entre elas para duas abas
 * passarem no mesmo limite. O `for update` segura a linha até o fim.
 */
create or replace function public.registrar_uso(p_marca text, p_ferramenta text, p_limite int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  atual int;
begin
  insert into public.usos (dia, marca, ferramenta, total)
  values (current_date, p_marca, p_ferramenta, 0)
  on conflict (dia, marca, ferramenta) do nothing;

  select total into atual
  from public.usos
  where dia = current_date and marca = p_marca and ferramenta = p_ferramenta
  for update;

  if atual >= p_limite then
    return json_build_object('permitido', false, 'usados', atual, 'limite', p_limite);
  end if;

  update public.usos set total = total + 1
  where dia = current_date and marca = p_marca and ferramenta = p_ferramenta
  returning total into atual;

  return json_build_object('permitido', true, 'usados', atual, 'limite', p_limite);
end;
$$;

-- Mesma trava das outras: função security definer fica exposta em /rest/v1/rpc/
-- por padrão, e esta escreve num contador.
revoke execute on function public.registrar_uso(text, text, int) from public;
revoke execute on function public.registrar_uso(text, text, int) from anon;
revoke execute on function public.registrar_uso(text, text, int) from authenticated;
