// Require the framework and instantiate it
const fastify = require('fastify')

function build(opts = {}) {
  const app = fastify(opts)

  //A schema to validate the query string. Everything after ?
  const queryStringSchema = {
    type: 'object',
    properties: {
      optionalParameter1: { type: 'string', maxLength: 10 },
    }
  }

  //A schema to validate the in path parameters
  const paramsSchema = {
    properties: {
      keyword: {
        type: 'string',
        maxLength: 10,
        minLength: 1, //If you want to make a parameter required, add an min-length to it
      }
    }
  }

  //Explain where the schema needs to be applied
  const schema = {
    query: queryStringSchema,
    params: paramsSchema
  }

  //Attach the schema to the route
  // app.get('/:keyword', { schema }, async (request, reply) => {
  //   return { queryStringParameters: request.query, params: request.params }
  // })

  app.get('/status', (req, res) => {
    res.status(200).send('Up and running')
  })

  app.get('/test', (req, res) => {
    res.status(200).send('Up and running')
  })

  return app
}

module.exports = build