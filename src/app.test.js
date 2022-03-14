'use strict';

const server = require('./app');
const supertest = require('supertest');
const requestWithSupertest = supertest(server);
const matchers = require('jest-extended');
expect.extend(matchers);

describe('GET /contracts/:id', () => {
  it('should return contract for profile_id: 5', async () => {
    const res = await requestWithSupertest
      .get('/contracts/1')
      .set('profile_id', 5);
    expect(res.status).toEqual(200);
    expect(res.type).toEqual(expect.stringContaining('json'));
    expect(res.body).toHaveProperty('ClientId');
    expect(res.body).toHaveProperty('ContractorId');
    expect(res.body.id).toEqual(1);
  });

  it('should return Not Found error for profile_id: 1', async () => {
    const res = await requestWithSupertest
      .get('/contracts/1')
      .set('profile_id', 1);
    expect(res.status).toEqual(404);
  });

  it('should return Not Authorized error for not exising profile_id: 1000', async () => {
    const res = await requestWithSupertest
      .get('/contracts/1')
      .set('profile_id', 1000);
    expect(res.status).toEqual(401);
  });
});

describe('GET /contracts', () => {
  it('should return array of contracts belonging to contractor', async () => {
    const res = await requestWithSupertest
      .get('/contracts')
      .set('profile_id', 3);

    expect(res.status).toEqual(200);
    expect(res.body).toBeArray();
    expect(res.body).toSatisfyAll(
      (contract) => contract.status !== 'terminated'
    );
  });
});

describe('GET /jobs/unpaid', () => {
  xit('tests to be implemented', async () => {
    // TODO
    expect(true).toEqual(true);
  });
});

describe('POST /jobs/:job_id/pay', () => {
  xit('tests to be implemented', async () => {
    // TODO
  });
});

describe('POST /balances/deposit/:userIdy', () => {
  xit('tests to be implemented', async () => {
    // TODO
  });
});

describe('GET /admin/best-profession?start=<date>&end=<date>', () => {
  xit('tests to be implemented', async () => {
    // TODO
  });
});

describe('GET /admin/best-clients?start=<date>&end=<date>&limit=<integer>', () => {
  xit('tests to be implemented', async () => {
    // TODO
  });
});
