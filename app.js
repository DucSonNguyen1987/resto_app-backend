require('dotenv').config();
const express = require ('express');
const path = require ('path');
const cookieParser = require('cookie-parser');
const logger = require ('morgan');
const cors = require ('cors');
const helmet = require ('helmet');


//const indexRouter = require ('./routes/index');
const userRouter = require ('./routes/users');
const floorPlanRouter = require ('./routes/floorPlan.js');
const tableRouter = require('./routes/tables.js');
const tableReservationRouter = require('./routes/tableReservation.js');
const twoFactorAuthRoutes = require('./routes/twoFactorAuth.js');

const app = express();
app.use(cors({
    origin: 'http://localhost:5173', // Your frontend URL
    credentials: true
  }));

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet());

//app.use('/', indexRouter);
app.use('/users', userRouter);
app.use('/floorPlans', floorPlanRouter);
app.use('/tables', tableRouter);
app.use('/reservations', tableReservationRouter);
app.use('/2fa', twoFactorAuthRoutes)

// Gestion d'erreur
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ result :false, error: 'Une erreur est survenue'})
})

// Démarrage du serveur
// const port = process.env.PORT || 3000;
// app.listen(port, () => {
//     console.log(`Serveur démarré sur le port ${port}`);
// })

module.exports = app;
