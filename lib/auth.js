var User = require('../models/user.js'),
	passport = require('passport'),
	FacebookStrategy = require('passport-facebook').Strategy,
	GoogleStrategy = require('passport-google').Strategy;

passport.serializeUser(function(user, done) {
	done(null, user._id);
});

passport.deserializeUser(function(id, done) {
	User.findById(id, function(err, user) {
		if (err || !user) return done(err, null);
		done(null, user);
	});
});

module.exports = function(app, options) {
	// if success and failure redirects aren't specified,
	// set some reasonable defaults
	if (!options.successRedirect) options.successRedirect = '/account';
	if (!options.failureRedirect) options.failureRedirect = '/login';
	return {
		init: function() {
			var env = app.get('env');
			var config = options.providers;
			// configure Facebook strategy
			passport.use(new FacebookStrategy({
				clientID: config.facebook[env].appId,
				clientSecret: config.facebook[env].appSecret,
				callbackURL: '/auth/facebook/callback',
			}, function(accessToken, refreshToken, profile, done) {
				var authId = 'facebook:' + profile.id;
				console.log(profile);
				User.findOne({
					authId: authId
				}, function(err, user) {
					if (err) return done(err, null);
					if (user) return done(null, user);
					user = new User({
						authId: authId,
						name: profile.displayName,
						created: Date.now(),
						role: 'customer',
					});
					user.save(function(err) {
						if (err) return done(err, null);
						done(null, user);
					});
				});
			}));

			passport.use(new GoogleStrategy({
				returnURL: 'http://localhost/auth/google/return',
				realm: 'http://localhost/'
			}, function(identifier, profile, done) {
				var authId = 'google:' + identifier;
				User.findOne({
					authId: authId
				}, function(err, user) {
					if (err) return done(err, null);
					if (user) return done(null, user);
					user = new User({
						authId: authId,
						name: profile.displayName,
						created: Date.now(),
						role: 'customer',
					});
					user.save(function(err) {
						if (err) return done(err, null);
						done(null, user);
					});
				});
			}));


			app.use(passport.initialize());
			app.use(passport.session());
		},

		registerRoutes: function() {

			// Redirect the user to Facebook for authentication.  When complete,
			// Facebook will redirect the user back to the application at
			//     /auth/facebook/callback
			app.get('/auth/facebook', passport.authenticate('facebook'));

			// Facebook will redirect the user to this URL after approval.  Finish the
			// authentication process by attempting to obtain an access token.  If
			// access was granted, the user will be logged in.  Otherwise,
			// authentication has failed.
			app.get('/auth/facebook/callback',
				passport.authenticate('facebook', {
					successRedirect: '/account',
					failureRedirect: '/login'
				}));

			// Redirect the user to Google for authentication.  When complete, Google
			// will redirect the user back to the application at
			//     /auth/google/return
			app.get('/auth/google', passport.authenticate('google'));

			// Google will redirect the user to this URL after authentication.  Finish
			// the process by verifying the assertion.  If valid, the user will be
			// logged in.  Otherwise, authentication has failed.
			app.get('/auth/google/return',
				passport.authenticate('google', {
					successRedirect: '/account',
					failureRedirect: '/login'
				}));
		},
	};
};