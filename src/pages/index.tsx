// pages/index.tsx
import { signIn, signOut, useSession } from "next-auth/react";
import type { NextPage } from "next";

const Home: NextPage = () => {
  const { data: session } = useSession();
  console.log('@@@@@@@@@@@@@@@@@', session)

  return (
    <div style={{ textAlign: "center", marginTop: "2rem" }}>
      {!session ? (
        <>
          <h2>You are not signed in</h2>
          <button onClick={() => signIn("google")}>Sign in with Google</button>
        </>
      ) : (
        <>
          <h2>Welcome, {session.user?.name}!</h2>
          {session.user?.image && (
            <img
              src={session.user.image}
              alt={`${session.user.name}'s avatar`}
              style={{
                borderRadius: "50%",
                width: "100px",
                height: "100px",
                objectFit: "cover",
                marginBottom: "1rem",
              }}
            />
          )}
          {session.user?.email && <p>Email: {session.user.email}</p>}
          {/* Note: The phone number is not provided by default by Google.
              You might need to extend your NextAuth callbacks or your user model
              to include a phone number if available. */}
          {/* {session.user?.phoneNumber && <p>Phone: {session.user.phoneNumber}</p>} */}
          <button onClick={() => signOut()}>Sign out</button>
        </>
      )}
    </div>
  );
};

export default Home;
