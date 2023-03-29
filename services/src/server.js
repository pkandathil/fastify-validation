'use strict'

const server = require('./app')({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
})

let port = process.env.NODE_ENV === 'prod' ? 80 : 3000

server.listen({ port }, (err, address) => {
  if (err) {
    server.log.error(err)
    process.exit(1)
  }
})