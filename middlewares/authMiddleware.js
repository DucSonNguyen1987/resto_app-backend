const jwt = require('jsonwebtoken');

function authenticateToken( req, res, next) {
    const authHeader = req.headers.autorization;
    const accessToken = authHeader && authHeader.split(' ')[1];
    
    if (!accessToken) return res.status(401).json({error : 'Access Refusé'});
    
    try {
        jwt.verify(accessToken, process.env.JWT_SECRET_KEY, (err, user) => {
            if(err) return res.status(403);
            req.user = user;
            next();
        });
    } catch( error) {
        res.status(401).json({error : `Token d'accès invalide` })
    }
};

module.exports = authenticateToken;