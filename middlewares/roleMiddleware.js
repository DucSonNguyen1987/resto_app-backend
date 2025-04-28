const {hasPermission} = require ('../config/roles.js');

// Middleware pour vérifier les rôles et permissions

const requireRole = (roles) => {
    return (req, res, next) => {
        // On s'assure que le USER est authentifié
        if(!req.user){
            return res.status(401).json({error : 'Non autorisé - Autorisation requise'});
        }

        // Convertir en tableau si c'est une chaîne
        const requiredRoles = Array.isArray(roles) ? roles : [roles];

        if (requiredRoles.includes(req.user.role)) {
            return next(); // le User a le rôle requis
        }

        return res.status(403).json ({ error: 'Accès refusé - Rôle innsuffisant'});
    };
};

// Middleware pour vérifier si le USER a certaines permissions

const requirePermission = (permission) => {
    return (req, res, next) => {
        // Vérifie si le USER est authentifié
        if(!req.user) {
            return res.status(401).json({error: 'Non autorisé - Autorisation requise'})
        }

        if(hasPermission(req.user.role, permission)) {
            return next(); // Le User a la permission requise
        }

        return res.status(403).json({error: 'Accès refusé - Vous n\'avez pas les permissions nécessaires'})
    };
};

module.exports = { requireRole, requirePermission, hasPermission };