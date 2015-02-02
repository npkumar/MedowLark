var http = require('http'),
    https = require('https'),
    express = require('express'),
    fortune = require('./lib/fortune.js'),
    formidable = require('formidable'),
    fs = require('fs'),
    vhost = require('vhost'),
    rest = require('connect-rest'),
    path = require('path'),
    sio = require('socket.io');

var Vacation = require('./models/vacation.js'),
    VacationInSeasonListener = require('./models/vacationInSeasonListener.js'),
    Attraction = require('./models/attraction.js');

var app = express();

var credentials = require('./credentials.js');

var emailService = require('./lib/email.js')(credentials);

// set up handlebars view engine
var handlebars = require('express3-handlebars').create({
    defaultLayout: 'main',
    helpers: {
        section: function(name, options) {
            if (!this._sections) this._sections = {};
            this._sections[name] = options.fn(this);
            return null;
        },
        static: function(name) {
            return require('./lib/static.js').map(name);
        }
    }
});
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

// set up css/js bundling
// var bundler = require('connect-bundle')(require('./config.js'));
// app.use(bundler);

app.set('port', process.env.PORT || 3000);

// use domains for better error handling
app.use(function(req, res, next) {
    // create a domain for this request
    var domain = require('domain').create();
    // handle errors on this domain
    domain.on('error', function(err) {
        console.error('DOMAIN ERROR CAUGHT\n', err.stack);
        try {
            // failsafe shutdown in 5 seconds
            setTimeout(function() {
                console.error('Failsafe shutdown.');
                process.exit(1);
            }, 5000);

            // disconnect from the cluster
            var worker = require('cluster').worker;
            if (worker) worker.disconnect();

            // stop taking new requests
            server.close();

            try {
                // attempt to use Express error route
                next(err);
            } catch (error) {
                // if Express error route failed, try
                // plain Node response
                console.error('Express error mechanism failed.\n', error.stack);
                res.statusCode = 500;
                res.setHeader('content-type', 'text/plain');
                res.end('Server error.');
            }
        } catch (error) {
            console.error('Unable to send 500 response.\n', error.stack);
        }
    });

    // add the request and response objects to the domain
    domain.add(req);
    domain.add(res);

    // execute the rest of the request chain in the domain
    domain.run(next);
});

// logging
switch (app.get('env')) {
    case 'development':
        // compact, colorful dev logging
        app.use(require('morgan')('dev'));
        break;
    case 'production':
        // module 'express-logger' supports daily log rotation
        app.use(require('express-logger')({
            path: __dirname + '/log/requests.log'
        }));
        break;
}

var MongoSessionStore = require('session-mongoose')(require('connect'));
var sessionStore = new MongoSessionStore({
    url: credentials.mongo.development.connectionString
});

app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')({
    store: sessionStore
}));
app.use(express.static(__dirname + '/public'));
app.use(require('body-parser')());

// cross origin resource sharing
app.use(require('cors')());
app.use('/api', require('cors')());

// database configuration
var mongoose = require('mongoose');
var options = {
    server: {
        socketOptions: {
            keepAlive: 1
        }
    }
};
switch (app.get('env')) {
    case 'development':
        mongoose.connect(credentials.mongo.development.connectionString, options);
        break;
    case 'production':
        mongoose.connect(credentials.mongo.production.connectionString, options);
        break;
    default:
        throw new Error('Unknown execution environment: ' + app.get('env'));
}

// initialize vacations
Vacation.find(function(err, vacations) {
    if (vacations.length) return;

    new Vacation({
        name: 'Hood River Day Trip',
        slug: 'hood-river-day-trip',
        category: 'Day Trip',
        sku: 'HR199',
        description: 'Spend a day sailing on the Columbia and ' +
            'enjoying craft beers in Hood River!',
        priceInCents: 9995,
        tags: ['day trip', 'hood river', 'sailing', 'windsurfing', 'breweries'],
        inSeason: true,
        maximumGuests: 16,
        available: true,
        packagesSold: 0,
    }).save();

    new Vacation({
        name: 'Oregon Coast Getaway',
        slug: 'oregon-coast-getaway',
        category: 'Weekend Getaway',
        sku: 'OC39',
        description: 'Enjoy the ocean air and quaint coastal towns!',
        priceInCents: 269995,
        tags: ['weekend getaway', 'oregon coast', 'beachcombing'],
        inSeason: false,
        maximumGuests: 8,
        available: true,
        packagesSold: 0,
    }).save();

    new Vacation({
        name: 'Rock Climbing in Bend',
        slug: 'rock-climbing-in-bend',
        category: 'Adventure',
        sku: 'B99',
        description: 'Experience the thrill of rock climbing in the high desert.',
        priceInCents: 289995,
        tags: ['weekend getaway', 'bend', 'high desert', 'rock climbing', 'hiking', 'skiing'],
        inSeason: true,
        requiresWaiver: true,
        maximumGuests: 4,
        available: false,
        packagesSold: 0,
        notes: 'The tour guide is currently recovering from a skiing accident.',
    }).save();
});

