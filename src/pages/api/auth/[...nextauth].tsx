// pages/api/auth/[...nextauth].tsx

import NextAuth, { NextAuthOptions, DefaultSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

declare module "next-auth" {
  interface Session {
    user: {
      accessToken?: string;
    } & DefaultSession["user"];
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Include the phone number scope along with standard scopes.
          scope: "openid email profile https://www.googleapis.com/auth/user.phonenumbers.read",
        },
      },
    }),
  ],
  secret: process.env.NEXT_PUBLIC_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      // When the user signs in, account is available.
      if (account && account.access_token) {
        // Save the access token in the JWT token.
        token.accessToken = account.access_token;

        // Optionally, fetch phone numbers from Google People API using the access token.
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
          console.log("Google People API raw data:", data);

          // If phoneNumbers are returned, save the first one.
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
    async session({ session, token }) {
      // Attach values from the JWT token to the session object.
      if (session.user) {
        session.user.accessToken = token.accessToken as string;
        // session.user.phoneNumber = token.phoneNumber;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
