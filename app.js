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

const app = express();
app.use(cors());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet());

//app.use('/', indexRouter);
app.use('/users', userRouter);
app.use('/floor-plans', floorPlanRouter);
app.use('/tables', tableRouter);
app.use('/reservations', tableReservationRouter);


module.exports = app;
