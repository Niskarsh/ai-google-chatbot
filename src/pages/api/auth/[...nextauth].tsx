import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Include the phone number scope along with standard scopes
          scope:
            "openid email profile https://www.googleapis.com/auth/user.phonenumbers.read",
        },
      },
    }),
  ],
  secret: process.env.NEXT_PUBLIC_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      // When the user signs in for the first time, account is available.
      if (account && account.access_token) {
        // Save the access token in the token for later use.
        token.accessToken = account.access_token;

        // Fetch phone numbers from Google People API using the access token.
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

          // If phoneNumbers array is returned, pick the first one.
          if (data.phoneNumbers && data.phoneNumbers.length > 0) {
            token.phoneNumber = data.phoneNumbers[0].value;
          } else {
            token.phoneNumber = null;
          }
        } catch (error) {
          console.error("Error fetching phone number:", error);
          token.phoneNumber = null;
        }
      }
      return token;
    },
    async session({
        session,
        // token,
    }) {
      // Make the phone number available on the session object.
      if (session.user) {
        // session.user.phoneNumber = token.phoneNumber as string | null;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
