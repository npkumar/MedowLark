var credentials = require('./credentials.js');
var nodemailer = require('nodemailer');

var mailTransport = nodemailer.createTransport('SMTP', {
	service: 'Gmail',
	auth: {
		user: credentials.gmail.user,
		pass: credentials.gmail.password,
	}
});

mailTransport.sendMail({
	from: '"Nitin" <nitin.nus>',
	to: 'getnpk@gmail.com',
	subject: 'Your Meadowlark Travel Tour',
	text: 'Thank you for booking your trip with Meadowlark Travel'
}, function(error, info) {
	if (error) console.error('Unable to send email: ' + error);
	else console.log('Message sent: ' + info.response);
});