import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { UserModel } from "../models/User.js";
import { config } from "../config.js";

if (config.googleClientId && config.googleClientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        callbackURL: config.googleCallbackUrl,
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value?.toLowerCase().trim();
          if (!email) return done(new Error("No email returned from Google"));

          // Look up by googleId first. Only fall back to email for accounts
          // that were created with a password and have no googleId yet — this
          // covers the intentional "link existing account" flow while preventing
          // a Google account from silently taking over a different user's account
          // if they happen to share an email address.
          let user = await UserModel.findOne({ googleId });

          if (!user) {
            const byEmail = await UserModel.findOne({ email });
            if (byEmail) {
              if (byEmail.googleId && byEmail.googleId !== googleId) {
                // Email is already linked to a different Google account — reject
                return done(new Error("This email is already linked to a different Google account"));
              }
              // Password account — attach this Google identity
              byEmail.googleId = googleId;
              await byEmail.save();
              user = byEmail;
            } else {
              user = await UserModel.create({ email, googleId });
            }
          }

          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}

export default passport;
