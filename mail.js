var credentials = require('./credentials.js');
var emailService = require('./lib/email.js')(credentials);

emailService.send('awesome@gmail.com', 'Awesome subject','Awesome email body');