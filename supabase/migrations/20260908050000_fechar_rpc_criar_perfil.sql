-- A criar_perfil() é uma função de gatilho, mas por padrão o Postgres concede
-- EXECUTE a todo mundo — e o PostgREST expõe isso como /rest/v1/rpc/criar_perfil.
-- Sendo SECURITY DEFINER, ela roda com privilégio elevado, então não deve ficar
-- ao alcance de quem não está autenticado (nem de quem está).
--
-- Gatilhos não passam por essa checagem: o Postgres não exige EXECUTE do papel
-- que dispara o trigger, então o cadastro continua criando o perfil normalmente.

revoke execute on function public.criar_perfil() from public;
revoke execute on function public.criar_perfil() from anon;
revoke execute on function public.criar_perfil() from authenticated;
