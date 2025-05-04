// app.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const helmet = require('helmet');

// Importation des routeurs
//const indexRouter = require('./routes/index');
const userRouter = require('./routes/users');
const floorPlanRouter = require('./routes/floorPlan.js');
const tableRouter = require('./routes/tables.js');
const tableReservationRouter = require('./routes/tableReservation.js');
const twoFactorAuthRoutes = require('./routes/twoFactorAuth.js');

const app = express();
app.use(cors({
    origin: 'http://localhost:5173', // Votre URL frontend
    credentials: true
}));

// Middleware de debugging pour aider à résoudre les problèmes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    
    // Sauvegarder la méthode send originale
    const originalSend = res.send;
    
    // Surcharger la méthode send pour logger la réponse
    res.send = function(body) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body).slice(0, 200) + '...';
        console.log(`[${new Date().toISOString()}] Response: ${bodyStr}`);
        
        // Appeler la méthode send originale
        return originalSend.call(this, body);
    };
    
    next();
});

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet());

// Montage des routeurs
//app.use('/', indexRouter);
app.use('/users', userRouter);
app.use('/floorPlans', floorPlanRouter);
app.use('/tables', tableRouter);
app.use('/reservations', tableReservationRouter);
app.use('/users/2fa', twoFactorAuthRoutes);

// Gestion d'erreur
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ result: false, error: 'Une erreur est survenue' });
});

module.exports = app;