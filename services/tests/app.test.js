'use strict'

const { test } = require('tap')
const build = require('../src/app')

test('requests the "/" route and ', async t => {
  const app = build()

  const response = await app.inject({
    method: 'GET',
    url: '/'
  })
  t.equal(400, response.statusCode, 'returns a status code of 400')
})

test('requests the "/:keyword" route', async t => {
  const app = build()

  const response = await app.inject({
    method: 'GET',
    url: '/someword'
  })
  t.equal(200, response.statusCode, 'and passes when the input is 8 characters long')
})

test('requests the "/:keword" route', async t => {
  const app = build()

  const response = await app.inject({
    method: 'GET',
    url: '/somewordasdf'
  })
  t.equal(400, response.statusCode, 'and fails when the input is longer than 10 characters')
})

test('requests the "/:keword?optionalParameter1=test" route', async t => {
  const app = build()

  const response = await app.inject({
    method: 'GET',
    url: '/someword?optionalParameter1=test'
  })
  t.equal(200, response.statusCode, 'and passes when the keyword is 8 characters long and the optionmalParameter is less than 10 characters')
})

test('requests the "/:keword?optionalParameter1=testtesttest" route', async t => {
  const app = build()

  const response = await app.inject({
    method: 'GET',
    url: '/someword?optionalParameter1=testtesttest'
  })
  t.equal(400, response.statusCode, 'and fails when the keyword is 8 characters long and the optionmalParameter is more than 10 characters')
})