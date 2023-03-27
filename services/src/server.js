'use strict'

const server = require('./app')({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
})

server.listen({ port: 3000 }, (err, address) => {
  if (err) {
    server.log.error(err)
    process.exit(1)
  }
})