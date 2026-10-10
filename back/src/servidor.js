import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { usuarioDesdeRequest } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARPETA_IMG = path.resolve(__dirname, '../img');
const TIPOS_IMG = { '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

const PUERTO = Number(process.env.PORT || 4000);
const ORIGEN_PERMITIDO = process.env.FRONT_URL || '*';

const servidor = new ApolloServer({ typeDefs, resolvers, includeStacktraceInErrorResponses: false });
await servidor.start();

const cabecerasCors = {
  'Access-Control-Allow-Origin': ORIGEN_PERMITIDO,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function responderJson(res, estado, cuerpo) {
  res.writeHead(estado, { 'Content-Type': 'application/json', ...cabecerasCors });
  res.end(JSON.stringify(cuerpo));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (trozo) => (datos += trozo));
    req.on('end', () => resolve(datos));
    req.on('error', reject);
  });
}

const htmlPlayground = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GraphQL Playground</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/css/index.css" />
    <script src="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/js/middleware.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.addEventListener('load', () => {
        GraphQLPlayground.init(document.getElementById('root'), { endpoint: '/graphql' });
      });
    </script>
  </body>
</html>`;

http
  .createServer(async (req, res) => {
    const ruta = new URL(req.url, `http://${req.headers.host}`).pathname;

    if (ruta.startsWith('/img/') && req.method === 'GET') {
      const archivo = path.resolve(CARPETA_IMG, decodeURIComponent(ruta.slice(5)));
      const tipo = TIPOS_IMG[path.extname(archivo).toLowerCase()];
      if (!archivo.startsWith(CARPETA_IMG + path.sep) || !tipo || !fs.existsSync(archivo)) {
        return responderJson(res, 404, { errors: [{ message: 'No encontrado' }] });
      }
      res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'public, max-age=86400', ...cabecerasCors });
      return fs.createReadStream(archivo).pipe(res);
    }

    if (ruta !== '/graphql') {
      return responderJson(res, 404, { errors: [{ message: 'No encontrado' }] });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cabecerasCors);
      return res.end();
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...cabecerasCors });
      return res.end(htmlPlayground);
    }

    if (req.method !== 'POST') {
      return responderJson(res, 405, { errors: [{ message: 'Método no permitido' }] });
    }

    try {
      const crudo = await leerCuerpo(req);
      if (!crudo.trim()) return responderJson(res, 200, { data: null });

      const cuerpo = JSON.parse(crudo);
      if (!cuerpo.query) return responderJson(res, 200, { data: null });

      const respuesta = await servidor.executeOperation(
        {
          query: cuerpo.query,
          variables: cuerpo.variables,
          operationName: cuerpo.operationName,
        },
        { contextValue: { user: await usuarioDesdeRequest(req) } }
      );

      responderJson(res, 200, respuesta.body.singleResult);
    } catch (err) {
      responderJson(res, 200, { errors: [{ message: err.message }] });
    }
  })
  .listen(PUERTO, () => {
    console.log(`Back GraphQL en http://localhost:${PUERTO}/graphql`);
  });
