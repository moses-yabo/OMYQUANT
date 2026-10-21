import mongoose from 'mongoose';
import { AuthIdentity, User } from '../../database/models';
import { ApiError } from '../../shared/http';
import type { GoogleProfile } from './google-provider';

export class GoogleAccountConflict extends ApiError {
  constructor() { super(409, 'Sign in to your existing account first, then return to the login page to link Google.'); }
}

// Called only with a server-verified profile, never raw browser profile data.
// Keeping identity resolution separate lets future native clients reuse it after
// their own approved OAuth verification, without a second user database.
export async function resolveGoogleUser(profile: GoogleProfile, linkingUserId?: string): Promise<string> {
  try {
    return await mongoose.connection.transaction(async session => {
      const identity = await AuthIdentity.findOne({ provider: 'google', providerUserId: profile.sub }).session(session);
      if (identity) {
        if (linkingUserId && String(identity.user) !== linkingUserId) throw new ApiError(409, 'This Google identity already belongs to another account.');
        const user = await User.findOne({ _id: identity.user, active: true }).session(session);
        if (!user) throw new ApiError(403, 'Account unavailable.');
        return String(user._id);
      }
      if (linkingUserId) {
        const user = await User.findOne({ _id: linkingUserId, active: true }).session(session);
        if (!user) throw new ApiError(403, 'Account unavailable.');
        // No email matching: explicit reauthenticated linking binds the subject
        // to this account, even when the verified Google email is different.
        await AuthIdentity.create([{ user: user._id, provider: 'google', providerUserId: profile.sub }], { session });
        return String(user._id);
      }
      if (await User.exists({ email: profile.email }).session(session)) throw new GoogleAccountConflict();
      const [user] = await User.create([{ name: profile.name, email: profile.email }], { session });
      await AuthIdentity.create([{ user: user._id, provider: 'google', providerUserId: profile.sub }], { session });
      return String(user._id);
    });
  } catch (error) {
    // Unique email and identity indexes arbitrate concurrent creation/linking.
    // Never infer that a duplicate email grants permission to link an account.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new GoogleAccountConflict();
    throw error;
  }
}
