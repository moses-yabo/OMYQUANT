import { afterEach, expect, jest, test } from '@jest/globals';
import { submissionNotice, redirectNotice, scrollAfterSubmission } from '../app/lib/submission-feedback.ts';

afterEach(() => { delete globalThis.window; });

test('confirmation requires an explicit action outcome, never merely returned records or loader state', () => {
  for (const value of [undefined, null, {}, { data: { _id: 'saved-looking-record' } }, { success: false }, { saved: true }]) expect(submissionNotice(value)).toBeNull();
  expect(submissionNotice({ success: 'Listing saved.' })).toMatchObject({ message: 'Listing saved.' });
  expect(submissionNotice({ success: true }, 'Request sent.')).toMatchObject({ message: 'Request sent.' });
  expect(submissionNotice({ error: '' })).toMatchObject({ message: 'Your changes have been saved.' });
});

test('errors take precedence over success and preserve actionable API validation messages', () => {
  expect(submissionNotice({ error: 'quantity: Out of stock', success: true })).toMatchObject({ error: true, message: 'quantity: Out of stock' });
  expect(submissionNotice({ error: { message: 'Address lookup timed out.' } })).toMatchObject({ error: true, message: 'Address lookup timed out.' });
});

test('administrative redirects confirm only recognized saved destinations', () => {
  expect(redirectNotice('/admin/businesses/abc', '/admin/businesses/abc?saved=1', '')).toMatchObject({ title: 'Saved successfully' });
  expect(redirectNotice('/admin/businesses/abc', '/admin/businesses/other?saved=1', '')).toBeNull();
  expect(redirectNotice('/support', '/support/' + 'a'.repeat(24) + '?saved=1', '')).toMatchObject({ title: 'Saved successfully' });
  expect(redirectNotice('/support', '/support?status=all', '')).toBeNull();
});

test('authentication redirects distinguish completed auth from expired access', () => {
  expect(redirectNotice('/register', '/login?registered=1', '')).toMatchObject({ title: 'Account created' });
  expect(redirectNotice('/login', '/business/' + 'b'.repeat(24) + '/tools', '')).toMatchObject({ title: 'Signed in successfully' });
  expect(redirectNotice('/account', '/login', 'logout')).toMatchObject({ title: 'Signed out' });
  expect(redirectNotice('/business/x/profile', '/login', '')).toMatchObject({ error: true, title: 'Sign in required' });
  expect(redirectNotice('/business/x/profile', '/business/x/tools', '')).toBeNull();
});

test.each([true, false])('successful page feedback respects reduced motion: %s', reduced => {
  const scrollTo = jest.fn();
  globalThis.window = { matchMedia: () => ({ matches: reduced }), scrollTo };
  scrollAfterSubmission();
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
});
