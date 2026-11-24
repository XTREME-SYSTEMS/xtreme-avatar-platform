// Compatibility names for old components; identity is now verified by Supabase.
import { redirect } from 'next/navigation';
import { verifiedUser } from '../server/supabase-auth';
import { safeReturnPath } from '../server/supabase-auth-policy.mjs';
export type ChatGPTUser = {userId: string; displayName: string; email: string; fullName: string | null};
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const {user} = await verifiedUser();
  if (!user) return null;
  const email = user.email || '';
  return {userId: user.id, displayName: email, email, fullName: null};
}
export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser(); if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}
export function chatGPTSignInPath(returnTo: string) {return '/auth/login?return_to=' + encodeURIComponent(safeReturnPath(returnTo));}
export function chatGPTSignOutPath() {return '/signout-with-chatgpt';}
