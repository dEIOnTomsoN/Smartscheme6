const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session'); // Import express-session
const { connectDB } = require('./db'); // Import the connectDB function
const indexRouter = require('./routes/index'); // Import the index router
const hbs = require('hbs'); // Import Handlebars

const app = express();

// Connect to MongoDB
connectDB();

// Session middleware
app.use(session({
    secret: 'your-secret-key', // Replace with a secure secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Register a Handlebars helper to check if a deadline has passed
hbs.registerHelper('isPast', function (deadline) {
    const currentDate = new Date();
    const scholarshipDeadline = new Date(deadline);
    return scholarshipDeadline < currentDate;
});

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Enable form data parsing
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the "public" folder

// Routes
app.use('/', indexRouter); // Use the index router for all routes

// Catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// Error handler
app.use(function (err, req, res, next) {
    // Set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // Render the error page
    res.status(err.status || 500);
    res.render('error');
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app;