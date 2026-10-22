import type { InvestorProfile, User } from '@prisma/client';
import type { Me } from '@dautu/contracts';
import { toInvestorProfile } from '../profile/investor-profile';

/** User row (with its profile) → `Me` contract, built field by field so `passwordHash`/`googleId` never leak. */
export function toMe(u: User & { profile: InvestorProfile | null }): Me {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    onboarded: !!u.profile,
    profile: u.profile && toInvestorProfile(u.profile),
  };
}
