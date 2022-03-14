'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model');
const { Op } = require('sequelize');
const { getProfile } = require('./middleware/getProfile');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('./errors');

// Express 5.0.0 won't need this.
require('express-async-errors');

/**
 * Check if given profile is allowed to access resource.
 *
 * @param {*} profile
 * @param {*} resource
 * @returns
 *
 */
function checkAccessPermissions(profile, resource) {
  if (profile.id === resource.ClientId) return;
  throw new ForbiddenError();
}

async function transaction(func) {
  const result = await sequelize.transaction(async (t) => {
    return func();
  });
  return result;
}

/**
 * ***GET*** `/contracts/:id` - This API is broken 😵! it should return the contract only if it belongs to the profile calling. better fix that!
 *
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
  const result = await transaction(async () => {
    const { Contract } = req.app.get('models');
    const { profile } = req;
    const { id } = req.params;

    const contract = await Contract.findOne({
      where: { id, ContractorId: profile.id },
    });

    if (!contract) throw new NotFoundError();
    return contract;
  });
  // TODO: NOT NEEDED
  // checkAccessPermissions(profile, contract);
  res.json(result);
});

/**
 * ***GET*** `/contracts` - Returns a list of contracts belonging to a user (client or contractor), the list should only contain non terminated contracts.
 *
 */
app.get('/contracts', getProfile, async (req, res) => {
  const result = await transaction(async () => {
    const { Contract } = req.app.get('models');
    const { profile } = req;
    const contracts = await Contract.findAll({
      where: {
        [Op.or]: { ClientId: profile.id, ContractorId: profile.id },
        status: { [Op.not]: 'terminated' },
      },
    });
    return contracts;
  });

  res.json(result);
});

/**
 * ***GET*** `/jobs/unpaid` -  Get all unpaid jobs for a user (***either*** a client or contractor), for ***active contracts only***.
 *
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
  const result = await transaction(async () => {
    const { Contract, Job } = req.app.get('models');
    const { profile } = req;

    const contracts = await Contract.findAll({
      where: {
        [Op.or]: { ClientId: profile.id, ContractorId: profile.id },
        status: 'in_progress',
      },
    });

    const jobs = await Job.findAll({
      where: {
        paid: { [Op.not]: true }, // TODO: Poor data quality (made on purpose?). Easy workaround use not.
        ContractId: { [Op.in]: contracts.map((contract) => contract.id) },
      },
    });

    return jobs;
  });

  res.json(result);
});

/**
 * ***POST*** `/jobs/:job_id/pay` - Pay for a job, a client can only pay if his balance >= the amount to pay. The amount should be moved from the client's balance to the contractor balance.
 *
 * Client pays (profile) to job assigned to contractor
 *
 */
app.post('/jobs/:job_id/pay', getProfile, async (req, res) => {
  const result = await transaction(async () => {
    const { Contract, Job, Profile } = req.app.get('models');
    const { profile } = req; // client balance
    const { job_id } = req.params;

    const job = await Job.findOne({
      where: { id: job_id },
    });

    if (!job) throw new NotFoundError();
    if (job.paid) throw new ConflictError();
    if (job.price > profile.balance) throw new ForbiddenError();

    const contract = await Contract.findOne({ where: { id: job.ContractId } });
    if (!contract) throw new NotFoundError();
    // TODO: Question: Can `terminated` contract be still paid? Nothing about this case in spec. Even if contract is paid it can be still in_progress I guess.

    const contractor = await Profile.findOne({
      where: { id: contract.ContractorId },
    });

    await Profile.update(
      { balance: (profile.balance * 100 - job.price * 100) / 100 }, // 231.11 - 202 = 29.110000000000014; simple fix
      { where: { id: profile.id } }
    );
    await Profile.update(
      { balance: (contractor.balance * 100 + job.price * 100) / 100 },
      { where: { id: contractor.id } }
    );
    const updated = await Job.update(
      { paid: true, paymentDate: new Date() },
      { where: { id: job.id } }
    );

    return updated; // Return number of rows affected.
  });

  res.json(result);
});