// flash message middleware
app.use(function(req, res, next) {
    // if there's a flash message, transfer
    // it to the context, then clear it
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

// set 'showTests' context property if the querystring contains test=1
app.use(function(req, res, next) {
    res.locals.showTests = app.get('env') !== 'production' &&
        req.query.test === '1';
    next();
});

// mocked weather data
function getWeatherData() {
    return {
        locations: [{
            name: 'Portland',
            forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
            iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
            weather: 'Overcast',
            temp: '54.1 F (12.3 C)',
        }, {
            name: 'Bend',
            forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
            iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
            weather: 'Partly Cloudy',
            temp: '55.0 F (12.8 C)',
        }, {
            name: 'Manzanita',
            forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
            iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
            weather: 'Light Rain',
            temp: '55.0 F (12.8 C)',
        }, ],
    };
}

// middleware to add weather data to context
app.use(function(req, res, next) {
    if (!res.locals.partials) res.locals.partials = {};
    res.locals.partials.weather = getWeatherData();
    next();
});

// middleware to handle logo image easter eggs
var static = require('./lib/static.js').map;

app.use(function(req, res, next) {
    var now = new Date();
    res.locals.logoImage = now.getMonth() == 11 && now.getDate() == 19 ?
        static('/img/logo_bud_clark.png') :
        static('/img/logo.png');
    next();
});

// middleware to provide cart data for header
app.use(function(req, res, next) {
    var cart = req.session.cart;
    res.locals.cartItems = cart && cart.items ? cart.items.length : 0;
    next();
});

var auth = require('./lib/auth.js')(app, {
    providers: credentials.authProviders,
    successRedirect: '/account',
    failureRedirect: '/unauthorized',
});
// auth.init() links in Passport middleware:
auth.init();
// now we can specify our auth routes:
auth.registerRoutes();


app.get('/account', function(req, res) {
    if (!req.session.passport.user)
        return res.redirect(303, '/unauthorized');
    res.render('account', {
        user: req.session.passport.user
    });
});

app.get('/logout', function(req, res) {
    if (req.session.passport.user)
        req.session.passport.user = null;
    return res.redirect(303, '/');
});

// add routes
require('./routes.js')(app);

// add support for auto views
var autoViews = {};

app.use(function(req, res, next) {
    var path = req.path.toLowerCase();
    // check cache; if it's there, render the view
    if (autoViews[path]) return res.render(autoViews[path]);
    // if it's not in the cache, see if there's
    // a .handlebars file that matches
    if (fs.existsSync(__dirname + '/views' + path + '.handlebars')) {
        autoViews[path] = path.replace(/^\//, '');
        return res.render(autoViews[path]);
    }
    // no view found; pass on to 404 handler
    next();
});


// API configuration
var apiOptions = {
    context: '/api',
    domain: require('domain').create(),
};

apiOptions.domain.on('error', function(err) {
    console.log('API domain error.\n', err.stack);
    setTimeout(function() {
        console.log('Server shutting down after API domain error.');
        process.exit(1);
    }, 5000);
    server.close();
    var worker = require('cluster').worker;
    if (worker) worker.disconnect();
});

// link API into pipeline
app.use(rest.rester(apiOptions));

// api
rest.get('/attractions', function(req, content, cb) {
    Attraction.find({
        approved: true
    }, function(err, attractions) {
        if (err) return cb({
            error: 'Internal error.'
        });
        cb(null, attractions.map(function(a) {
            return {
                name: a.name,
                description: a.description,
                location: a.location,
                id: a._id
            };
        }));
    });
});

rest.post('/attraction', function(req, content, cb) {
    var a = new Attraction({
        name: req.body.name,
        description: req.body.description,
        location: {
            lat: req.body.lat,
            lng: req.body.lng
        },
        history: {
            event: 'created',
            email: req.body.email,
            date: new Date(),
        },
        approved: false,
    });
    a.save(function(err, a) {
        if (err) return cb({
            error: 'Unable to add attraction.'
        });
        cb(null, {
            id: a._id
        });
    });
});

rest.get('/attraction/:id', function(req, content, cb) {
    Attraction.findById(req.params.id, function(err, a) {
        if (err) return cb({
            error: 'Unable to retrieve attraction.'
        });
        cb(null, {
            name: attraction.name,
            description: attraction.description,
            location: attraction.location,
        });
    });
});

// 404 catch-all handler (middleware)
app.use(function(req, res, next) {
    res.status(404);
    res.render('404');
});

// 500 error handler (middleware)
app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500);
    res.render('500');
});

var server, io,
    nicknames = {};

function startServer() {
    server = http.createServer(app);
    io = require('socket.io')(server);
    createSocketConnections();
    server.listen(app.get('port'), function() {
        console.log('Express started in ' + app.get('env') +
            ' mode on http://localhost:' + app.get('port') +
            '; press Ctrl-C to terminate.');
    });
}

if (require.main === module) {
    // application run directly; start app server
    startServer();
} else {
    // application imported as a module via "require": export function to create server
    module.exports = startServer;
}

function createSocketConnections() {
    io.sockets.on('connection', function(socket) {
        console.log('Connected')
        socket.on('user message', function(msg) {
            socket.broadcast.emit('user message', socket.nickname, msg);
        });

        socket.on('user image', function(msg) {
            console.log('user image msg');
            socket.broadcast.emit('user image', socket.nickname, msg);
        });

        socket.on('nickname', function(nick, fn) {
            if (nicknames[nick]) {
                fn(true);
            } else {
                fn(false);
                nicknames[nick] = socket.nickname = nick;
                socket.broadcast.emit('announcement', nick + ' connected');
                io.sockets.emit('nicknames', nicknames);
            }
        });

        socket.on('disconnect', function() {
            if (!socket.nickname) {
                return;
            }
            delete nicknames[socket.nickname];
            socket.broadcast.emit('announcement', socket.nickname + ' disconnected');
            socket.broadcast.emit('nicknames', nicknames);
        });
    });
}