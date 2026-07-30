const express = require('express');
const cors = require('cors');

const errorHandler = require('./middlewares/error-handler');
const notFoundHandler = require('./middlewares/not-found-handler');
const routes = require('./routes');

const app = express();

const allowedOrigins = [
  'http://localhost:4200',
  'https://atlas-protocol-front-upstream.vercel.app',
  'https://atlas-protocol-front.vercel.app',
];

app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      // Permite Postman, testes e requisições internas sem Origin.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origem não permitida pelo CORS.'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  }),
);

app.use(express.json());

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;