/**
 * ***POST*** `/balances/deposit/:userId` - Deposits money into the the the balance of a client, a client can't deposit more than 25% his total of jobs to pay. (at the deposit moment)
 *
 * TODO: This is not clearly defiend - who is user and who is client in this case? Where is the money coming from?
 * I'd say `userId` param is pointless. It should work like top-up my balance. Thus, no point to pass `userId`.
 * No information about terminated contracts etc.
 *
 */
app.post('/balances/deposit/:userId', getProfile, async (req, res) => {
  const result = await transaction(async () => {
    const { amount } = req.body;
    const { profile } = req;

    if (!amount) throw new BadRequestError();

    const { Contract, Job, Profile } = req.app.get('models');

    const contracts = await Contract.findAll({
      where: { ClientId: profile.id },
    });

    const total = await Job.sum('price', {
      where: {
        id: { [Op.in]: contracts.map((contract) => contract.id) },
        paid: { [Op.not]: true }, // jobs to pay is not paid (null or false)
      },
    });

    const limit = (total * 100 * 0.25) / 100; // TODO: Rounding

    if (amount > limit) throw new ForbiddenError();

    const updated = await Profile.update(
      { balance: (profile.balance * 100 - amount * 100) / 100 },
      { where: { id: profile.id } }
    );

    return updated;
  });

  res.json(result);
});

/**
 * ***GET*** `/admin/best-profession?start=<date>&end=<date>` - Returns the profession that earned the most money (sum of jobs paid) for any contactor that worked in the query time range.
 *
 * TODO: Input format is not defined
 * Returns the profession implies return to be just a string (best profession)
 *
 */
app.get('/admin/best-profession', getProfile, async (req, res) => {
  const result = await transaction(async () => {
    const { Contract, Job, Profile } = req.app.get('models');
    const { start, end } = req.query;

    const professions = await Job.findAll({
      attributes: [[sequelize.fn('sum', sequelize.col('price')), 'price']],
      where: {
        paid: true,
        createdAt: { [Op.between]: [new Date(start), new Date(end)] },
      },
      include: [
        {
          model: Contract,
          attributes: ['createdAt'],
          include: [
            {
              model: Profile,
              as: 'Contractor',
              where: { type: 'contractor' },
              attributes: ['profession'],
            },
          ],
        },
      ],
      group: ['Contract.Contractor.profession'],
      order: [[sequelize.fn('sum', sequelize.col('price')), 'DESC']],
      limit: 1,
    });

    return professions[0].Contract.Contractor.profession;
  });

  res.json(result);
});

/**
 * ***GET*** `/admin/best-clients?start=<date>&end=<date>&limit=<integer>` - returns the clients the paid the most for jobs in the query time period. limit query parameter should be applied, default limit is 2.
 *
 */
app.get('/admin/best-clients', getProfile, async (req, res) => {
  const result = await transaction(async () => {
    const { Contract, Job, Profile } = req.app.get('models');
    const { start, end, limit } = req.query;

    const clients = await Job.findAll({
      attributes: [[sequelize.fn('sum', sequelize.col('price')), 'paid']],
      where: {
        paid: true,
        paymentDate: {
          [Op.between]: [new Date(start), new Date(end)],
        },
      },
      include: [
        {
          model: Contract,
          attributes: ['id'],
          include: [
            {
              model: Profile,
              as: 'Client',
              where: { type: 'client' },
              attributes: ['id', 'firstName', 'lastName'],
            },
          ],
        },
      ],
      group: ['Contract.Client.id'],
      order: [[sequelize.fn('sum', sequelize.col('price')), 'DESC']],
      limit,
    });

    return clients;
  });

  const formatted = result.map((r) => {
    return {
      id: r.Contract.Client.id,
      fullName: `${r.Contract.Client.firstName} ${r.Contract.Client.lastName}`,
      paid: r.paid,
    };
  });

  res.json(formatted);
});

/**
 * Middleware for handling all errors.
 */
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500);
  res.json({ message: err.message || 'Internal Server Error' });
});

module.exports = app;
