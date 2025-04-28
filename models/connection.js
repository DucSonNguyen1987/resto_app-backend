const mongoose = require('mongoose');

const connectionString = process.env.CONNECTION_STRING;

mongoose.set('strictQuery', false);

mongoose.connect(connectionString, {connectTimeoutMS: 2000})
.then(() => console.log('Connecté(e) à la Base de données'))
.catch(error => console.error(error));