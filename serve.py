"""
Servidor local do EditorBG.

O `python -m http.server` não manda cabeçalho de cache, e o navegador acaba
guardando os módulos JS por conta própria — você edita um arquivo, recarrega e
continua vendo a versão antiga. Aqui todo arquivo vai com `no-store`.

Uso:  python serve.py [porta]
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5180


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        """
        Serve /remover-fundo lendo remover-fundo.html.

        A Vercel faz isso em producao (cleanUrls no vercel.json). Sem o mesmo
        comportamento aqui, o site testado na maquina e o publicado seriam dois
        sites diferentes — e a diferenca so apareceria depois do deploy.
        """
        destino = super().translate_path(path)
        if (not os.path.splitext(destino)[1]
                and not os.path.isdir(destino)
                and os.path.isfile(destino + ".html")):
            return destino + ".html"
        return destino

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
        """
        As funções de `api/` só existem na Vercel. Aqui elas viram um 204 vazio.

        Sem isto, cada POST vira um 501 vermelho no console — e o erro é do
        servidorzinho, não do site. Quem quiser rodar as funções de verdade na
        própria máquina precisa do `vercel dev`, não deste arquivo.
        """
        if self.path.startswith("/api/"):
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(501, "Unsupported method ('POST')")

    def log_message(self, fmt, *args):
        # silencia o log de cada arquivo servido
        pass


# Precisa ser com threads: o navegador abre conexões especulativas e deixa
# ociosas — num servidor de thread única elas travam a fila inteira.
class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("", PORT), NoCacheHandler) as httpd:
        print(f"EditorBG rodando em http://localhost:{PORT}  (Ctrl+C para parar)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nservidor parado")
