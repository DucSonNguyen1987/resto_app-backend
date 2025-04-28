const express = require('express');
const router = express.Router();

require('../models/connection.js');
const User = require('../models/users.js');
const { checkBody} = require ('../modules/checkBody.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middlewares/authMiddleware.js');
const { refresh } = require('less');


function generateAccessToken (userData) {
    return jwt.sign( userData, process.env.JWT_SECRET_REFRESH_KEY, {expiresIn : process.env.JWT_EXPIRATION_TIME});
};

function generateRefreshToken (userData) {
    return jwt.sign( userData, process.env.JWT_SECRET_REFRESH_KEY, {expiresIn : '1y'} );
};



// Création de USER
// POST
router.post('/register', function(req, res, next){
    
    // Vérifie si un param est manquant
    if(!checkBody(req.body, ['email','password','firstname','lastname','username','phone'])){
        res.json({result : false, error : 'Un ou plusieurs champs manquants ou vides'});
        return;
    }

    const {email, password, firstname, lastname, phone, username} = req.body;

    // Vérifie si le user existe déjà
    User.findOne({email}).then(data => {
        // Si non trouvé
        if (data === null){
            // Hash le MDP pour le new USER
            const hash = bcrypt.hashSync(password, 10);
            const userData = { username, firstname, lastname, email, phone};
            const accessToken = generateAccessToken(userData);
            const refreshToken = generateRefreshToken({email});

            // Création new USER
            const newUser = new User ({...userData, password : hash, accessToken, refreshToken});

            // Sauvegarde new User dans la DB
            newUser.save().then(newDoc => {
                res.json({result : true, data : {username, firstname, lastname, email, phone, accessToken, refreshToken}});
            });

        } else {
            // Si le USER existe déjà
            res.json({result : false, error: `L'utilisateur existe déjà`});
        }
    });
});

// Login du USER
// POST
router.post('/login', async( req, res, next) =>{
    // Check les params
    if(!checkBody(req.body, ['email','password'])){
        res.json({result: false, error : 'Un ou plusieurs champs manquants ou vides'});
        return;
    }

    const { email, password } = req.body;

    // Vérifie si le USER existe
    const foundUser = await User.findOne({email});

    // Si USER n'existe pas dans la DB
    if(!foundUser || !(await bcrypt.compare(password, foundUser.password))){
        return res.status(401).send('Error : Non autorisé');
    }

    // Génère les token et MAJ user dans la DB
    const { username, firstname, lastname, phone } = foundUser;
    const accessToken = generateAccessToken({email, firstname, lastname, username, phone})
    const refreshToken = generateRefreshToken ({email});
    foundUser.accessToken = accessToken;
    foundUser.refreshToken = refreshToken;
    const result = await foundUser.save();
    // Send Response with user data
    res.json({result: true, data :{username, email, firstname, lastname, phone, accessToken, refreshToken}});
});


// Logout
// PUT
router.post ('/logout', authenticateToken, async (req, res, ) => {
    const {email, username, firstname, lastname, phone} = req.user;

    const foundUser = await User.findOne( {email : req.user.email});

    if(!foundUser){
        return res.status(401).send('Error : User not found');

    }

    const accessToken = jwt.sign({email, firstname, lastname, phone, username}, process.env.JWT_SECRET_KEY, {expiresIn : 1});
    const refreshToken = jwt.sign({email: req.user.email}, process.env.JWT_SECRET_REFRESH_KEY, {expiresIn : 1});
    foundUser.accessToken = accessToken;
    foundUser.refreshToken = refreshToken;
    const result = await foundUser.save();

    res.json( {result : true, data: 'Vous êtes déconnecté(e)'});
});

// Regénérer l'accessToken à partir du RefreshToken
//POST
router.post('/refreshToken', async(req, res) => {
    
    // Vérifie que le refreshtoken est dans le request body
    const refreshToken = req.body.refreshToken;

    // Si pas de token, reourne une erreur
    if(!refreshToken) return res.status(401).json({error: 'Accès Refusé'});

    // Vérifie la validité du refreshToken
    jwt.verify(refreshToken, process.env.JWT_SECRET_REFRESH_KEY, async(err, user) => {
        console.log(user);
        if(err){
            // Token invalide => erreur
            return res.status(401).json({error: 'Accès Refusé'});
        }

        // Vérifie dans la DB que le USER est existant
        const foundUser = await User.findOne({email : user.email});

        // Si pas de User ou MDP incorrect => error 401
        if(!foundUser) {
            return res.status(401).json({error: 'Accès Refusé'});
        };
        console.log('foundUser', foundUser.username);
        console.log('foundUser RefreshToken', foundUser.refreshToken);

        // Vérifie si un nouveau refreshToken a été créé aprèes celui-ci.
        const savedRefreshToken = jwt.decode(foundUser.refreshToken, process.env.JWT_SECRET_REFRESH_KEY);
        console.log('savedRefreshToken decoded', savedRefreshToken);

        if(savedRefreshToken.iat > user.iat){
            // RefreshToken dans la request est + vieille que le refreshToken dans la DB
            // Une déconnecxion a déjà eu lieu
            return res.status(401).json({error : 'Accès Refusé, mauvais Token'});
        }

        const {firstname, lastname, phone} = foundUser;
        
        // Détruis issued at et expiration key
        delete user.iat;
        delete user.exp;
        
        // Génère un nouvel accessToken et update User dans la DB
        const refreshedAccessToken = generateAccessToken({email: user.email, firstname, lastname, phone});
        console.log(refreshedAccessToken);
        foundUser.accessToken = refreshedAccessToken;
        const result = await foundUser.save();
        // Renvoi une réponse avec 
        res.send({accessToken : refreshedAccessToken});
    })
})

//  USER routes protégées (test)
// GET 

router.get('/account', authenticateToken, (req, res) => {
    res.json({message : 'Succès', user: req.user});
});

module.exports = router;