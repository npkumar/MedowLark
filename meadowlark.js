var express = require('express');
var fortune = require('./lib/fortune.js');

var app = express();

//set up handlebars view engine
var handlebars = require('express3-handlebars').create({
	defaultLayout: 'main',
	helpers: {
		section: function(name, options) {
			if (!this._sections) this._sections = {};
			this._sections[name] = options.fn(this);
			return null;
		}
	}
});
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', process.env.PORT || 3000);
app.use(express.static(__dirname + '/public'));
app.use(require('body-parser')());

app.use(function(req, res, next) {
	res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
	next();
});

function getWeatherData() {
	return {
		locations: [{
			name: 'Portland',
			forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
			iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
			weather: 'Overcast',
			temp: '54.1 F (12.3 C)',
		}]
	};
}

app.use(function(req, res, next) {
	if (!res.locals.partials) res.locals.partials = {};
	res.locals.partials.weather = getWeatherData();
	next();
});

app.get('/', function(req, res) {
	res.render('home');
});

app.get('/about', function(req, res) {
	res.render('about', {
		fortune: fortune.getFortune(),
		pageTestScript: '/qa/tests-about.js'
	});
});

app.get('/jquery-test', function(req, res) {
	res.render('jquery-test');
});

app.get('/tours/hood-river', function(req, res) {
	res.render('tours/hood-river');
});

app.get('/tours/oregon-coast', function(req, res) {
	res.render('tours/oregon-coast');
});

app.get('/tours/request-group-rate', function(req, res) {
	res.render('tours/request-group-rate');
});

app.get('/rhyme', function(req, res) {
	res.render('rhyme');
});

app.get('/data/rhyme', function(req, res) {
	res.json({
		animal: 'squirrel',
		bodyPart: 'tail',
		adjective: 'bushy',
		noun: 'heck',
	});
});

app.get('/newsletter', function(req, res) {
	// provide a dummy value
	res.render('newsletter', {
		csrf: 'CSRF token goes here'
	});
});

app.post('/process', function(req, res) {
	if (req.xhr || req.accepts('json,html') === 'json') {
		//if there were an error, we would send { error: 'error description' }
		res.send({
			success: true
		});
	} else {
		// if there were an error, we would redirect to an error page
		console.log('Form (from querystring): ' + req.query.form);
		console.log('CSRF token (from hidden form field): ' + req.body._csrf);
		console.log('Name (from visible form field): ' + req.body.name);
		console.log('Email (from visible form field): ' + req.body.email);
		res.redirect(303, '/thank-you');
	}
});

//custom 404 page
app.use(function(req, res) {
	console.log('404')
	res.status(404);
	res.render('404');
});

//custom 500 page
app.use(function(err, req, res, next) {
	console.log(err.stack);
	res.status(500);
	res.render('500');
});

app.listen(app.get('port'), function() {
	console.log('Express started on http://localhost:' + app.get('port') + '; press Ctrl-C to terminate');
});