import { afterEach, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { connect, connectToDatabase, mongoConfiguration } from '../app/.server/database/connect.ts';

afterEach(() => jest.restoreAllMocks());

test('complete URI is preserved and an absent URI is checked lazily', () => {
  const uri = 'mongodb://host1:27017,host2:27017/omyquant?replicaSet=rs0';
  expect(mongoConfiguration({ MONGODB_URI: uri })).toEqual({ uri, options: { serverSelectionTimeoutMS: 5000 } });
  expect(() => mongoConfiguration({})).toThrow('MONGODB_URI');
  expect(connect).toBe(connectToDatabase);
});

test.each(['username', '<db_username>'])('template %s uses encoded URI credentials once and the configured database', placeholder => {
  const result = mongoConfiguration({ MONGODB_URI: `mongodb+srv://${placeholder}:<db_password>@cluster.example/?appName=username`, MONGODB_DB_USERNAME: 'user@farm', MONGODB_PASSWORD: 'p@ss#:/%$word', MONGODB_DB_NAME: 'omyquant' });
  expect(result.uri).toBe('mongodb+srv://user%40farm:p%40ss%23%3A%2F%25%24word@cluster.example/?appName=username');
  expect(result.options).toEqual({ serverSelectionTimeoutMS: 5000, dbName: 'omyquant' });
});

test('complete URI supports raw credential overrides without double encoding', () => {
  const result = mongoConfiguration({ MONGODB_URI: 'mongodb://old:old@localhost/', MONGODB_DB_USERNAME: 'user@farm', MONGODB_PASSWORD: 'p@ss#word' });
  expect(result.options).toMatchObject({ user: 'user@farm', pass: 'p@ss#word' });
});

test('invalid URI schemes and unresolved placeholders fail before connecting', () => {
  expect(() => mongoConfiguration({ MONGODB_URI: 'https://example.test/' })).toThrow('must start');
  expect(() => mongoConfiguration({ MONGODB_URI: 'mongodb+srv://user:pass@<cluster>/' })).toThrow('unresolved placeholder');
});

test('missing credential variables reject templates rather than substituting empty values', () => {
  expect(() => mongoConfiguration({ MONGODB_URI: 'mongodb+srv://username:<db_password>@cluster.example/' })).toThrow('MONGODB_DB_USERNAME');
  expect(() => mongoConfiguration({ MONGODB_URI: 'mongodb+srv://user:<db_password>@cluster.example/' })).toThrow('MONGODB_PASSWORD');
  expect(() => mongoConfiguration({ MONGODB_URI: 'mongodb://localhost/', MONGODB_PASSWORD: 'password' })).toThrow('both');
});

test('failed connections retry without logging raw driver details', async () => {
  const old = process.env.MONGODB_URI;
  process.env.MONGODB_URI = 'mongodb://localhost/omyquant';
  const failure = Object.assign(new Error('sensitive-connection-details'), { code: 8000 });
  const open = jest.spyOn(mongoose, 'connect').mockRejectedValueOnce(failure).mockResolvedValueOnce(mongoose);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(connect()).rejects.toBe(failure);
    await expect(connect()).resolves.toBe(mongoose);
    expect(open).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive-connection-details');
  } finally {
    if (old === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = old;
  }
});
