/**
 * Middleware pour vérifier si un USER nécessite l'authentification 2FA basé sur son rôlr (ADMIN OU OWNER)
 */

function requires2FA(req, res, next) {
    // Si le USER est ADMIN ou OWNER, vérifier si 2FA est activé

    if (req.user && (req.user.role === 'ADMIN' || req.user.role === 'OWNER')) {
        // Si 2FA n'est pas activé, rediriger vers la configuration 2FA
        if (!req.user.twoFactorEnabled) {
            return res.status(403).json ({
                result: false,
                error :'L\'authentification à deux facteurs est requise pour les ADMINS et Propriétataires',
                redirect: '/setup-2fa'
            });
        }
    }
    // si le USER n'a pas besoin de 2FA ou si 2FA déjà activé, continuer
    next();
}

module.exports = requires2FA;