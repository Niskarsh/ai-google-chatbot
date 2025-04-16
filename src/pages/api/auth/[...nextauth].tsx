// pages/api/auth/[...nextauth].tsx

import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/user.phonenumbers.read",
        },
      },
    }),
  ],
  secret: process.env.NEXT_PUBLIC_SECRET,
  callbacks: {
    // The JWT callback runs on every sign in / token refresh and stores the access token in the JWT.
    async jwt({ token, account }) {
      if (account && account.access_token) {
        // Save the access token inside the JWT token (server-side storage)
        token.accessToken = account.access_token;
        try {
          const res = await fetch(
            "https://people.googleapis.com/v1/people/me?personFields=phoneNumbers",
            {
              headers: {
                Authorization: `Bearer ${account.access_token}`,
              },
            }
          );
          const data = await res.json();
          token.phoneNumber =
            data.phoneNumbers && data.phoneNumbers.length > 0
              ? data.phoneNumbers[0].value
              : null;
        } catch (error) {
          console.error("Error fetching phone number:", error);
          token.phoneNumber = null;
        }
      }
      return token;
    },
    // In the session callback, we intentionally do not include the access token
    // so that it isn’t available on the client.
    async session({ session, token }) {
      // Attach only non-sensitive data to the session (e.g. phoneNumber)
      if (session.user) {
        // @ts-expect-error Property 'token' does not exist on type 
        session.user.token = token;
        // Notice: we are not attaching token.accessToken here.
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
