'use strict';

function BadRequestError() {
  const error = new Error('Bad Request');
  return Object.assign(error, { statusCode: 400 });
}

function NotAuthorizedError() {
  const error = new Error('Not Authorized');
  return Object.assign(error, { statusCode: 401 });
}

function ForbiddenError() {
  const error = new Error('Forbidden');
  return Object.assign(error, { statusCode: 403 });
}

function NotFoundError() {
  const error = new Error('Not Found');
  return Object.assign(error, { statusCode: 404 });
}

function ConflictError() {
  const error = new Error('Conflict');
  return Object.assign(error, { statusCode: 409 });
}

module.exports = {
  BadRequestError,
  NotAuthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
